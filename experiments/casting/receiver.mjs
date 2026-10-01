import { request, subscribe, newId } from './client.mjs';
import { renderBoard } from './screen.mjs';
import { TrialSound } from './sound.mjs';
import { NAMESPACE } from './cast.mjs';
import { validateAttachment } from './receiver-attachment.mjs';
const $=s=>document.querySelector(s), sound=new TrialSound(), instance=newId();
let config, state, disconnect, heartbeat, connected=false, castContext, senderId, shouldClaim=true, ownedSound=false, attachQueue=Promise.resolve();
const report = (type,message) => { if(castContext&&senderId)castContext.sendCustomMessage(NAMESPACE,senderId,{type,message,roomId:config?.roomId,attempt:config?.attempt}); };
function labelCast(){
  try{if(!castContext?.isSystemReady())return;
    castContext.setApplicationState(state&&!state.game.done?'Triple Yahoo · '+state.game.players[state.game.active].name+"'s turn":'Triple Yahoo · Shared board');
  }catch{} // Cast labels must not prevent game updates.
}
async function announceReady() {
  if(!config||!connected||!shouldClaim)return;
  const target=config;
  if(!await sound.ready()){$('#enable-sound').hidden=false;$('#audio-status').textContent='TV sound is not ready. Phone sound stays on.';report('audio-blocked','TV board loaded; phone sound remains on because TV audio is blocked.');return;}
  if(!shouldClaim||!connected||config!==target)return;
  try {
    await request(`/api/rooms/${config.roomId}/display`,{instance,ready:true},config.displayToken);
    $('#enable-sound').hidden=true;$('#audio-status').textContent='Room sound plays here. Local phones stay quiet.';report('ready','TV board and sound are ready.');
    clearInterval(heartbeat);heartbeat=setInterval(async()=>{if(!connected||sound.context?.state!=='running')return;try{await request(`/api/rooms/${config.roomId}/display`,{instance,ready:true,renew:true},config.displayToken);}catch(e){sound.setMuted(true);clearInterval(heartbeat);$('#audio-status').textContent=e.message;}},3000);
  }catch(e){$('#audio-status').textContent=e.message;report('audio-blocked',e.message);}
}
function attach(packet,sender) {
  const next=attachQueue.catch(()=>{}).then(()=>attachNow(packet,sender));attachQueue=next;return next;
}
async function attachNow(packet,sender) {
  const first=await validateAttachment(config,packet,value=>request(`/api/rooms/${value.roomId}/state`,undefined,value.displayToken));
  disconnect?.();clearInterval(heartbeat);sound.setMuted(true);
  config=packet;senderId=sender;shouldClaim=true;ownedSound=false;state=first;
  $('#error').textContent='';renderBoard($('#board'),state);labelCast();
  report('attached','TV board connected. Phone sound stays on until TV sound is ready.');
  disconnect=subscribe({roomId:packet.roomId,ticket:packet.displayToken},(next,play)=>{
    if(config?.roomId!==packet.roomId)return;
    if(state&&next.revision<state.revision)return;state=next;renderBoard($('#board'),state,{rolling:play&&next.cue?.type==='roll'});labelCast();
    const nowOwns=next.soundOwner===instance;
    if(ownedSound&&!nowOwns){shouldClaim=false;clearInterval(heartbeat);$('#audio-status').textContent='Room sound moved to a phone. This display is quiet.';}
    ownedSound=nowOwns;sound.setMuted(!nowOwns);if(play&&next.cue)sound.play(next.cue);
  },(ok,message,code)=>{
    if(config?.roomId!==packet.roomId)return;
    connected=ok;$('#connection').textContent=ok?'Following the game':message;
    if(!ok){sound.setMuted(true);clearInterval(heartbeat);}
    if(code===410){config=null;state=null;shouldClaim=false;ownedSound=false;sound.stop();$('#board').textContent='This trial has ended. Start a new trial on your phone, then tap Show on TV.';$('#audio-status').textContent='';labelCast();}
    else if(ok)announceReady();
  });
}
$('#enable-sound').onclick=announceReady;
window.addEventListener('pagehide',()=>{sound.stop();clearInterval(heartbeat);});
let preview;try{preview=JSON.parse(decodeURIComponent(location.hash.slice(1)));history.replaceState(null,'',location.pathname);}catch{}
if(preview)attach(preview).catch(e=>{$('#error').textContent=e.message;});
else{
  const script=document.createElement('script');script.src='https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
  script.onload=()=>{try{castContext=cast.framework.CastReceiverContext.getInstance();castContext.addCustomMessageListener(NAMESPACE,event=>{
    let packet;
    const reject=message=>{castContext.sendCustomMessage(NAMESPACE,event.senderId,{type:'error',message,roomId:packet?.roomId,attempt:packet?.attempt});};
    try{packet=typeof event.data==='string'?JSON.parse(event.data):event.data;if(packet.type==='attach')attach(packet,event.senderId).catch(e=>reject(e.message));else reject('The TV invitation is invalid.');}
    catch{reject('The TV invitation is invalid.');}
  });castContext.addEventListener(cast.framework.system.EventType.READY,labelCast);castContext.start({disableIdleTimeout:true,customNamespaces:{[NAMESPACE]:cast.framework.system.MessageType.JSON}});}catch{$('#error').textContent='This page must run on a supported Cast display. Use the board preview link for browser checks.';}};
  script.onerror=()=>{$('#error').textContent='The TV casting library could not load.';};document.head.append(script);
}
