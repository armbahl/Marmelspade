import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { MeiliSearch } from "meilisearch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // __dirname replacement for ES modules
const configPath = "./config.json";  // Path to config file

// Parse config file
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

// Error handling
catch (err) {
  console.error("Failed to read config.json:", err);
  process.exit(1);
}

const indexFromConfig = config.serverInfo.indexName; // Index name from config file

// Sanitize index name
const INDEX_NAME = String(indexFromConfig || "files").replace(/[^a-zA-Z0-9_-]/g, "");

// Validate index name
if (!INDEX_NAME) {
  console.error("No valid index name provided in config.json\n Please set \"serverInfo: indexName\" to the proper index.");
  process.exit(1);
}
console.log("Using Meili index:", INDEX_NAME);

// Extract server info from config with defaults
const {
  serverInfo: { host = "localhost", port = 8080, meiliPort = 7700, frontendRemote = false, frontendUrl = "", searchKey } = {},
} = config;

// Validate search key
if (!searchKey) {
  console.error("searchKey missing in config.json");
  process.exit(1);
}

const app = express(); // Create Express app

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://assets.resonite.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      },
    },
  })
);
app.disable("x-powered-by"); // Disable X-Powered-By header

// CORS: only allow configured frontend if remote, otherwise allow same-origin
if (frontendRemote && frontendUrl) {
  app.use(cors({ origin: frontendUrl }));
}

// Allow all origins if not remote
else {
  app.use(cors());
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter); // Apply rate limiting to all requests

app.use(express.json()); // Parse JSON request bodies

// Serve frontend and other static files from the project directory
app.use(express.static(__dirname));

// Replace the JSON root route with the frontend file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend.html"));
});

// Meilisearch search-only client
const meiliHost = `http://${host}:${meiliPort}`;
const meili = new MeiliSearch({ host: meiliHost, apiKey: searchKey });

// Outputs only whitelisted fields from search hits
function pickResultFields(hit) {
  return {
    name: hit.name ?? null,
    path: hit.path ?? null,
    assetUri: hit.assetUri ?? null,
    thumbnailUrl: hit.thumbnailUrl ?? null,
  };
}

// Sanitize and validate query
function sanitizeQuery(raw) {
  if (!raw) return "";

  // Coerce, trim, normalize, remove null/control chars, and limit length
  let q = String(raw).trim();
  try { q = q.normalize('NFC'); }
  
  catch (e) {} // Ignore normalization errors

  // Remove control chars (except whitespace)
  q = q.replace(/[\u0000-\u001F\u007F]/g, '');

  // Enforce max length
  const MAX_Q = 512;
  if (q.length > MAX_Q) q = q.slice(0, MAX_Q);
  return q;
}

// Search endpoint
app.get("/search", async (req, res) => {
  try {
    const q = sanitizeQuery(req.query.q);
    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'." });

    // Limit query length to prevent abuse
    if (q.length > 512) return res.status(400).json({ error: "Query too long." });

    const indexName = INDEX_NAME; // Use server-side configured index only
    const PAGE_SIZE = 8; // Fixed page size enforced by server
    const MAX_TOTAL_RESULTS = 1000; // Limit the maximum number of pageable results

    let page = parseInt(String(req.query.page ?? "1"), 10); // Get page number from query

    // Validate page number
    if (Number.isNaN(page) || page < 1) page = 1;

    const offset = (page - 1) * PAGE_SIZE; // Calculate offset
    const index = meili.index(indexName); // Get MeiliSearch index

    // Search options
    const searchOptions = {
      limit: PAGE_SIZE,
      offset,
      sort: ['name:asc']
    };

    const result = await index.search(q, searchOptions); // Perform search
    const mapped = (result.hits || []).map(pickResultFields); // Map results to whitelisted fields
    
    // Use MeiliSearch's numeric total if available; fall back to mapped.length
    const pHits = Number(result.pHits ?? result.estimatedTotalHits ?? mapped.length);

    const cappedTotal = Math.min(pHits, MAX_TOTAL_RESULTS); // Cap total hits
    const totalPages = Math.max(1, Math.ceil(cappedTotal / PAGE_SIZE)); // Calculate total pages

    // Only return the whitelisted fields
    return res.json({
        hits: mapped,
        pHits,
        cappedTotal,
        totalPages,
        processingTimeMs: result.processingTimeMs ?? undefined,
        query: q,
        page,
        pageSize: PAGE_SIZE
    });
  }
  
  // Error handling
  catch (err) {
    console.error("Search error:", err);
    return res.status(500).json({ error: "Search failed." });
  }
});

// Start the server
app.listen(port, host, () => {
  console.log(`Server listening at http://${host}:${port}`);
});