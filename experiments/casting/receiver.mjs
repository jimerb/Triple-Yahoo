import { request, subscribe, newId } from './client.mjs';
import { renderBoard } from './screen.mjs';
import { TrialSound } from './sound.mjs';
import { NAMESPACE } from './cast.mjs';
const $=s=>document.querySelector(s), sound=new TrialSound(), instance=newId();
let config, state, disconnect, heartbeat, connected=false, castContext, senderId, shouldClaim=true, ownedSound=false;
const report = (type,message) => { if(castContext&&senderId)castContext.sendCustomMessage(NAMESPACE,senderId,{type,message,roomId:config?.roomId}); };
function labelCast(){
  if(!castContext?.isSystemReady())return;
  castContext.setApplicationState(state&&!state.game.done?'Triple Yahoo · '+state.game.players[state.game.active].name+"'s turn":'Triple Yahoo · Shared board');
}
async function announceReady() {
  if(!config||!connected||!shouldClaim)return;
  if(!await sound.ready()){$('#enable-sound').hidden=false;$('#audio-status').textContent='TV sound is not ready. Phone sound stays on.';report('audio-blocked','TV board loaded; phone sound remains on because TV audio is blocked.');return;}
  if(!shouldClaim||!connected)return;
  try {
    await request(`/api/rooms/${config.roomId}/display`,{instance,ready:true},config.displayToken);
    $('#enable-sound').hidden=true;$('#audio-status').textContent='Room sound plays here. Local phones stay quiet.';report('ready','TV board and sound are ready.');
    clearInterval(heartbeat);heartbeat=setInterval(async()=>{if(!connected||sound.context?.state!=='running')return;try{await request(`/api/rooms/${config.roomId}/display`,{instance,ready:true,renew:true},config.displayToken);}catch(e){sound.setMuted(true);clearInterval(heartbeat);$('#audio-status').textContent=e.message;}},3000);
  }catch(e){$('#audio-status').textContent=e.message;report('audio-blocked',e.message);}
}
async function attach(packet) {
  if(packet.version!==1||typeof packet.roomId!=='string'||typeof packet.displayToken!=='string')throw Error('The TV invitation is invalid.');
  if(config&&config.roomId!==packet.roomId)throw Error('This TV is already following another trial. Stop that TV session before switching.');
  await request(`/api/rooms/${packet.roomId}/state`,undefined,packet.displayToken);
  config=packet; shouldClaim=true; disconnect?.(); clearInterval(heartbeat);
  disconnect=subscribe({roomId:config.roomId,ticket:config.displayToken},(next,play)=>{
    if(state&&next.revision<state.revision)return;state=next;renderBoard($('#board'),state,{rolling:play&&next.cue?.type==='roll'});labelCast();
    const nowOwns=next.soundOwner===instance;
    if(ownedSound&&!nowOwns){shouldClaim=false;clearInterval(heartbeat);$('#audio-status').textContent='Room sound moved to a phone. This display is quiet.';}
    ownedSound=nowOwns;sound.setMuted(!nowOwns);if(play&&next.cue)sound.play(next.cue);
  },(ok,message)=>{connected=ok;$('#connection').textContent=ok?'Following the game':message;if(!ok){sound.setMuted(true);clearInterval(heartbeat);}else announceReady();});
}
$('#enable-sound').onclick=announceReady;
window.addEventListener('pagehide',()=>{sound.stop();clearInterval(heartbeat);});
let preview;try{preview=JSON.parse(decodeURIComponent(location.hash.slice(1)));history.replaceState(null,'',location.pathname);}catch{}
if(preview)attach(preview).catch(e=>{$('#error').textContent=e.message;});
else{
  const script=document.createElement('script');script.src='https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
  script.onload=()=>{try{castContext=cast.framework.CastReceiverContext.getInstance();castContext.addCustomMessageListener(NAMESPACE,event=>{senderId=event.senderId;try{const packet=typeof event.data==='string'?JSON.parse(event.data):event.data;if(packet.type==='attach')attach(packet).catch(e=>{report('error',e.message);$('#error').textContent=e.message;});}catch{report('error','The TV invitation is invalid.');}});castContext.addEventListener(cast.framework.system.EventType.READY,labelCast);castContext.start({disableIdleTimeout:true,customNamespaces:{[NAMESPACE]:cast.framework.system.MessageType.JSON}});}catch{$('#error').textContent='This page must run on a supported Cast display. Use the board preview link for browser checks.';}};
  script.onerror=()=>{$('#error').textContent='The TV casting library could not load.';};document.head.append(script);
}
