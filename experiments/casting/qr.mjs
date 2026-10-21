import qr from './vendor/qr.mjs';
export function qrSvg(text){
 const code=qr.QrCode.encodeText(text,qr.QrCode.Ecc.MEDIUM),border=4,size=code.size+border*2;let path='';
 for(let y=0;y<code.size;y++)for(let x=0;x<code.size;x++)if(code.getModule(x,y))path+=`M${x+border},${y+border}h1v1h-1z `;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Scan to join this room" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="#000"/></svg>`;
}
export const inviteUrl=(origin,data)=>origin+'/join.html#'+data.roomId+'.'+data.inviteToken;
