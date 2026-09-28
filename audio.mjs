// Procedural dice audio. No sample files: every sound is synthesized with Web Audio,
// modelled on real acrylic dice (hard, bright "clack" modes) landing on felt over wood
// (soft low "thud"). Impacts are scheduled on the audio clock to match the roll animation.

let ctx = null, master = null, noise = null, enabled = false;

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
  comp.attack.value = 0.002; comp.release.value = 0.12;
  master = ctx.createGain(); master.gain.value = 0.9;
  master.connect(comp); comp.connect(ctx.destination);
  // 1 s of white noise, reused for every transient
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// Call from any user gesture. iOS Safari and Chrome on Android only allow audio
// after the page has been touched, so the first tap unlocks the context.
export function unlock() {
  if (!enabled) return;
  const c = init(); if (!c) return;
  if (c.state === 'suspended') c.resume();
  // play a silent buffer (required by older iOS WebKit)
  const b = c.createBufferSource(); b.buffer = c.createBuffer(1, 1, 22050); b.connect(master); b.start(0);
}
export function setEnabled(on) { enabled = !!on; if (on) unlock(); }
export function now() { return ctx ? ctx.currentTime : 0; }

function out(pan) {
  if (ctx.createStereoPanner && pan) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(master); return p;
  }
  return master;
}
function noiseBurst(t, dest, { type = 'bandpass', freq = 3000, q = 1, gain = 0.3, attack = 0.001, decay = 0.03 }) {
  const src = ctx.createBufferSource(); src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.8); src.stop(t + attack + decay + 0.02);
}
function tone(t, dest, { freq, gain, decay, type = 'sine', attack = 0.0015, glide = 1 }) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide !== 1) o.frequency.exponentialRampToValueAtTime(freq * glide, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + attack + decay + 0.02);
}

// One die hitting the table. strength 0..1, pan -1..1
function impact(t, strength, pan) {
  const dest = out(pan), s = Math.max(0.05, strength);
  // table body: felt-muffled wood thump
  tone(t, dest, { freq: 95 + Math.random() * 50, gain: 0.35 * s, decay: 0.05 + 0.03 * s, glide: 0.6 });
  noiseBurst(t, dest, { type: 'lowpass', freq: 520 + 300 * s, q: 0.7, gain: 0.5 * s, decay: 0.035 + 0.03 * s });
  // die corner click: bright, short, a few inharmonic modes of a small acrylic cube
  const f0 = 2300 + Math.random() * 1400;
  noiseBurst(t, dest, { freq: f0, q: 2.5, gain: 0.22 * s, decay: 0.012 + 0.01 * s });
  [1, 1.53, 2.21].forEach((m, i) => tone(t + 0.0005 * i, dest, { freq: f0 * m, gain: (0.05 / (i + 1)) * s, decay: 0.02 + 0.02 * s }));
}
// Two dice knocking together (in the hand or on the table): no table thump, all click
function clack(t, strength, pan) {
  const dest = out(pan), s = Math.max(0.05, strength), f0 = 3000 + Math.random() * 1800;
  noiseBurst(t, dest, { freq: f0, q: 3.5, gain: 0.2 * s, decay: 0.008 + 0.006 * s });
  [1, 1.47, 2.09].forEach((m, i) => tone(t, dest, { freq: f0 * m, gain: (0.045 / (i + 1)) * s, decay: 0.015 + 0.012 * s }));
}
// Felt scuff as a die slides to rest
function slide(t, dur, strength, pan) {
  noiseBurst(t, out(pan), { type: 'bandpass', freq: 900, q: 0.6, gain: 0.05 * strength, attack: 0.01, decay: dur });
}

// events: [{t: seconds from now, kind: 'impact'|'clack'|'slide'|'rattle', s, pan, dur}]
export function playRoll(events) {
  if (!enabled) return; const c = init(); if (!c) return;
  if (c.state === 'suspended') c.resume();
  const base = c.currentTime + 0.02;
  for (const e of events) {
    const t = base + e.t;
    if (e.kind === 'impact') impact(t, e.s, e.pan);
    else if (e.kind === 'clack') clack(t, e.s, e.pan);
    else if (e.kind === 'slide') slide(t, e.dur || 0.08, e.s, e.pan);
    else if (e.kind === 'rattle') {
      // dice shaken in a loose fist: a dense, irregular cluster of clacks
      const n = Math.round(e.dur * 70 * (0.6 + e.s * 0.6));
      for (let i = 0; i < n; i++) clack(t + Math.random() * e.dur, 0.25 + Math.random() * 0.55 * e.s, (Math.random() - 0.5) * 0.5);
    }
  }
}

export function sfx(name) {
  if (!enabled) return; const c = init(); if (!c) return;
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime + 0.01;
  if (name === 'select') { clack(t, 0.35, 0); }
  else if (name === 'score') {
    // wooden peg + soft two-note chime
    noiseBurst(t, master, { freq: 1400, q: 4, gain: 0.12, decay: 0.03 });
    tone(t, master, { freq: 880, gain: 0.08, decay: 0.35, type: 'triangle' });
    tone(t + 0.07, master, { freq: 1318.5, gain: 0.07, decay: 0.5, type: 'triangle' });
  } else if (name === 'zero') {
    tone(t, master, { freq: 180, gain: 0.18, decay: 0.2, glide: 0.55 });
    noiseBurst(t, master, { type: 'lowpass', freq: 400, gain: 0.2, decay: 0.08 });
  } else if (name === 'yahoo') {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      tone(t + i * 0.085, master, { freq: f, gain: 0.09, decay: 0.6, type: 'triangle' });
      tone(t + i * 0.085, master, { freq: f * 2, gain: 0.025, decay: 0.4 });
    });
  } else if (name === 'win') {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(t + i * 0.12, master, { freq: f, gain: 0.09, decay: 0.8, type: 'triangle' }));
    [523.25, 659.25, 783.99, 1046.5].forEach(f => tone(t + 0.55, master, { freq: f, gain: 0.05, decay: 1.4, type: 'triangle' }));
  } else if (name === 'turn') {
    tone(t, master, { freq: 660, gain: 0.05, decay: 0.18, type: 'triangle' });
    tone(t + 0.09, master, { freq: 990, gain: 0.05, decay: 0.25, type: 'triangle' });
  }
}
