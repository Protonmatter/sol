// Local HTTP serving for the complete staged application validation harness.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export function createStagedPreviewServer(webRoot, basePath = '/') {
  if (typeof basePath !== 'string' || !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath)
      || basePath.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Preview base path must be a normalized absolute URL path ending in slash');
  }
  const root = path.resolve(webRoot);
  return http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!pathname.startsWith(basePath)) { res.writeHead(404).end(); return; }
      const relative = pathname.slice(basePath.length);
      const file = path.resolve(root, relative.endsWith('/') || !relative ? relative + 'index.html' : relative);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end(); return;
      }
      res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg'})[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(400).end(); }
  });
}
