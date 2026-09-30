import { subscribe } from './client.mjs';
import { renderBoard } from './screen.mjs';
import { TrialSound } from './sound.mjs';
const $=s=>document.querySelector(s), sound=new TrialSound(); let separate=false, muted=false, state;
let config; try{config=JSON.parse(decodeURIComponent(location.hash.slice(1)));history.replaceState(null,'',location.pathname);}catch{}
if(!config?.roomId||!config?.ticket)$('#error').textContent='Open the viewer link from the trial phone.';
else subscribe(config,(next,play)=>{state=next;renderBoard($('#board'),state,{rolling:play&&next.cue?.type==='roll'});sound.setMuted(!separate||muted);if(play&&next.cue)sound.play(next.cue);},(ok,message)=>{$('#connection').textContent=ok?'Following the same game':message;sound.setMuted(!ok||!separate||muted);});
async function choose(ownSound){separate=ownSound;if(ownSound&&!await sound.ready()){$('#error').textContent='Tap again to enable sound on this device.';return;}$('#sound-choice').hidden=true;$('#mute').hidden=!ownSound;sound.setMuted(!ownSound||muted);}
$('#together').onclick=()=>choose(false);$('#separate').onclick=()=>choose(true);$('#mute').onclick=()=>{muted=!muted;sound.setMuted(muted);$('#mute').textContent=muted?'Unmute':'Mute';};
