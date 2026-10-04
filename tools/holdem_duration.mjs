// Schätzt die Dauer eines Hold'em-Turniers (Sit & Go) aus Selbstspiel: Hände, Entscheidungen, Showdowns je Turnier,
// dazu die Zeiten aus src/tempo.js (Denkzeit des Computers, Animationen, Ergebnis liegen lassen) und eine
// angenommene Bedenkzeit des Menschen (6 s je Entscheidung). Ein Platz = Mensch (gespielt von Stufe 2).
// Aufruf: node tools/holdem_duration.mjs [--players=4] [--blinds=normal] [--n=300] [--level=2]
import * as E from '../src/games/holdem/engine.js';
import { chooseMove } from '../src/games/holdem/bot.js';
import { TEMPO, holdemTimes } from '../src/tempo.js';
import { mulberry32 } from '../src/rng.js';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const players = Number(arg('players', 4)), blinds = arg('blinds', 'normal'), N = Number(arg('n', 300)), level = Number(arg('level', 2));
const HUMAN = 6000;
const rng = mulberry32(42);
const res = { gemuetlich: [], normal: [] };
const handsList = [];
for (let t = 0; t < N; t++) {
  let s = E.initialState({ players, blinds, start: Number(arg('start', 1000)) });
  const human = players - 1;
  const ms = { gemuetlich: 0, normal: 0 };
  let humanOut = false;
  while (s.phase !== 'over') {
    if (E.chance(s)) {
      const p = [...Array(52).keys()];
      for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
      s = E.applyChance(s, p);
      continue;
    }
    const seat = s.turn;
    const m = chooseMove(E.viewFor(s, seat), { level, rng, iters: 150 });
    s = E.applyMove(s, m);
    for (const lv of ['gemuetlich', 'normal']) {
      const a = TEMPO[lv];
      const think = seat === human ? HUMAN : a.think + a.jitter / 2;
      ms[lv] += think + holdemTimes(a, s).total;
    }
    if (s.out[human] !== null && !humanOut) {
      humanOut = true;
      // Mensch raus: Rest zählt (er schaut zu) – aber getrennt merken
    }
  }
  handsList.push(s.hand);
  for (const lv of ['gemuetlich', 'normal']) res[lv].push(ms[lv] / 60000);
}
const q = (a, f) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(f * (b.length - 1))]; };
console.log(`${players} Spieler, Blinds ${blinds}, ${N} Turniere (Stufe ${level}): Hände Median ${q(handsList, 0.5)} (25–75 %: ${q(handsList, 0.25)}–${q(handsList, 0.75)})`);
for (const lv of ['gemuetlich', 'normal']) {
  console.log(`  Tempo ${lv}: Median ${q(res[lv], 0.5).toFixed(0)} min (25–75 %: ${q(res[lv], 0.25).toFixed(0)}–${q(res[lv], 0.75).toFixed(0)} min)`);
}
