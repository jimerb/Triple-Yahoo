import {eventGate} from './events.mjs';
export function newId(){return typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function request(path,data,ticket){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
 try{
  const response=await fetch(path,{method:data===undefined?'GET':'POST',signal:abort.signal,headers:{'Content-Type':'application/json',...(ticket?{Authorization:'Bearer '+ticket}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const value=await response.json();if(!response.ok){const error=Error(value.error||'Connection problem.');error.status=response.status;throw error;}return value;
 }catch(e){if(e.name==='AbortError')throw Error('The connection took too long. Your game is saved; please try again.');throw e;}finally{clearTimeout(timer);}
}
export function subscribe(config,onState,onConnection){
 const gate=eventGate(),stream=new EventSource('/api/rooms/'+config.roomId+'/events?ticket='+encodeURIComponent(config.ticket));
 stream.addEventListener('snapshot',e=>{const s=JSON.parse(e.data);gate(s,true);onConnection(true);onState(s,[],true);});
 stream.addEventListener('state',e=>{const s=JSON.parse(e.data);onConnection(true);onState(s,gate(s),false);});
 for(const [type,code,message] of [['expired',410,'This room has expired. Create a new room.'],['removed',403,'Your seat was removed from this game.']])stream.addEventListener(type,()=>{stream.close();onConnection(false,message,code);});
 stream.onerror=()=>onConnection(false,'Reconnecting to the room…');return ()=>stream.close();
}
