// Übungs-Bot für Backgammon (rein, ohne DOM).
// level 1 = leicht: zufällig aus der besseren Hälfte der Züge, verdoppelt nur mit großem Vorsprung
// level 2 = mittel: Heuristik (Pips, Blots und ihre Gefährdung, Punkte, Primes, Anker, Bar, Abtragen)
// level 3 = stark: zusätzlich 1-Ply-Vorausschau über die 21 gegnerischen Würfe (Zeitlimit timeMs)
import { legalMoves, _pos, _gen, _flip, _genFor } from './engine.js';

const O = 26;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// 21 verschiedene Würfe mit Gewicht (Pasch 1/36, sonst 2/36)
const ROLLS = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 : 2]);

// Je Wurf: Bitmaske der Entfernungen (1–24), die ein Stein damit erreichen kann (ohne Blockaden)
const ROLL_MASK = ROLLS.map(([a, b]) => {
  let m = (1 << a) | (1 << b) | (1 << (a + b));
  if (a === b) m |= (1 << (3 * a)) | (1 << (4 * a));
  return m & 0x1fffffe;
});

// Anzahl Würfe (von 36), die eine der Entfernungen in mask treffen
function shots(mask) {
  let n = 0;
  for (let i = 0; i < ROLLS.length; i++) if (ROLL_MASK[i] & mask) n += ROLLS[i][2];
  return n;
}

// Wert eines gemachten Punktes je relativer Position (Heimfeld und Bar-Punkt wichtiger; 19–24 Anker)
const POINT_VAL = [0, 1, 2, 3, 5, 6, 6, 5, 4, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 3, 4, 4, 3, 2, 2, 0];

// Bewertung aus Sicht des Spielers, der gerade gezogen hat (Gegner würfelt als Nächstes), in „Pips“
export function heur(pos) {
  if (pos[0] === 15) return 1000;
  let my = 0, op = 0, myBack = 0, opBack = 26;
  for (let r = 1; r <= 25; r++) if (pos[r]) { my += r * pos[r]; myBack = r; }
  for (let q = 24; q >= 0; q--) if (pos[O + q]) { op += (25 - q) * pos[O + q]; opBack = q; }
  let s = op - my + 3 * pos[0] - 3 * pos[O + 25];
  if (myBack <= opBack) {
    // Rennen: Pips und abgetragene Steine; aufgetürmte Steine leicht bestrafen
    for (let r = 1; r <= 6; r++) if (pos[r] > 3) s -= (pos[r] - 3) * 0.5;
    return s;
  }
  // gegnerische Heimfeldpunkte (meine 19–24) und eigene (1–6)
  let opHome = 0, myHome = 0;
  for (let q = 19; q <= 24; q++) if (pos[O + q] >= 2) opHome++;
  for (let r = 1; r <= 6; r++) if (pos[r] >= 2) myHome++;
  // Schützen: Bitmaske gegnerischer Steine (q = 0 Bar … 24)
  let opMask = 0;
  for (let q = 0; q <= 24; q++) if (pos[O + q]) opMask |= 1 << q;
  let run = 0, best = 0;
  for (let r = 1; r <= 24; r++) {
    const n = pos[r];
    if (n >= 2) {
      s += POINT_VAL[r];
      if (n > 3) s -= (n - 3) * 0.7;
      run++;
      if (run > best && (opMask & ((1 << r) - 1)) !== 0) best = run;   // Blockade nur, wenn Gegner dahinter steht
    } else {
      run = 0;
      if (n === 1) {
        // Blot: Treffer durch Gegner auf q < r (Entfernung r − q)
        const behind = opMask & ((1 << r) - 1);
        if (behind) {
          let dm = 0;
          for (let q = 0; q < r; q++) if (behind & (1 << q)) dm |= 1 << (r - q);
          const h = shots(dm & 0x1fffffe);
          s -= (h / 36) * (6 + (25 - r) * 0.55) * (1 + opHome * 0.25);
        }
      }
    }
  }
  if (best >= 3) s += (best - 2) * (best - 2) * 2.5;
  s += pos[O] * (3 + 2.5 * myHome);       // Gegner auf der Bar
  s -= pos[25] * (3 + 2.5 * opHome);      // eigene Steine auf der Bar
  return s;
}

// Wert aus Sicht dessen, der jetzt würfelt (pos aus seiner Sicht)
const toRoll = pos => -heur(_flip(pos)) + 8;   // ≈ ein halber Wurf Tempo

const isRace = pos => {
  let myBack = 0, opBack = 26;
  for (let r = 1; r <= 25; r++) if (pos[r]) myBack = r;
  for (let q = 24; q >= 0; q--) if (pos[O + q]) opBack = q;
  return myBack <= opBack;
};
const pipsOf = pos => {
  let my = 0, op = 0;
  for (let r = 1; r <= 25; r++) my += r * pos[r];
  for (let q = 0; q <= 24; q++) op += (25 - q) * pos[O + q];
  return [my, op];
};

// Stärke der Stellung für den Spieler am Wurf: > 0 gut. Rennen: Vorsprung in % (8-9-12-Regel), sonst Heuristik
function cubeStrength(pos) {
  if (isRace(pos)) {
    const [my, op] = pipsOf(pos);
    return { race: true, v: my > 0 ? (op - my) / my * 100 : 100 };
  }
  return { race: false, v: toRoll(pos) };
}

function wantDouble(pos, level, redouble) {
  const { race, v } = cubeStrength(pos);
  if (level <= 1) return race ? v >= 15 : v >= 30;
  return race ? v >= (redouble ? 9 : 8) : v >= 16;
}
function wantTake(posDoubler, level) {
  const { race, v } = cubeStrength(posDoubler);
  if (level <= 1) return race ? v <= 25 : v <= 45;
  return race ? v <= 12 : v <= 26;
}

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const r = typeof rng === 'function' ? rng : Math.random;
  const lv = level >= 3 ? 3 : level <= 1 ? 1 : 2;
  if (state.phase === 'roll') {
    const dbl = moves.find(m => m.type === 'double');
    if (dbl && wantDouble(_pos(state, state.turn), lv, state.cube.owner !== null)) return dbl;
    return { type: 'roll' };
  }
  if (state.phase === 'double') {
    return wantTake(_pos(state, state.turn), lv) ? { type: 'take' } : { type: 'drop' };
  }
  if (moves.length === 1) return moves[0];
  const g = _genFor(state);   // g.list[i] ↔ moves[i]
  const scored = g.list.map((m, i) => ({ i, v: heur(m.pos) + r() * 1e-6 }));
  scored.sort((a, b) => b.v - a.v);
  if (lv === 1) {
    const half = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
    return moves[half[Math.floor(r() * half.length)].i];
  }
  if (lv === 2) return moves[scored[0].i];
  const ms = Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 400;
  return moves[lookahead(g.list, scored, ms, r)];
}

// 1-Ply: für die besten Kandidaten den Erwartungswert über alle 21 Würfe des Gegners
// (Gegner wählt seinen besten Zug nach Heuristik); bricht bei Zeitablauf ab.
function lookahead(list, scored, ms, rng) {
  const t0 = now();
  const cand = scored.slice(0, 8);
  let bestI = scored[0].i, bestV = -Infinity;
  for (let k = 0; k < cand.length; k++) {
    if (k > 0 && now() - t0 > ms) break;
    const opp = _flip(list[cand[k].i].pos);
    let sum = 0, aborted = false;
    for (const [a, b, w] of ROLLS) {
      if (k > 0 && now() - t0 > ms) { aborted = true; break; }   // halber Kandidat zählt nicht
      const g = _gen(opp, [a, b]);
      let bestOpp = -Infinity;
      for (const m of g.list) {
        const v = heur(m.pos);
        if (v > bestOpp) bestOpp = v;
      }
      sum += w * -bestOpp;
    }
    if (aborted) break;
    const v = sum / 36 + cand[k].v * 0.05 + rng() * 1e-6;
    if (v > bestV) { bestV = v; bestI = cand[k].i; }
  }
  return bestI;
}
