import {categories,score} from '/engine.mjs';
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const spots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const face=n=>`<svg class="die-face" viewBox="0 0 60 60" aria-hidden="true">${spots[n].map(p=>`<circle cx="${12+p%3*18}" cy="${12+Math.floor(p/3)*18}" r="6.5" fill="#142921"/>`).join('')}</svg>`;
const short=['Ones','Twos','Threes','Fours','Fives','Sixes','3 of a kind','4 of a kind','Full house','Small straight','Large straight','Yahoo!','Pot luck'];
export const livePlayers=s=>s.players.filter(p=>!p.removed);
export function playerStatus(p,s){return p.removed?'Left game':s.phase==='lobby'?'Ready to start':s.phase==='done'?'Finished':p.finished?'Round complete':p.rolls?`Roll ${p.rolls} of 3`:'Ready to roll';}
export function diceHtml(p,{controls=false,locked=false}={}){return `<div class="dice">${p.dice.map((d,i)=>`<button class="die ${p.selected[i]&&p.rolls?'selected':''}" data-die="${i}" aria-label="Die ${i+1}: ${d}" aria-pressed="${!!(p.selected[i]&&p.rolls)}" ${!controls||locked||!p.rolls||p.rolls>=3||p.finished||p.removed?'disabled':''}>${face(d)}</button>`).join('')}</div>`;}
export function cardHtml(p,s,{controls=false,locked=false,compact=false}={}){
 const enabled=controls&&!locked&&s.phase==='playing'&&!p.finished&&!p.removed&&p.rolls>0;
 return `<div class="scorecard"><table aria-label="${esc(p.name)} scorecard"><thead><tr><th>Category</th><th>×1</th><th>×2</th><th>×3</th></tr></thead><tbody>${p.card.map((r,row)=>`<tr><th scope="row">${esc(compact?short[row]:categories[row])}</th>${r.map((v,column)=>`<td><button data-row="${row}" data-column="${column}" aria-label="${esc(categories[row])} times ${column+1}" class="${v!==null?'filled':''} ${p.lastScore?.row===row&&p.lastScore?.column===column?'latest':''}" ${!enabled||v!==null?'disabled':''}>${v!==null?v:enabled?score(p.dice,row)*(column+1):'—'}</button></td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th>Upper bonus</th>${p.totals.bonus.map(n=>`<td>${n}</td>`).join('')}</tr><tr><th>Column total</th>${p.totals.columns.map(n=>`<td>${n}</td>`).join('')}</tr></tfoot></table></div>`;
}
export function renderPersonal(container,s,{playerId,selectionLocked=false,scoringLocked=false}={}){
 const p=s.players.find(p=>p.id===playerId);if(!p){container.innerHTML='<p>This seat is no longer in the game.</p>';return;}
 container.innerHTML=`<section class="personal-board"><div class="personal-dice"><div class="player-heading"><div><span class="eyebrow">Round ${s.round} · Your dice · ${esc(playerStatus(p,s))}</span><h2>${esc(p.name)}</h2></div><strong class="total">${p.total}<small>points</small></strong></div>${diceHtml(p,{controls:s.phase==='playing',locked:selectionLocked})}<p class="dice-help">${p.finished?'Score committed. Your dice stay here while the room finishes.':p.rolls?'Tap dice to select them for your next roll.':'Roll all five dice to begin this round.'}</p></div><div class="personal-card"><h3>Your scorecard</h3>${cardHtml(p,s,{controls:true,locked:scoringLocked})}</div></section>`;
}
export function renderShared(container,s){
 const players=s.phase==='lobby'?livePlayers(s):s.players;
 container.className='shared-grid count-'+players.length;
 container.innerHTML=players.map(p=>`<article class="player-tile ${p.finished?'finished':''} ${p.removed?'removed':''}" data-player="${p.id}"><div class="tile-heading"><h2>${esc(p.name)}</h2><strong>${p.total}<small> pts</small></strong></div><div class="tile-status">${esc(playerStatus(p,s))}<span class="presence" data-seen="${p.lastSeen}" data-playing="${s.phase==='playing'&&!p.finished&&!p.removed}"></span></div>${diceHtml(p)}${cardHtml(p,s,{compact:true})}${p.lastScore?`<p class="last-score">Round ${p.lastScore.round}: +${p.lastScore.points} in ${esc(short[p.lastScore.row])} ×${p.lastScore.column+1}</p>`:'<p class="last-score">One score per round. Everyone plays together.</p>'}</article>`).join('');
}
export function renderStandings(container,s){
 const rows=[...s.players].sort((a,b)=>b.total-a.total),best=Math.max(...livePlayers(s).map(p=>p.total));
 container.innerHTML=rows.map(p=>`<div class="standing ${p.total===best&&!p.removed?'leader':''}"><span>${esc(p.name)}${p.removed?' · left':''}</span><strong>${p.total}</strong>${s.phase==='done'&&p.total===best&&!p.removed?'<span>Winner</span>':''}</div>`).join('');
}
export function roundLabel(s){return s.phase==='lobby'?'Gather your players':s.phase==='done'?'Final scores':`Round ${s.round} of 39`;}
export function roomProgress(s){const players=livePlayers(s),ready=players.filter(p=>p.finished).length;return s.phase==='lobby'?`${players.length} of 6 players joined`:s.phase==='done'?(()=>{const best=Math.max(...players.map(p=>p.total));const names=players.filter(p=>p.total===best).map(p=>p.name);return (names.length>1?'Winners: ':'Winner: ')+names.join(' & ')+' · '+best+' points';})():`${ready} of ${players.length} finished · the next round starts when everyone scores`;}
export function updatePresence(root=document){root.querySelectorAll('[data-seen]').forEach(e=>{e.textContent=e.dataset.playing==='true'&&Date.now()-Number(e.dataset.seen)>30000?' · reconnecting':'';});}
// Compatibility name used by the retained Cast receiver.
export const renderBoard=renderShared;
