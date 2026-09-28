export const categories = ['Ones','Twos','Threes','Fours','Fives','Sixes','Three of a kind','Four of a kind','Full house','Small straight','Large straight','Yahoo!','Pot luck'];
export function score(dice, row) {
  if (dice.length !== 5 || dice.some(d => !Number.isInteger(d) || d < 1 || d > 6)) throw new Error('Five valid dice required');
  const counts = Array.from({length:6},(_,i)=>dice.filter(d=>d===i+1).length);
  const sum=dice.reduce((a,b)=>a+b,0), max=Math.max(...counts), unique=[...new Set(dice)].sort().join('');
  if(row<6) return counts[row]*(row+1);
  return [max>=3?sum:0,max>=4?sum:0,counts.includes(3)&&counts.includes(2)?25:0,/1234|2345|3456/.test(unique)?30:0,/12345|23456/.test(unique)?40:0,max===5?50:0,sum][row-6];
}
export const blankCard=()=>Array.from({length:13},()=>[null,null,null]);
export function totals(card) {
 const upper=[0,1,2].map(c=>card.slice(0,6).reduce((s,r)=>s+(r[c]??0),0));
 const bonus=upper.map((s,c)=>s>=63*(c+1)?35*(c+1):0);
 const columns=[0,1,2].map(c=>card.reduce((s,r)=>s+(r[c]??0),0)+bonus[c]);
 return {upper,bonus,columns,total:columns.reduce((a,b)=>a+b,0)};
}
export function newGame(names) {return {players:names.map(name=>({name,card:blankCard()})),active:0,dice:[1,2,3,4,5],selected:[true,true,true,true,true],rolls:0,turn:1,done:false};}
export function roll(game,random=Math.random) {
 if(game.done||game.rolls>=3||!game.selected.some(Boolean)) return false;
 game.dice=game.dice.map((d,i)=>game.rolls===0||game.selected[i]?1+Math.floor(random()*6):d);
 game.rolls++;game.selected.fill(false);return true;
}
export function commit(game,row,col) {
 const card=game.players[game.active].card;
 if(game.done||!game.rolls||card[row][col]!==null) return false;
 card[row][col]=score(game.dice,row)*(col+1);
 game.done=game.players.every(p=>p.card.every(r=>r.every(v=>v!==null)));
 game.active=(game.active+1)%game.players.length;
 if(game.active===0)game.turn++;
 game.rolls=0;game.selected.fill(true);return true;
}
