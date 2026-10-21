// A reconnect silently establishes a baseline. Burst cues share one room speaker.
export function eventGate(){
 let revision=-1,seen=new Set(),offset=0;
 return (state,snapshot=false,now=Date.now())=>{
  const cues=state.cues||[];
  if(snapshot){offset=now-state.serverNow;revision=state.revision;for(const c of cues)seen.add(c.id);return [];}
  if(state.revision<=revision)return [];revision=state.revision;
  const fresh=cues.filter(c=>!seen.has(c.id)&&now-offset-c.at>=-1000&&now-offset-c.at<=2500);
  for(const c of cues)seen.add(c.id);while(seen.size>512)seen.delete(seen.values().next().value);return fresh;
 };
}
