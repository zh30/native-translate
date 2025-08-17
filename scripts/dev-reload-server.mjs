#!/usr/bin/env node
// Simple SSE server that watches dist/ and notifies connected clients to reload
// Usage: node scripts/dev-reload-server.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.NT_DEV_RELOAD_PORT ? Number(process.env.NT_DEV_RELOAD_PORT) : 5173;
const DIST_DIR = path.resolve(process.cwd(), 'dist');

/** @type {http.ServerResponse[]} */
const clients = [];

function sendAll(event, data) {
  const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
  for (const res of [...clients]) {
    try {
      res.write(payload);
    } catch {
      // drop dead connections
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');
    clients.push(res);
    req.on('close', () => {
      const idx = clients.indexOf(res);
      if (idx >= 0) clients.splice(idx, 1);
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('ok');
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[dev-reload] SSE listening on http://localhost:${PORT}/events`);
});

let ready = false;
try {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  ready = true;
} catch { }

if (ready) {
  let debounceTimer = null;
  const emitChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => sendAll('message', { type: 'reload' }), 100);
  };
  try {
    fs.watch(DIST_DIR, { recursive: true }, emitChange);
    // eslint-disable-next-line no-console
    console.log(`[dev-reload] Watching: ${DIST_DIR}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dev-reload] fs.watch failed, using interval polling');
    let snapshot = '';
    setInterval(() => {
      try {
        const list = walk(DIST_DIR).join('\n');
        if (snapshot && snapshot !== list) emitChange();
        snapshot = list;
      } catch { }
    }, 500);
  }
}

function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(`${p}:${st.mtimeMs}`);
  }
  return out;
}


