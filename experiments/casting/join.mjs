import {request,newId} from './client.mjs';
import {seats,rememberedName} from './seats.mjs';
const $=s=>document.querySelector(s),parts=location.hash.slice(1).split('.');let config;
if(parts.length===2&&parts.every(p=>/^[\w-]{16,100}$/.test(p)))config={roomId:parts[0],inviteToken:parts[1]};
const joinId=newId();
if(!config)$('#error').textContent='Scan the organizer’s QR code to open your invitation.';
else{
 try{
  const info=await request('/api/rooms/'+config.roomId+'/join-info',undefined,config.inviteToken);
  $('#invite-title').textContent='Join '+info.hostName+'’s room';$('#invite-players').textContent=info.players.join(' · ');
  const saved=seats.get();if(saved?.schema===2&&saved.roomId===config.roomId){$('#return').hidden=false;$('#return').onclick=()=>location.replace('/');}
  if(info.full)$('#error').textContent='The room already has six players.';else{$('#join').hidden=false;$('#name').value=rememberedName();}
 }catch(e){$('#error').textContent=e.message;$('#invite-players').textContent='Ask the organizer to show a current QR code.';}
}
$('#join').onsubmit=async e=>{
 e.preventDefault();$('#error').textContent='';$('#join-button').disabled=true;
 try{const name=$('#name').value.trim(),keys=await request('/api/rooms/'+config.roomId+'/join',{name,joinId},config.inviteToken);seats.set({...keys,name});location.replace('/');}
 catch(e){$('#error').textContent=e.message;$('#join-button').disabled=false;}
};
