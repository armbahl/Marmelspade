import http from 'http';
import fs from 'fs';
import { request as httpRequest } from 'http';

const config = JSON.parse(fs.readFileSync('./config.json'));
const FRONTENDPATH = './Main/frontend.html';
const HOST = config.serverInfo.host;
const PORT = config.serverInfo.port;
const MEILI_PORT = config.serverInfo.meiliPort;
const KEY = config.serverInfo.key;

function setHostFrontend() {
  let lines = fs.readFileSync(FRONTENDPATH, 'utf-8').split('\n');
  lines[350] = `        "${HOST}:${PORT}/meili", // Host URL`;
  lines[351] = `        "${KEY}" // Public API Key`;
  fs.writeFileSync(FRONTENDPATH, lines.join('\n'), 'utf-8');
}
setHostFrontend();

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/frontend.html') {
    fs.readFile(FRONTENDPATH, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url.startsWith('/meili')) {
    // Proxy to Meilisearch
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
        // Clone headers and overwrite Access-Control-Allow-Origin
        const headers = { ...proxyRes.headers };
        // Remove any existing Access-Control-Allow-Origin header
        delete headers['access-control-allow-origin'];
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
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});