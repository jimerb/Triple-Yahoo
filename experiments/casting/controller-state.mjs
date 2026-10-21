import {eventGate} from './events.mjs';
const maskEqual=(a,b)=>a.every((v,i)=>v===b[i]);
export class ControllerState {
 constructor({playerId,send,read,onChange,onCue,onError}){Object.assign(this,{playerId,send,read,onChange,onCue,onError});this.state=null;this.draft=null;this.inFlight=false;this.kind=null;this.gate=eventGate();}
 get player(){return this.state?.players.find(p=>p.id===this.playerId);}
 get key(){const p=this.player;return p?[this.state.gameId,this.state.round,p.rolls,p.finished,p.removed].join(':'):'';}
 get busy(){return this.inFlight||!!this.draft;}
 get canSelect(){return !this.inFlight||this.kind==='select';}
 get visible(){return this.draft?{...this.state,players:this.state.players.map(p=>p.id===this.playerId?{...p,selected:[...this.draft.mask]}:p)}:this.state;}
 receive(next,snapshot=false){
  if(this.state&&next.revision<this.state.revision)return;
  this.state=next;if(this.draft&&this.draft.key!==this.key)this.draft=null;
  if(this.draft&&!this.inFlight&&maskEqual(this.draft.mask,this.player.selected))this.draft=null;
  const cues=this.gate(next,snapshot);this.onChange();if(cues.length)this.onCue(cues);
 }
 command(data){return {...data,gameId:this.state.gameId,round:this.state.round,playerRevision:this.player.revision};}
 toggle(die){
  const p=this.player;if(!p||!this.canSelect||!Number.isInteger(die)||die<0||die>4||!p.rolls||p.rolls>=3||p.finished||p.removed||this.state.phase!=='playing')return;
  this.draft||={key:this.key,mask:[...p.selected]};this.draft.mask[die]=!this.draft.mask[die];this.onChange();void this.flush();
 }
 async flush(){
  if(this.inFlight||!this.draft)return;this.inFlight=true;this.kind='select';this.onChange();
  try{let retries=0;while(this.draft){
   if(maskEqual(this.draft.mask,this.player.selected)){this.draft=null;break;}
   const mask=[...this.draft.mask];
   try{this.receive(await this.send(this.command({type:'select',selected:mask})));retries=0;}
   catch(e){if(e.status===409&&retries++<2){this.receive(await this.read(),true);continue;}throw e;}
  }}catch(e){this.draft=null;try{this.receive(await this.read(),true);}catch{}this.onError(e);}finally{this.inFlight=false;this.kind=null;this.onChange();}
 }
 async action(data){
  if(this.busy||!this.player)return;this.inFlight=true;this.kind=data.type;this.onChange();
  try{this.receive(await this.send(this.command(data)));}catch(e){try{this.receive(await this.read(),true);}catch{}this.onError(e);}finally{this.inFlight=false;this.kind=null;this.onChange();}
 }
}
