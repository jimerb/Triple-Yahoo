import { categories, score, totals, newGame, roll, commit, hasOpenYahoo } from './engine.mjs';
import { createTray } from './dice3d.mjs';
import { setEnabled as soundOn, setVolume, setYahooMode, stopReward, unlock, sfx } from './audio.mjs';
import { helpHtml, wireHelp } from './help.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = {
  get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { $('#notice').classList.add('warn'); $('#notice').textContent = 'Browser storage is unavailable; this game will not be saved.'; } },
};
let game = storage.get('ty-game-v1', null), view = 0, busy = false, justRolled = false, fresh = null, lastGain = null, lastProgress = null;
// Names are remembered separately from the saved game, so they survive even when the game itself is reset
const roster = {
  get() { const r = storage.get('ty-roster-v1', null); return { count: Math.min(4, Math.max(1, +r?.count || 1)), names: Array.isArray(r?.names) ? r.names.slice(0, 4).map(n => String(n ?? '').slice(0, 24)) : [] }; },
  set(count, names) { storage.set('ty-roster-v1', { count, names }); },
};
if (!game?.players?.length || !game.players.every(p => p.card?.length === 13)) {
  const r = roster.get();
  game = newGame(Array.from({ length: r.count }, (_, i) => r.names[i]?.trim() || 'Player ' + (i + 1)));
}
view = game.active;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const prefs = { hints: true, sound: true, volume: 1, yahoo: 'full', animation: true, countup: !reduceMotion, theme: 'dark', ...storage.get('ty-prefs-v1', {}) };
prefs.volume = Math.min(1, Math.max(0, Number.isFinite(+prefs.volume) ? +prefs.volume : 1));
if (prefs.yahoo !== 'simple') prefs.yahoo = 'full';
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const PAR = (ri, c) => 3 * (ri + 1) * (c + 1); // three of a number in every upper box = exactly 63 per column
const HINT = ['', '', '', '', '', '', 'sum', 'sum', '25', '30', '40', '50', 'sum'];

function save() { storage.set('ty-game-v1', game); }
function savePrefs() { storage.set('ty-prefs-v1', prefs); }
function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme;
  document.querySelector('meta[name=theme-color]').content = prefs.theme === 'light' ? '#ece6da' : '#0a1310';
  $('#theme').setAttribute('aria-label', prefs.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
}
function applyMotion() { document.documentElement.classList.toggle('no-countup', !prefs.countup); }
applyTheme(); applyMotion(); setVolume(prefs.volume); setYahooMode(prefs.yahoo); soundOn(prefs.sound);

const tray = createTray($('#stage'), {
  onToggle(i) {
    if (!diceInteractive()) return;
    game.selected[i] = !game.selected[i]; sfx('select'); save(); render();
  },
});
const diceInteractive = () => !busy && !game.handoff && !game.done && game.rolls > 0 && game.rolls < 3;

// ---------- count-up totals ----------
// Any element with data-ck (a key) and data-to (the real value) shows a number that ticks up when the value rises.
// Purely visual: the game state is already final, so nothing waits on it.
const counts = new Map();
let countRaf = 0;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function paintCount(key, e) {
  const txt = String(Math.round(e.shown));
  document.querySelectorAll(`[data-ck="${key}"]`).forEach(el => { if (el.textContent !== txt) el.textContent = txt; el.classList.toggle('counting', !!e.t0); });
}
function countTick(now) {
  countRaf = 0;
  for (const [key, e] of counts) {
    if (!e.t0) continue;
    const t = Math.min(1, (now - e.t0) / e.dur);
    e.shown = e.from + (e.to - e.from) * easeOut(t);
    if (t >= 1) { e.shown = e.to; e.t0 = 0; }
    paintCount(key, e);
    if (e.t0 && !countRaf) countRaf = requestAnimationFrame(countTick);
  }
}
function bump(el, gain) {
  const host = el.parentElement; if (!host) return;
  host.querySelector('.bump')?.remove();
  const b = document.createElement('span'); b.className = 'bump'; b.setAttribute('aria-hidden', 'true'); b.textContent = '+' + gain;
  b.addEventListener('animationend', () => b.remove()); setTimeout(() => b.remove(), 2000);
  host.append(b);
}
function syncCounts(root = document) {
  const seen = new Set();
  root.querySelectorAll('[data-ck]').forEach(el => {
    const key = el.dataset.ck, to = +el.dataset.to;
    if (seen.has(key)) return; seen.add(key);
    let e = counts.get(key);
    if (!e) counts.set(key, e = { shown: to, from: to, to, t0: 0, dur: 0 });
    else if (e.to !== to) {
      if (to > e.to && prefs.countup) {
        const gain = to - e.to;
        Object.assign(e, { from: e.shown, to, t0: performance.now(), dur: Math.min(1600, 650 + (to - e.shown) * 5) });
        root.querySelectorAll(`[data-ck="${key}"][data-bump]`).forEach(x => bump(x, gain));
      } else Object.assign(e, { shown: to, from: to, to, t0: 0 });
    }
    paintCount(key, e);
  });
  if (!countRaf && [...counts.values()].some(e => e.t0)) countRaf = requestAnimationFrame(countTick);
}
function finishCounts() { for (const [key, e] of counts) { Object.assign(e, { shown: e.to, t0: 0 }); paintCount(key, e); } }
const countEl = (key, value, tag = 'b', extra = '') => `<${tag} data-ck="${key}" data-to="${value}"${extra}>${value}</${tag}>`;

// ---------- round progress bar ----------
function renderProgress() {
  const round = Math.min(game.turn, 39), boxes = game.players.length * 39;
  const filled = game.players.reduce((a, pl) => a + pl.card.flat().filter(v => v !== null).length, 0);
  const pct = game.done ? 1 : filled / boxes, bar = $('#roundbar');
  document.querySelectorAll('#roundbar .rn').forEach(n => n.textContent = round);
  if (lastProgress === null) { bar.classList.add('instant'); requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('instant'))); }
  bar.style.setProperty('--p', pct.toFixed(4));
  bar.classList.toggle('full', pct >= 1);
  bar.setAttribute('aria-valuenow', round);
  bar.setAttribute('aria-valuetext', game.done ? 'Game complete' : `Round ${round} of 39`);
  if (lastProgress !== null && pct > lastProgress && prefs.countup) { bar.classList.remove('glint'); void bar.offsetWidth; bar.classList.add('glint'); }
  lastProgress = pct;
}

function render() {
  const p = game.players[view], t = totals(p.card);
  const canScore = view === game.active && game.rolls > 0 && !game.done && !busy && !game.handoff;
  $('#new').disabled = busy;
  renderProgress();

  // players
  $('#players').replaceChildren(...game.players.map((pl, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'player' + (i === game.active && !game.done ? ' active' : '') + (i === view && game.players.length > 1 ? ' viewing' : '');
    b.innerHTML = `<span class="av">${esc(pl.name.trim()[0]?.toUpperCase() || '?')}</span><span>${esc(pl.name)}</span>${countEl('p' + i, totals(pl.card).total)}`;
    b.setAttribute('aria-label', `${pl.name}, ${totals(pl.card).total} points${i === game.active ? ', rolling now' : ''}. Show scorecard.`);
    b.onclick = () => { view = i; render(); };
    return b;
  }));
  $('#players').classList.toggle('solo', game.players.length < 2); // solo chip shows only where the scorecard header can scroll away (phones)

  // table status
  const active = game.players[game.active].name, multi = game.players.length > 1;
  $('#instruction').textContent = busy ? 'Rolling…' : game.done ? 'A game well rolled.' : game.handoff ? 'Turn complete.'
    : !game.rolls ? (multi ? `${active}, you’re up.` : 'Start with a little luck.')
    : game.rolls === 3 ? 'Make this roll count.' : 'Keep the good ones.';
  $('#help').textContent = busy ? 'Good luck.' : game.done ? 'Start a new game to play again.' : !game.rolls ? 'Roll all five dice to begin your turn.'
    : game.rolls === 3 ? 'Choose an open box on your scorecard.' : 'Tap dice to reroll them, or take a score now.';
  document.querySelectorAll('.rollmeter span').forEach((s, i) => s.classList.toggle('used', i < game.rolls));
  const n = game.selected.filter(Boolean).length;
  const r = $('#roll');
  r.disabled = busy || game.handoff || game.done || game.rolls === 3 || (game.rolls > 0 && !n);
  r.textContent = busy ? 'Rolling…' : game.done ? 'Game over' : game.handoff ? 'Waiting for next player' : game.rolls === 3 ? 'Pick a score'
    : game.rolls === 0 ? 'Roll the dice' : !n ? 'Tap dice to reroll' : n === 5 ? 'Reroll all five' : `Reroll ${n} ${n === 1 ? 'die' : 'dice'}`;
  tray.render({ values: game.dice, selected: game.selected, interactive: diceInteractive(), faded: !game.rolls || game.done });

  // scorecard header
  $('#cardname').textContent = p.name;
  const away = view !== game.active && !game.done;
  $('#cardlabel').textContent = away ? 'Viewing scorecard' : game.done ? 'Final scorecard' : 'Your scorecard';
  $('#cardlabel').classList.toggle('away', away);
  Object.assign($('#total').dataset, { ck: 'p' + view, to: t.total });

  // potentials for the heat shading
  const pots = p.card.map((row, ri) => row.map((v, c) => v === null && canScore && prefs.hints ? score(game.dice, ri) * (c + 1) : null));
  const max = Math.max(1, ...pots.flat().filter(v => v !== null));
  const sheet = $('#sheet'), out = [];
  sheet.classList.toggle('reveal', justRolled); justRolled = false;
  out.push(`<div class="row" role="row"><div class="h" role="columnheader">Category</div>${['Single', 'Double', 'Triple'].map((l, c) => `<div class="h" role="columnheader"><b>×${c + 1}</b>${l}</div>`).join('')}</div>`);
  let k = 0;
  categories.forEach((name, ri) => {
    const icon = ri < 6 ? `<span class="mini" aria-hidden="true">${Array.from({ length: 9 }, (_, q) => `<i class="${PIPS[ri + 1].includes(q) ? 'p' : ''}"></i>`).join('')}</span>` : '';
    const edge = '';
    let cells = '';
    for (let c = 0; c < 3; c++) {
      const v = p.card[ri][c], pot = pots[ri][c];
      let cls = 'cell', txt = '', style = '', label;
      if (v !== null) {
        cls += ' scored' + (v === 0 ? ' z' : '') + (fresh && fresh.p === view && fresh.r === ri && fresh.c === c ? ' fresh' : ''); txt = v; label = `scored ${v}`;
        if (ri < 6) { // compare with par: three of this number, the pace for the upper bonus
          const diff = v - PAR(ri, c);
          if (diff) { txt += `<span class="par ${diff > 0 ? 'up' : 'down'}" aria-hidden="true">${diff > 0 ? '▲' : '▼'}</span>`; label += `, ${Math.abs(diff)} ${diff > 0 ? 'ahead of' : 'behind'} par`; }
          else label += ', on par';
        }
      }
      else if (pot !== null && pot > 0) { const h = pot / max; cls += ' pot' + (h >= 0.75 ? ' hot' : ''); style = `--h:${h.toFixed(3)};--d:${k++}`; txt = pot; label = `take ${pot} points`; }
      else if (canScore) { cls += ' nil'; style = `--d:${k++}`; txt = '0'; label = prefs.hints ? 'take zero points' : 'open'; if (!prefs.hints) { cls = 'cell'; txt = ''; } }
      else label = 'open';
      cells += `<button type="button" role="cell" class="${cls}${edge}" style="${style}" data-r="${ri}" data-c="${c}" ${v !== null || !canScore ? 'disabled' : ''} aria-label="${esc(name)}, times ${c + 1}: ${label}">${txt}</button>`;
    }
    out.push(`<div class="row" role="row"><div class="cat${edge}" role="rowheader">${icon}<span class="nm">${esc(name)}</span>${HINT[ri] ? `<small>${HINT[ri]}</small>` : ''}</div>${cells}</div>`);
    if (ri === 5) {
      out.push(`<div class="row" role="row"><div class="cat bonus-cat edge edge-b" role="rowheader"><span class="nm">Upper bonus</span><small title="Bonus for 63 / 126 / 189 in the upper section">+35/+70/+105</small></div>${[0, 1, 2].map(c => {
        const thr = 63 * (c + 1), won = t.bonus[c] > 0;
        const filled = p.card.slice(0, 6).map((r, ri) => [r[c], ri]).filter(([v]) => v !== null);
        const pace = filled.reduce((a, [v, ri]) => a + v - PAR(ri, c), 0);
        const paceTxt = won || !filled.length ? '' : pace > 0 ? ` <span class="par up">▲${pace}</span>` : pace < 0 ? ` <span class="par down">▼${-pace}</span>` : ' <span class="par even">even</span>';
        const paceLbl = won || !filled.length ? '' : pace > 0 ? `, ${pace} ahead of pace` : pace < 0 ? `, ${-pace} behind pace` : ', on pace';
        const newBonus = won && fresh?.bonus && fresh.p === view && fresh.c === c;
        return `<div class="meter edge edge-b${won ? ' won' : ''}${newBonus ? ' fresh' : ''}" role="cell" aria-label="Upper section ${c + 1}: ${t.upper[c]} of ${thr}${won ? ', bonus ' + t.bonus[c] + ' earned' : ', ' + (thr - t.upper[c]) + ' needed for +' + 35 * (c + 1)}${paceLbl}"><span class="lbl">${won ? `<span>+${t.bonus[c]}</span><span class="bw"> bonus</span>` : `<span>${countEl(`p${view}u${c}`, t.upper[c], 'span')} / ${thr}</span>${paceTxt}`}</span></div>`;
      }).join('')}</div>`);
    }
  });
  out.push(`<div class="row" role="row"><div class="tot cat edge" role="rowheader">Total</div>${t.columns.map((v, c) => `<div class="tot edge" role="cell" aria-label="${['Single', 'Double', 'Triple'][c]} total ${v}">${countEl(`p${view}c${c}`, v, 'span')}</div>`).join('')}</div>`);
  sheet.innerHTML = out.join('');
  sheet.querySelectorAll('button.cell:not(:disabled)').forEach(b => b.onclick = () => takeScore(+b.dataset.r, +b.dataset.c));
  fresh = null;
  syncCounts();
}

// ---------- dialogs ----------
function modal(html, cls = '') { $('#dialog').className = cls; $('#dialogbody').innerHTML = html; if (!$('#dialog').open) $('#dialog').showModal(); }
$('.close').onclick = () => $('#dialog').close();
$('#dialog').addEventListener('click', e => { if (e.target === $('#dialog') && !game.handoff) $('#dialog').close(); });

function takeScore(r, c) {
  const value = score(game.dice, r) * (c + 1);
  if (value === 0) {
    modal(`<p class="eyebrow">Zero points</p><h2>Take a zero?</h2><p>This uses your ${esc(categories[r])} ×${c + 1} box for the rest of the game.</p><button class="btn primary" id="accept" type="button">Score zero</button><button class="btn" id="cancel" type="button">Keep rolling</button>`);
    $('#accept').onclick = () => { $('#dialog').close(); finishScore(r, c); };
    $('#cancel').onclick = () => $('#dialog').close();
  } else finishScore(r, c);
}
function finishScore(r, c) {
  const previous = game.active, name = game.players[game.active].name, value = score(game.dice, r) * (c + 1);
  const before = totals(game.players[previous].card);
  if (!commit(game, r, c)) return;
  const after = totals(game.players[previous].card);
  fresh = { p: previous, r, c, bonus: after.bonus[c] > before.bonus[c] };
  lastGain = { name, before: before.total, after: after.total };
  view = game.active;
  sfx(value === 0 ? 'zero' : r === 11 ? 'yahooScore' : 'score');
  $('#notice').textContent = `${name} scored ${value} in ${categories[r]} ×${c + 1}.`;
  if (game.done) {
    const top = storage.get('ty-high-v1', []), best = Math.max(...game.players.map(p => totals(p.card).total));
    game.players.filter(p => totals(p.card).total === best).forEach(p => top.push({ name: p.name, score: best, date: new Date().toLocaleDateString() }));
    top.sort((a, b) => b.score - a.score); storage.set('ty-high-v1', top.slice(0, 10));
  }
  save();
  if (game.done) { view = previous; render(); setTimeout(() => { sfx('win'); showResults(); }, 450); }
  else if (game.players.length > 1) { view = previous; game.handoff = true; save(); render(); setTimeout(showHandoff, 550); }
  else render();
}
function showHandoff() {
  if (!game.handoff) return;
  const prev = game.players[(game.active + game.players.length - 1) % game.players.length], now = totals(prev.card).total;
  const from = lastGain && lastGain.name === prev.name && lastGain.after === now ? lastGain.before : now;
  counts.set('handoff', { shown: from, from, to: from, t0: 0, dur: 0 });
  modal(`<p class="eyebrow">Turn complete</p><h2>Pass the dice</h2><p id="handoffsummary"></p><div class="gain"><small>${esc(prev.name)}’s total</small><span class="gnum">${countEl('handoff', now, 'strong', ' data-bump')}</span></div><button class="btn primary" id="nextplayer" type="button">${esc(game.players[game.active].name)}, roll ↗</button>`);
  syncCounts($('#dialogbody'));
  $('#handoffsummary').textContent = $('#notice').textContent + ' Next up: ' + game.players[game.active].name + '.';
  $('#nextplayer').onclick = () => { game.handoff = false; view = game.active; save(); $('#dialog').close(); sfx('turn'); render(); };
}
$('#dialog').addEventListener('close', () => { if (game.handoff) setTimeout(showHandoff, 0); });

function showResults() {
  const ranked = game.players.slice().sort((a, b) => totals(b.card).total - totals(a.card).total), best = totals(ranked[0].card).total;
  const winners = ranked.filter(p => totals(p.card).total === best).map(p => p.name);
  ranked.forEach((_, i) => counts.set('res' + i, { shown: 0, from: 0, to: 0, t0: 0, dur: 0 }));
  modal(`<p class="eyebrow">All 39 boxes filled</p><h2>${esc(winners.join(' & '))} win${winners.length === 1 ? 's' : ''}!</h2><ul class="results">${ranked.map((p, i) => `<li class="${totals(p.card).total === best ? 'win' : ''}"><span>${esc(p.name)}</span>${countEl('res' + i, totals(p.card).total)}</li>`).join('')}</ul><p>Winning scores enter the local top ten.</p><button class="btn primary" id="again" type="button">Play again</button>`);
  syncCounts($('#dialogbody'));
  $('#again').onclick = () => { $('#dialog').close(); openNewGame(); };
}
$('#rules').onclick = () => { modal(helpHtml(), 'help-dlg'); wireHelp($('#dialogbody'), () => $('#dialog').close()); };
$('#leaders').onclick = () => {
  const scores = storage.get('ty-high-v1', []);
  modal(`<p class="eyebrow">Local hall of fame</p><h2>Top ten</h2>${scores.length ? `<ul class="results">${scores.map((s, i) => `<li><span>${i + 1}. ${esc(s.name)} <small style="color:var(--faint)">${esc(s.date)}</small></span><b>${s.score}</b></li>`).join('')}</ul>` : '<p>Finish a game to set your first high score.</p>'}`);
};
$('#settingsBtn').onclick = () => {
  const row = (id, t, d) => `<label class="toggle"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" id="pref-${id}" ${prefs[id] ? 'checked' : ''}></label>`;
  const pct = Math.round(prefs.volume * 100);
  modal(`<p class="eyebrow">Settings</p><h2>House rules</h2>
  ${row('sound', 'Sound', 'Dice rattle, bounce and scoring cues')}
  <div class="subset${prefs.sound ? '' : ' off'}" id="audioset">
    <div class="vol">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/></svg>
      <input type="range" class="slider" id="pref-volume" min="0" max="100" step="5" value="${pct}" style="--v:${pct}%" aria-label="Volume" ${prefs.sound ? '' : 'disabled'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>
      <output id="volout" for="pref-volume">${pct}%</output>
    </div>
    <div class="yset">
      <div class="yhead"><span><b>Yahoo! sound</b><small>Plays when you roll five of a kind</small></span><button type="button" class="play" id="yplay" aria-label="Play the Yahoo! sound" title="Preview" ${prefs.sound ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg></button></div>
      <div class="seg y" id="yseg" role="group" aria-label="Yahoo! sound">
        <button type="button" data-y="full" aria-pressed="${prefs.yahoo === 'full'}" ${prefs.sound ? '' : 'disabled'}>Full reward</button>
        <button type="button" data-y="simple" aria-pressed="${prefs.yahoo === 'simple'}" ${prefs.sound ? '' : 'disabled'}>Simple chime</button>
      </div>
    </div>
  </div>
  ${row('animation', 'Dice animation', 'Full 3D throw. Off = instant results')}
  ${row('countup', 'Score count-up', 'Totals tick up after each score. Off = instant')}
  ${row('hints', 'Score hints', 'Shade every box this roll could fill')}
  <label class="toggle"><span><b>Light theme</b><small>Dark is the default</small></span><input type="checkbox" id="pref-light" ${prefs.theme === 'light' ? 'checked' : ''}></label>
  <div class="only-phone"><button class="btn" id="s-rules" type="button">How to play</button><button class="btn" id="s-leaders" type="button">High scores</button></div>`);
  $('#s-rules').onclick = () => $('#rules').click();
  $('#s-leaders').onclick = () => $('#leaders').click();
  const vol = $('#pref-volume'), audioControls = () => document.querySelectorAll('#audioset input, #audioset button');
  const preview = () => { stopReward(0.05); sfx('yahoo'); };
  $('#dialog').addEventListener('close', () => stopReward(0.25), { once: true }); // a preview should not outlive the dialog
  $('#pref-sound').onchange = e => {
    prefs.sound = e.target.checked; soundOn(prefs.sound); if (prefs.sound) sfx('select');
    $('#audioset').classList.toggle('off', !prefs.sound); audioControls().forEach(x => { x.disabled = !prefs.sound; });
    savePrefs();
  };
  vol.oninput = () => {
    prefs.volume = vol.value / 100; setVolume(prefs.volume);
    vol.style.setProperty('--v', vol.value + '%'); $('#volout').textContent = vol.value + '%';
  };
  vol.onchange = () => { savePrefs(); sfx('select'); }; // a click on release, so you can hear the new level
  document.querySelectorAll('#yseg [data-y]').forEach(b => b.onclick = () => {
    prefs.yahoo = b.dataset.y; setYahooMode(prefs.yahoo); savePrefs();
    document.querySelectorAll('#yseg [data-y]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    preview();
  });
  $('#yplay').onclick = preview;
  for (const id of ['animation', 'countup', 'hints']) $('#pref-' + id).onchange = e => { prefs[id] = e.target.checked; if (id === 'countup') { applyMotion(); if (!prefs.countup) finishCounts(); } savePrefs(); render(); };
  $('#pref-light').onchange = e => { prefs.theme = e.target.checked ? 'light' : 'dark'; applyTheme(); savePrefs(); };
};
// ---------- full screen ----------
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function toggleFullscreen() {
  const el = document.documentElement;
  try {
    const p = fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    p?.catch?.(() => {});
  } catch {}
}
function syncFullscreen() {
  const on = fsOn(), b = $('#fs');
  b.classList.toggle('on', on);
  b.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
  b.title = on ? 'Exit full screen (Esc)' : 'Full screen (F)';
}
if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
  $('#fs').hidden = false;
  $('#fs').onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
}

$('#theme').onclick = () => { prefs.theme = prefs.theme === 'light' ? 'dark' : 'light'; applyTheme(); savePrefs(); };
function openNewGame() {
  const saved = roster.get();
  let count = saved.count;
  modal(`<p class="eyebrow">A fresh scorecard</p><h2>Who’s at the table?</h2><p>Starting replaces the current saved game.</p>
  <label class="field">Players</label><div class="seg" id="count">${[1, 2, 3, 4].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div>
  <form id="setup"><div id="names"></div><button class="btn primary" type="submit">Start game ↗</button></form>`);
  const old = game.players.map(p => p.name);
  const draw = () => {
    document.querySelectorAll('#count button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === count)));
    const prev = [...document.querySelectorAll('#names input')].map(x => x.value);
    $('#names').replaceChildren(...Array.from({ length: count }, (_, i) => {
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 24; input.placeholder = 'Player ' + (i + 1);
      input.value = prev[i] ?? (saved.names[i] || (/^Player \d$/.test(old[i] || '') ? '' : old[i] || '')); input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Player ' + (i + 1) + ' name'); return input;
    }));
  };
  document.querySelectorAll('#count button').forEach(b => b.onclick = () => { count = +b.dataset.n; draw(); });
  draw();
  $('#setup').onsubmit = e => {
    e.preventDefault();
    const typed = [...$('#names').children].map(x => x.value.trim());
    roster.set(count, Array.from({ length: 4 }, (_, i) => i < count ? typed[i] : saved.names[i] || ''));
    game = newGame(typed.map((n, i) => n || 'Player ' + (i + 1)));
    stopReward(0.2); view = 0; save(); $('#notice').textContent = ''; $('#dialog').close(); sfx('turn'); render();
  };
}
$('#new').onclick = openNewGame;

// ---------- rolling ----------
async function doRoll() {
  if (busy || game.handoff || game.done || game.rolls >= 3) return;
  const mask = game.rolls === 0 ? [true, true, true, true, true] : game.selected.slice();
  if (!mask.some(Boolean)) return;
  unlock();
  if (!roll(game)) return;
  stopReward(0.5); // never let the long Yahoo! track fight the dice
  busy = true; view = game.active; save(); render();
  await tray.roll(game.dice, mask, prefs.animation !== false);
  busy = false; justRolled = true;
  // Only celebrate when the Yahoo! can actually be scored: with all three Yahoo! boxes full it is just another roll
  if (game.dice.every(d => d === game.dice[0]) && hasOpenYahoo(game.players[game.active])) {
    const b = $('#burst'); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); sfx('yahoo');
  }
  render();
}
$('#roll').onclick = doRoll;
document.addEventListener('keydown', e => {
  if ($('#dialog').open || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); doRoll(); }
  else if ((e.key === 'f' || e.key === 'F') && !$('#fs').hidden) { e.preventDefault(); toggleFullscreen(); }
  else if (/^[1-5]$/.test(e.key) && diceInteractive()) { const i = +e.key - 1; game.selected[i] = !game.selected[i]; sfx('select'); save(); render(); }
});
// iOS / Android only allow audio after a touch: unlock on the first one
document.addEventListener('pointerdown', unlock, { once: true, capture: true });

render();
if (game.handoff) showHandoff();
