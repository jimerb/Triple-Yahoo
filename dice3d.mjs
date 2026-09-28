// 3D dice on a tilted felt table. Pure CSS 3D transforms driven by the Web Animations API.
// Each die is a real cube (6 faces + inner core). A roll scoops the dice up toward the viewer,
// shakes them, throws them back onto the felt where they bounce with decaying height,
// tumble through random full spins and settle with the rolled value on top.
// Face lighting is recomputed every frame from the die's actual orientation.
import { playRoll } from './audio.mjs';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// face value -> transform placing that face on the cube, and its outward normal (cube-local)
const FACES = {
  1: { t: '', n: [0, 0, 1] },
  6: { t: 'rotateY(180deg)', n: [0, 0, -1] },
  2: { t: 'rotateY(90deg)', n: [1, 0, 0] },
  5: { t: 'rotateY(-90deg)', n: [-1, 0, 0] },
  3: { t: 'rotateX(90deg)', n: [0, -1, 0] },
  4: { t: 'rotateX(-90deg)', n: [0, 1, 0] },
};
// cube rotation (rotateX, rotateY) that brings each value to the top (+z = up from the felt)
const UP = { 1: [0, 0], 6: [180, 0], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
const norm = v => { const m = Math.hypot(...v); return v.map(x => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const LIGHT = norm([-0.45, 0.3, 1]);
// viewer direction in table coordinates (the table is tilted rotateX(32deg) away from the camera)
const VIEW = [0, Math.sin(32 * Math.PI / 180), Math.cos(32 * Math.PI / 180)];
const HALF = norm(LIGHT.map((x, i) => x + VIEW[i]));
// Solid die: 6 flat faces inset by BEV, 12 rounded edge strips and 8 corner caps close the gaps.
const BEV = 0.1; // bevel size as a fraction of the die edge
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const EDGES = [], CORNERS = [];
for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) for (const si of [1, -1]) for (const sj of [1, -1]) {
  const a = AX[i].map(x => x * si), b = AX[j].map(x => x * sj), u = AX[3 - i - j];
  const n = norm(a.map((x, k) => x + b[k])), v = cross(n, u);
  // local +y of the strip points toward whichever face normal agrees with v
  const [top, bot] = a[0] * v[0] + a[1] * v[1] + a[2] * v[2] < 0 ? [a, b] : [b, a];
  EDGES.push({ u, v, n, dir: a.map((x, k) => x + b[k]), top, bot });
}
for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
  const sgn = [sx, sy, sz], n = norm(sgn), u = norm([-sx, -sy, 2 * sz]), v = cross(n, u);
  // rounded corner: surface normals around the cap, sampled every 60deg of a CSS conic gradient
  // (starting at 30deg). Vertices touch a flat face, the points between them touch an edge strip.
  const ring = [30, 90, 150, 210, 270, 330].map(deg => {
    const r = deg * Math.PI / 180, d = u.map((x, i) => Math.sin(r) * x - Math.cos(r) * v[i]);
    const face = k => AX[k].map(x => x * sgn[k]);
    const order = [0, 1, 2].sort((a, b) => d[b] * sgn[b] - d[a] * sgn[a]); // most outward axis first
    const vertex = deg % 120 === 90; // 90, 210, 330 are the triangle's vertices
    return { n: vertex ? face(order[0]) : norm(face(order[0]).map((x, i) => x + face(order[1])[i])), vertex };
  });
  CORNERS.push({ n, u, v, sgn, ring });
}
const m3d = (u, v, n, t) => `matrix3d(${u[0]},${u[1]},${u[2]},0,${v[0]},${v[1]},${v[2]},0,${n[0]},${n[1]},${n[2]},0,${t[0]},${t[1]},${t[2]},1)`;
// brightness overlay for a surface normal (already in table space): dark shade plus a soft specular glint
function lightAt(p) {
  const dot = p[0] * LIGHT[0] + p[1] * LIGHT[1] + p[2] * LIGHT[2];
  const spec = Math.pow(Math.max(0, p[0] * HALF[0] + p[1] * HALF[1] + p[2] * HALF[2]), 24);
  return { dark: 0.5 * (1 - Math.max(0, dot)), spec };
}
const overlay = ({ dark, spec }) => {
  const s = spec * 0.75, a = Math.min(1, dark + s), w = a ? s / a : 0;
  const mix = (hi, lo) => Math.round(hi * w + lo * (1 - w));
  return `rgba(${mix(255, 28)},${mix(252, 20)},${mix(240, 9)},${a.toFixed(3)})`;
};
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createTray(stage, { onToggle } = {}) {
  const table = document.createElement('div'); table.className = 'table3d';
  const hits = document.createElement('div'); hits.className = 'dice-hits';
  stage.append(table, hits);
  const dice = [];
  for (let i = 0; i < 5; i++) {
    const wrap = el('div', 'dwrap'), shadow = el('div', 'dshadow'), ring = el('div', 'dring'),
      lift = el('div', 'dlift'), cube = el('div', 'cube');
    const faces = {}, cores = [], edges = [], corners = [];
    // solid core: three crossed planes so nothing behind a hairline seam ever shows through
    for (const t of ['', 'rotateY(90deg)', 'rotateX(90deg)']) { const c = el('div', 'core'); c.dataset.t = t; cores.push(c); cube.append(c); }
    for (const [v, f] of Object.entries(FACES)) {
      const face = el('div', 'face'); face.dataset.v = v;
      for (let p = 0; p < 9; p++) { const s = el('span', PIPS[v].includes(p) ? 'pip' : ''); face.append(s); }
      const shade = el('i', 'shade'); face.append(shade);
      faces[v] = { face, shade, t: f.t, n: f.n };
      cube.append(face);
    }
    for (const e of EDGES) { const b = el('div', 'bevel'), shade = el('i', 'shade'); b.append(shade); cube.append(b); edges.push({ ...e, el: b, shade }); }
    for (const k of CORNERS) { const b = el('div', 'bevel corner'), shade = el('i', 'shade'); b.append(shade); cube.append(b); corners.push({ ...k, el: b, shade }); }
    lift.append(cube); wrap.append(shadow, ring, lift); table.append(wrap);
    const hit = document.createElement('button'); hit.type = 'button'; hit.className = 'die-hit';
    hit.innerHTML = '<span class="tag"></span>';
    hit.addEventListener('click', () => onToggle?.(i));
    hits.append(hit);
    dice.push({ wrap, shadow, ring, lift, cube, faces, cores, edges, corners, hit, value: 1, rx: 0, ry: 0, yaw: rnd(-8, 8), lifted: false, x: 0, y: 0 });
  }
  let geo = { s: 60, w: 300, h: 160, slots: [] }, animating = false, state = null;

  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const s = Math.round(Math.max(34, Math.min(w / 7.6, h * 0.42, 100)));
    const gap = Math.min(s * 1.55, (w - s * 1.9) / 4);
    const cx = w / 2, cy = h * 0.5;
    geo = { s, w, h, gap, slots: dice.map((_, i) => [cx + (i - 2) * gap, cy]) };
    stage.style.setProperty('--s', s + 'px');
    table.style.width = w + 'px'; table.style.height = h + 'px';
    dice.forEach((d, i) => {
      d.x = geo.slots[i][0]; d.y = geo.slots[i][1];
      build(d, s);
      const bw = Math.min(gap * 0.96, s * 1.45);
      Object.assign(d.hit.style, { left: d.x - bw / 2 + 'px', top: d.y - s * 1.05 + 'px', width: bw + 'px', height: s * 1.95 + 'px' });
      if (!animating) pose(d);
    });
  }
  // place every piece of the solid die for edge length s (pixels)
  function build(d, s) {
    const h = s / 2, c = s * BEV, ov = 0.5; // ov: tiny overlap that hides anti-aliasing seams
    for (const f of Object.values(d.faces)) { f.face.style.inset = c - ov + 'px'; f.face.style.transform = `${f.t} translateZ(${h}px)`; }
    const core = s - c;
    for (const k of d.cores) Object.assign(k.style, { width: core + 'px', height: core + 'px', left: c / 2 + 'px', top: c / 2 + 'px', transform: k.dataset.t });
    const L = s - 2 * c + 2 * ov, W = c * Math.SQRT2 + 2 * ov;
    for (const e of d.edges) Object.assign(e.el.style, {
      width: L + 'px', height: W + 'px', left: (s - L) / 2 + 'px', top: (s - W) / 2 + 'px',
      transform: m3d(e.u, e.v, e.n, e.dir.map(x => x * (h - c / 2))),
    });
    const R = c * Math.SQRT2 / Math.sqrt(3) + ov * 2;
    for (const k of d.corners) Object.assign(k.el.style, {
      width: 2 * R + 'px', height: 2 * R + 'px', left: h - R + 'px', top: h - R + 'px',
      transform: m3d(k.u, k.v, k.n, k.sgn.map(x => x * (h - 2 * c / 3))),
    });
  }
  const liftZ = d =>geo.s / 2 + (d.lifted ? geo.s * 0.22 : 0);
  function pose(d) {
    d.wrap.style.transform = `translate3d(${d.x - geo.s / 2}px,${d.y - geo.s / 2}px,0) rotateZ(${d.yaw}deg)`;
    d.lift.style.transform = `translateZ(${liftZ(d)}px)`;
    d.cube.style.transform = `rotateX(${d.rx}deg) rotateY(${d.ry}deg) rotateZ(0deg)`;
    const k = d.lifted ? 0.22 : 0;
    d.shadow.style.transform = `translateZ(0.5px) scale(${1 + k * 0.6})`; d.shadow.style.opacity = String(0.6 - k);
    shade(d);
  }
  // lighting: brightness of each face from its world-space normal
  function shade(d, live) {
    let W, C;
    if (live) { W = new DOMMatrix(getComputedStyle(d.wrap).transform); C = new DOMMatrix(getComputedStyle(d.cube).transform); }
    else { W = new DOMMatrix().rotate(0, 0, d.yaw); C = new DOMMatrix().rotate(d.rx, 0, 0).rotate(0, d.ry, 0); }
    const M = W.multiply(C);
    // table coordinates: CSS z is up out of the felt, y points toward the viewer
    const toWorld = n => { const p = M.transformPoint(new DOMPoint(n[0], n[1], n[2], 0)); return [p.x, p.y, p.z]; };
    for (const f of Object.values(d.faces)) f.shade.style.opacity = lightAt(toWorld(f.n)).dark.toFixed(3);
    // rounded edges: sweep the normal from one face to the other across the strip
    for (const e of d.edges) {
      const a = toWorld(e.top), b = toWorld(e.bot), stops = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4, ang = t * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
        const l = lightAt(a.map((x, i) => x * ca + b[i] * sa));
        l.spec *= Math.sin(Math.PI * t); // no glint where the strip meets the flat faces, so the seam stays invisible
        stops.push(`${overlay(l)} ${(t * 100).toFixed(0)}%`);
      }
      e.shade.style.background = `linear-gradient(to bottom,${stops.join(',')})`;
    }
    for (const k of d.corners) {
      const c = k.ring.map(r => { const l = lightAt(toWorld(r.n)); if (r.vertex) l.spec = 0; return overlay(l); });
      k.shade.style.background = `conic-gradient(from 30deg,${c.map((x, i) => `${x} ${i * 60}deg`).join(',')},${c[0]} 360deg)`;
    }
  }

  function render(s) {
    state = s;
    stage.classList.toggle('idle', !!s.faded);
    dice.forEach((d, i) => {
      if (!animating && d.value !== s.values[i]) { d.value = s.values[i]; [d.rx, d.ry] = UP[d.value]; }
      d.lifted = !!(s.interactive && s.selected[i]);
      d.wrap.classList.toggle('selected', d.lifted);
      d.hit.disabled = !s.interactive;
      d.hit.classList.toggle('on', d.lifted);
      d.hit.querySelector('.tag').textContent = s.interactive ? (d.lifted ? 'Reroll' : 'Keep') : '';
      d.hit.setAttribute('aria-pressed', String(!!s.selected[i]));
      d.hit.setAttribute('aria-label', `Die ${i + 1} shows ${s.values[i]}. ${s.interactive ? (s.selected[i] ? 'Will be rerolled.' : 'Kept.') : ''}`);
      if (!animating) {
        d.lift.style.transition = 'transform .22s cubic-bezier(.3,1.4,.5,1)';
        d.shadow.style.transition = 'transform .22s ease, opacity .22s ease';
        pose(d);
      }
    });
  }

  // values: new dice values; mask: which dice are thrown
  function roll(values, mask, animate = true) {
    const idx = mask.map((m, i) => m ? i : -1).filter(i => i >= 0);
    if (!animate || reduced()) {
      idx.forEach(i => { const d = dice[i]; d.value = values[i]; [d.rx, d.ry] = UP[d.value]; d.yaw = rnd(-10, 10) + pick([0, 90, 180, 270]); d.lifted = false; pose(d); });
      playRoll(idx.map(i => ({ t: Math.random() * 0.05, kind: 'impact', s: 0.7, pan: pan(i) })));
      return Promise.resolve();
    }
    animating = true;
    const { s } = geo, h = s / 2, events = [], anims = [];
    let longest = 0;
    events.push({ t: 0.02, kind: 'rattle', dur: 0.32, s: Math.min(1, 0.4 + idx.length * 0.15) });
    idx.forEach((i, n) => {
      const d = dice[i]; d.lift.style.transition = d.shadow.style.transition = 'none';
      const D = rnd(1050, 1300), delay = n * rnd(10, 35), sx = d.x, sy = d.y;
      const jx = rnd(-0.3, 0.3) * s * (i === 0 ? 0.3 : i === 4 ? -0.3 : 1) + (i === 0 ? s * .12 : i === 4 ? -s * .12 : 0), z0 = liftZ(d);
      const startYaw = d.yaw, endYaw = rnd(-11, 11) + pick([0, 90, 180, 270]) + pick([-360, 0, 360]);
      const [tx, ty] = UP[values[i]];
      const kx = pick([-2, -1, 1, 2]), ky = pick([-2, -1, 1, 2]), kz = pick([-1, 0, 1]);
      const r0 = [d.rx % 360, d.ry % 360, 0], r1 = [tx + 360 * kx, ty + 360 * ky, 360 * kz];
      const rot = f => `rotateX(${r0[0] + (r1[0] - r0[0]) * f}deg) rotateY(${r0[1] + (r1[1] - r0[1]) * f}deg) rotateZ(${r0[2] + (r1[2] - r0[2]) * f}deg)`;
      // [offset, x, y, z, yawFrac, spinFrac]
      const K = [
        [0, sx, sy, z0, 0, 0],
        [0.17, sx + jx * 0.3, sy + s * 0.95, h + s * 1.55, 0.1, 0.12],
        [0.40, sx + jx, sy + s * 0.38, h, 0.55, 0.66],
        [0.52, sx + jx * 0.8, sy + s * 0.16, h + s * 0.55, 0.75, 0.84],
        [0.64, sx + jx * 0.5, sy - s * 0.04, h, 0.88, 0.95],
        [0.72, sx + jx * 0.3, sy - s * 0.07, h + s * 0.17, 0.95, 0.99],
        [0.80, sx + jx * 0.15, sy - s * 0.06, h, 0.99, 1],
        [0.855, sx + jx * 0.06, sy - s * 0.03, h + s * 0.035, 1, 1],
        [0.90, sx + jx * 0.02, sy - s * 0.01, h, 1, 1],
        [1, sx, sy, h, 1, 1],
      ];
      const up = 'cubic-bezier(.2,.6,.35,1)', down = 'cubic-bezier(.6,0,.85,.4)';
      const zEase = [up, down, up, down, up, down, up, down, 'ease-out'];
      const opts = { duration: D, delay, fill: 'forwards' };
      const yawAt = f => startYaw + (endYaw - startYaw) * f;
      anims.push(d.wrap.animate(K.map((k, j) => ({ offset: k[0], transform: `translate3d(${k[1] - h}px,${k[2] - h}px,0) rotateZ(${yawAt(k[4])}deg)`, easing: j < 2 ? 'ease-in-out' : 'linear' })), opts));
      anims.push(d.lift.animate(K.map((k, j) => ({ offset: k[0], transform: `translateZ(${k[3]}px)`, easing: zEase[j] || 'linear' })), opts));
      anims.push(d.cube.animate(K.map((k, j) => ({ offset: k[0], transform: rot(k[5]), easing: j === 0 ? 'ease-in' : 'linear' })), opts));
      anims.push(d.shadow.animate(K.map((k, j) => {
        const air = Math.max(0, (k[3] - h) / s);
        return { offset: k[0], transform: `translateZ(0.5px) translate(${air * 10}px,${air * 6}px) scale(${1 + air * 0.55})`, opacity: Math.max(0.12, 0.6 - air * 0.3), easing: zEase[j] || 'linear' };
      }), opts));
      const p = pan(i), T = t => (delay + D * t) / 1000;
      events.push({ t: T(0.40), kind: 'impact', s: rnd(0.85, 1), pan: p },
        { t: T(0.64), kind: 'impact', s: rnd(0.45, 0.6), pan: p },
        { t: T(0.80), kind: 'impact', s: rnd(0.22, 0.32), pan: p },
        { t: T(0.90), kind: 'impact', s: 0.1, pan: p },
        { t: T(0.9), kind: 'slide', dur: D * 0.1 / 1000, s: 0.6, pan: p });
      longest = Math.max(longest, delay + D);
      d.value = values[i]; d.rx = tx; d.ry = ty; d.yaw = endYaw % 360; d.lifted = false;
    });
    if (idx.length > 1) for (let c = 0; c < Math.min(3, idx.length - 1); c++) events.push({ t: rnd(0.5, 0.8) * longest / 1000, kind: 'clack', s: rnd(0.3, 0.6), pan: rnd(-0.4, 0.4) });
    playRoll(events);
    let raf;
    const tick = () => { idx.forEach(i => shade(dice[i], true)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
      cancelAnimationFrame(raf);
      idx.forEach(i => pose(dice[i]));
      anims.forEach(a => a.cancel());
      animating = false;
      if (state) render(state);
    });
  }
  const pan = i => ((geo.slots[i]?.[0] ?? geo.w / 2) - geo.w / 2) / (geo.w / 2) * 0.7;

  new ResizeObserver(layout).observe(stage);
  layout();
  return { render, roll, layout };
}
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
