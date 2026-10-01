import {request} from './client.mjs';
import {setupCast} from './cast.mjs';
const $=s=>document.querySelector(s);let config,casting;
try{config=JSON.parse(decodeURIComponent(location.hash.slice(1)));}catch{}
if(!config?.roomId||!config?.displayToken)$('#error').textContent='Open the TV setup link shared from the trial phone.';
else{
  request(`/api/rooms/${config.roomId}/state`,undefined,config.displayToken)
    .then(()=>setupCast({packet:()=>config,status:text=>{$('#cast-status').textContent=text;},readyButton:handler=>{$('#cast').disabled=false;$('#cast').onclick=handler;}}))
    .then(value=>{casting=value;}).catch(e=>{$('#error').textContent=e.message;});
}
$('#stop').onclick=async()=>{if(!config)return;try{await casting?.stop();const state=await request(`/api/rooms/${config.roomId}/state`,undefined,config.displayToken);if(state.displayConnected)await request(`/api/rooms/${config.roomId}/display`,{instance:state.soundOwner,ready:false},config.displayToken);$('#cast-status').textContent='TV stopped. The game continues on its controller phone.';}catch(e){$('#error').textContent=e.message;}};
