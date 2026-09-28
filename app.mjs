import { categories, score, totals, newGame, roll, commit } from './engine.mjs';
import { createTray } from './dice3d.mjs';
import { setEnabled as soundOn, unlock, sfx } from './audio.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = {
  get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { $('#notice').classList.add('warn'); $('#notice').textContent = 'Browser storage is unavailable; this game will not be saved.'; } },
};
let game = storage.get('ty-game-v1', null), view = 0, busy = false, justRolled = false, fresh = null;
if (!game?.players?.length || !game.players.every(p => p.card?.length === 13)) game = newGame(['Player 1']);
view = game.active;
const prefs = { hints: true, sound: true, animation: true, theme: 'dark', ...storage.get('ty-prefs-v1', {}) };
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
applyTheme(); soundOn(prefs.sound);

const tray = createTray($('#stage'), {
  onToggle(i) {
    if (!diceInteractive()) return;
    game.selected[i] = !game.selected[i]; sfx('select'); save(); render();
  },
});
const diceInteractive = () => !busy && !game.handoff && !game.done && game.rolls > 0 && game.rolls < 3;

function render() {
  const p = game.players[view], t = totals(p.card);
  const canScore = view === game.active && game.rolls > 0 && !game.done && !busy && !game.handoff;
  $('#new').disabled = busy;
  $('#round').textContent = Math.min(game.turn, 39);

  // players
  $('#players').replaceChildren(...game.players.map((pl, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'player' + (i === game.active && !game.done ? ' active' : '') + (i === view && game.players.length > 1 ? ' viewing' : '');
    b.innerHTML = `<span class="av">${esc(pl.name.trim()[0]?.toUpperCase() || '?')}</span><span>${esc(pl.name)}</span><b>${totals(pl.card).total}</b>`;
    b.setAttribute('aria-label', `${pl.name}, ${totals(pl.card).total} points${i === game.active ? ', rolling now' : ''}. Show scorecard.`);
    b.onclick = () => { view = i; render(); };
    return b;
  }));
  $('#players').hidden = game.players.length < 2;

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
  $('#total').textContent = t.total;

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
        return `<div class="meter edge edge-b${won ? ' won' : ''}" role="cell" aria-label="Upper section ${c + 1}: ${t.upper[c]} of ${thr}${won ? ', bonus ' + t.bonus[c] + ' earned' : ', ' + (thr - t.upper[c]) + ' needed for +' + 35 * (c + 1)}${paceLbl}"><span class="lbl">${won ? '+' + t.bonus[c] + ' bonus' : t.upper[c] + ' / ' + thr + paceTxt}</span></div>`;
      }).join('')}</div>`);
    }
  });
  out.push(`<div class="row" role="row"><div class="tot cat edge" role="rowheader">Total</div>${t.columns.map(v => `<div class="tot edge" role="cell">${v}</div>`).join('')}</div>`);
  sheet.innerHTML = out.join('');
  sheet.querySelectorAll('button.cell:not(:disabled)').forEach(b => b.onclick = () => takeScore(+b.dataset.r, +b.dataset.c));
  fresh = null;
}

// ---------- dialogs ----------
function modal(html) { $('#dialogbody').innerHTML = html; if (!$('#dialog').open) $('#dialog').showModal(); }
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
  if (!commit(game, r, c)) return;
  fresh = { p: previous, r, c };
  view = game.active;
  sfx(value === 0 ? 'zero' : r === 11 ? 'yahoo' : 'score');
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
  modal(`<p class="eyebrow">Turn complete</p><h2>Pass the dice</h2><p id="handoffsummary"></p><button class="btn primary" id="nextplayer" type="button">${esc(game.players[game.active].name)}, roll ↗</button>`);
  $('#handoffsummary').textContent = $('#notice').textContent + ' Next up: ' + game.players[game.active].name + '.';
  $('#nextplayer').onclick = () => { game.handoff = false; view = game.active; save(); $('#dialog').close(); sfx('turn'); render(); };
}
$('#dialog').addEventListener('close', () => { if (game.handoff) setTimeout(showHandoff, 0); });

function showResults() {
  const ranked = game.players.slice().sort((a, b) => totals(b.card).total - totals(a.card).total), best = totals(ranked[0].card).total;
  const winners = ranked.filter(p => totals(p.card).total === best).map(p => p.name);
  modal(`<p class="eyebrow">All 39 boxes filled</p><h2>${esc(winners.join(' & '))} win${winners.length === 1 ? 's' : ''}!</h2><ul class="results">${ranked.map(p => `<li class="${totals(p.card).total === best ? 'win' : ''}"><span>${esc(p.name)}</span><b>${totals(p.card).total}</b></li>`).join('')}</ul><p>Winning scores enter the local top ten.</p><button class="btn primary" id="again" type="button">Play again</button>`);
  $('#again').onclick = () => { $('#dialog').close(); openNewGame(); };
}
$('#rules').onclick = () => modal(`<p class="eyebrow">Original 1993 rules</p><h2>A little luck. A little strategy.</h2>
<p>Each player fills 39 boxes: 13 categories across three columns. Roll five dice, tap any you want to throw again, and roll up to three times per turn. You can score after any roll.</p>
<p>Pick one empty box. Columns multiply the score by 1, 2 or 3. Gold boxes show what this roll would score (brighter means more points), dashed boxes would score zero, and green boxes are already filled.</p>
<ul><li><b>Ones to Sixes:</b> sum of matching dice. Reach 63 base points in a column for a 35 base bonus (35 / 70 / 105). Three of each number is exactly 63, so ▲ / ▼ on a scored box shows whether it beat or missed three of that number, and the bonus row shows the running total.</li><li><b>Three / four of a kind:</b> sum of all dice.</li><li><b>Full house:</b> a pair plus a triple, 25.</li><li><b>Small / large straight:</b> 4 / 5 in a row, 30 / 40.</li><li><b>Yahoo!:</b> five of a kind, 50.</li><li><b>Pot luck:</b> sum of all dice.</li></ul>
<p>Keyboard: press <b>R</b> to roll, <b>1–5</b> to pick dice, <b>F</b> for full screen. Leave full screen with the <b>Exit full screen</b> button in the top bar or the <b>Esc</b> key.</p>`);
$('#leaders').onclick = () => {
  const scores = storage.get('ty-high-v1', []);
  modal(`<p class="eyebrow">Local hall of fame</p><h2>Top ten</h2>${scores.length ? `<ul class="results">${scores.map((s, i) => `<li><span>${i + 1}. ${esc(s.name)} <small style="color:var(--faint)">${esc(s.date)}</small></span><b>${s.score}</b></li>`).join('')}</ul>` : '<p>Finish a game to set your first high score.</p>'}`);
};
$('#settingsBtn').onclick = () => {
  const row = (id, t, d) => `<label class="toggle"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" id="pref-${id}" ${prefs[id] ? 'checked' : ''}></label>`;
  modal(`<p class="eyebrow">Settings</p><h2>House rules</h2>
  ${row('sound', 'Sound', 'Dice rattle, bounce and scoring cues')}
  ${row('animation', 'Dice animation', 'Full 3D throw. Off = instant results')}
  ${row('hints', 'Score hints', 'Shade every box this roll could fill')}
  <label class="toggle"><span><b>Light theme</b><small>Dark is the default</small></span><input type="checkbox" id="pref-light" ${prefs.theme === 'light' ? 'checked' : ''}></label>
  <div class="only-phone"><button class="btn" id="s-rules" type="button">How to play</button><button class="btn" id="s-leaders" type="button">High scores</button></div>`);
  $('#s-rules').onclick = () => $('#rules').click();
  $('#s-leaders').onclick = () => $('#leaders').click();
  for (const id of ['sound', 'animation', 'hints']) $('#pref-' + id).onchange = e => { prefs[id] = e.target.checked; if (id === 'sound') { soundOn(prefs.sound); sfx('select'); } savePrefs(); render(); };
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
  let count = Math.min(4, game.players.length) || 1;
  modal(`<p class="eyebrow">A fresh scorecard</p><h2>Who’s at the table?</h2><p>Starting replaces the current saved game.</p>
  <label class="field">Players</label><div class="seg" id="count">${[1, 2, 3, 4].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div>
  <form id="setup"><div id="names"></div><button class="btn primary" type="submit">Start game ↗</button></form>`);
  const old = game.players.map(p => p.name);
  const draw = () => {
    document.querySelectorAll('#count button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === count)));
    const prev = [...document.querySelectorAll('#names input')].map(x => x.value);
    $('#names').replaceChildren(...Array.from({ length: count }, (_, i) => {
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 24; input.placeholder = 'Player ' + (i + 1);
      input.value = prev[i] ?? (/^Player \d$/.test(old[i] || '') ? '' : old[i] || ''); input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Player ' + (i + 1) + ' name'); return input;
    }));
  };
  document.querySelectorAll('#count button').forEach(b => b.onclick = () => { count = +b.dataset.n; draw(); });
  draw();
  $('#setup').onsubmit = e => {
    e.preventDefault();
    game = newGame([...$('#names').children].map((x, i) => x.value.trim() || 'Player ' + (i + 1)));
    view = 0; save(); $('#notice').textContent = ''; $('#dialog').close(); sfx('turn'); render();
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
  busy = true; view = game.active; save(); render();
  await tray.roll(game.dice, mask, prefs.animation !== false);
  busy = false; justRolled = true;
  if (game.dice.every(d => d === game.dice[0])) {
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
