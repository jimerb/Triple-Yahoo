import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { newGame, roll, commit, score, totals } from '../../engine.mjs';

export const LEASE_MS = 12000;
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const token = () => randomBytes(24).toString('base64url');
const same = (a, b) => {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export class TrialError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Deliberately one controller for this casting experiment, not the multiplayer release.
// TV and separate viewers subscribe directly to this service, never through that phone.
export class TrialRooms {
  constructor({ clock = Date.now, random = () => randomInt(6) / 6 } = {}) {
    this.clock = clock; this.random = random; this.rooms = new Map();
  }
  create(names) {
    if (!Array.isArray(names) || names.length < 1 || names.length > 6 || names.some(n => typeof n !== 'string' || !n.trim() || n.trim().length > 24)) {
      throw new TrialError(400, 'Enter one to six nicknames, up to 24 characters each.');
    }
    const room = { id: token(), controlToken: token(), viewToken: token(), displayToken: token(),
      game: newGame(names.map(n => n.trim())), revision: 0, cue: null, display: null,
      expires: this.clock() + ROOM_TTL_MS, listeners: new Set(), commands: new Map() };
    this.rooms.set(room.id, room);
    return { roomId: room.id, controlToken: room.controlToken, viewToken: room.viewToken, displayToken: room.displayToken };
  }
  get(id) {
    const room = this.rooms.get(id);
    if (!room || room.expires <= this.clock()) throw new TrialError(410, 'This trial room has expired. Start another trial.');
    return room;
  }
  authorize(room, supplied, role = 'view') {
    const allowed = role === 'control' ? [room.controlToken] : role === 'display' ? [room.displayToken] : [room.viewToken, room.controlToken, room.displayToken];
    if (!allowed.some(t => same(supplied, t))) throw new TrialError(403, 'This link cannot access that trial room.');
  }
  snapshot(room) {
    return { roomId: room.id, revision: room.revision, game: structuredClone(room.game),
      totals: room.game.players.map(p => totals(p.card)), cue: room.cue,
      soundOwner: room.display ? room.display.instance : 'phone',
      displayConnected: !!room.display, serverNow: this.clock() };
  }
  emit(room) {
    room.revision++; const state = this.snapshot(room);
    for (const fn of room.listeners) fn(state);
    return state;
  }
  expireDisplay(room) {
    if (room.display && room.display.until <= this.clock()) { room.display = null; this.emit(room); }
  }
  action(room, supplied, data) {
    this.authorize(room, supplied, 'control'); this.expireDisplay(room);
    if (typeof data.id !== 'string' || data.id.length > 80 || !data.id) throw new TrialError(400, 'Missing action identity.');
    if (room.commands.has(data.id)) return this.snapshot(room);
    if (data.revision !== room.revision) throw new TrialError(409, 'The game has updated. Try your move again.');
    const game = room.game; let cue = null;
    if (data.type === 'roll') {
      const mask = game.rolls === 0 ? [true, true, true, true, true] : [...game.selected];
      if (!roll(game, this.random)) throw new TrialError(409, 'Choose dice to reroll, or score this turn.');
      cue = { type: 'roll', mask };
    } else if (data.type === 'select') {
      if (!Array.isArray(data.selected) || data.selected.length !== 5 || data.selected.some(value => typeof value !== 'boolean') || !game.rolls || game.rolls >= 3 || game.done) throw new TrialError(400, 'Those dice cannot be selected now.');
      game.selected = [...data.selected];
    } else if (data.type === 'toggle') {
      if (!Number.isInteger(data.die) || data.die < 0 || data.die > 4 || !game.rolls || game.rolls >= 3 || game.done) throw new TrialError(400, 'That die cannot be selected now.');
      game.selected[data.die] = !game.selected[data.die];
    } else if (data.type === 'score') {
      if (!Number.isInteger(data.row) || data.row < 0 || data.row > 12 || !Number.isInteger(data.column) || data.column < 0 || data.column > 2) throw new TrialError(400, 'Choose a valid score box.');
      const points = score(game.dice, data.row) * (data.column + 1);
      if (points === 0 && data.confirmZero !== true) throw new TrialError(400, 'Confirm taking a zero in this box.');
      const player = game.active;
      if (!commit(game, data.row, data.column)) throw new TrialError(409, 'That box is unavailable.');
      cue = { type: 'score', player, row: data.row, column: data.column, points };
    } else if (data.type === 'phone-sound') {
      room.display = null;
    } else { throw new TrialError(400, 'Unknown trial action.'); }
    room.cue = cue ? { ...cue, id: data.id, at: this.clock() } : null;
    room.commands.set(data.id, true);
    if (room.commands.size > 512) room.commands.delete(room.commands.keys().next().value);
    return this.emit(room);
  }
  display(room, supplied, { instance, ready, renew = false }) {
    this.authorize(room, supplied, 'display'); this.expireDisplay(room);
    if (typeof instance !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(instance)) throw new TrialError(400, 'Invalid display identity.');
    if (ready === false) {
      if (room.display?.instance === instance) { room.display = null; return this.emit(room); }
    } else if (ready === true) {
      if (renew && room.display?.instance !== instance) throw new TrialError(409, 'TV sound was released. Tap Show on TV to transfer it back.');
      if (room.display && room.display.instance !== instance) throw new TrialError(409, 'Another display has the sound. Stop it before switching.');
      if (room.display) room.display.until = this.clock() + LEASE_MS;
      else { room.display = { instance, until: this.clock() + LEASE_MS }; return this.emit(room); }
    } else { throw new TrialError(400, 'Confirm display readiness.'); }
    return this.snapshot(room);
  }
  sweep() {
    for (const [id, room] of this.rooms) {
      if (room.expires <= this.clock()) { for (const fn of room.listeners) fn(null); this.rooms.delete(id); }
      else this.expireDisplay(room);
    }
  }
}
