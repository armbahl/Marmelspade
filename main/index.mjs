import fs from 'fs';
import { MeiliSearch } from 'meilisearch';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Parse config
let config;
try {
  config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
}

// Error handling
catch (err) {
  console.error('Failed to read or parse config.json:', err.message);
  process.exit(1);
}

// Constants
const CONFIGPATH = "./config.json";
const HOST = config.serverInfo?.host ?? 'localhost';
const PORT = Number(config.serverInfo?.port ?? 8080);
const MEILI_PORT = Number(config.serverInfo?.meiliPort ?? 7700);
const RESO_APIURL = "https://api.resonite.com";
const RESO_ASSETURL = "https://assets.resonite.com";

// Create Meili client
let client;
try {
  client = new MeiliSearch({
    host: `http://${HOST}:${MEILI_PORT}`,
    apiKey: config.serverInfo?.masterKey
  });
}

// Error handling
catch (err) {
  console.error('Failed to initialize MeiliSearch client:', err.message);
  process.exit(1);
}

// Express app
const app = express();

// Security and parsing middleware
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// Rate limiter
const limiter = rateLimit({
  windowMs: 60_000,
  max: 128,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Serve frontend from local file
app.get(['/', '/frontend.html'], (req, res) => {
  try {
    const html = fs.readFileSync('./main/frontend.html', 'utf-8')
                   .replace(/__HOST_URL__/g, `http://${HOST}:${PORT}`)
                   .replace(/__API_KEY__/g, '');
    res.type('html').send(html);
  }
  
  // Error handling
  catch (err) {
    console.error('Frontend serve error:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

// Public search endpoint
app.post('/api/search', async (req, res) => {
  const payload = req.body || {}; // Request payload
  const indexName = typeof payload.index === 'string' ? payload.index : 'creatorjam'; // Main index
  const q = typeof payload.q === 'string' ? payload.q : ''; // Search query

  // Search options
  const options = (payload.options && typeof payload.options === 'object' && payload.options !== null) ? payload.options : {};

  // Validate options
  if (Array.isArray(options) || typeof options === 'function') {
    return res.status(400).send('Invalid search options');
  }

  // Perform search
  try {
    const result = await client.index(indexName).search(q, options);
    res.json(result);
  }
  
  // Error handling
  catch (err) {
    console.error('Search error:', err.message);
    res.status(502).send('Search backend error');
  }
});

// Not found 404
app.use((req, res) => res.status(404).send('Not Found'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unexpected server error:', err?.message || err);
  res.status(500).send('Internal Server Error');
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

// Create Meilisearch index
async function mMakeIndex() {
  try {
    // Check if index exists
    try {
      await client.getIndex('creatorjam');

      //// DELETE SECTION IF TRYING TO KEEP RECORD IDS
      /**/ await client.deleteIndex('creatorjam');
      /**/ const res = await client.createIndex('creatorjam', { primaryKey: 'id' });
      /**/ console.log('Created index:', res);
      /**/ await client.index('creatorjam').updateFilterableAttributes(['recordType', 'tags']);
      /**/ await client.index('creatorjam').updateSortableAttributes(['name']);
      //// END SECTION
    }
    
    // Create if it does not exist
    catch (err) {
      const notFound =
        err?.errorCode === 'index_not_found' ||
        (typeof err.message === 'string' && err.message.toLowerCase().includes('not found'));

      // Create index if not found
      if (notFound) {
        const res = await client.createIndex('creatorjam', { primaryKey: 'id' });
        console.log('Created index:', res);
        await client.index('creatorjam').updateFilterableAttributes(['recordType', 'tags']);
        await client.index('creatorjam').updateSortableAttributes(['name']);
      }
      
      // Error handling
      else {
        throw err;
      }
    }
  }

  // Error handling
  catch (err) {
    console.error('Error ensuring Meilisearch index:', err.message);
    throw err;
  }
}

// Pull inventory and return JSON batches
async function inventoryDump() {
  let mainConfig;
  try {
    mainConfig = JSON.parse(fs.readFileSync(CONFIGPATH)); // Loads config.json
  }
  
  // Error handling
  catch (err) {
    console.error('Failed to read or parse config.json in inventoryDump:', err.message);
    throw err;
  }

  let pulledDirs = []; // Directories to pull
  let currentData; // Current driectory data
  let fileNumber = 0; // File counter
  let assetUrl; // Asset URL
  const batches = []; // Loads JSON into array

  // Initializes target directories from config.json
  for (let initDirs in mainConfig["inventoryPaths"]) {
    pulledDirs.length = 0;
    pulledDirs.push(mainConfig["inventoryPaths"][initDirs]["directory"]);

    // Pulls directories and loads into memory
    while (pulledDirs.length > 0) {
      try {
        currentData = await getRequest(RESO_APIURL, mainConfig["inventoryPaths"][initDirs]["id"], pulledDirs[0]);
        console.log(pulledDirs[0]);

        for (let i in currentData) {
          // Append directories to pull list
          if (currentData[i]["recordType"] === "directory") {
            pulledDirs.push(currentData[i]["path"] + "\\" + currentData[i]["name"]);
          }

          // Add tumbnailUrl and resdb links to records
          else if (currentData[i]["recordType"] === "object") {
            assetUrl = currentData[i]["thumbnailUri"];
            assetUrl = assetUrl.replace('resdb:///', `${RESO_ASSETURL}/`);
            assetUrl = assetUrl.replace('.webp', '');
            Object.assign(currentData[i], { "thumbnailUrl": assetUrl });
          }
        }

        batches.push(currentData); // Push current data to batches
        fileNumber += 1; // Increment file counter
        pulledDirs.shift(); // Remove processed directory
      }

      // Error handling
      catch (err) {
        console.error('Error processing directory:', pulledDirs[0], err.message);
        pulledDirs.shift(); // Skips directory and continues
      }
    }
  }

  return batches;
}

// Add documents to Meilisearch index
async function mAddDocs(batches) {
  for (let i = 0; i < batches.length; i++) {
    try {
      const batch = batches[i];
      let res = await client.index('creatorjam').addDocuments(batch, { primaryKey: 'id' });
      console.log(res);
    }
    
    // Error handling
    catch (err) {
      console.error(`Error adding documents from batch ${i}:`, err.message);
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
  }
  
  // Error handling
  catch (err) {
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

    // Check response
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

      // Log deletion result
      if (delRes.ok) {
        console.log(`Deleted search-only key: ${key.uid}`);
      }
      
      // Error handling
      else {
        console.error(`Failed to delete key ${key.uid}: ${delRes.statusText}`);
      }
    }

    // Print if no search-only keys found
    if (searchOnlyKeys.length === 0) {
      console.log('No search-only keys found.');
    }
  }
  
  // Error handling
  catch (err) {
    console.error('Error deleting search-only keys:', err.message);
  }
}

// Create a search-only key in Meilisearch and save to config.json
async function createSearchOnlyKeyAndSave() {
  try {
    // Create search-only key
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

    // Check response
    if (!response.ok) {
      throw new Error(`Failed to create key: ${response.statusText}`);
    }

    const data = await response.json(); // Created key data
    console.log('Search-only key:', data.key); // Print created key

    // Ensure "searchKey" exists in config
    if (!('searchKey' in config.serverInfo)) {
      config.serverInfo.searchKey = data.key;
    }
    
    // Update existing "searchKey"
    else {
      config.serverInfo.searchKey = data.key;
    }

    // Write updated config back to config.json
    try {
      fs.writeFileSync(CONFIGPATH, JSON.stringify(config, null, 4));
    }
    
    //  Error handling
    catch (err) {
      console.error('Failed to write config.json:', err.message);
      throw err;
    }
  }
  
  // Error handling
  catch (err) {
    console.error('Error creating search-only key:', err.message);
    throw err;
  }
}

// Create index, add documents, and prune index
async function indexData(batches) {
  try {
    await mMakeIndex(); // Create Meilisearch index
    await deleteAllSearchOnlyKeys(); // Delete existing search-only keys
    await createSearchOnlyKeyAndSave(); // Create new search-only key
    await mAddDocs(batches); // Add documents to index
    await new Promise(r => setTimeout(r, 10000)); // Wait for indexing
    await mPruneIndex(); // Prune index
    process.exit(0); // Exit successfully
  }
   // Error handling
  catch (err) {
    console.error('Error during indexing data:', err.message);
    process.exit(1);
  }
}

// GET requests
async function getRequest(url, user, path) {
  try {
    const query = encodeURIComponent(path); // Encode path
    const urlWithQuery = `${url}/users/${user}/records?path=${query}`; // Full URL
    const response = await fetch(urlWithQuery, { method: 'GET' }); // Fetch request
    const contentType = response.headers.get('content-type'); // Content type

    // Check response
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    }
    
    // Non-JSON response
    else {
      data = await response.text();
    }

    return data;
  }
  
  // Error handling
  catch (err) {
    console.error('Error in getRequest:', err.message);
    throw err;
  }
}

// Main Execution
(async () => {
  try {
    const batches = await inventoryDump(); // Pull inventory data
    await indexData(batches); // Index data in Meilisearch
  }
  
  // Error handling
  catch (err) {
    console.error('Error in main execution:', err.message);
    process.exit(1);
  }
})();