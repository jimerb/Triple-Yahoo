import test from 'node:test';import assert from 'node:assert/strict';
import {ControllerState} from './controller-state.mjs';import {TrialRooms} from './room.mjs';import {eventGate} from './events.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const rules=new TrialRooms({random:()=>0}),host=rules.create({name:'Host'}),room=rules.get(host.roomId);rules.admin(room,host.hostToken,{id:'start',gameId:room.gameId,type:'start'});rules.action(room,host.playerToken,{id:'roll',gameId:room.gameId,round:1,playerRevision:0,type:'roll'});
 const pending=[],errors=[],cues=[];let requests=0;
 const sync=new ControllerState({playerId:host.playerId,send:data=>new Promise((resolve,reject)=>{pending.push({data,resolve,reject});requests++;}),read:async()=>rules.snapshot(room),onChange:()=>{},onCue:value=>cues.push(...value),onError:e=>errors.push(e)});
 sync.receive(rules.snapshot(room),true);
 const flush=async()=>{const p=pending.shift();p.resolve(rules.action(room,host.playerToken,{...p.data,id:'action-'+requests}));await tick();};
 return {rules,host,room,sync,pending,errors,cues,flush};
}

test('rapid dice taps display immediately and coalesce while the first move is slow',async()=>{
 const f=fixture();for(let i=0;i<5;i++)f.sync.toggle(i);assert.deepEqual(f.sync.visible.players[0].selected,[true,true,true,true,true]);assert.equal(f.pending.length,1);assert.equal(f.sync.busy,true);
 await f.flush();assert.equal(f.pending.length,1);await f.flush();assert.equal(f.sync.busy,false);assert.deepEqual(f.room.players[0].selected,[true,true,true,true,true]);
});

test('selection failure restores confirmed dice and reports the problem',async()=>{
 const f=fixture();f.sync.toggle(2);f.pending.shift().reject(Error('Offline'));await tick();assert.deepEqual(f.sync.visible.players[0].selected,[false,false,false,false,false]);assert.equal(f.errors[0].message,'Offline');assert.equal(f.sync.busy,false);
});

test('a new round drops old selection intent and never sends it into the next round',async()=>{
 const f=fixture();f.sync.toggle(2);const p=f.pending.shift();f.rules.action(f.room,f.host.playerToken,{id:'score',gameId:f.room.gameId,round:1,playerRevision:1,type:'score',row:0,column:0});f.sync.receive(f.rules.snapshot(f.room));
 p.reject(Object.assign(Error('Stale'),{status:409}));await tick();assert.equal(f.sync.state.round,2);assert.equal(f.sync.draft,null);assert.equal(f.pending.length,0);
});

test('other seats do not change the revision attached to my pending action',()=>{
 const f=fixture();const before=f.sync.player.revision;// No global room revision is submitted as my revision.
 f.sync.toggle(1);assert.equal(f.pending[0].data.playerRevision,before);assert.equal(f.pending[0].data.round,1);assert.equal(f.pending[0].data.revision,undefined);
 f.pending[0].resolve(f.rules.snapshot(f.room));f.sync.draft=null;
});

test('burst sounds are deduplicated and reconnect snapshots never replay them',()=>{
 const gate=eventGate(),a={revision:1,serverNow:1000,cues:[{id:'old',type:'roll',at:999}]};assert.deepEqual(gate(a,true,1000),[]);
 const b={revision:2,serverNow:1100,cues:[...a.cues,{id:'one',type:'roll',at:1100},{id:'two',type:'roll',at:1100}]};assert.equal(gate(b,false,1100).length,2);assert.deepEqual(gate(b,false,1100),[]);assert.deepEqual(gate(b,true,1200),[]);
});
