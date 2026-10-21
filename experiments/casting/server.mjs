import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {TrialRooms,TrialError} from './room.mjs';
const assets={
 '/':'controller.html','/controller.html':'controller.html','/join.html':'join.html','/join.mjs':'join.mjs','/seats.mjs':'seats.mjs','/qr.mjs':'qr.mjs','/vendor/qr.mjs':'vendor/qr.mjs',
 '/receiver.html':'receiver.html','/receiver.mjs':'receiver.mjs','/receiver-attachment.mjs':'receiver-attachment.mjs','/display-link.html':'display-link.html','/display-link.mjs':'display-link.mjs',
 '/controller.mjs':'controller.mjs','/controller-state.mjs':'controller-state.mjs','/trial.css':'trial.css','/screen.mjs':'screen.mjs','/sound.mjs':'sound.mjs','/cast.mjs':'cast.mjs','/cast-connection.mjs':'cast-connection.mjs','/client.mjs':'client.mjs','/events.mjs':'events.mjs',
 '/engine.mjs':'../../engine.mjs','/sounds/dice-on-felt.wav':'../../sounds/dice-on-felt.wav'};
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw new TrialError(413,'Request is too large.');}try{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{throw new TrialError(400,'Invalid request.');}}
export function createTrialServer({rooms=new TrialRooms(),appId=process.env.CAST_APP_ID||''}={}){
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store, no-transform');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,'http://localhost'),method=req.method;
   if(url.pathname.startsWith('/api/')&&method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new TrialError(403,'Use the game website to make this request.');
   if(url.pathname==='/api/config'&&method==='GET')return json(200,{appId,trial:true});
   if(url.pathname==='/api/rooms'&&method==='POST'){rooms.sweep();if(rooms.rooms.size>=30)throw new TrialError(429,'This trial is full. Try again later.');return json(201,rooms.create(await body(req)));}
   const match=url.pathname.match(/^\/api\/rooms\/([\w-]+)\/(state|events|action|admin|join|join-info|invitation|heartbeat|claim|display|cast-event)$/);
   if(match){
    const [,id,endpoint]=match,room=rooms.get(id),ticket=req.headers.authorization?.replace(/^Bearer /,'')||url.searchParams.get('ticket');
    const role=['action','heartbeat','claim'].includes(endpoint)?'player':endpoint==='admin'?'host':['display','cast-event'].includes(endpoint)?'display':['join','join-info'].includes(endpoint)?'invite':'view';rooms.authorize(room,ticket,role);rooms.expireDisplay(room);
    if(endpoint==='cast-event'&&method==='POST'){const data=await body(req);if(typeof data.stage!=='string'||!/^[a-zA-Z_]{1,40}$/.test(data.stage)||typeof data.code!=='string'||!/^([a-z_]{1,40})?$/.test(data.code))throw new TrialError(400,'Invalid casting event.');return json(200,{ok:true});}
    if(endpoint==='state'&&method==='GET')return json(200,rooms.snapshot(room));
    if(['join-info','invitation'].includes(endpoint)&&method==='GET')return json(200,endpoint==='join-info'?rooms.joinInfo(room,ticket):rooms.invitation(room,ticket));
    if(['action','admin','join','heartbeat','claim','display'].includes(endpoint)&&method==='POST')return json(endpoint==='join'?201:200,rooms[endpoint](room,ticket,await body(req)));
    if(endpoint==='events'&&method==='GET'){
     res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});
     const write=(type,s)=>res.write('event: '+type+'\ndata: '+JSON.stringify(s)+'\n\n');write('snapshot',rooms.snapshot(room));
     const listener=state=>{if(!state){write('expired',null);res.end();return;}try{rooms.authorize(room,ticket,'view');write('state',state);}catch{write('removed',null);res.end();}};
     room.listeners.add(listener);const timer=setInterval(()=>res.write(': alive\n\n'),10000);res.on('close',()=>{clearInterval(timer);room.listeners.delete(listener);});return;
    }
    throw new TrialError(405,'That request method is unavailable.');
   }
   if(method!=='GET'||!assets[url.pathname])throw new TrialError(404,'Page not found.');
   const path=assets[url.pathname],data=await readFile(new URL(path,import.meta.url));res.writeHead(200,{'Content-Type':path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.wav')?'audio/wav':'text/html'});res.end(data);
  }catch(e){if(!res.headersSent)json(e.status||503,{error:e.status?e.message:'The room could not complete that request. Please retry.'});else res.end();}
 });
 const timer=setInterval(()=>rooms.sweep(),1000);timer.unref();server.on('close',()=>clearInterval(timer));return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.PORT||4318),host=process.env.HOST||'127.0.0.1';createTrialServer().listen(port,host,()=>console.log('Shared-round preview: http://'+host+':'+port));}
