// Optional home-network entry point for the running loopback trial.
// Keep the existing trial process alive so its rooms and local preview survive.
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';

const ipv4 = address => address.split('.').reduce((value, octet) => (value * 256 + Number(octet)) >>> 0, 0);
const isPrivate = address => {
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

export function selectLanAddress(host) {
  const choices = Object.values(networkInterfaces()).flat().filter(address =>
    address && address.family === 'IPv4' && !address.internal && isPrivate(address.address));
  const selected = host ? choices.find(address => address.address === host) : choices.length === 1 ? choices[0] : null;
  if (!selected) throw new Error('Choose a local home-network IPv4 address: node experiments/casting/lan-preview.mjs <address>');
  return selected;
}

export function isLocalPeer(remoteAddress, address, netmask) {
  const remote = remoteAddress?.replace(/^::ffff:/, '');
  if (remote === '127.0.0.1' || remote === '::1') return true;
  if (!remote || !/^\d{1,3}(\.\d{1,3}){3}$/.test(remote) || remote.split('.').some(part => Number(part) > 255)) return false;
  const mask = ipv4(netmask);
  return (ipv4(remote) & mask) === (ipv4(address) & mask);
}

export function createLanProxy({ address, netmask, upstreamPort = 4318 }) {
  return http.createServer((request, response) => {
    if (!isLocalPeer(request.socket.remoteAddress, address, netmask)) {
      response.writeHead(403, { 'Content-Type': 'text/plain' });
      response.end('This preview is available only on the local network.');
      return;
    }
    // Preserve Host and Origin: the trial's origin checks still apply.
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url,
      method: request.method, headers: request.headers }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.on('error', () => response.destroy());
      incoming.pipe(response); // Streaming also preserves the game's live event feed.
    });
    upstream.on('error', () => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(502, { 'Content-Type': 'text/plain' });
        response.end('Start the casting trial on this PC, then reload.');
      }
    });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const selected = selectLanAddress(process.argv[2]);
  const port = Number(process.env.PORT || 4318);
  const proxy = createLanProxy({ address: selected.address, netmask: selected.netmask, upstreamPort: port });
  proxy.on('error', error => { console.error(`LAN preview could not start: ${error.code || error.message}`); process.exitCode = 1; });
  proxy.listen(port, selected.address, () => console.log(`LAN trial: http://${selected.address}:${port} — local subnet only; existing localhost trial stays running.`));
}
