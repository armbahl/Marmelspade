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

const FRONTENDPATH = './main/frontend.html';
const HOST = config.serverInfo.host;
const PORT = config.serverInfo.port;
const SEARCHKEY = config.serverInfo.searchKey;
const HOST_URL = `${HOST}:${PORT}/meili`;

const server = http.createServer((req, res) => {
  try {
    if (req.url === '/' || req.url === '/frontend.html') {
      fs.readFile(FRONTENDPATH, 'utf-8', (err, data) => {
        if (err) {
          console.error('Error reading frontend file:', err.message);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
          return;
        }
        // Replace placeholders with actual values
        data = data.replace(/__HOST_URL__/g, HOST_URL)
                   .replace(/__API_KEY__/g, SEARCHKEY);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    } else if (req.url.startsWith('/meili')) {
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
            // Clone headers and overwrite Access-Control-Allow-Origin
            const headers = { ...proxyRes.headers };
            // Remove any existing Access-Control-Allow-Origin header
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
    } else {
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