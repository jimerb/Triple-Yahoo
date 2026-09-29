// The How to Play screen. One block of markup, laid out three ways by CSS:
//   wide screens   two columns, everything visible at once
//   tablets        one column, everything visible, scrolls
//   phones         a full-screen sheet with four tabs so only one short section is on screen at a time
// Point values in the examples come from the real scoring function, so they can never drift from the rules.
import { score } from './engine.mjs';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n, on) => `<span class="hd${on ? ' on' : ''}" aria-hidden="true">${Array.from({ length: 9 }, (_, q) => `<i${PIPS[n].includes(q) ? ' class="p"' : ''}></i>`).join('')}</span>`;
const roll = (dice, on) => `<span class="ex" role="img" aria-label="Example roll: ${dice.join(', ')}">${dice.map((d, i) => die(d, on[i])).join('')}</span>`;

// [row index in the scorecard, name, rule, example dice, which example dice are the ones that count]
const ROWS = [
  [3, 'Ones to Sixes', 'Add up only the dice showing that number. Here, Fours.', [4, 4, 4, 2, 6], [1, 1, 1, 0, 0]],
  [6, 'Three of a kind', 'At least three the same. Score all five dice.', [5, 5, 5, 2, 3], [1, 1, 1, 0, 0]],
  [7, 'Four of a kind', 'At least four the same. Score all five dice.', [4, 4, 4, 4, 6], [1, 1, 1, 1, 0]],
  [8, 'Full house', 'A pair plus three of a kind.', [3, 3, 3, 5, 5], [1, 1, 1, 1, 1]],
  [9, 'Small straight', 'Four in a row. A spare die is fine.', [2, 3, 4, 5, 5], [1, 1, 1, 1, 0]],
  [10, 'Large straight', 'Five in a row.', [2, 3, 4, 5, 6], [1, 1, 1, 1, 1]],
  [11, 'Yahoo!', 'All five dice the same.', [6, 6, 6, 6, 6], [1, 1, 1, 1, 1]],
  [12, 'Pot luck', 'Any roll. Score all five dice.', [1, 3, 3, 5, 6], [1, 1, 1, 1, 1]],
];

export function helpHtml() {
  const rows = ROWS.map(([row, name, rule, dice, on]) => `<div class="sc"><div class="t"><b>${name}</b><small>${rule}</small></div>${roll(dice, on)}<span class="pts" aria-label="${score(dice, row)} points">${score(dice, row)}</span></div>`).join('');
  const bonus = [1, 2, 3].map(c => `<div class="bcard"><b>×${c}</b><small>${['Single', 'Double', 'Triple'][c - 1]}</small><span>Reach ${63 * c} in Ones to Sixes</span><em>+${35 * c}</em></div>`).join('');
  return `<div class="help" data-tab="turn">
  <header class="help-head">
    <div class="help-title"><p class="eyebrow">How to play</p><h2>Five dice. Thirty-nine boxes.</h2></div>
    <button class="help-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <nav class="tabs" role="tablist" aria-label="Help sections">
      <button type="button" role="tab" data-t="turn" aria-selected="true">Your turn</button>
      <button type="button" role="tab" data-t="scoring" aria-selected="false">Scoring</button>
      <button type="button" role="tab" data-t="card" aria-selected="false">Scorecard</button>
      <button type="button" role="tab" data-t="controls" aria-selected="false">Controls</button>
    </nav>
  </header>
  <div class="help-body">
    <p class="lede">Fill every box on your scorecard and finish with the highest total. There are 13 categories in three columns, and each column multiplies what you score: <b>×1</b>, <b>×2</b> or <b>×3</b>. Rules follow the original 1993 shareware.</p>
    <div class="help-grid">
     <div class="col c1">
      <section data-h="turn" aria-label="Your turn">
        <h3>Your turn</h3>
        <ol class="steps">
          <li><span class="n">1</span><div><b>Roll</b> all five dice.</div></li>
          <li><span class="n">2</span><div><b>Keep the good ones.</b> Tap any dice you want to throw again (they show REROLL), then roll again. You get up to 3 rolls per turn.</div></li>
          <li><span class="n">3</span><div><b>Pick a box.</b> Tap one empty box on your scorecard. You can score after any roll, and you must after the third.</div></li>
          <li><span class="n">4</span><div><b>Mind the column.</b> The points are multiplied by the column: ×1, ×2 or ×3. Save your best rolls for ×3.</div></li>
        </ol>
        <p class="callout"><b>Nothing fits?</b> Take a zero in the box you will miss least (the game asks you to confirm). The game ends when every box is filled.</p>
      </section>
      <section data-h="card" class="bonus" aria-label="Upper bonus">
        <h3>Upper bonus</h3>
        <p class="sub">Score enough in Ones to Sixes within one column and that column earns a bonus. Three of every number is exactly 63.</p>
        <div class="bonus3">${bonus}</div>
      </section>
     </div>
     <div class="col c2">
      <section data-h="scoring" aria-label="Scoring">
        <h3>Scoring</h3>
        <p class="sub">Base points, before the column multiplier. Highlighted dice are the ones that make the combination.</p>
        <div class="scs">${rows}</div>
      </section>
     </div>
     <div class="col c3">
      <section data-h="card" class="legendsec" aria-label="Reading the scorecard">
        <h3>Reading the scorecard</h3>
        <div class="legend">
          <div class="lg"><span class="sw"><span class="cell pot hot" style="--h:1">30</span><span class="cell pot" style="--h:.25">6</span></span><p><b>Gold</b> boxes show what this roll would score there. The brighter the gold, the more points.</p></div>
          <div class="lg"><span class="sw"><span class="cell nil">0</span></span><p><b>Dashed</b> boxes would score zero with this roll.</p></div>
          <div class="lg"><span class="sw"><span class="cell scored">24<span class="par up">▲</span></span></span><p><b>Green</b> boxes are already filled. On Ones to Sixes, ▲ means you beat three of that number and ▼ means you fell short.</p></div>
          <div class="lg"><span class="sw"><span class="meter-sw">48 / 189 <span class="par up">▲6</span></span></span><p><b>Upper bonus row</b> is your running total in each column, and whether you are ahead (▲) or behind (▼) the pace for the bonus.</p></div>
        </div>
      </section>
      <section data-h="controls" aria-label="Controls">
        <h3>Controls</h3>
        <ul class="keys only-kbd">
          <li><kbd>R</kbd><span>Roll</span></li>
          <li><kbd>1–5</kbd><span>Mark a die</span></li>
          <li><kbd>F</kbd><span>Full screen</span></li>
          <li><kbd>Esc</kbd><span>Leave full screen</span></li>
          <li><kbd>Tab</kbd><span>Next box</span></li>
          <li><kbd>Enter</kbd><span>Score the box</span></li>
        </ul>
        <ul class="keys only-touch">
          <li><b class="tap">Tap a die</b><span>Mark it to throw again</span></li>
          <li><b class="tap">Tap Roll</b><span>Throw the marked dice</span></li>
          <li><b class="tap">Tap a box</b><span>Score this roll there</span></li>
          <li><b class="tap">Slider icon</b><span>Sound, volume, hints</span></li>
        </ul>
        <p class="sub">Your game saves automatically. Close the tab and pick up where you left off.</p>
      </section>
     </div>
    </div>
  </div>
</div>`;
}

export function wireHelp(root, close) {
  const help = root.querySelector('.help'), tabs = [...help.querySelectorAll('.tabs button')];
  const show = t => { help.dataset.tab = t; tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t))); help.querySelector('.help-body').scrollTop = 0; };
  tabs.forEach((b, i) => {
    b.onclick = () => show(b.dataset.t);
    b.onkeydown = e => {
      const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1; if (j < 0) return;
      const n = tabs[(j + tabs.length) % tabs.length]; n.focus(); show(n.dataset.t); e.preventDefault();
    };
  });
  help.querySelector('.help-x').onclick = close;
}
