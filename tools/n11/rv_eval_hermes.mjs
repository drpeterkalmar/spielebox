import * as E from '/Users/wohnzimmer/dev/spielebox/src/games/reversi/engine.js';
import { EVAL } from '/Users/wohnzimmer/dev/spielebox/src/evalpos.js';
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
for (let g=0; g<3; g++){
 let s=E.initialState();
 const rows=[];
 while(!E.result(s)){
  const l=E.legalMoves(s); const m=l[Math.floor(rnd()*l.length)];
  s=E.applyMove(s,m);
  const c=E.counts(s), emp=64-c[0]-c[1], x=E.evaluate(s,0);
  rows.push(`${emp}e  Steine ${c[0]}:${c[1]} (diff ${c[0]-c[1]})  eval ${x}  -> ${Math.round(EVAL.reversi.pct(x)*100)}%`);
 }
 console.log('--- Partie',g, E.result(s).reason); console.log(rows.filter((_,i)=>i%6==0||i>rows.length-14).join('\n'));
}
