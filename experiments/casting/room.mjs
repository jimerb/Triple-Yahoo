import {blankCard,score,totals} from '../../engine.mjs';
export const LEASE_MS=12000, ROOM_TTL_MS=4*60*60*1000, MAX_PLAYERS=6;
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>{if(typeof a!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;};
const secureRandom=()=>{let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294967292);return (n%6)/6;};
export class TrialError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new TrialError(status,message);};
const nickname=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>24)fail(400,'Enter a nickname, up to 24 characters.');return name.trim();};
const active=room=>room.players.filter(p=>!p.removed);
// Independent seats replace the shared active-player pointer.
export class TrialRooms {
 constructor({clock=Date.now,random=secureRandom}={}){Object.assign(this,{clock,random});this.rooms=new Map();}
 player(name){return {id:token(),token:token(),name:nickname(name),card:blankCard(),dice:[1,2,3,4,5],selected:[true,true,true,true,true],rolls:0,revision:0,finishedRound:0,lastScore:null,removed:false,lastSeen:this.clock()};}
 create({name}={}){
  const p=this.player(name),room={schema:2,id:token(),hostToken:token(),inviteToken:token(),displayToken:token(),hostId:p.id,
   players:[p],phase:'lobby',gameId:token(),round:0,revision:0,cues:[],display:null,phoneSoundOwner:p.id,
   expires:this.clock()+ROOM_TTL_MS,listeners:new Set(),commands:new Map(),joins:[]};
  this.rooms.set(room.id,room);return {...this.seatKeys(room,p),hostToken:room.hostToken,displayToken:room.displayToken};
 }
 seatKeys(room,p){return {schema:2,roomId:room.id,playerId:p.id,playerToken:p.token,displayToken:room.displayToken};}
 get(id){const room=this.rooms.get(id);if(!room||room.expires<=this.clock()||room.schema!==2)fail(410,'This game has expired or uses the earlier trial. Create a new room.');return room;}
 authorize(room,ticket,role='view'){
  if(room.schema!==2)fail(410,'This is an earlier trial. Create a new room.');
  const p=room.players.find(p=>!p.removed&&same(ticket,p.token));
  const allowed=role==='host'?same(ticket,room.hostToken):role==='display'?same(ticket,room.displayToken):role==='invite'?same(ticket,room.inviteToken):role==='player'?!!p:!!p||same(ticket,room.hostToken)||same(ticket,room.displayToken);
  if(!allowed)fail(403,'This invitation or player seat cannot access this game.');return p;
 }
 invitation(room,ticket){
  if(!same(ticket,room.hostToken)&&!same(ticket,room.displayToken))fail(403,'Only the organizer or shared display can show the invitation.');
  return {roomId:room.id,inviteToken:room.phase==='lobby'?room.inviteToken:null,hostName:room.players.find(p=>p.id===room.hostId).name,phase:room.phase};
 }
 joinInfo(room,ticket){this.authorize(room,ticket,'invite');if(room.phase!=='lobby')fail(409,'The game has started. Ask the organizer to include you in the next game.');return {hostName:room.players.find(p=>p.id===room.hostId).name,players:active(room).map(p=>p.name),full:active(room).length>=MAX_PLAYERS};}
 join(room,ticket,{name,joinId}={}){
  this.authorize(room,ticket,'invite');if(typeof joinId!=='string'||!/^[\w-]{8,80}$/.test(joinId))fail(400,'Reopen the QR invitation and try joining again.');
  const prior=room.joins.find(j=>j.id===joinId);if(prior){const p=room.players.find(p=>p.id===prior.playerId&&!p.removed);if(!p)fail(403,'That seat was removed. Ask the organizer to start another game.');return this.seatKeys(room,p);}
  if(room.phase!=='lobby')fail(409,'Joining closes when the game starts. Join the next game.');if(active(room).length>=MAX_PLAYERS)fail(409,'This room already has six players.');
  name=nickname(name);if(active(room).some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))fail(409,'That nickname is already in this room. Choose another.');
  const p=this.player(name);room.players.push(p);room.joins.push({id:joinId,playerId:p.id});this.emit(room);return this.seatKeys(room,p);
 }
 snapshot(room){return {schema:2,roomId:room.id,gameId:room.gameId,revision:room.revision,phase:room.phase,round:room.round,hostId:room.hostId,
  players:room.players.map(({token,...p})=>({...structuredClone(p),total:totals(p.card).total,totals:totals(p.card),finished:p.finishedRound===room.round&&room.round>0})),
  cues:structuredClone(room.cues),soundOwner:room.display?.instance||room.phoneSoundOwner,displayConnected:!!room.display,serverNow:this.clock()};}
 emit(room){room.revision++;const state=this.snapshot(room);for(const fn of room.listeners)fn(state);return state;}
 cue(room,data){room.cues.push({...data,at:this.clock()});room.cues=room.cues.slice(-32);}
 expireDisplay(room){if(room.display&&room.display.until<=this.clock()){room.display=null;this.emit(room);}}
 advance(room){
  if(room.phase!=='playing'||!active(room).every(p=>p.finishedRound===room.round))return;
  if(room.round===39){room.phase='done';this.cue(room,{id:token(),type:'complete'});return;}
  room.round++;for(const p of active(room)){p.rolls=0;p.selected.fill(true);p.revision++;}this.cue(room,{id:token(),type:'round',round:room.round});
 }
 identity(room,ticket,data,role){const p=this.authorize(room,ticket,role);if(typeof data.id!=='string'||!data.id||data.id.length>80)fail(400,'Missing action identity.');const key=(p?.id||'host')+':'+data.id;return {p,key,duplicate:room.commands.has(key)};}
 remember(room,key){room.commands.set(key,true);if(room.commands.size>1024)room.commands.delete(room.commands.keys().next().value);}
 action(room,ticket,data){
  const {p,key,duplicate}=this.identity(room,ticket,data,'player');this.expireDisplay(room);if(duplicate)return this.snapshot(room);
  if(data.type==='phone-sound'){room.display=null;room.phoneSoundOwner=p.id;this.remember(room,key);return this.emit(room);}
  if(room.phase!=='playing'||p.finishedRound===room.round)fail(409,'Your round is complete. Wait for everyone to finish.');
  if(data.gameId!==room.gameId||data.round!==room.round||data.playerRevision!==p.revision)fail(409,'Your round has updated. Please try again.');p.lastSeen=this.clock();
  if(data.type==='roll'){
   if(p.rolls>=3||(p.rolls>0&&!p.selected.some(Boolean)))fail(409,'Choose dice to reroll or commit a score.');
   p.dice=p.dice.map((d,i)=>p.rolls===0||p.selected[i]?1+Math.floor(this.random()*6):d);p.rolls++;p.selected.fill(false);this.cue(room,{id:key,type:'roll',playerId:p.id,round:room.round});
  }else if(data.type==='select'){
   if(!p.rolls||p.rolls>=3||!Array.isArray(data.selected)||data.selected.length!==5||data.selected.some(v=>typeof v!=='boolean'))fail(400,'Those dice cannot be selected now.');p.selected=[...data.selected];
  }else if(data.type==='score'){
   const {row,column}=data;if(!p.rolls||!Number.isInteger(row)||row<0||row>12||!Number.isInteger(column)||column<0||column>2||p.card[row][column]!==null)fail(409,'Roll first, then choose an empty score box.');
   const points=score(p.dice,row)*(column+1);if(points===0&&data.confirmZero!==true)fail(400,'Confirm taking a zero in this box.');
   p.card[row][column]=points;p.finishedRound=room.round;p.lastScore={round:room.round,row,column,points};this.cue(room,{id:key,type:'score',playerId:p.id,round:room.round,points});
  }else fail(400,'Unknown player action.');
  p.revision++;this.remember(room,key);this.advance(room);return this.emit(room);
 }
 admin(room,ticket,data){
  const {key,duplicate}=this.identity(room,ticket,data,'host');if(duplicate)return this.snapshot(room);if(data.gameId!==room.gameId)fail(409,'The game has changed. Refresh the room.');
  if(data.type==='start'){if(room.phase!=='lobby'||!active(room).length)fail(409,'This game has already started.');room.phase='playing';room.round=1;this.cue(room,{id:key,type:'round',round:1});}
  else if(data.type==='remove'){
   const p=room.players.find(p=>p.id===data.playerId&&!p.removed);if(!p||p.id===room.hostId)fail(400,'The organizer stays in this game.');if(room.phase==='done')fail(409,'Start another game to change the players.');p.removed=true;if(room.phoneSoundOwner===p.id)room.phoneSoundOwner=room.hostId;this.advance(room);
  }else if(data.type==='again'){
   if(room.phase!=='done')fail(409,'Finish this game before playing again.');room.gameId=token();room.phase='lobby';room.round=0;room.inviteToken=token();room.joins=[];room.cues=[];
   room.players=active(room).map(p=>({...p,card:blankCard(),rolls:0,revision:0,finishedRound:0,lastScore:null,selected:[true,true,true,true,true],dice:[1,2,3,4,5]}));
  }else fail(400,'Unknown organizer action.');this.remember(room,key);return this.emit(room);
 }
 heartbeat(room,ticket){const p=this.authorize(room,ticket,'player');p.lastSeen=this.clock();return this.emit(room);}
 claim(room,ticket){
  const p=this.authorize(room,ticket,'player'),previous=room.players.find(p=>p.id===room.hostId);
  if(p.id!==room.hostId){
   if(this.clock()-previous.lastSeen<=45000)fail(409,'The organizer is still connected. Try again if they remain offline.');
   const oldId=room.hostId;room.hostId=p.id;room.hostToken=token();if(room.phoneSoundOwner===oldId)room.phoneSoundOwner=p.id;p.lastSeen=this.clock();this.emit(room);
  }
  return {...this.seatKeys(room,p),hostToken:room.hostToken,state:this.snapshot(room)};
 }
 display(room,ticket,{instance,ready,renew=false}){
  this.authorize(room,ticket,'display');this.expireDisplay(room);if(typeof instance!=='string'||!/^[\w-]{8,80}$/.test(instance))fail(400,'Invalid display identity.');
  if(ready===false){if(room.display?.instance===instance){room.display=null;return this.emit(room);}}
  else if(ready===true){
   if(renew&&room.display?.instance!==instance)fail(409,'TV sound was released. Reconnect to transfer it back.');if(room.display&&room.display.instance!==instance)fail(409,'Another shared display has room sound. This display will stay quiet.');
   if(room.display)room.display.until=this.clock()+LEASE_MS;else{room.display={instance,until:this.clock()+LEASE_MS};return this.emit(room);}
  }else fail(400,'Confirm display readiness.');return this.snapshot(room);
 }
 sweep(){for(const [id,room] of this.rooms){if(room.expires<=this.clock()){for(const fn of room.listeners)fn(null);this.rooms.delete(id);}else this.expireDisplay(room);}}
}
