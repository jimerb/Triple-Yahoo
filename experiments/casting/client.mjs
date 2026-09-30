import { eventGate } from './events.mjs';
// randomUUID is restricted to secure contexts; getRandomValues also works for
// the optional HTTP LAN preview. These IDs deduplicate actions, not authenticate.
export function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function request(path, data, ticket) {
  const result = await fetch(path, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(ticket ? { Authorization: `Bearer ${ticket}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const value = await result.json(); if (!result.ok) {const error=Error(value.error || 'Connection problem.');error.status=result.status;throw error;} return value;
}
export function subscribe(config, onState, onConnection) {
  const gate = eventGate();
  const stream = new EventSource(`/api/rooms/${config.roomId}/events?ticket=${encodeURIComponent(config.ticket)}`);
  stream.addEventListener('snapshot', e => { const state = JSON.parse(e.data); gate(state, true); onConnection(true); onState(state, false, true); });
  stream.addEventListener('state', e => { const state = JSON.parse(e.data); onState(state, gate(state), false); });
  stream.addEventListener('expired', () => { stream.close(); onConnection(false, 'This trial room has expired.'); });
  stream.onerror = () => onConnection(false, 'Reconnecting…');
  return () => stream.close();
}
