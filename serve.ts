// Local static preview server for Midnight Bento Rush (Node 22 stdlib only).
// Serves files strictly from ./game on http://127.0.0.1:8080 (or $PORT).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = resolve(ROOT_DIR, 'game');
const LISTEN_PORT = Number(process.env.PORT || 8080);
const LISTEN_HOST = process.env.HOST || '127.0.0.1';

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function safeResolveAsset(rawUrl: string): string | null {
  const pathname = (rawUrl.split('?')[0] || '/').replace(/^\/+/, '');
  const rel = pathname === '' ? 'index.html' : pathname;
  const candidate = resolve(GAME_ROOT, normalize(rel));
  if (candidate !== GAME_ROOT && !candidate.startsWith(`${GAME_ROOT}/`)) {
    return null;
  }
  return candidate;
}

const server = createServer(async (req, res) => {
  const assetPath = safeResolveAsset(req.url || '/');
  if (!assetPath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(assetPath);
    const mime = MIME_BY_EXT[extname(assetPath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`Midnight Bento Rush ready at http://${LISTEN_HOST}:${LISTEN_PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
