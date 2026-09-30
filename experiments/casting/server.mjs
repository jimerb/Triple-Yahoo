import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { TrialRooms, TrialError } from './room.mjs';

const assets = {
  '/': 'controller.html', '/controller.html': 'controller.html', '/receiver.html': 'receiver.html',
  '/viewer.html': 'viewer.html', '/display-link.html': 'display-link.html', '/display-link.mjs': 'display-link.mjs',
  '/trial.css': 'trial.css', '/controller.mjs': 'controller.mjs', '/controller-state.mjs': 'controller-state.mjs',
  '/receiver.mjs': 'receiver.mjs', '/viewer.mjs': 'viewer.mjs', '/screen.mjs': 'screen.mjs',
  '/sound.mjs': 'sound.mjs', '/cast.mjs': 'cast.mjs', '/client.mjs': 'client.mjs', '/events.mjs': 'events.mjs',
  '/engine.mjs': '../../engine.mjs', '/sounds/dice-on-felt.wav': '../../sounds/dice-on-felt.wav',
};
const mime = f => f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.wav') ? 'audio/wav' : 'text/html';
async function body(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 8192) throw new TrialError(413, 'Request is too large.'); }
  try { return JSON.parse(data); } catch { throw new TrialError(400, 'Invalid request.'); }
}
export function createTrialServer({ rooms = new TrialRooms(), appId = process.env.CAST_APP_ID || '' } = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-transform'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/') && req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new TrialError(403, 'Use the trial website to make this request.');
      if (url.pathname === '/api/config' && req.method === 'GET') return json(200, { appId, trial: true });
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        if (rooms.rooms.size >= 30) throw new TrialError(429, 'This trial is full. Please try later.');
        return json(201, rooms.create((await body(req)).names));
      }
      const match = url.pathname.match(/^\/api\/rooms\/([\w-]+)\/(state|events|action|display)$/);
      if (match) {
        const room = rooms.get(match[1]); const supplied = req.headers.authorization?.replace(/^Bearer /, '') || url.searchParams.get('ticket');
        const endpoint = match[2]; rooms.authorize(room, supplied, endpoint === 'action' ? 'control' : endpoint === 'display' ? 'display' : 'view');
        rooms.expireDisplay(room);
        if (endpoint === 'state' && req.method === 'GET') return json(200, rooms.snapshot(room));
        if (endpoint === 'action' && req.method === 'POST') return json(200, rooms.action(room, supplied, await body(req)));
        if (endpoint === 'display' && req.method === 'POST') return json(200, rooms.display(room, supplied, await body(req)));
        if (endpoint === 'events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
          const write = (type, state) => res.write(`event: ${type}\ndata: ${JSON.stringify(state)}\n\n`);
          // Reconnect is a silent snapshot, never a replay of old game sounds.
          write('snapshot', rooms.snapshot(room));
          const listener = state => { if (state) write('state', state); else { write('expired', null); res.end(); } };
          room.listeners.add(listener); const keepAlive = setInterval(() => res.write(': alive\n\n'), 10000);
          res.on('close', () => { clearInterval(keepAlive); room.listeners.delete(listener); }); return;
        }
        throw new TrialError(405, 'That request method is unavailable.');
      }
      if (req.method !== 'GET' || !assets[url.pathname]) throw new TrialError(404, 'Page not found.');
      const file = assets[url.pathname]; const data = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, { 'Content-Type': mime(file) }); res.end(data);
    } catch (error) { if (!res.headersSent) json(error.status || 500, { error: error.status ? error.message : 'The trial could not complete that request.' }); else res.end(); }
  });
  const timer = setInterval(() => rooms.sweep(), 1000); timer.unref(); server.on('close', () => clearInterval(timer));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4318); const host = process.env.HOST || '127.0.0.1';
  createTrialServer().listen(port, host, () => console.log(`Casting trial: http://${host}:${port} — separate from the working game.`));
}
