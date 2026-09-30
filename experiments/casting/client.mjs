import { eventGate } from './events.mjs';
export async function request(path, data, ticket) {
  const result = await fetch(path, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(ticket ? { Authorization: `Bearer ${ticket}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const value = await result.json(); if (!result.ok) throw Error(value.error || 'Connection problem.'); return value;
}
export function subscribe(config, onState, onConnection) {
  const gate = eventGate();
  const stream = new EventSource(`/api/rooms/${config.roomId}/events?ticket=${encodeURIComponent(config.ticket)}`);
  stream.addEventListener('snapshot', e => { const state = JSON.parse(e.data); gate(state, true); onConnection(true); onState(state, false); });
  stream.addEventListener('state', e => { const state = JSON.parse(e.data); onState(state, gate(state)); });
  stream.addEventListener('expired', () => { stream.close(); onConnection(false, 'This trial room has expired.'); });
  stream.onerror = () => onConnection(false, 'Reconnecting…');
  return () => stream.close();
}
