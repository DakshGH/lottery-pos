#!/usr/bin/env node
/*
 * server.js — zero-dependency static file server for the Lottery POS app.
 * Run:  node server.js        (then open http://localhost:5173)
 *       node server.js 8080   (custom port)
 *
 * The app also works by opening index.html directly in a browser; this server
 * just gives a clean http origin (useful for the optional online game-DB fetch).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 5173;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // prevent path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('\n  Lottery POS running at  http://localhost:' + PORT + '\n');
  console.log('  Press Ctrl+C to stop.\n');
});
