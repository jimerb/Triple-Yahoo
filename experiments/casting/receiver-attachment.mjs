// An expired room may release a board; a live room must never be hijacked.
export async function validateAttachment(current, packet, read) {
  if(packet?.version!==1||typeof packet.roomId!=='string'||typeof packet.displayToken!=='string')throw Error('The TV invitation is invalid.');
  const first=await read(packet);
  if(current&&current.roomId!==packet.roomId){
    try{await read(current);}catch(error){if(error.status===410)return first;throw error;}
    throw Error('This TV is already following another trial. Tap Stop TV before switching games.');
  }
  return first;
}
