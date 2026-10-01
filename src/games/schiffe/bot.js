// Übungs-Bot für Schiffe versenken (rein, ohne DOM). Bekommt nur die Sicht (viewFor) des Sitzes am Zug:
// die gegnerische Flotte ist darin null, er nutzt nur Schüsse, Treffer und versenkte Schiffe.
// Setzen: Zufallsflotte (randomFleet); Stufe 3 wählt unter vielen Zufallsflotten die, deren Felder bei
//         gleichmäßigem Suchen am seltensten getroffen werden (weg von der „heißen“ Mitte).
// Schießen:
// level 1 = leicht: zufällig auf unbeschossene Felder, nach einem Treffer nur jedes zweite Mal daneben
// level 2 = mittel: Jagen/Zielen – sucht im Schachbrettmuster, nach Treffer Nachbarn, dann die Linie entlang;
//           lässt sicheres Wasser aus (ohne Berühren: Umfeld versenkter Schiffe, Ecken neben Treffern)
// level 3 = stark: Wahrscheinlichkeitskarte – zählt alle möglichen Lagen der restlichen Schiffe, die zu allen
//           Schüssen passen (Treffer stark gewichtet), schießt aufs wahrscheinlichste Feld, Parität bei Gleichstand
import * as E from './engine.js';

const N = E.SIZE;

export function chooseMove(view, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = E.legalMoves(view);
  if (!moves.length) return null;
  const r = typeof rng === 'function' ? rng : Math.random;
  if (view.phase === 'place') return { type: 'place', ships: placeFleet(view.opts, level, r) };
  if (moves.length === 1) return moves[0];
  const me = E.currentPlayer(view);
  const b = board(view, me);
  let i;
  if (level <= 1) i = easy(b, r);
  else if (level === 2) i = hunter(b, r);
  else i = density(b, r);
  return { type: 'shot', i };
}

// ---------- Setzen ----------

function placeFleet(opts, level, rng) {
  if (level < 3) return E.randomFleet(opts, rng);
  const heat = emptyHeat(opts);
  let best = null, bestScore = Infinity;
  for (let t = 0; t < 40; t++) {
    const f = E.randomFleet(opts, rng);
    const score = f.reduce((a, s) => a + E.cells(s).reduce((x, i) => x + heat[i], 0), 0) + rng() * 1e-6;
    if (score < bestScore) { bestScore = score; best = f; }
  }
  return best;
}

// Wie oft liegt ein Feld unter einer Lage der Flottenschiffe auf leerem Brett (gleichmäßige Suche)
const heatCache = new Map();
function emptyHeat(opts) {
  const key = JSON.stringify(E.normalizeOptions(opts));
  if (heatCache.has(key)) return heatCache.get(key);
  const heat = new Array(100).fill(0);
  for (const { len } of E.fleetOf(opts)) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const dir of ['h', 'v']) {
    const cs = E.cells({ r, c, len, dir });
    if (cs.length === len) for (const i of cs) heat[i]++;
  }
  heatCache.set(key, heat);
  return heat;
}

// ---------- Lagebild ----------

// st[i]: 0 unbekannt, 1 Wasser (beschossen oder sicher), 2 Treffer an noch nicht versenktem Schiff, 3 versenkt
function board(view, me) {
  const opp = 1 - me, touch = !!view.opts.beruehren;
  const g = E.grid(view, opp, me);
  const st = g.map(x => (x.sunk ? 3 : x.shot === 'hit' ? 2 : x.shot === 'miss' || x.ship === false ? 1 : 0));
  const shot = new Set(view.shots[me].map(x => x.i));
  const sunkK = new Set(E.revealedShips(view, opp).map(s => s.k));
  const lens = E.fleetOf(view.opts).map(s => s.len).filter((_, k) => !sunkK.has(k));
  const hits = [];
  for (let i = 0; i < 100; i++) if (st[i] === 2) hits.push(i);
  return { st, shot, lens, hits, touch };
}

const rc = i => [Math.floor(i / N), i % N];
const idx = (r, c) => (r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1);
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const unshot = b => [...Array(100).keys()].filter(i => !b.shot.has(i));
const open = b => [...Array(100).keys()].filter(i => b.st[i] === 0 && !b.shot.has(i));

// ---------- Stufe 1 ----------

function easy(b, rng) {
  if (b.hits.length && rng() < 0.5) {
    const cand = b.hits.flatMap(i => E.neighbors(i, false)).filter(i => !b.shot.has(i));
    if (cand.length) return pick(rng, cand);
  }
  return pick(rng, unshot(b));
}

// ---------- Stufe 2 ----------

// Passt das kleinste Restschiff waagrecht oder senkrecht durch Feld i (nur unbekannte Felder)?
function fits(b, i, len) {
  const [r, c] = rc(i);
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    let n = 1;
    for (let k = 1; k < len; k++) { const j = idx(r + dr * k, c + dc * k); if (j < 0 || b.st[j] !== 0) break; n++; }
    for (let k = 1; k < len; k++) { const j = idx(r - dr * k, c - dc * k); if (j < 0 || b.st[j] !== 0) break; n++; }
    if (n >= len) return true;
  }
  return false;
}

function hunter(b, rng) {
  if (b.hits.length) {
    const hs = new Set(b.hits), line = [], near = [];
    for (const h of b.hits) {
      const [r, c] = rc(h);
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const j = idx(r + dr, c + dc);
        if (j < 0 || b.st[j] !== 0 || b.shot.has(j)) continue;
        near.push(j);
        // Linie: auf der Gegenseite liegt ebenfalls ein Treffer
        if (hs.has(idx(r - dr, c - dc))) line.push(j);
      }
    }
    if (line.length) return pick(rng, line);
    if (near.length) return pick(rng, near);
  }
  const minLen = Math.min(...b.lens);
  const cand = open(b).filter(i => fits(b, i, minLen));
  const par = cand.filter(i => { const [r, c] = rc(i); return (r + c) % 2 === 0; });
  if (par.length) return pick(rng, par);
  if (cand.length) return pick(rng, cand);
  const o = open(b);
  return pick(rng, o.length ? o : unshot(b));
}

// ---------- Stufe 3 ----------

const HIT_W = 40;

function density(b, rng) {
  const score = new Float64Array(100);
  const target = b.hits.length > 0;
  const hs = new Set(b.hits);
  for (const len of b.lens) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const dir of ['h', 'v']) {
      const cs = E.cells({ r, c, len, dir });
      if (cs.length !== len) continue;
      let nh = 0, ok = true;
      for (const i of cs) {
        const s = b.st[i];
        if (s === 1 || s === 3) { ok = false; break; }
        if (s === 2) nh++;
      }
      if (!ok) continue;
      // ohne Berühren: ein nicht überdeckter Treffer darf nicht anliegen (gehört zu einem anderen Schiff)
      if (!b.touch && b.hits.length) {
        const own = new Set(cs);
        for (const i of cs) {
          for (const n of E.neighbors(i)) if (hs.has(n) && !own.has(n)) { ok = false; break; }
          if (!ok) break;
        }
        if (!ok) continue;
      }
      if (target && !nh) continue;
      const w = nh ? Math.pow(HIT_W, nh) : 1;
      for (const i of cs) if (b.st[i] === 0) score[i] += w;
    }
  }
  const minLen = Math.min(...b.lens);
  let best = -1, cand = [];
  for (let i = 0; i < 100; i++) {
    if (b.shot.has(i) || b.st[i] !== 0) continue;
    const [r, c] = rc(i);
    // Parität nur zum Gleichstand-Brechen im Suchmodus
    const v = score[i] + (!target && (r + c) % minLen === 0 ? 0.5 : 0);
    if (v > best + 1e-9) { best = v; cand = [i]; }
    else if (Math.abs(v - best) <= 1e-9) cand.push(i);
  }
  if (best > 0 && cand.length) return pick(rng, cand);
  return hunter(b, rng);
}
