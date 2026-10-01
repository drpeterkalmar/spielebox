// Schiffe versenken (2 Spieler, verdeckte Flotte) – reine Regel-Engine ohne DOM, ohne Zufall (Spiel-API der Spielebox).
// Quelle der Regeln: de.wikipedia.org/wiki/Schiffe_versenken (abgerufen 01.10.2026):
//   10×10-Plan, Zeilen A–J, Spalten 1–10; Flotte „ein Schlachtschiff (5 Kästchen), zwei Kreuzer (je 4),
//   drei Zerstörer (je 3), vier U-Boote (je 2)“; „Die Schiffe dürfen nicht aneinander stoßen“, nicht über Eck
//   gebaut, nicht diagonal aufgestellt, dürfen am Rand liegen; Antworten „Wasser, Treffer oder Treffer, versenkt“;
//   versenkt, wenn alle Felder getroffen; „Entweder wird abwechselnd geschossen oder so lange, bis ins Wasser
//   getroffen wird“; wer zuerst alle Schiffe des Gegners versenkt hat, gewinnt.
//   Die kleine Flotte (5 Schiffe: 5, 4, 3, 3, 2) ist die der Brettspiel-Ausgabe („Flottenmanöver“ von Milton Bradley
//   mit Flugzeugträger, Schlachtschiff, Zerstörer, U-Boot, Schnellboot – laut Wikipedia „fünf unterschiedlich große“).
//
// Entscheidungen bei unklaren Regeln:
// - Standardflotte der Spielebox ist 'klein' (5 Schiffe, 17 Felder, kürzere Partien für Kinder); 'gross' = Wikipedia.
// - „Nicht aneinander stoßen“ gilt auch über Eck (Wikipedia-Strategie: „um versenkte Schiffe herum Fehlschüsse
//   eintragen“ – das ganze Umfeld ist Wasser). Option beruehren = true erlaubt Berühren (Hausregel).
// - Schussfolge: Wikipedia nennt beides gleichrangig; Standard abwechselnd, Option nochmal = nach Treffer weiter.
// - „Es wird ausgelost, wer zuerst schießen darf“ → hier schießt Sitz 0 zuerst (die Sitzwahl am Tisch ist das Los).
// - Gesetzt wird nacheinander (erst Sitz 0, dann Sitz 1), jeweils die ganze Flotte mit einem Zug.
// - Nach Spielende sind beide Flotten offen (Sicht deckt auf, wie Karten nach dem Spiel).
//
// Brett: Zelle i = r*10 + c (r 0–9 = Zeile A–J, c 0–9 = Spalte 1–10), Text „B7“ = r 1, c 6.
// Schiff: { r, c, len, dir: 'h'|'v' } (h = nach rechts, v = nach unten ab (r, c)).
//
// Zustand (reines JSON):
//   { opts: { flotte: 'klein'|'gross', beruehren, nochmal }, phase: 'place'|'shoot'|'over', turn: 0|1,
//     fleets: [ [ { r, c, len, dir, hits } ] | null, … ]  (nach Länge absteigend sortiert, Index k ↔ FLEETS[flotte][k]),
//     shots: [ [ { i, hit, sunk: k|null } ], … ]  shots[s] = Schüsse VON Sitz s auf die Flotte von 1−s,
//     sunk: [ [k…], [k…] ]  sunk[s] = von Sitz s versenkte Schiffe (Indizes in fleets[1−s]), in Reihenfolge,
//     last: null | { seat, i, hit, sunk: k|null, len? }, winner: null|0|1, ply }
// Sicht (viewFor): fremde Flotte null (bis Spielende), dazu revealed: [[…], […]] mit revealed[q] = versenkte Schiffe
//   von q als { k, r, c, len, dir }. Schüsse und Ergebnisse sind öffentlich.
// Züge: { type: 'place', ships: [ {r, c, len, dir} × Flottengröße ] } | { type: 'shot', i }
//   legalMoves liefert in 'place' nur EINE Beispiel-Flotte (alle Aufstellungen aufzuzählen ist unmöglich);
//   isLegal/applyMove nehmen jede gültige Flotte.
// evaluate: Einheit „Felder“ = (noch nicht getroffene eigene Schiffsfelder) − (noch nicht getroffene gegnerische);
//   nur öffentliche Info (Flottengröße und Treffer), daher auf Sicht und vollem Zustand gleich.

export const id = 'schiffe';
export const title = 'Schiffe versenken';
export const PLAYERS = ['Spieler 1', 'Spieler 2'];
export const HIDDEN = true;
export const SIZE = 10;
export const ROWS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);

const ship = (len, name) => Object.freeze({ len, name });
export const FLEETS = Object.freeze({
  klein: Object.freeze([ship(5, 'Flugzeugträger'), ship(4, 'Schlachtschiff'), ship(3, 'Zerstörer'), ship(3, 'U-Boot'),
    ship(2, 'Schnellboot')]),
  gross: Object.freeze([ship(5, 'Schlachtschiff'), ship(4, 'Kreuzer'), ship(4, 'Kreuzer'), ship(3, 'Zerstörer'),
    ship(3, 'Zerstörer'), ship(3, 'Zerstörer'), ship(2, 'U-Boot'), ship(2, 'U-Boot'), ship(2, 'U-Boot'), ship(2, 'U-Boot')])
});

const PHASES = new Set(['place', 'shoot', 'over']);
const SHIP_KEYS = new Set(['r', 'c', 'len', 'dir']);

// beruehren: Schiffe dürfen sich berühren (Hausregel; Standard aus = auch nicht über Eck)
// nochmal: nach einem Treffer darf man nochmal schießen (Wikipedia-Variante; Standard abwechselnd)
export function normalizeOptions(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  return {
    flotte: o.flotte === 'gross' ? 'gross' : 'klein',
    beruehren: o.beruehren === true,
    nochmal: o.nochmal === true
  };
}

export function fleetOf(opts) {
  return FLEETS[normalizeOptions(opts).flotte];
}
export function fleetCells(opts) {
  return fleetOf(opts).reduce((a, s) => a + s.len, 0);
}
export function shipName(opts, k) {
  const f = fleetOf(opts)[k];
  return f ? f.name : 'Schiff';
}

export function initialState(opts) {
  return {
    opts: normalizeOptions(opts), phase: 'place', turn: 0, fleets: [null, null], shots: [[], []], sunk: [[], []],
    last: null, winner: null, ply: 0
  };
}

export function phase(state) {
  return state.phase;
}

// ---------- Brett-Hilfen ----------

const isInt = x => Number.isInteger(x);
const isSeat = s => s === 0 || s === 1;
export const cellName = i => (isInt(i) && i >= 0 && i < 100 ? ROWS[Math.floor(i / SIZE)] + (i % SIZE + 1) : '?');

// Felder eines Schiffs (Indizes); [] bei ungültigem Schiff
export function cells(s) {
  if (!s || !isInt(s.r) || !isInt(s.c) || !isInt(s.len) || s.len < 1 || (s.dir !== 'h' && s.dir !== 'v')) return [];
  const out = [];
  for (let j = 0; j < s.len; j++) {
    const r = s.dir === 'v' ? s.r + j : s.r, c = s.dir === 'h' ? s.c + j : s.c;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return [];
    out.push(r * SIZE + c);
  }
  return out;
}

// 8 Nachbarn (bzw. 4 bei diag = false) einer Zelle
export function neighbors(i, diag = true) {
  const r = Math.floor(i / SIZE), c = i % SIZE, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    if (!diag && dr && dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(rr * SIZE + cc);
  }
  return out;
}

// Stimmt die Flotte (Liste {r,c,len,dir}) mit der Option überein? Im Brett, ohne Überlappung, Berühr-Regel.
export function validFleet(opts, ships) {
  try {
    const o = normalizeOptions(opts);
    const want = FLEETS[o.flotte].map(s => s.len).sort((a, b) => a - b);
    if (!Array.isArray(ships) || ships.length !== want.length) return false;
    const owner = new Array(100).fill(-1);
    for (let k = 0; k < ships.length; k++) {
      const s = ships[k];
      if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
      if (Object.keys(s).some(key => !SHIP_KEYS.has(key))) return false;
      const cs = cells(s);
      if (cs.length !== s.len) return false;
      for (const i of cs) { if (owner[i] !== -1) return false; owner[i] = k; }
    }
    const lens = ships.map(s => s.len).sort((a, b) => a - b);
    if (lens.some((l, j) => l !== want[j])) return false;
    if (!o.beruehren) {
      for (let i = 0; i < 100; i++) {
        if (owner[i] < 0) continue;
        for (const n of neighbors(i)) if (owner[n] >= 0 && owner[n] !== owner[i]) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Gültige Zufallsflotte (rng: Funktion → [0, 1), z. B. Math.random in der Oberfläche); Schiffe nach Länge absteigend
// wie FLEETS. Ohne rng deterministisch (die Engine selbst nutzt keinen echten Zufall).
export function randomFleet(opts, rng) {
  if (typeof rng !== 'function') rng = seeded(42);
  const o = normalizeOptions(opts), lens = FLEETS[o.flotte].map(s => s.len);
  for (let tries = 0; tries < 1000; tries++) {
    const block = new Array(100).fill(false), ships = [];
    let ok = true;
    for (const len of lens) {
      const cand = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) for (const dir of ['h', 'v']) {
        const cs = cells({ r, c, len, dir });
        if (cs.length === len && cs.every(i => !block[i])) cand.push({ r, c, len, dir });
      }
      if (!cand.length) { ok = false; break; }
      const s = cand[Math.min(cand.length - 1, Math.floor(rng() * cand.length))];
      ships.push(s);
      for (const i of cells(s)) {
        block[i] = true;
        if (!o.beruehren) for (const n of neighbors(i)) block[n] = true;
      }
    }
    if (ok) return ships;
  }
  throw new Error('Keine Flotte gefunden');
}

// Deterministischer Zufall für die Beispiel-Flotte in legalMoves (kein Math.random in der Engine)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Ablauf ----------

function validState(s) {
  return !!s && typeof s === 'object' && PHASES.has(s.phase) && isSeat(s.turn) && !!s.opts && typeof s.opts === 'object' &&
    Array.isArray(s.fleets) && s.fleets.length === 2 && Array.isArray(s.shots) && s.shots.length === 2 &&
    s.shots.every(Array.isArray) && Array.isArray(s.sunk) && s.sunk.length === 2 && s.sunk.every(Array.isArray);
}

export function currentPlayer(state) {
  if (!validState(state) || state.phase === 'over') return null;
  return state.turn;
}

const shotSet = (state, seat) => new Set(state.shots[seat].map(x => x.i));

export function legalMoves(state) {
  if (!validState(state)) return [];
  const p = state.turn;
  if (state.phase === 'place') {
    if (state.fleets[p]) return [];
    return [{ type: 'place', ships: randomFleet(state.opts, seeded(0x5c41ff + p)) }];
  }
  if (state.phase !== 'shoot') return [];
  const done = shotSet(state, p), out = [];
  for (let i = 0; i < 100; i++) if (!done.has(i)) out.push({ type: 'shot', i });
  return out;
}

export function isLegal(state, move) {
  try {
    if (!validState(state) || !move || typeof move !== 'object' || Array.isArray(move)) return false;
    const keys = Object.keys(move);
    if (move.type === 'place') {
      if (keys.length !== 2 || !keys.includes('ships')) return false;
      return state.phase === 'place' && !state.fleets[state.turn] && validFleet(state.opts, move.ships);
    }
    if (move.type === 'shot') {
      if (keys.length !== 2 || !keys.includes('i')) return false;
      if (state.phase !== 'shoot' || !isInt(move.i) || move.i < 0 || move.i >= 100) return false;
      return !state.shots[state.turn].some(x => x.i === move.i);
    }
    return false;
  } catch {
    return false;
  }
}

// Flotte nach Länge absteigend (stabil) – so passt Index k zu FLEETS[flotte][k]
function sortFleet(ships) {
  return ships.map((s, j) => ({ s, j })).sort((a, b) => b.s.len - a.s.len || a.j - b.j)
    .map(({ s }) => ({ r: s.r, c: s.c, len: s.len, dir: s.dir, hits: 0 }));
}

export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error('Illegaler Zug: ' + JSON.stringify(move));
  const p = state.turn, o = 1 - p;
  const s = { ...state, fleets: state.fleets.slice(), shots: state.shots.slice(), sunk: state.sunk.slice(), ply: (state.ply || 0) + 1 };
  if (move.type === 'place') {
    s.fleets[p] = sortFleet(move.ships);
    if (p === 0) s.turn = 1;
    else { s.phase = 'shoot'; s.turn = 0; }
    s.last = null;
    return s;
  }
  const fleet = state.fleets[o];
  if (!Array.isArray(fleet)) throw new Error('Gegnerische Flotte fehlt (Sicht statt vollem Zustand?)');
  const k = fleet.findIndex(sh => cells(sh).includes(move.i));
  const hit = k >= 0;
  let sunkK = null;
  if (hit) {
    const sh = { ...fleet[k], hits: fleet[k].hits + 1 };
    s.fleets[o] = fleet.slice();
    s.fleets[o][k] = sh;
    if (sh.hits === sh.len) { sunkK = k; s.sunk[p] = [...state.sunk[p], k]; }
  }
  s.shots[p] = [...state.shots[p], { i: move.i, hit, sunk: sunkK }];
  s.last = sunkK === null ? { seat: p, i: move.i, hit, sunk: null } : { seat: p, i: move.i, hit, sunk: sunkK, len: fleet[k].len };
  if (s.sunk[p].length === fleet.length) { s.phase = 'over'; s.winner = p; }
  else if (!(hit && state.opts.nochmal)) s.turn = o;
  return s;
}

export function result(state) {
  if (!validState(state) || state.phase !== 'over' || !isSeat(state.winner)) return null;
  const w = state.winner;
  return { winner: w, reason: 'alle Schiffe versenkt' };   // Namen stehen schon in der Status-Zeile
}

export function describeMove(state, move) {
  if (!move || typeof move !== 'object') return '?';
  if (move.type === 'place') return 'Flotte gesetzt';
  if (move.type !== 'shot') return '?';
  const name = cellName(move.i);
  try {
    const p = state.turn, fleet = state.fleets[1 - p];
    if (state.phase !== 'shoot' || !Array.isArray(fleet)) return name;
    const k = fleet.findIndex(sh => cells(sh).includes(move.i));
    if (k < 0) return `${name}: Wasser`;
    if (fleet[k].hits + 1 === fleet[k].len) return `${name}: Treffer, versenkt (${shipName(state.opts, k)})`;
    return `${name}: Treffer`;
  } catch {
    return name;
  }
}

// Zug ohne geheime Daten (Zugliste/Verlauf für den Gegner)
export function publicMove(move) {
  if (move && move.type === 'place') return { type: 'place' };
  return move && typeof move === 'object' ? { ...move } : move;
}

// Vollständige Stellung (nur Host; enthält die Flotten)
export function positionKey(state) {
  const s = state;
  return JSON.stringify([s.phase, s.turn, s.opts, s.fleets, s.shots]);
}

// ---------- Sicht ----------

// Versenkte Schiffe von owner (öffentlich): aus revealed der Sicht oder aus vollem Zustand
export function revealedShips(state, owner) {
  if (!state || !isSeat(owner)) return [];
  if (Array.isArray(state.revealed) && Array.isArray(state.revealed[owner])) return state.revealed[owner];
  const fleet = state.fleets && state.fleets[owner];
  if (!Array.isArray(fleet)) return [];
  return (state.sunk[1 - owner] || []).map(k => ({ k, r: fleet[k].r, c: fleet[k].c, len: fleet[k].len, dir: fleet[k].dir }));
}

// Fremde Flotte wird null (bis Spielende), versenkte Schiffe stehen offen in revealed. seat = null: Zuschauer.
export function viewFor(state, seat) {
  const over = state.phase === 'over';
  const revealed = [revealedShips(state, 0), revealedShips(state, 1)].map(l => l.map(x => ({ ...x })));
  const fleets = state.fleets.map((f, q) => (f && (q === seat || over) ? f.map(x => ({ ...x })) : null));
  return {
    ...state, opts: { ...state.opts }, fleets, revealed,
    shots: state.shots.map(l => l.map(x => ({ ...x }))), sunk: state.sunk.map(l => l.slice()),
    last: state.last ? { ...state.last } : null
  };
}

// Brett von owner aus Sicht von viewer: 100 × { ship: true|false|null (unbekannt), shot: 'hit'|'miss'|null, sunk }.
// Eigene Flotte (bzw. nach Spielende jede) ist bekannt; sonst nur Treffer, versenkte Schiffe und – ohne Berühren –
// das sichere Wasser rund um versenkte Schiffe und diagonal neben Treffern.
export function grid(state, owner, viewer) {
  const out = Array.from({ length: 100 }, () => ({ ship: null, shot: null, sunk: false }));
  if (!state || !isSeat(owner)) return out;
  const touch = !!(state.opts && state.opts.beruehren);
  for (const x of state.shots[1 - owner] || []) {
    out[x.i].shot = x.hit ? 'hit' : 'miss';
    out[x.i].ship = !!x.hit;
  }
  const water = i => { if (out[i].ship === null) out[i].ship = false; };
  for (const sh of revealedShips(state, owner)) {
    const cs = cells(sh);
    for (const i of cs) { out[i].ship = true; out[i].sunk = true; }
    if (!touch) for (const i of cs) for (const n of neighbors(i)) water(n);
  }
  if (!touch) {
    for (let i = 0; i < 100; i++) {
      if (out[i].shot !== 'hit') continue;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      for (const n of neighbors(i)) if (Math.floor(n / SIZE) !== r && n % SIZE !== c) water(n);
    }
  }
  const fleet = state.fleets && state.fleets[owner];
  if (Array.isArray(fleet) && (viewer === owner || state.phase === 'over')) {
    for (const i of out.keys()) out[i].ship = false;
    for (const sh of fleet) for (const i of cells(sh)) out[i].ship = true;
  }
  return out;
}

// Noch nicht getroffene Schiffsfelder von seat (öffentlich: Flottengröße minus Treffer des Gegners)
export function remaining(state, seat) {
  if (!state || !isSeat(seat)) return 0;
  return fleetCells(state.opts) - (state.shots[1 - seat] || []).filter(x => x.hit).length;
}

export function evaluate(state, seat) {
  return remaining(state, seat) - remaining(state, 1 - seat);
}
