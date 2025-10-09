import http from 'http';
import fs from 'fs';
import { request as httpRequest } from 'http';

let config;
try {
  config = JSON.parse(fs.readFileSync('./config.json'));
} catch (err) {
  console.error('Failed to read or parse config.json:', err.message);
  process.exit(1);
}

const FRONTEND_LOCAL_PATH = './main/frontend.html'; // Local path to frontend HTML file
const FRONTEND_REMOTE_URL = config.serverInfo.frontendUrl; // Pulls url from config.json
const HOST = config.serverInfo.host;
const PORT = config.serverInfo.port;
const SEARCHKEY = config.serverInfo.searchKey;
const HOST_URL = `${HOST}:${PORT}/meili`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/' || req.url === '/frontend.html') {
      if (config.serverInfo.frontendRemote) {
        // Serve frontend from remote URL
        try {
          const response = await fetch(FRONTEND_REMOTE_URL);
          if (!response.ok) throw new Error('Failed to fetch remote frontend');
          let data = await response.text();
          data = data.replace(/__HOST_URL__/g, HOST_URL)
                     .replace(/__API_KEY__/g, SEARCHKEY);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        } catch (err) {
          console.error('Error fetching remote frontend:', err.message);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
        }
      }
      else {
        // Serve frontend from local file
        fs.readFile(FRONTEND_LOCAL_PATH, 'utf-8', (err, data) => {
          if (err) {
            console.error('Error reading frontend file:', err.message);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
            return;
          }
          data = data.replace(/__HOST_URL__/g, HOST_URL)
                     .replace(/__API_KEY__/g, SEARCHKEY);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        });
      }
    }
    else if (req.url.startsWith('/meili')) {
      // Proxy to Meilisearch
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const options = {
            hostname: HOST,
            port: config.serverInfo.meiliPort,
            path: req.url.slice(6) || '/', // Remove '/meili' prefix
            method: req.method,
            headers: {
              ...req.headers,
              'host': `${HOST}:${config.serverInfo.meiliPort}`,
            }
          };
          const proxy = httpRequest(options, proxyRes => {
            const headers = { ...proxyRes.headers };
            delete headers['access-control-allow-origin'];
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
        } catch (proxyErr) {
          console.error('Proxy request error:', proxyErr.message);
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
    else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  } catch (err) {
    console.error('Unexpected server error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
  }
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});