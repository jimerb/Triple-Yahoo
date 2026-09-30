import { request, subscribe } from './client.mjs';
import { renderBoard } from './screen.mjs';
import { TrialSound } from './sound.mjs';
import { setupCast } from './cast.mjs';
import { score } from '/engine.mjs';
const $ = s => document.querySelector(s), sound = new TrialSound();
let credentials, state, closing, casting, pending = false, animationUntil = 0, animationTimer, muted = false;
const storage = { get() { try { return JSON.parse(localStorage.getItem('ty-casting-trial')); } catch { return null; } }, set(value) { try { localStorage.setItem('ty-casting-trial',JSON.stringify(value)); } catch {} }, clear() { try { localStorage.removeItem('ty-casting-trial'); } catch {} } };
const error = e => { $('#error').textContent = e.message; };
function draw() {
  if (!state) return;
  const rolling = Date.now() < animationUntil;
  renderBoard($('#board'), state, { controls: true, onToggle: die => action({type:'toggle',die}), onScore: (row,column) => {
    const points = score(state.game.dice,row)*(column+1);
    if (!points && !confirm('Take a zero in this box?')) return;
    action({type:'score',row,column,confirmZero:points===0});
  }, rolling });
  const g = state.game; $('#roll').disabled = pending || rolling || g.done || g.rolls >= 3 || (g.rolls > 0 && !g.selected.some(Boolean));
  $('#roll').textContent = g.rolls ? 'Reroll selected dice' : 'Roll dice';
  $('#sound-status').textContent = state.displayConnected ? 'Room sound: TV · this phone is quiet' : muted ? 'Room sound: muted here' : 'Room sound: this phone';
  $('#stop-tv').hidden = !state.displayConnected;
  sound.setMuted(muted || state.soundOwner !== 'phone');
}
async function action(data) {
  if (pending || !state) return;
  pending = true; $('#error').textContent = ''; await sound.ready(); draw();
  try { await request(`/api/rooms/${credentials.roomId}/action`,{...data,id:crypto.randomUUID(),revision:state.revision},credentials.controlToken); }
  catch (e) { error(e); } finally { pending=false; draw(); }
}
async function openRoom(value) {
  const first = await request(`/api/rooms/${value.roomId}/state`, undefined, value.controlToken);
  credentials = value; state = first; storage.set(value); $('#setup').hidden=true; $('#playing').hidden=false;
  $('#preview').href='/receiver.html#'+encodeURIComponent(JSON.stringify({version:1,roomId:value.roomId,displayToken:value.displayToken}));
  $('#watch').href='/viewer.html#'+encodeURIComponent(JSON.stringify({roomId:value.roomId,ticket:value.viewToken}));
  $('#display-link').href='/display-link.html#'+encodeURIComponent(JSON.stringify({roomId:value.roomId,displayToken:value.displayToken}));
  closing?.(); closing=subscribe({roomId:value.roomId,ticket:value.controlToken}, (next,play) => {
    if(state && next.revision<state.revision)return; state=next;
    if(play&&next.cue?.type==='roll'){animationUntil=Date.now()+700;clearTimeout(animationTimer);animationTimer=setTimeout(draw,720);}
    draw(); if(play&&next.cue)sound.play(next.cue);
  }, connected => { if (!connected) { sound.setMuted(true); $('#notice').textContent='Reconnecting to the game…'; } else $('#notice').textContent='One phone controls this trial; the TV and viewers follow independently.'; });
  draw();
  casting = await setupCast({packet:()=>({roomId:credentials.roomId,displayToken:credentials.displayToken}),status:text=>{$('#cast-status').textContent=text;$('#stop-tv').hidden=!state?.displayConnected;},readyButton:handler=>{$('#cast').disabled=false;$('#cast').onclick=handler;}});
}
$('#create').onsubmit=async e=>{e.preventDefault();$('#error').textContent='';await sound.ready();try{await openRoom(await request('/api/rooms',{names:$('#names').value.split(',').map(n=>n.trim())}));}catch(e){error(e);}};
$('#roll').onclick=()=>action({type:'roll'});
$('#share-display').onclick=async()=>{const url=$('#display-link').href;try{if(navigator.share)await navigator.share({title:'Triple Yahoo TV setup',url});else{await navigator.clipboard.writeText(url);$('#notice').textContent='TV setup link copied. Open it on the Android that will cast.';}}catch(e){if(e.name!=='AbortError')error(Error('Open Use another Android to cast, then share that page address.'));}};
$('#sound').onclick=()=>{muted=false;action({type:'phone-sound'});};
$('#mute').onclick=()=>{muted=!muted;$('#mute').textContent=muted?'Unmute':'Mute';sound.setMuted(muted);draw();};
$('#stop-tv').onclick=()=>{casting?.stop();action({type:'phone-sound'});};
$('#another').onclick=()=>{if(confirm('Leave this trial and start a new one?')){closing?.();storage.clear();location.reload();}};
const saved=storage.get(); if(saved)openRoom(saved).catch(e=>{storage.clear();error(e);});
