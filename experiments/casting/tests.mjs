import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrialRooms, LEASE_MS, ROOM_TTL_MS } from './room.mjs';
import { eventGate } from './events.mjs';
import { createTrialServer } from './server.mjs';

function fixture(){let time=10000;const rooms=new TrialRooms({clock:()=>time,random:()=>0});const keys=rooms.create(['Jim','Terry']);const room=rooms.get(keys.roomId);return{rooms,room,keys,advance:ms=>{time+=ms;},action:data=>rooms.action(room,keys.controlToken,{id:Math.random().toString(),revision:room.revision,...data})};}
test('controller can roll and score; duplicate and stale commands cannot gain rolls or scores',()=>{
  const f=fixture();assert.throws(()=>f.action({type:'score',row:0,column:0}),/Confirm|unavailable/);
  f.action({type:'roll',id:'roll-1'});assert.deepEqual(f.room.game.dice,[1,1,1,1,1]);assert.equal(f.room.game.rolls,1);
  f.action({type:'roll',id:'roll-1',revision:0});assert.equal(f.room.game.rolls,1);
  assert.throws(()=>f.action({type:'roll',id:'roll-2',revision:0}),/updated/);
  f.action({type:'score',row:0,column:2,id:'score-1'});assert.equal(f.room.game.players[0].card[0][2],15);assert.equal(f.room.game.active,1);
  f.action({type:'score',row:0,column:2,id:'score-1',revision:1});assert.equal(f.room.game.active,1);
});
test('invalid dice, categories, turns, and zero confirmation are rejected without mutation',()=>{
  const f=fixture();f.action({type:'roll'});const original=structuredClone(f.room.game);
  for(const data of [{type:'toggle',die:5},{type:'score',row:13,column:0},{type:'score',row:0,column:3},{type:'score',row:1,column:0}])assert.throws(()=>f.action(data));
  assert.deepEqual(f.room.game,original);f.action({type:'score',row:1,column:0,confirmZero:true});assert.equal(f.room.game.players[0].card[1][0],0);
});
test('viewer and display credentials cannot roll; display cannot use another room',()=>{
  const f=fixture();for(const t of [f.keys.viewToken,f.keys.displayToken,'bogus','🙂'.repeat(16)])assert.throws(()=>f.rooms.action(f.room,t,{type:'roll',id:'x',revision:0}),/cannot access/);
  assert.throws(()=>f.rooms.display(f.room,f.keys.viewToken,{instance:'display-one',ready:true}),/cannot access/);
  const other=f.rooms.create(['Other']);assert.throws(()=>f.rooms.authorize(f.rooms.get(other.roomId),f.keys.displayToken,'display'),/cannot access/);
  assert.equal(f.room.game.rolls,0);
});
test('TV sound takes over only on readiness, has one owner, and returns after loss',()=>{
  const f=fixture();assert.equal(f.rooms.snapshot(f.room).soundOwner,'phone');
  assert.throws(()=>f.rooms.display(f.room,f.keys.displayToken,{instance:'display-one'}),/readiness/);
  f.rooms.display(f.room,f.keys.displayToken,{instance:'display-one',ready:true});assert.equal(f.rooms.snapshot(f.room).soundOwner,'display-one');
  assert.throws(()=>f.rooms.display(f.room,f.keys.displayToken,{instance:'display-two',ready:true}),/Another display/);
  f.advance(LEASE_MS+1);f.rooms.sweep();assert.equal(f.rooms.snapshot(f.room).soundOwner,'phone');
  f.rooms.display(f.room,f.keys.displayToken,{instance:'display-two',ready:true});assert.equal(f.rooms.snapshot(f.room).soundOwner,'display-two');
  f.action({type:'phone-sound'});assert.equal(f.rooms.snapshot(f.room).soundOwner,'phone');
  assert.throws(()=>f.rooms.display(f.room,f.keys.displayToken,{instance:'display-two',ready:true,renew:true}),/released/);
});
test('TV heartbeat and controller refresh preserve current dice, scores and turn',()=>{
  const f=fixture();f.action({type:'roll'});f.action({type:'score',row:0,column:0});f.action({type:'roll'});const game=structuredClone(f.room.game);
  f.rooms.display(f.room,f.keys.displayToken,{instance:'display-one',ready:true});f.advance(LEASE_MS-1);f.rooms.display(f.room,f.keys.displayToken,{instance:'display-one',ready:true});
  f.rooms.authorize(f.room,f.keys.controlToken,'control');assert.deepEqual(f.rooms.snapshot(f.room).game,game);
  f.advance(LEASE_MS-1);f.rooms.sweep();assert.equal(f.rooms.snapshot(f.room).soundOwner,'display-one');
});
test('snapshots, reconnect, repeated events, late audio and other state changes are silent',()=>{
  const gate=eventGate(), initial={revision:0,serverNow:10000,cue:{id:'old',at:9999}};
  assert.equal(gate(initial,true,11000),false);
  const fresh={revision:1,serverNow:10001,cue:{id:'roll',at:10001}};assert.equal(gate(fresh,false,11001),true);assert.equal(gate(fresh,false,11002),false);
  assert.equal(gate({...fresh,revision:2},false,11003),false);
  assert.equal(gate({...fresh,revision:3,cue:{id:'late',at:10001}},false,14002),false);
  assert.equal(gate({...fresh,revision:4,cue:{id:'latest',at:14000}},true,15000),false);
});
test('nickname validation and two-hour trial expiry have clear boundaries',()=>{
  const f=fixture();for(const names of [[],[''],['x'.repeat(25)],Array(7).fill('Player')])assert.throws(()=>f.rooms.create(names));
  f.advance(ROOM_TTL_MS+1);f.rooms.sweep();assert.throws(()=>f.rooms.get(f.keys.roomId),/expired/);
});
test('the unchanged rule engine completes six-player trial games',()=>{
  const rooms=new TrialRooms({random:()=>0});const keys=rooms.create(['A','B','C','D','E','F']),room=rooms.get(keys.roomId);
  for(let row=0;row<13;row++)for(let column=0;column<3;column++)for(let player=0;player<6;player++){
    rooms.action(room,keys.controlToken,{type:'roll',id:`roll-${row}-${column}-${player}`,revision:room.revision});
    rooms.action(room,keys.controlToken,{type:'score',row,column,confirmZero:true,id:`score-${row}-${column}-${player}`,revision:room.revision});
  }
  assert.equal(room.game.done,true);assert.ok(room.game.players.every(p=>p.card.every(row=>row.every(v=>v!==null))));
});
test('HTTP assets, credential checks, silent reconnect snapshots and path allowlist',async()=>{
  const server=createTrialServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;let stream;
  try{
    for(const p of ['/','/receiver.html','/viewer.html','/screen.mjs','/engine.mjs','/sounds/dice-on-felt.wav'])assert.equal((await fetch(base+p)).status,200);
    for(const p of ['/.git/config','/room.mjs','/server.mjs','/package.json'])assert.equal((await fetch(base+p)).status,404);
    const keys=await(await fetch(base+'/api/rooms',{method:'POST',body:JSON.stringify({names:['Jim','Terry']})})).json();
    const path=`/api/rooms/${keys.roomId}`;
    assert.equal((await fetch(base+path+'/state')).status,403);
    assert.equal((await fetch(base+path+'/action',{method:'POST',headers:{Authorization:`Bearer ${keys.viewToken}`},body:'{}'})).status,403);
    assert.equal((await fetch(base+path+'/action',{method:'POST',headers:{Origin:'https://another.example',Authorization:`Bearer ${keys.controlToken}`},body:'{}'})).status,403);
    stream=await fetch(base+path+'/events?ticket='+keys.viewToken);const reader=stream.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/^event: snapshot/);await reader.cancel();
  }finally{await stream?.body?.cancel().catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
