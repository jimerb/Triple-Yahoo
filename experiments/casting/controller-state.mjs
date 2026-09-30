import { eventGate } from './events.mjs';
const turnKey = state => [state.game.turn,state.game.active,state.game.rolls,state.game.done].join(':');
const sameMask = (a,b) => a.every((value,i)=>value===b[i]);

// Keep predictable selection feedback local; dice rolls and scores stay authoritative.
export class ControllerState {
  constructor({send,read,onChange,onCue,onError}) {
    Object.assign(this,{send,read,onChange,onCue,onError});
    this.state=null;this.draft=null;this.inFlight=false;this.kind=null;this.gate=eventGate();
  }
  get busy(){return this.inFlight||!!this.draft;}
  get canSelect(){return !this.inFlight||this.kind==='select';}
  get visible(){return this.draft?{...this.state,game:{...this.state.game,selected:[...this.draft.mask]}}:this.state;}
  receive(next,snapshot=false){
    if(this.state&&next.revision<this.state.revision)return;
    if(this.draft&&this.draft.turn!==turnKey(next))this.draft=null;
    this.state=next;
    if(this.draft&&!this.inFlight&&sameMask(this.draft.mask,next.game.selected))this.draft=null;
    const play=this.gate(next,snapshot);this.onChange();if(play)this.onCue(next.cue);
  }
  toggle(die){
    const game=this.state?.game;
    if(!game||!this.canSelect||!Number.isInteger(die)||die<0||die>4||!game.rolls||game.rolls>=3||game.done)return;
    this.draft||={turn:turnKey(this.state),mask:[...game.selected]};
    this.draft.mask[die]=!this.draft.mask[die];this.onChange();void this.flush();
  }
  async flush(){
    if(this.inFlight||!this.draft)return;
    this.inFlight=true;this.kind='select';this.onChange();
    try{
      let conflicts=0;
      while(this.draft){
        if(sameMask(this.draft.mask,this.state.game.selected)){this.draft=null;break;}
        const mask=[...this.draft.mask],turn=this.draft.turn;
        try{this.receive(await this.send({type:'select',selected:mask,revision:this.state.revision}));conflicts=0;}
        catch(error){
          if(error.status===409&&conflicts++<2){this.receive(await this.read(),true);continue;}
          throw error;
        }
        if(this.draft&&this.draft.turn===turn&&sameMask(this.draft.mask,this.state.game.selected))this.draft=null;
      }
    }catch(error){
      this.draft=null;
      try{this.receive(await this.read(),true);}catch{}
      this.onError(error);
    }finally{this.inFlight=false;this.kind=null;this.onChange();}
  }
  async action(data){
    if(this.busy||!this.state)return;
    this.inFlight=true;this.kind=data.type;this.onChange();
    try{this.receive(await this.send({...data,revision:this.state.revision}));}
    catch(error){try{this.receive(await this.read(),true);}catch{}this.onError(error);}
    finally{this.inFlight=false;this.kind=null;this.onChange();}
  }
}
