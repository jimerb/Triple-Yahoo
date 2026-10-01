import test from 'node:test';
import assert from 'node:assert/strict';
import {CastConnection,castFailure,startAnotherTrial} from './cast-connection.mjs';
import {validateAttachment} from './receiver-attachment.mjs';
import {TrialRooms} from './room.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const packet={roomId:'new-room',displayToken:'display-only'};
function fixture(){
  const sent=[],statuses=[];let listener,id=0;
  const session={addMessageListener(ns,fn){listener=fn;},removeMessageListener(){listener=null;},async sendMessage(ns,data){sent.push(data);},endSession(){}};
  const link=new CastConnection({namespace:'trial',makeId:()=>String(++id),status:value=>statuses.push(value),timeoutMs:20,stopTimeoutMs:20});
  return {link,session,sent,statuses,reply(data){listener?.('trial',data);}};
}
test('Cast waits for a board acknowledgement, coalesces callback duplicates and ignores unrelated replies',async()=>{
  const f=fixture(),wait=f.link.attach(f.session,packet);assert.equal(f.link.attach(f.session,packet),wait);
  await tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].controlToken,undefined);
  let done=false;wait.then(()=>{done=true;});await tick();assert.equal(done,false,'Sending alone is not TV readiness');
  f.reply({type:'attached',roomId:'other-room'});f.reply({type:'attached',roomId:packet.roomId,attempt:'old'});await tick();assert.equal(done,false);
  f.reply({type:'attached',roomId:packet.roomId,attempt:f.sent[0].attempt});await wait;assert.equal(done,true);f.link.detach();
});
test('TV rejection is visible for the requested room and silent TV connections time out',async()=>{
  const f=fixture(),wait=f.link.attach(f.session,packet);const failed=assert.rejects(wait,/already following/);
  await tick();f.reply({type:'error',roomId:packet.roomId,message:'TV already following a live game'});await failed;f.link.detach();
  const g=fixture();await assert.rejects(g.link.attach(g.session,packet),/did not respond.*Stop TV/);g.link.detach();
});
test('Cast send failures preserve the Google error code',async()=>{
  const f=fixture();f.session.sendMessage=async()=>{throw 'receiver_unavailable';};
  try{await f.link.attach(f.session,packet);assert.fail('must fail');}catch(error){assert.match(castFailure(error),/receiver_unavailable/);}f.link.detach();
  assert.match(castFailure('cancel'),/canceled/);assert.match(castFailure({code:'timeout'}),/timeout/);
});
test('New trial waits for the actual Cast-ended event before discarding phone state',async()=>{
  const f=fixture(),calls=[];let current=f.session;
  f.session.endSession=stop=>{assert.equal(stop,true);calls.push('stop requested');};
  const leaving=startAnotherTrial({stop:()=>f.link.stop(()=>current),close:()=>calls.push('close'),clear:()=>calls.push('clear'),reload:()=>calls.push('reload')});
  await tick();assert.deepEqual(calls,['stop requested']);
  current=null;f.link.ended();await leaving;assert.deepEqual(calls,['stop requested','close','clear','reload']);
});
test('failed stop keeps the phone game and session data intact',async()=>{
  const f=fixture(),calls=[];
  await assert.rejects(startAnotherTrial({stop:()=>f.link.stop(()=>f.session),close:()=>calls.push('close'),clear:()=>calls.push('clear'),reload:()=>calls.push('reload')}),/did not confirm stopping/);
  assert.deepEqual(calls,[]);
});
test('stopping without a current Cast session still opens a fresh trial',async()=>{
  const f=fixture(),calls=[];
  await startAnotherTrial({stop:()=>f.link.stop(()=>null),close:()=>calls.push('close'),clear:()=>calls.push('clear'),reload:()=>calls.push('reload')});assert.deepEqual(calls,['close','clear','reload']);
});
test('next-day room expiry releases the board while live games remain protected',async()=>{
  let now=1000;const rooms=new TrialRooms({clock:()=>now});const old=rooms.create(['Yesterday']);const previous={version:1,roomId:old.roomId,displayToken:old.displayToken};
  now+=24*60*60*1000;const fresh=rooms.create(['Today']);const next={version:1,roomId:fresh.roomId,displayToken:fresh.displayToken};
  const read=async value=>{const room=rooms.get(value.roomId);rooms.authorize(room,value.displayToken,'view');return rooms.snapshot(room);};
  assert.equal((await validateAttachment(previous,next,read)).game.players[0].name,'Today');
  const other=rooms.create(['Another']);const otherPacket={version:1,roomId:other.roomId,displayToken:other.displayToken};
  await assert.rejects(validateAttachment(next,otherPacket,read),/already following/);
  await assert.rejects(validateAttachment(previous,{...next,displayToken:other.displayToken},read),error=>error.status===403);
});
