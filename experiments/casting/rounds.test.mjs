import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialRooms,LEASE_MS,ROOM_TTL_MS} from './room.mjs';
const ident=()=>crypto.randomUUID();
function setup(count=2){
 let now=1000;const rules=new TrialRooms({clock:()=>now,random:()=>0});const host=rules.create({name:'Organizer'}),room=rules.get(host.roomId),seats=[host];
 for(let i=1;i<count;i++)seats.push(rules.join(room,room.inviteToken,{name:'Player '+i,joinId:ident()}));
 const admin=data=>rules.admin(room,host.hostToken,{id:ident(),gameId:room.gameId,...data});
 const move=(n,data,id=ident())=>rules.action(room,seats[n].playerToken,{id,gameId:room.gameId,round:room.round,playerRevision:room.players[n].revision,...data});
 return {rules,room,seats,host,admin,move,setNow:value=>{now=value;}};
}

test('QR joining confirms unique nicknames and separate seats; public state contains no tickets',()=>{
 const f=setup();const state=f.rules.snapshot(f.room);assert.equal(state.players.length,2);assert.notEqual(f.seats[0].playerToken,f.seats[1].playerToken);
 const serialized=JSON.stringify(state);for(const value of [f.host.hostToken,f.room.inviteToken,f.host.displayToken,...f.seats.map(s=>s.playerToken)])assert.ok(!serialized.includes(value));
 assert.throws(()=>f.rules.join(f.room,f.room.inviteToken,{name:'organizer',joinId:ident()}),/already/);
 const id=ident(),seat=f.rules.join(f.room,f.room.inviteToken,{name:'Third',joinId:id});assert.deepEqual(f.rules.join(f.room,f.room.inviteToken,{name:'Third',joinId:id}),seat);
 assert.throws(()=>f.rules.join(f.room,'wrong',{name:'No',joinId:ident()}),e=>e.status===403);
 f.admin({type:'start'});assert.throws(()=>f.rules.join(f.room,f.room.inviteToken,{name:'Late',joinId:ident()}),/closes/);
});

test('everyone rolls independently and exactly one score per seat releases the round',()=>{
 const f=setup(6);f.admin({type:'start'});for(let i=0;i<6;i++)f.move(i,{type:'roll'});
 assert.ok(f.room.players.every(p=>p.rolls===1));const id=ident();f.move(0,{type:'score',row:0,column:0},id);
 assert.equal(f.room.round,1);assert.equal(f.room.players[0].rolls,1);assert.equal(f.room.players[0].card[0][0],5);
 assert.throws(()=>f.move(0,{type:'roll'}),/complete/);f.move(0,{type:'score',row:0,column:0},id);assert.equal(f.room.round,1);
 for(let i=1;i<6;i++)f.move(i,{type:'score',row:0,column:0});assert.equal(f.room.round,2);
 assert.ok(f.room.players.every(p=>p.rolls===0&&p.card[0][0]===5));assert.ok(f.room.players.every(p=>p.dice.every(n=>n===1)),'last dice remain visible');
});

test('another player and sound lease do not invalidate a seat’s in-flight move',()=>{
 const f=setup();f.admin({type:'start'});const revision=f.room.players[0].revision;
 f.move(1,{type:'roll'});f.rules.display(f.room,f.host.displayToken,{instance:'display-one',ready:true});
 f.move(0,{type:'roll',playerRevision:revision});assert.equal(f.room.players[0].rolls,1);
 assert.throws(()=>f.move(0,{type:'roll',playerRevision:revision}),/updated/);
});

test('seat permissions, three-roll limit, zero confirmation and filled cells stay authoritative',()=>{
 const f=setup();f.admin({type:'start'});
 assert.throws(()=>f.rules.action(f.room,f.host.displayToken,{id:ident(),type:'roll'}),e=>e.status===403);
 assert.throws(()=>f.rules.admin(f.room,f.seats[1].playerToken,{id:ident(),type:'remove'}),e=>e.status===403);
 f.move(0,{type:'roll'});f.move(0,{type:'select',selected:[true,false,false,false,false]});f.move(0,{type:'roll'});f.move(0,{type:'select',selected:[true,false,false,false,false]});f.move(0,{type:'roll'});
 assert.throws(()=>f.move(0,{type:'roll'}),/Choose dice/);assert.throws(()=>f.move(0,{type:'score',row:1,column:0}),/zero/);
 f.move(0,{type:'score',row:1,column:0,confirmZero:true});assert.equal(f.room.players[0].card[1][0],0);
});

test('round and game identities reject delayed actions across the barrier and replay',()=>{
 const f=setup(1);f.admin({type:'start'});const stale={gameId:f.room.gameId,round:1,playerRevision:0};
 f.move(0,{type:'roll'});f.move(0,{type:'score',row:0,column:0});assert.equal(f.room.round,2);
 assert.throws(()=>f.move(0,{type:'roll',...stale}),/updated/);
});

test('disconnects never skip scores; explicit organizer removal can release the barrier',()=>{
 const f=setup();f.admin({type:'start'});f.move(0,{type:'roll'});f.move(0,{type:'score',row:0,column:0});
 f.setNow(61000);f.rules.sweep();assert.equal(f.room.round,1);f.admin({type:'remove',playerId:f.room.players[1].id});
 assert.equal(f.room.round,2);assert.equal(f.room.players[1].removed,true);assert.equal(f.rules.snapshot(f.room).players.length,2);
 assert.throws(()=>f.rules.action(f.room,f.seats[1].playerToken,{id:ident(),type:'roll'}),e=>e.status===403);
 assert.throws(()=>f.admin({type:'remove',playerId:f.host.playerId}),/organizer/);
});

test('six-player games complete exactly 39 shared rounds and replay retains the group',()=>{
 const f=setup(6);f.admin({type:'start'});const originalGame=f.room.gameId,oldInvite=f.room.inviteToken;
 for(let slot=0;slot<39;slot++){
  assert.equal(f.room.round,slot+1);for(let i=0;i<6;i++){f.move(i,{type:'roll'});f.move(i,{type:'score',row:Math.floor(slot/3),column:slot%3,confirmZero:true});}
 }
 assert.equal(f.room.phase,'done');assert.equal(f.room.round,39);assert.ok(f.room.players.every(p=>p.card.flat().every(v=>v!==null)));
 f.admin({type:'again'});assert.equal(f.room.phase,'lobby');assert.equal(f.room.players.length,6);assert.notEqual(f.room.gameId,originalGame);assert.notEqual(f.room.inviteToken,oldInvite);assert.ok(f.room.players.every(p=>p.card.flat().every(v=>v===null)));
 f.admin({type:'start'});assert.throws(()=>f.move(0,{type:'roll',gameId:originalGame}),/updated/);
});

test('one room speaker survives display handoff, failure, and concurrent player devices',()=>{
 const f=setup();assert.equal(f.rules.snapshot(f.room).soundOwner,f.host.playerId);
 f.rules.display(f.room,f.host.displayToken,{instance:'display-one',ready:true});assert.equal(f.rules.snapshot(f.room).soundOwner,'display-one');
 assert.throws(()=>f.rules.display(f.room,f.host.displayToken,{instance:'display-two',ready:true}),/stay quiet/);
 f.move(1,{type:'phone-sound'});assert.equal(f.rules.snapshot(f.room).soundOwner,f.seats[1].playerId);
 assert.throws(()=>f.rules.display(f.room,f.host.displayToken,{instance:'display-one',ready:true,renew:true}),/released/);
 f.rules.display(f.room,f.host.displayToken,{instance:'display-two',ready:true});f.setNow(1000+LEASE_MS+1);f.rules.expireDisplay(f.room);assert.equal(f.rules.snapshot(f.room).soundOwner,f.seats[1].playerId);
 f.setNow(1000+ROOM_TTL_MS+1);assert.throws(()=>f.rules.get(f.room.id),e=>e.status===410);
});

test('a connected organizer cannot be displaced; explicit takeover after disconnect preserves play',()=>{
 const f=setup();f.admin({type:'start'});f.move(1,{type:'roll'});f.move(1,{type:'score',row:0,column:0});
 assert.throws(()=>f.rules.claim(f.room,f.seats[1].playerToken),/still connected/);
 f.setNow(47000);const oldToken=f.host.hostToken,result=f.rules.claim(f.room,f.seats[1].playerToken);
 assert.equal(result.state.hostId,f.seats[1].playerId);assert.equal(result.state.players[1].card[0][0],5);
 assert.throws(()=>f.rules.admin(f.room,oldToken,{id:ident(),gameId:f.room.gameId,type:'remove',playerId:f.host.playerId}),e=>e.status===403);
 f.rules.admin(f.room,result.hostToken,{id:ident(),gameId:f.room.gameId,type:'remove',playerId:f.host.playerId});assert.equal(f.room.round,2);
});
