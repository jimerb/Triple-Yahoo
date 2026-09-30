import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerState } from './controller-state.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot=(revision=0,selected=[false,false,false,false,false])=>({revision,serverNow:Date.now(),cue:null,game:{turn:1,active:0,rolls:1,done:false,selected}});
test('five taps respond before a slow request and coalesce without waiting for a stream',async()=>{
  const calls=[],waiting=[];
  const sync=new ControllerState({send:data=>{calls.push(data);return new Promise(resolve=>waiting.push(resolve));},read:async()=>snapshot(),onChange(){},onCue(){},onError(e){throw e;}});
  sync.receive(snapshot(),true);
  for(let die=0;die<5;die++)sync.toggle(die);
  assert.deepEqual(sync.visible.game.selected,[true,true,true,true,true]);assert.equal(calls.length,1);assert.equal(sync.busy,true);
  waiting.shift()(snapshot(1,calls[0].selected));await tick();
  assert.equal(calls.length,2);assert.deepEqual(calls[1].selected,[true,true,true,true,true]);assert.equal(calls[1].revision,1);
  waiting.shift()(snapshot(2,calls[1].selected));await tick();
  assert.equal(sync.busy,false);assert.deepEqual(sync.state.game.selected,[true,true,true,true,true]);
});
test('repeated taps retain their final intent through stale streams and slow acknowledgements',async()=>{
  const calls=[],waiting=[];
  const sync=new ControllerState({send:data=>{calls.push(data);return new Promise(resolve=>waiting.push(resolve));},read:async()=>snapshot(),onChange(){},onCue(){},onError(e){throw e;}});
  sync.receive(snapshot(),true);sync.toggle(0);sync.toggle(0);sync.toggle(1);
  sync.receive(snapshot(),true);assert.deepEqual(sync.visible.game.selected,[false,true,false,false,false]);
  waiting.shift()(snapshot(1,calls[0].selected));await tick();
  assert.deepEqual(calls[1].selected,[false,true,false,false,false]);
  waiting.shift()(snapshot(2,calls[1].selected));await tick();
  sync.receive(snapshot(1,[true,false,false,false,false]));assert.deepEqual(sync.visible.game.selected,[false,true,false,false,false]);
});
test('a failed selection restores confirmed dice and exposes the error',async()=>{
  const errors=[];let fail;
  const sync=new ControllerState({send:()=>new Promise((_,reject)=>{fail=reject;}),read:async()=>snapshot(),onChange(){},onCue(){},onError:e=>errors.push(e.message)});
  sync.receive(snapshot(),true);sync.toggle(0);assert.equal(sync.visible.game.selected[0],true);
  fail(Error('Network unavailable'));await tick();assert.equal(sync.visible.game.selected[0],false);assert.equal(sync.busy,false);assert.deepEqual(errors,['Network unavailable']);
});
test('a competing sound revision retries selections, and a new turn discards old intent',async()=>{
  let current=snapshot(),attempts=0;const errors=[];
  const sync=new ControllerState({send:async data=>{if(!attempts++){current={...snapshot(1),soundOwner:'tv'};throw Object.assign(Error('Updated'),{status:409});}return {...snapshot(2,data.selected),soundOwner:'tv'};},read:async()=>current,onChange(){},onCue(){},onError:e=>errors.push(e)});
  sync.receive(current,true);sync.toggle(2);await tick();assert.equal(sync.state.game.selected[2],true);assert.equal(attempts,2);assert.equal(errors.length,0);
  let resolve;sync.send=()=>new Promise(r=>{resolve=r;});sync.toggle(3);
  sync.receive({...snapshot(3),game:{...snapshot().game,turn:2,active:1,rolls:0}});
  resolve({...snapshot(3),game:{...snapshot().game,turn:2,active:1,rolls:0}});await tick();assert.equal(sync.draft,null);assert.equal(sync.state.game.turn,2);
});
test('roll acknowledgements update immediately and their later stream echo never repeats audio',async()=>{
  let sounds=0;
  const cue={id:'roll',type:'roll',at:Date.now()};
  const next={...snapshot(1),cue};
  const sync=new ControllerState({send:async()=>next,read:async()=>next,onChange(){},onCue(){sounds++;},onError(e){throw e;}});
  sync.receive(snapshot(),true);await sync.action({type:'roll'});assert.equal(sync.state.revision,1);assert.equal(sounds,1);
  sync.receive(next);sync.receive(next,true);assert.equal(sounds,1);
});
