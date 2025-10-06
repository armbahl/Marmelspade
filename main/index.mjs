import http from 'http';
import fs from 'fs';
import { request as httpRequest } from 'http';
import { MeiliSearch } from 'meilisearch';

const CONFIGPATH = "./config.json"; // Config file path

// Parse config file
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIGPATH));
} catch (err) {
  console.error('Failed to read or parse config.json:', err.message);
  process.exit(1);
}

const HOST = config.serverInfo.host; // Server host
const PORT = config.serverInfo.port; // Server port
const MEILI_PORT = config.serverInfo.meiliPort; // Meilisearch port
const RESO_APIURL = "https://api.resonite.com"; // Base API URL
const RESO_ASSETURL = "https://assets.resonite.com"; // Base Asset URL

// Nodejs server to serve frontend and proxy Meilisearch requests
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/frontend.html') {
    fs.readFile('./main/frontend.html', (err, data) => {
      if (err) {
        console.error('Error reading frontend.html:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  }
  // Proxy to Meilisearch
  else if (req.url.startsWith('/meili')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const options = {
          hostname: HOST,
          port: MEILI_PORT,
          path: req.url.slice(6) || '/', // Remove '/meili' prefix
          method: req.method,
          headers: {
            ...req.headers,
            'host': `${HOST}:${MEILI_PORT}`,
          }
        };
        const proxy = httpRequest(options, proxyRes => {
          const headers = { ...proxyRes.headers }; // Clone headers and overwrite Access-Control-Allow-Origin
          delete headers['access-control-allow-origin']; // Remove any existing Access-Control-Allow-Origin header
          headers['Access-Control-Allow-Origin'] = '*';

          res.writeHead(proxyRes.statusCode, headers);
          proxyRes.pipe(res, { end: true });
        });
        proxy.on('error', (err) => {
          console.error('Proxy error:', err.message);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Bad Gateway');
        });
        if (body) proxy.write(body);
        proxy.end();
      } catch (err) {
        console.error('Proxy request error:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    });
    req.on('error', (err) => {
      console.error('Request error:', err.message);
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('400 Bad Request');
    });
  }
  // Error 404
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
});

// Meilisearch client setup
let client;
try {
  client = new MeiliSearch({
    host: `http://${HOST}:${MEILI_PORT}`,
    apiKey: config.serverInfo.masterKey
  });
} catch (err) {
  console.error('Failed to initialize MeiliSearch client:', err.message);
  process.exit(1);
}

// Create Meilisearch index
async function mMakeIndex() {
  try {
    await client.deleteIndex('creatorjam').catch(() => { });
    await new Promise(r => setTimeout(r, 5000));
    const res = await client.createIndex('creatorjam', { primaryKey: 'id' });
    console.log(res);
    await client.index('creatorjam').updateFilterableAttributes(['recordType', 'tags']);
    await client.index('creatorjam').updateSortableAttributes(['name']);
  } catch (err) {
    console.error('Error creating Meilisearch index:', err.message);
    throw err;
  }
}

// Add documents to Meilisearch index
async function mAddDocs(files) {
  for (let i = 0; i < files.length; i++) {
    try {
      let parsedFile = JSON.parse(fs.readFileSync(`./_RAW_JSON/${files[i]}`, 'utf8'));
      let res = await client.index('creatorjam').addDocuments(parsedFile, { primaryKey: 'id' });
      console.log(res);
    } catch (err) {
      console.error(`Error adding documents from file ${files[i]}:`, err.message);
      throw err;
    }
  }
}

// Remove links and directories from Meilisearch index
async function mPruneIndex() {
  try {
    const res = await client.index('creatorjam').deleteDocuments({
      filter: 'recordType = "link" OR recordType = "directory"'
    });
    console.log(res);
  } catch (err) {
    console.error('Error pruning Meilisearch index:', err.message);
    throw err;
  }
}

// Delete all search-only keys in Meilisearch
async function deleteAllSearchOnlyKeys() {
  try {
    // Get all keys
    const response = await fetch(`http://${HOST}:${MEILI_PORT}/keys`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.serverInfo.masterKey}`
      }
    });
    if (!response.ok) throw new Error(`Failed to fetch keys: ${response.statusText}`);
    const data = await response.json();

    // Filter search-only keys (actions: ['search'])
    const searchOnlyKeys = data.results.filter(
      key => Array.isArray(key.actions) &&
             key.actions.length === 1 &&
             key.actions[0] === 'search'
    );

    // Delete each search-only key by UID
    for (const key of searchOnlyKeys) {
      const delRes = await fetch(`http://${HOST}:${MEILI_PORT}/keys/${key.uid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${config.serverInfo.masterKey}`
        }
      });
      if (delRes.ok) {
        console.log(`Deleted search-only key: ${key.uid}`);
      } else {
        console.error(`Failed to delete key ${key.uid}: ${delRes.statusText}`);
      }
    }
    if (searchOnlyKeys.length === 0) {
      console.log('No search-only keys found.');
    }
  } catch (err) {
    console.error('Error deleting search-only keys:', err.message);
  }
}

// Create a search-only key in Meilisearch and save to config.json
async function createSearchOnlyKeyAndSave() {
  try {
    const response = await fetch(`http://${HOST}:${MEILI_PORT}/keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.serverInfo.masterKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Search only key',
        actions: ['search'],
        indexes: ['*'],
        expiresAt: null
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create key: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Search-only key:', data.key);

    // Ensure "searchKey" exists in config
    if (!('searchKey' in config.serverInfo)) {
      config.serverInfo.searchKey = data.key;
    } else {
      config.serverInfo.searchKey = data.key;
    }

    try {
      fs.writeFileSync(CONFIGPATH, JSON.stringify(config, null, 4));
    } catch (err) {
      console.error('Failed to write config.json:', err.message);
      throw err;
    }
  } catch (err) {
    console.error('Error creating search-only key:', err.message);
    throw err;
  }
}

// Create index, add documents, and prune index
async function indexData(files) {
  try {
    await mMakeIndex();
    await deleteAllSearchOnlyKeys();
    await createSearchOnlyKeyAndSave();
    await mAddDocs(files);
    await new Promise(r => setTimeout(r, 10000));
    await mPruneIndex();
    process.exit(0);
  } catch (err) {
    console.error('Error during indexing data:', err.message);
    process.exit(1);
  }
}

// GET requests
async function getRequest(url, user, path) {
  try {
    const query = encodeURIComponent(path);
    const urlWithQuery = `${url}/users/${user}/records?path=${query}`;
    const response = await fetch(urlWithQuery, { method: 'GET' });
    const contentType = response.headers.get('content-type');

    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    return data;
  } catch (err) {
    console.error('Error in getRequest:', err.message);
    throw err;
  }
}

// Pull inventory and save to JSON files
export async function inventoryDump() {
  let mainConfig;
  try {
    mainConfig = JSON.parse(fs.readFileSync(CONFIGPATH));
  } catch (err) {
    console.error('Failed to read or parse config.json in inventoryDump:', err.message);
    throw err;
  }

  try {
    if (!fs.existsSync('_RAW_JSON')) { fs.mkdirSync('_RAW_JSON'); }
  } catch (err) {
    console.error('Failed to create _RAW_JSON directory:', err.message);
    throw err;
  }

  let pulledDirs = [];
  let currentData;
  let fileNumber = 0;
  let assetUrl;

  for (let initDirs in mainConfig["inventoryPaths"]) {
    pulledDirs.length = 0;
    pulledDirs.push(mainConfig["inventoryPaths"][initDirs]["directory"]);

    while (pulledDirs.length > 0) {
      try {
        currentData = await getRequest(RESO_APIURL, mainConfig["inventoryPaths"][initDirs]["id"], pulledDirs[0]);
        console.log(pulledDirs[0]);

        for (let i in currentData) {
          if (currentData[i]["recordType"] === "directory") {
            pulledDirs.push(currentData[i]["path"] + "\\" + currentData[i]["name"]);
          }
          else if (currentData[i]["recordType"] === "object") {
            assetUrl = currentData[i]["thumbnailUri"];
            assetUrl = assetUrl.replace('resdb:///', `${RESO_ASSETURL}/`);
            assetUrl = assetUrl.replace('.webp', '');
            Object.assign(currentData[i], { "thumbnailUrl": assetUrl });
          }
        }

        try {
          fs.writeFileSync(`_RAW_JSON/${fileNumber}.json`, JSON.stringify(currentData, null, 2));
        } catch (err) {
          console.error(`Failed to write file _RAW_JSON/${fileNumber}.json:`, err.message);
          throw err;
        }
        fileNumber += 1;
        pulledDirs.shift();
      } catch (err) {
        console.error('Error processing directory:', pulledDirs[0], err.message);
        pulledDirs.shift(); // Skip this directory and continue
      }
    }
  }
}

// Main Execution
(async () => {
  try {
    await inventoryDump();
    let files;
    try {
      files = fs.readdirSync('./_RAW_JSON');
    } catch (err) {
      console.error('Failed to read _RAW_JSON directory:', err.message);
      process.exit(1);
    }
    await indexData(files);
  } catch (err) {
    console.error('Fatal error in main execution:', err.message);
    process.exit(1);
  }
})();