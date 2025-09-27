import http from 'http';
import fs from 'fs';
import { request as httpRequest } from 'http';
import { MeiliSearch } from 'meilisearch';
import fetch from 'node-fetch'; // Import fetch for Node.js

const CONFIGPATH = "./config.json"; // Config file path
const config = JSON.parse(fs.readFileSync(CONFIGPATH)); // Configuration file
const HOST = config.serverInfo.host; // Server host
const PORT = config.serverInfo.port; // Server port
const MEILI_PORT = config.serverInfo.meiliPort; // Meilisearch port
const RESO_APIURL = "https://api.resonite.com"; // Base API URL
const RESO_ASSETURL = "https://assets.resonite.com"; // Base Asset URL

// Nodejs server to serve frontend and proxy Meilisearch requests
const server = http.createServer((req, res) => {
  // Error handling for file read
  if (req.url === '/' || req.url === '/frontend.html') {
    fs.readFile('./frontend.html', (err, data) => {
      if (err) {
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
      const options = {
        hostname: HOST,
        port: MEILI_PORT,
        path: req.url.replace('/meili', ''),
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
      proxy.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      });
      if (body) proxy.write(body);
      proxy.end();
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

// Meilisearch client setup
const client = new MeiliSearch({
  host: `http://${HOST}:${MEILI_PORT}`,
  apiKey: 'aSampleMasterKey'
});

// Create Meilisearch index
async function mMakeIndex() {
  client.deleteIndex('creatorjam').catch(() => { }); // Deletes existing index if it exists
  await new Promise(r => setTimeout(r, 5000)); // Waits for 5 seconds to ensure deletion is processed
  const res = await client.createIndex('creatorjam', { primaryKey: 'id' });
  console.log(res);
  await client.index('creatorjam').updateFilterableAttributes(['recordType']);
  await client.index('creatorjam').updateSortableAttributes(['name']);
}

// Add documents to Meilisearch index
async function mAddDocs(files) {
  for (let i = 0; i < files.length; i++) {
    let parsedFile = JSON.parse(fs.readFileSync(`./_RAW_JSON/${files[i]}`, 'utf8'));
    let res = await client.index('creatorjam').addDocuments(parsedFile, { primaryKey: 'id' });
    console.log(res);
  }
}

// Remove links and directories from Meilisearch index
async function mPruneIndex() {
  const res = await client.index('creatorjam').deleteDocuments({
    filter: 'recordType = "link" OR recordType = "directory"'
  });
  console.log(res);
}

// Async function to create index, add documents, and prune index
async function indexData(files) {
  await mMakeIndex();
  await mAddDocs(files);
  await new Promise(r => setTimeout(r, 30000));
  await mPruneIndex();
  process.exit(0); // Stop the program
}

// GET requests
async function getRequest(url, user, path) {
  const query = encodeURIComponent(path); // Converts inventory path to URL encoded format
  const urlWithQuery = `${url}/users/${user}/records?path=${query}`; // Adds query to base URL
  const response = await fetch(urlWithQuery, { method: 'GET' }); // Fetches data from API
  const contentType = response.headers.get('content-type'); // Gets content type from response headers

  let data; // Variable to hold response data

  // Parses response based on content type
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return data; // Returns the parsed data
}

// Main function to pull inventory and save to JSON files
export async function inventoryDump() {
  const mainConfig = JSON.parse(fs.readFileSync(CONFIGPATH));

  if (!fs.existsSync('_RAW_JSON')) { fs.mkdirSync('_RAW_JSON'); } // Creates directory for raw JSON files if it doesn't exist

  let pulledDirs = []; // Array to hold pulled directories
  let currentData; // Variable to hold current data from API
  let fileNumber = 0; // Counter for naming JSON files
  let assetUrl; // Variable to hold actual asset URL

  // Loop through each index in "inventoryPaths" within config file
  for (let initDirs in mainConfig["inventoryPaths"]) {
    pulledDirs.length = 0; // Clears array for each iterated index
    pulledDirs.push(mainConfig["inventoryPaths"][initDirs]["directory"]); // Adds initial directory to array

    // Recursively pulls directories and saves data to JSON files
    while (pulledDirs.length > 0) {
      currentData = await getRequest(RESO_APIURL, mainConfig["inventoryPaths"][initDirs]["id"], pulledDirs[0]); // Fetches data
      console.log(pulledDirs[0]);

      // Finds subdirectories and adds them to the array
      for (let i in currentData) {
        if (currentData[i]["recordType"] === "directory") {
          pulledDirs.push(currentData[i]["path"] + "\\" + currentData[i]["name"]);
        }
        else if (currentData[i]["recordType"] === "object") {
          assetUrl = currentData[i]["thumbnailUri"]; // Loads raw URI
          assetUrl = assetUrl.replace('resdb:///', `${RESO_ASSETURL}/`); // Replaces "resdb:///" with asset URL
          assetUrl = assetUrl.replace('.webp', ''); // Removes ".webp" from URL
          Object.assign(currentData[i], { "thumbnailUrl": assetUrl }); // Adds proper URL field to object
        }
      }

      fs.writeFileSync(`_RAW_JSON/${fileNumber}.json`, JSON.stringify(currentData, null, 2)); // Writes JSON data to file
      fileNumber += 1; // Increments for file naming

      pulledDirs.shift(); // Removes the processed directory from the beginning of the array
    }
  }
}

// Main Execution
(async () => {
  await inventoryDump(); // Calls main function to execute inventory dump
  const files = fs.readdirSync('./_RAW_JSON'); // Reads all files in _RAW_JSON directory
  await indexData(files); // Indexes JSON into Meilisearch
})();