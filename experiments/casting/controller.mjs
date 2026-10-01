import { request, subscribe, newId } from './client.mjs';
import { renderBoard } from './screen.mjs';
import { TrialSound } from './sound.mjs';
import { setupCast } from './cast.mjs';
import { ControllerState } from './controller-state.mjs';
import { startAnotherTrial,reloadTvConnection } from './cast-connection.mjs';
import { score } from '/engine.mjs';
const $ = s => document.querySelector(s), sound = new TrialSound();
let credentials, state, closing, casting, sync, castConnected=false, pending = false, animationUntil = 0, animationTimer, muted = false;
const storage = { get() { try { return JSON.parse(localStorage.getItem('ty-casting-trial')); } catch { return null; } }, set(value) { try { localStorage.setItem('ty-casting-trial',JSON.stringify(value)); } catch {} }, clear() { try { localStorage.removeItem('ty-casting-trial'); } catch {} } };
const error = e => { $('#error').textContent = e.message; };
function draw() {
  if (!state) return;
  const rolling = Date.now() < animationUntil;
  renderBoard($('#board'), state, { controls: true, selectionLocked: !sync.canSelect, scoringLocked: sync.busy, onToggle: die => sync.toggle(die), onScore: (row,column) => {
    if(sync.busy)return;
    const points = score(state.game.dice,row)*(column+1);
    if (!points && !confirm('Take a zero in this box?')) return;
    action({type:'score',row,column,confirmZero:points===0});
  }, rolling });
  const g = state.game; $('#roll').disabled = pending || rolling || g.done || g.rolls >= 3 || (g.rolls > 0 && !g.selected.some(Boolean));
  $('#roll').textContent = g.rolls ? 'Reroll selected dice' : 'Roll dice';
  $('#sound-status').textContent = state.displayConnected ? 'Room sound: TV · this phone is quiet' : muted ? 'Room sound: muted here' : 'Room sound: this phone';
  $('#stop-tv').hidden = !state.displayConnected&&!castConnected;
  sound.setMuted(muted || state.soundOwner !== 'phone');
}
async function action(data) {
  if (sync?.busy || !state) return;
  $('#error').textContent = ''; void sound.ready(); await sync.action(data);
}
async function openRoom(value) {
  const first = await request(`/api/rooms/${value.roomId}/state`, undefined, value.controlToken);
  credentials = value; storage.set(value); $('#setup').hidden=true; $('#playing').hidden=false;
  sync=new ControllerState({
    send:data=>request(`/api/rooms/${credentials.roomId}/action`,{...data,id:newId()},credentials.controlToken),
    read:()=>request(`/api/rooms/${credentials.roomId}/state`,undefined,credentials.controlToken),
    onChange:()=>{state=sync.visible;pending=sync.busy;draw();},onError:error,
    onCue:cue=>{if(cue.type==='roll'){animationUntil=Date.now()+700;clearTimeout(animationTimer);draw();animationTimer=setTimeout(draw,720);}sound.play(cue);}
  });
  sync.receive(first,true);
  $('#preview').href='/receiver.html#'+encodeURIComponent(JSON.stringify({version:1,roomId:value.roomId,displayToken:value.displayToken}));
  $('#watch').href='/viewer.html#'+encodeURIComponent(JSON.stringify({roomId:value.roomId,ticket:value.viewToken}));
  $('#display-link').href='/display-link.html#'+encodeURIComponent(JSON.stringify({roomId:value.roomId,displayToken:value.displayToken}));
  closing?.(); closing=subscribe({roomId:value.roomId,ticket:value.controlToken}, (next,_play,snapshot) => {
    sync.receive(next,snapshot);
  }, connected => { if (!connected) { sound.setMuted(true); $('#notice').textContent='Reconnecting to the game…'; } else $('#notice').textContent='One phone controls this trial; the TV and viewers follow independently.'; });
  draw();
  casting = await setupCast({packet:()=>({roomId:credentials.roomId,displayToken:credentials.displayToken}),status:text=>{$('#cast-status').textContent=text;},sessionChanged:value=>{castConnected=value;draw();},busyChanged:value=>{$('#cast').disabled=value;},recovery:value=>{$('#reset-tv').hidden=!value;},readyButton:handler=>{$('#cast').disabled=false;$('#cast').onclick=handler;}});
}
$('#create').onsubmit=async e=>{e.preventDefault();$('#error').textContent='';await sound.ready();try{await openRoom(await request('/api/rooms',{names:$('#names').value.split(',').map(n=>n.trim())}));}catch(e){error(e);}};
$('#roll').onclick=()=>action({type:'roll'});
$('#share-display').onclick=async()=>{const url=$('#display-link').href;try{if(navigator.share)await navigator.share({title:'Triple Yahoo TV setup',url});else{await navigator.clipboard.writeText(url);$('#notice').textContent='TV setup link copied. Open it on the Android that will cast.';}}catch(e){if(e.name!=='AbortError')error(Error('Open Use another Android to cast, then share that page address.'));}};
$('#sound').onclick=()=>{muted=false;action({type:'phone-sound'});};
$('#mute').onclick=()=>{muted=!muted;$('#mute').textContent=muted?'Unmute':'Mute';sound.setMuted(muted);draw();};
$('#stop-tv').onclick=async()=>{try{await casting?.stop();await action({type:'phone-sound'});}catch(e){error(e);}};
$('#reset-tv').onclick=()=>reloadTvConnection(window.sessionStorage,()=>location.reload());
$('#another').onclick=async()=>{
  if(!confirm('Leave this trial and start a new one?'))return;
  $('#another').disabled=true;
  try{await startAnotherTrial({stop:()=>casting?.stop(),close:()=>closing?.(),clear:()=>storage.clear(),reload:()=>location.reload()});}
  catch(e){error(e);$('#another').disabled=false;}
};
const saved=storage.get(); if(saved)openRoom(saved).catch(e=>{storage.clear();error(e);});
