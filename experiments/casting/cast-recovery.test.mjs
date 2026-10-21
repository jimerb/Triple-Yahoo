import test from 'node:test';
import assert from 'node:assert/strict';
import {CastConnection,CastLaunch,castFailure,startAnotherTrial,reloadTvConnection,useFreshTvConnection} from './cast-connection.mjs';
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
test('expired old rooms release the display while active rooms remain protected',async()=>{
 let now=1000;const rules=new TrialRooms({clock:()=>now});const old=rules.create({name:'Yesterday'}),previous={version:1,roomId:old.roomId,displayToken:old.displayToken};now+=86400000;
 const fresh=rules.create({name:'Today'}),next={version:1,roomId:fresh.roomId,displayToken:fresh.displayToken};
 const read=async p=>{const room=rules.get(p.roomId);rules.authorize(room,p.displayToken);return rules.snapshot(room);};
 assert.equal((await validateAttachment(previous,next,read)).players[0].name,'Today');
 const another=rules.create({name:'Another'});await assert.rejects(validateAttachment(next,{version:1,roomId:another.roomId,displayToken:another.displayToken},read),/already following/);
});

test('connection failure cannot be treated as permission to replace a live TV game',async()=>{
  const old={...packet,roomId:'old',version:1},next={...packet,version:1};
  await assert.rejects(validateAttachment(old,next,async p=>{if(p.roomId==='old')throw Error('Offline');return {};}),/Offline/);
});

function launchFixture(requestSession=()=>new Promise(()=>{})) {
  let current=null;const statuses=[],recoveries=[];
  const launch=new CastLaunch({requestSession,getSession:()=>current,status:s=>statuses.push(s),recovery:r=>recoveries.push(r),timeoutMs:25});
  return {launch,statuses,recoveries,setSession:s=>{current=s;}};
}

test('session-started events finish launch even if Google never settles its selection promise',async()=>{
  let requests=0;const f=launchFixture(()=>{requests++;return new Promise(()=>{});});
  const wait=f.launch.start();assert.equal(requests,1,'Native request starts within the original tap');
  assert.equal(f.launch.start(),wait);f.launch.starting();assert.match(f.statuses.at(-1),/TV selected/);
  const session={};f.setSession(session);assert.equal(f.launch.started(session),true);assert.equal(await wait,session);
  assert.equal(f.recoveries.at(-1),false);
});

test('a fulfilled Google request without a session is not a connected TV',async()=>{
  const f=launchFixture(()=>Promise.resolve());const wait=f.launch.start();let completed=false;wait.then(()=>{completed=true;});
  await tick();assert.equal(completed,false);assert.match(f.statuses.at(-1),/TV selected/);
  const session={};f.setSession(session);f.launch.started(session);assert.equal(await wait,session);
});

test('a stuck launch times out, offers reset and cannot stack native requests',async()=>{
  let requests=0;const f=launchFixture(()=>{requests++;return new Promise(()=>{});});
  await assert.rejects(f.launch.start(),/launch_timeout.*Chrome/);assert.equal(f.recoveries.at(-1),true);
  await assert.rejects(f.launch.start(),/launch_timeout/);assert.equal(requests,1);
  const session={};f.setSession(session);assert.equal(f.launch.started(session),false);assert.equal(await f.launch.start(),session);
});

test('Google session-event error codes unblock a pending request; late errors cannot affect its retry',async()=>{
  let rejectOld,requests=0;
  const f=launchFixture(()=>++requests===1?new Promise((_,reject)=>{rejectOld=reject;}):new Promise(()=>{}));
  const wait=f.launch.start(),failed=assert.rejects(wait,e=>castFailure(e).includes('receiver_unavailable'));
  f.launch.failed('receiver_unavailable');await failed;
  const retry=f.launch.start();rejectOld('timeout');await tick();assert.ok(f.launch.pending);
  const session={};f.setSession(session);f.launch.started(session);assert.equal(await retry,session);
});

test('canceling an unfinished launch settles it without waiting for Google',async()=>{
  const f=launchFixture();const wait=f.launch.start(),canceled=assert.rejects(wait,e=>e.code==='stopped');
  f.launch.cancel();await canceled;assert.equal(f.launch.pending,null);
});

test('TV connection reset requests one fresh launch without deleting saved game data',()=>{
  const saved=new Map([['game','keep-game']]);let reloads=0;
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  reloadTvConnection(storage,()=>reloads++);assert.equal(reloads,1);assert.equal(saved.get('game'),'keep-game');
  assert.equal(useFreshTvConnection(storage),true);assert.equal(useFreshTvConnection(storage),false);
  assert.equal(saved.get('game'),'keep-game');
});

test('a missed Android session event is recovered by observing a real started session',async()=>{
  let current={getSessionState:()=> 'SESSION_STARTING'};
  const launch=new CastLaunch({requestSession:()=>new Promise(()=>{}),getSession:()=>current,status:()=>{},timeoutMs:100,pollMs:5});
  const wait=launch.start();assert.ok(launch.pending);
  current={getSessionState:()=> 'SESSION_STARTED'};
  assert.equal(await wait,current);assert.equal(launch.pending,null);
});
test('selection and receiver-launch timeouts identify different failing stages',async()=>{
  const f=launchFixture();const wait=f.launch.start();f.launch.starting();
  await assert.rejects(wait,/could not launch.*registered trial receiver/);
  f.launch.failed('receiver_unavailable');assert.equal(f.launch.needsReset,false);
});

test('Reset ends the old TV session before reload, and remains bounded if Google does not confirm',async()=>{
  const {resetTvConnection}=await import('./cast-connection.mjs');
  const calls=[],storage={setItem:()=>calls.push('fresh')};let stopped;
  const wait=resetTvConnection({stop:()=>new Promise(resolve=>{calls.push('stop');stopped=resolve;}),storage,reload:()=>calls.push('reload')});
  assert.deepEqual(calls,['stop']);stopped();await wait;assert.deepEqual(calls,['stop','fresh','reload']);
  calls.length=0;
  await resetTvConnection({stop:()=>Promise.reject(Error('timeout')),storage,reload:()=>calls.push('reload'),onStopFailure:()=>calls.push('stop failed')});
  assert.deepEqual(calls,['stop failed','fresh','reload']);
});
