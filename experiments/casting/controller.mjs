import {request,subscribe,newId} from './client.mjs';
import {renderPersonal,renderShared,renderStandings,roundLabel,roomProgress,playerStatus,livePlayers,esc,updatePresence} from './screen.mjs';
import {ControllerState} from './controller-state.mjs';
import {TrialSound} from './sound.mjs';
import {setupCast} from './cast.mjs';
import {reloadTvConnection} from './cast-connection.mjs';
import {seats,rememberedName,rememberName} from './seats.mjs';
import {qrSvg,inviteUrl} from './qr.mjs';
import {score} from '/engine.mjs';
const $=s=>document.querySelector(s),sound=new TrialSound();
let personalKey='',keys,sync,state,closing,heartbeat,casting,castConnected=false,muted=false,inviteGame='',adminBusy=false,connected=true;
const showError=e=>{$('#error').textContent=e.message;};
const confirmAction=(title,message,label)=>new Promise(resolve=>{
 const dialog=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-message').textContent=message;$('#confirm-ok').textContent=label;
 const finish=value=>{dialog.close();resolve(value);};$('#confirm-ok').onclick=()=>finish(true);$('#confirm-cancel').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.showModal();
});
function updateSound(){
 if(!state||!keys)return;const owns=state.soundOwner===keys.playerId;sound.setMuted(muted||!owns||!connected);
 const owner=state.players.find(p=>p.id===state.soundOwner);
 $('#sound-status').textContent=muted?'This device is muted.':state.displayConnected?'Room sound: shared display · player devices stay quiet':owns?'Room sound: this device':`Room sound: ${owner?.name||'organizer'}’s device · this device stays quiet`;
}
async function showInvitation(){
 if(!keys.hostToken||state.hostId!==keys.playerId||state.phase!=='lobby')return;const game=state.gameId;if(inviteGame===game)return;inviteGame=game;
 try{const data=await request('/api/rooms/'+keys.roomId+'/invitation',undefined,keys.hostToken);if(state.phase!=='lobby'||state.gameId!==game)return;
  $('#join-qr').innerHTML=qrSvg(inviteUrl(location.origin,data));$('#qr-note').textContent=location.hostname==='127.0.0.1'||location.hostname==='localhost'?'Use the hosted trial on your phone; this is a local development QR.':'Everyone uses the camera on their own device. No account or password.';
 }catch(e){inviteGame='';showError(e);}
}
function draw(){
 if(!sync?.state)return;state=sync.visible;const p=state.players.find(p=>p.id===keys.playerId),host=state.hostId===keys.playerId&&!!keys.hostToken;
 $('#round-label').textContent=roundLabel(state);$('#room-title').textContent=state.phase==='lobby'?'Your room':state.phase==='done'?'Everyone’s final score':p?.finished?'You’re finished this round':'Play at your own pace';$('#progress').textContent=roomProgress(state);
 $('#lobby').hidden=state.phase!=='lobby';$('#active-play').hidden=state.phase==='lobby';$('#recap').hidden=state.phase!=='done';$('#organizer-tools').hidden=!host;
 $('#stop-tv').hidden=!castConnected;$('#invitation').hidden=!host||state.phase!=='lobby';$('#start').hidden=!host;$('#start').disabled=adminBusy;
 $('#again').hidden=!host;$('#again').disabled=adminBusy;$('#again-note').textContent=host?'Keep the same players, or invite others before the next game.':'The organizer can start another game with this group.';
 $('#lobby-note').textContent=host?'When everyone has joined, start the first round. Joining then closes.':'Your seat is ready. Waiting for the organizer to start.';
 $('#roster').innerHTML=livePlayers(state).map(p=>`<div class="roster-player"><span>${esc(p.name)}${p.id===keys.playerId?' · you':''}</span><span class="ready-label">Ready</span></div>`).join('');
 $('#remove-list').innerHTML=state.players.filter(p=>!p.removed&&p.id!==state.hostId).map(p=>`<div class="roster-player"><span>${esc(p.name)} · ${esc(playerStatus(p,state))}</span><button data-remove="${p.id}" ${state.phase==='done'||adminBusy?'disabled':''}>Remove</button></div>`).join('');
 if(p){
  const renderKey=[state.gameId,state.round,state.phase,p.revision,p.finished,p.removed,sync.busy,sync.canSelect,connected,JSON.stringify(p.selected)].join(':');
  if(renderKey!==personalKey){personalKey=renderKey;renderPersonal($('#own-board'),state,{playerId:keys.playerId,selectionLocked:!connected||!sync.canSelect,scoringLocked:!connected||sync.busy});}
  $('#roll').disabled=!connected||sync.busy||state.phase!=='playing'||p.finished||p.removed||p.rolls>=3||(p.rolls>0&&!p.selected.some(Boolean));
  $('#roll').textContent=p.rolls?'Reroll selected dice':'Roll dice';
  $('#wait-message').textContent=p.removed?'Your seat was removed.':state.phase==='done'?'All rounds complete.':p.finished?'Waiting for the rest of the room…':p.rolls===3?'Choose one score to finish your round.':'';
 }
 if($('#room-details').open)renderShared($('#room-board'),state);renderStandings($('#standings'),state);updatePresence();updateSound();void showInvitation();
}
async function admin(data){if(adminBusy||!keys?.hostToken)return;adminBusy=true;draw();$('#error').textContent='';
 try{sync.receive(await request('/api/rooms/'+keys.roomId+'/admin',{...data,id:newId(),gameId:state.gameId},keys.hostToken));}
 catch(e){showError(e);try{sync.receive(await request('/api/rooms/'+keys.roomId+'/state',undefined,keys.playerToken),true);}catch{}}
 finally{adminBusy=false;draw();}
}
async function openRoom(value){
 const first=await request('/api/rooms/'+value.roomId+'/state',undefined,value.playerToken);
 if(first.schema!==2||!first.players.some(p=>p.id===value.playerId&&!p.removed))throw Error('This seat is no longer active. Ask the organizer for the current QR code.');
 keys=value;seats.set(value);$('#setup').hidden=true;$('#playing').hidden=false;
 sync=new ControllerState({playerId:value.playerId,send:data=>request('/api/rooms/'+keys.roomId+'/action',{...data,id:newId()},keys.playerToken),read:()=>request('/api/rooms/'+keys.roomId+'/state',undefined,keys.playerToken),onChange:draw,onCue:cues=>sound.playMany(cues),onError:showError});sync.receive(first,true);
 closing?.();closing=subscribe({roomId:keys.roomId,ticket:keys.playerToken},(s,_,snapshot)=>sync.receive(s,snapshot),(ok,message,code)=>{
  connected=ok;$('#connection').textContent=ok?'Connected':message||'Reconnecting…';draw();if(!ok&&[403,410].includes(code)){$('#error').textContent=message;clearInterval(heartbeat);$('#roll').disabled=true;}else if(!ok)$('#roll').disabled=true;
 });
 clearInterval(heartbeat);heartbeat=setInterval(()=>request('/api/rooms/'+keys.roomId+'/heartbeat',{},keys.playerToken).then(s=>{connected=true;sync.receive(s);}).catch(e=>{connected=false;updateSound();$('#connection').textContent=e.message;}),10000);
 const packet={version:1,roomId:keys.roomId,displayToken:keys.displayToken};$('#preview').href='/receiver.html#'+encodeURIComponent(JSON.stringify(packet));
 $('#display-qr').innerHTML=qrSvg(location.origin+'/display-link.html#'+encodeURIComponent(JSON.stringify(packet)));
 casting=await setupCast({packet:()=>packet,status:text=>{$('#cast-status').textContent=text;},sessionChanged:value=>{castConnected=value;$('#stop-tv').hidden=!value;},busyChanged:value=>{$('#cast').disabled=value;},recovery:value=>{$('#reset-tv').hidden=!value;},readyButton:fn=>{$('#cast').disabled=false;$('#cast').onclick=fn;}});
}
$('#name').value=rememberedName();
$('#create').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#error').textContent='';void sound.ready();
 try{const name=$('#name').value.trim();rememberName(name);await openRoom({...await request('/api/rooms',{name}),name});}catch(e){showError(e);button.disabled=false;}
};
$('#room-details').ontoggle=()=>{if(state&&$('#room-details').open){renderShared($('#room-board'),state);updatePresence();}};
$('#start').onclick=()=>admin({type:'start'});$('#again').onclick=()=>admin({type:'again'});
$('#roll').onclick=()=>{if(!connected)return;$('#error').textContent='';void sound.ready();void sync.action({type:'roll'});};
$('#own-board').onclick=async e=>{
 const button=e.target.closest('button');if(!button||button.disabled)return;
 if(button.hasAttribute('data-die')){sync.toggle(Number(button.dataset.die));return;}
 if(button.hasAttribute('data-row')){
  const row=Number(button.dataset.row),column=Number(button.dataset.column),p=sync.player,revision=p.revision;
  const points=score(p.dice,row)*(column+1);
  if(points===0&&!await confirmAction('Take a zero?','This will fill this score box with zero and finish your round.','Score zero'))return;
  if(sync.player.revision!==revision){showError(Error('Your dice changed. Choose a score again.'));return;}
  $('#error').textContent='';void sound.ready();void sync.action({type:'score',row,column,confirmZero:points===0});
 }
};
$('#remove-list').onclick=async e=>{const b=e.target.closest('[data-remove]');if(!b)return;const p=state.players.find(p=>p.id===b.dataset.remove);if(await confirmAction('Remove '+p.name+'?','Their scorecard stays visible. The group will no longer wait for their scores.','Remove player'))await admin({type:'remove',playerId:p.id});};
$('#sound').onclick=()=>{muted=false;void sound.ready();void sync.action({type:'phone-sound'});};
$('#mute').onclick=()=>{muted=!muted;$('#mute').textContent=muted?'Unmute here':'Mute here';$('#mute').setAttribute('aria-pressed',String(muted));updateSound();};
$('#stop-tv').onclick=async()=>{try{await casting?.stop();}catch(e){showError(e);}};
$('#reset-tv').onclick=()=>casting?.reset?casting.reset(window.sessionStorage,()=>location.reload()):reloadTvConnection(window.sessionStorage,()=>location.reload());
$('#display-qr-button').onclick=()=>{$('#display-qr-panel').hidden=!$('#display-qr-panel').hidden;};
$('#leave').onclick=async()=>{if(await confirmAction('Leave this device?','Your seat stays in the room. Ask the organizer to remove you if you’re leaving the game.','Leave device')){closing?.();clearInterval(heartbeat);seats.clear();location.reload();}};
$('#takeover').onclick=async()=>{if(!await confirmAction('Take over organizing?','The organizer has been offline for a while. Keep the game and take over room controls?','Take over'))return;try{void sound.ready();const result=await request('/api/rooms/'+keys.roomId+'/claim',{},keys.playerToken);keys={...keys,...result};delete keys.state;seats.set(keys);inviteGame='';sync.receive(result.state);}catch(e){showError(e);}};
setInterval(()=>{updatePresence();if(state&&keys){const organizer=state.players.find(p=>p.id===state.hostId),me=state.players.find(p=>p.id===keys.playerId);$('#takeover').hidden=!me||me.removed||me.id===state.hostId||Date.now()-organizer.lastSeen<=45000;}},2000);
window.addEventListener('pagehide',()=>{sound.stop();closing?.();clearInterval(heartbeat);});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
const saved=seats.get();if(saved?.schema===2)openRoom(saved).catch(e=>{seats.clear();showError(e);});
// Optional read-only browser agent support; no game actions are exposed.
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'get_room_round',description:'Read the visible round, dice, scorecards and completion status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){if(!state)throw Error('Create or join a room first.');return {round:state.round,phase:state.phase,players:state.players.map(p=>({nickname:p.name,dice:p.dice,total:p.total,finished:p.finished}))};}})).catch(()=>{});}catch{}}
