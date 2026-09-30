// Snapshots and out-of-order/repeated events must never replay old audio.
export function eventGate() {
  let revision = -1, seen = new Set(), offset = 0;
  return (state, snapshot = false, now = Date.now()) => {
    if (snapshot) { offset = now - state.serverNow; revision = state.revision; if (state.cue) seen.add(state.cue.id); return false; }
    if (state.revision <= revision) return false;
    revision = state.revision;
    const cue = state.cue;
    if (!cue || seen.has(cue.id)) return false;
    seen.add(cue.id); if (seen.size > 512) seen.delete(seen.values().next().value);
    return now - offset - cue.at >= -1000 && now - offset - cue.at <= 2000;
  };
}
