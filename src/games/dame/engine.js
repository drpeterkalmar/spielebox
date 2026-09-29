// Dame – reine Spiel-Engine ohne DOM (gemeinsamer Spiele-Vertrag der Spielebox).
// Regeln „deutsch“ (8×8) und „international“ (10×10, FMJD), Hausregeln „kurz“ (Kurze Dame)
// und „pusten“ (Pusten statt Schlagzwang). Der Host prüft jeden Zug mit dieser Engine.
// Brett: i = r * n + c; r = 0 oben (Grundlinie Schwarz), r = n - 1 unten (Grundlinie Weiß).
// Weiß (Spieler 0, Werte > 0) zieht nach oben, Schwarz (Spieler 1, Werte < 0) nach unten.

export const id = 'dame';
export const title = 'Dame';
export const PLAYERS = ['Weiß', 'Schwarz'];
export const EMPTY = 0, WM = 1, WK = 2, BM = -1, BK = -2;

const WDH = 3;    // dreifache Wiederholung
const RUHE = 50;  // 25-Züge-Regel: 50 Halbzüge in Folge nur Damen ohne Schlagen

// ---------- Optionen und Brettgeometrie ----------

export function normalizeOptions(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const r = typeof o.rules === 'string' ? o.rules.trim().toLowerCase() : '';
  return { rules: r === 'international' ? 'international' : 'deutsch', kurz: o.kurz === true, pusten: o.pusten === true };
}

export function boardSize(x) {
  if (x && typeof x === 'object') {
    if (x.n === 8 || x.n === 10) return x.n;
    if (x.opts) return boardSize(x.opts);
  }
  return normalizeOptions(x).rules === 'international' ? 10 : 8;
}

export function indexOf(r, c, n = 8) {
  return r * n + c;
}

// liefert [r, c] und zusätzlich .r/.c (beide Schreibweisen funktionieren)
export function rcOf(i, n = 8) {
  const r = Math.floor(i / n), c = i - r * n;
  const rc = [r, c];
  rc.r = r;
  rc.c = c;
  return rc;
}

export function isDark(r, c) {
  return (r + c) % 2 === 1;
}

// 8×8: 'a1'..'h8' (a1 links unten); 10×10: FMJD-Nummer '1'..'50' (helle Felder: '')
export function squareName(i, n = 8) {
  if (!Number.isInteger(i) || i < 0 || i >= n * n) return '';
  const r = Math.floor(i / n), c = i % n;
  if (n === 10) return isDark(r, c) ? String(r * 5 + (c >> 1) + 1) : '';
  return String.fromCharCode(97 + c) + (n - r);
}

// Richtungen: 0/1 nach oben (Weiß vorwärts), 2/3 nach unten (Schwarz vorwärts)
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const GEO = {};

// vorberechnet je Brettgröße: Nachbarn, Diagonalstrahlen, dunkle Felder, Arbeitspuffer
function geo(n) {
  if (GEO[n]) return GEO[n];
  if (n !== 8 && n !== 10) throw new Error('Ungültiger Spielzustand: Brettgröße muss 8 oder 10 sein');
  const N = n * n, next = new Int16Array(N * 4).fill(-1), rays = new Array(N * 4), dark = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (isDark(r, c)) dark.push(i);
      for (let d = 0; d < 4; d++) {
        const ray = [];
        for (let rr = r + DIRS[d][0], cc = c + DIRS[d][1]; rr >= 0 && rr < n && cc >= 0 && cc < n; rr += DIRS[d][0], cc += DIRS[d][1]) {
          ray.push(rr * n + cc);
        }
        rays[i * 4 + d] = ray;
        if (ray.length) next[i * 4 + d] = ray[0];
      }
    }
  }
  return (GEO[n] = { n, N, next, rays, dark, buf: new Int8Array(N), mark: new Uint8Array(N), codes: new Array(dark.length + 2) });
}

// ---------- Zuggenerator ----------

// Kontext der Schlagsuche (modulweit, die Suche ist nie verschachtelt)
let G = null, B = null, MARK = null, OUT = null;
let SIDE = 1, INTL = false, KURZ = false, FROM = 0, PROMO = 0, MAXC = 1;
const PATH = [], CAPS = [];

// fertige Schlagfolge merken (International: nur die mit Maximalzahl)
function record() {
  const len = CAPS.length;
  if (INTL) {
    if (len < MAXC) return;
    if (len > MAXC) {
      MAXC = len;
      OUT.length = 0;
    }
  }
  OUT.push({ from: FROM, path: PATH.slice(), cap: CAPS.slice() });
}

// Stein: schlägt direkt benachbart (Deutsch nur vorwärts), landet direkt dahinter
function manJumps(sq) {
  const next = G.next;
  const d0 = INTL ? 0 : SIDE > 0 ? 0 : 2, d1 = INTL ? 4 : d0 + 2;
  let found = false;
  for (let d = d0; d < d1; d++) {
    const a = next[sq * 4 + d];
    if (a < 0 || B[a] * SIDE >= 0 || MARK[a]) continue;   // kein (noch nicht geschlagener) Gegner
    const b = next[a * 4 + d];
    if (b < 0 || B[b] !== EMPTY) continue;
    found = true;
    MARK[a] = 1;
    CAPS.push(a);
    PATH.push(b);
    // Deutsch: Umwandlung beendet den Zug; International: weiter schlagen als Stein
    if ((!INTL && ((b / G.n) | 0) === PROMO) || !manJumps(b)) record();
    PATH.pop();
    CAPS.pop();
    MARK[a] = 0;
  }
  return found;
}

// Dame: lang (Deutsch: Landung direkt dahinter; International: beliebig weit) oder kurz
function kingJumps(sq) {
  const rays = G.rays;
  let found = false;
  for (let d = 0; d < 4; d++) {
    const ray = rays[sq * 4 + d], len = ray.length;
    let k = 0;
    if (!KURZ) while (k < len && B[ray[k]] === EMPTY) k++;
    if (k + 1 >= len) continue;
    const a = ray[k];
    if (B[a] * SIDE >= 0 || MARK[a] || B[ray[k + 1]] !== EMPTY) continue;
    found = true;
    MARK[a] = 1;
    CAPS.push(a);
    const end = INTL && !KURZ ? len : k + 2;
    for (let j = k + 1; j < end && B[ray[j]] === EMPTY; j++) {
      PATH.push(ray[j]);
      if (!kingJumps(ray[j])) record();
      PATH.pop();
    }
    CAPS.pop();
    MARK[a] = 0;
  }
  return found;
}

function captures(board, n, side, o) {
  G = geo(n);
  B = G.buf;
  MARK = G.mark;
  B.set(board);
  MARK.fill(0);
  SIDE = side;
  INTL = o.rules === 'international';
  KURZ = o.kurz;
  PROMO = side > 0 ? 0 : n - 1;
  MAXC = 1;
  OUT = [];
  const dark = G.dark;
  for (let t = 0; t < dark.length; t++) {
    const i = dark[t], v = B[i];
    if (v * side <= 0) continue;
    FROM = i;
    B[i] = EMPTY;                 // Startfeld gilt während des Schlagens als leer
    if (v === side) manJumps(i);
    else kingJumps(i);
    B[i] = v;
  }
  const out = OUT;
  OUT = null;
  return out;
}

function normals(board, n, side, o, out) {
  const g = geo(n), next = g.next, rays = g.rays, dark = g.dark, d0 = side > 0 ? 0 : 2;
  for (let t = 0; t < dark.length; t++) {
    const i = dark[t], v = board[i];
    if (v * side <= 0) continue;
    if (v === side) {
      for (let d = d0; d < d0 + 2; d++) {
        const to = next[i * 4 + d];
        if (to >= 0 && board[to] === EMPTY) out.push({ from: i, path: [to], cap: [] });
      }
    } else {
      for (let d = 0; d < 4; d++) {
        const ray = rays[i * 4 + d], len = o.kurz ? Math.min(1, ray.length) : ray.length;
        for (let k = 0; k < len && board[ray[k]] === EMPTY; k++) out.push({ from: i, path: [ray[k]], cap: [] });
      }
    }
  }
  return out;
}

// intern (auch für den Bot): Züge ohne Pusten; o = normalisierte Optionen
export function _gen(board, n, turn, o) {
  const side = turn === 0 ? 1 : -1;
  const moves = captures(board, n, side, o);
  if (moves.length && !o.pusten) return moves;          // Schlagzwang
  return normals(board, n, side, o, moves);             // Pusten: Schläge und normale Züge
}

// intern (auch für den Bot): Zug auf einer Brettkopie ausführen, Umwandlung am Zugende
export function _play(board, n, m) {
  const b = board.slice();
  const v = b[m.from];
  b[m.from] = EMPTY;
  for (let k = 0; k < m.cap.length; k++) b[m.cap[k]] = EMPTY;
  const to = m.path[m.path.length - 1], r = (to / n) | 0;
  b[to] = v === WM && r === 0 ? WK : v === BM && r === n - 1 ? BK : v;
  return b;
}

// ---------- Zustand ----------

const CODE = [66, 98, 46, 119, 87];   // 'B', 'b', '.', 'w', 'W' für die Werte -2..2

// Zugrecht + dunkle Felder, z. B. '0:bbbbbbbbbbbb........wwwwwwwwwwww'
export function positionKey(state) {
  const board = state.board, g = geo(state.n), dark = g.dark, codes = g.codes;
  codes[0] = state.turn === 1 ? 49 : 48;
  codes[1] = 58;
  for (let t = 0; t < dark.length; t++) codes[t + 2] = CODE[board[dark[t]] + 2];
  return String.fromCharCode.apply(null, codes);
}

// flache Kopie von rep (bei vielen Einträgen deutlich schneller als {...rep})
function copyRep(rep) {
  const out = {};
  if (rep && typeof rep === 'object') {
    const ks = Object.keys(rep);
    for (let i = 0; i < ks.length; i++) out[ks[i]] = rep[ks[i]];
  }
  return out;
}

function fresh(o, n, board, turn) {
  const s = { opts: o, n, board, turn, ply: 0, quiet: 0, rep: {}, pustbar: [], pusted: false, over: null };
  const key = positionKey(s);
  s.rep[key] = 1;
  s.over = computeResult(s, key);
  return s;
}

export function initialState(opts) {
  const o = normalizeOptions(opts), n = o.rules === 'international' ? 10 : 8, k = n === 10 ? 4 : 3;
  const board = new Array(n * n).fill(EMPTY);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!isDark(r, c)) continue;
      if (r < k) board[r * n + c] = BM;
      else if (r >= n - k) board[r * n + c] = WM;
    }
  }
  return fresh(o, n, board, 0);
}

const SETUP = { '.': EMPTY, w: WM, W: WK, b: BM, B: BK };

// Teststellung: n Zeilen (oben = r 0), '.' leer, w/W weiß, b/B schwarz; Leerzeichen erlaubt
export function setup(rows, opts, turn = 0) {
  const o = normalizeOptions(opts), n = o.rules === 'international' ? 10 : 8;
  if (!Array.isArray(rows) || rows.length !== n) throw new Error(`setup: ${n} Zeilen erwartet`);
  if (turn !== 0 && turn !== 1) throw new Error('setup: turn muss 0 oder 1 sein');
  const board = new Array(n * n).fill(EMPTY);
  for (let r = 0; r < n; r++) {
    const row = String(rows[r]).replace(/\s+/g, '');
    if (row.length !== n) throw new Error(`setup: Zeile ${r + 1} braucht ${n} Zeichen`);
    for (let c = 0; c < n; c++) {
      const v = Object.hasOwn(SETUP, row[c]) ? SETUP[row[c]] : undefined;
      if (v === undefined) throw new Error(`setup: unbekanntes Zeichen „${row[c]}“`);
      if (v !== EMPTY && !isDark(r, c)) throw new Error(`setup: Figur auf hellem Feld (Zeile ${r + 1}, Spalte ${c + 1})`);
      if ((v === WM && r === 0) || (v === BM && r === n - 1)) throw new Error(`setup: Stein auf der Umwandlungsreihe (Zeile ${r + 1})`);
      board[r * n + c] = v;
    }
  }
  return fresh(o, n, board, turn);
}

export function currentPlayer(state) {
  return state.turn;
}

// Zugliste je Zustand zwischenspeichern (geprüft gegen Brett/Zugrecht, falls jemand den Zustand ändert)
const CACHE = new WeakMap();

function sameList(a, b) {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const NO_OPTS = {}, NO_LIST = [];

// interne Zugliste inkl. Pusten (nicht verändern!)
function movesOf(s) {
  const so = s.opts || NO_OPTS, pb = Array.isArray(s.pustbar) ? s.pustbar : NO_LIST;
  const e = CACHE.get(s);
  if (e && e.opts === so && e.rules === so.rules && e.kurz === so.kurz && e.pusten === so.pusten && e.turn === s.turn &&
      e.pusted === s.pusted && e.n === s.n && sameList(e.pustbar, pb) && sameList(e.board, s.board)) return e.moves;
  const o = normalizeOptions(so);
  if (!s.board || s.board.length !== geo(s.n).N || o.rules !== (s.n === 10 ? 'international' : 'deutsch')) {
    throw new Error('Ungültiger Spielzustand');
  }
  const moves = [];
  if (o.pusten && !s.pusted) {
    const side = s.turn === 0 ? 1 : -1;
    for (const i of pb) if (Number.isInteger(i) && s.board[i] * side < 0) moves.push({ puste: i });
  }
  for (const m of _gen(s.board, s.n, s.turn, o)) moves.push(m);
  CACHE.set(s, {
    opts: so, rules: so.rules, kurz: so.kurz, pusten: so.pusten, turn: s.turn, pusted: s.pusted, n: s.n,
    pustbar: pb.slice(), board: s.board.slice(), moves,
  });
  return moves;
}

function copyMove(m) {
  return m.puste !== undefined ? { puste: m.puste } : { from: m.from, path: m.path.slice(), cap: m.cap.slice() };
}

export function legalMoves(state) {
  if (!state || state.over) return [];
  return movesOf(state).map(copyMove);
}

function intList(a) {
  if (!Array.isArray(a)) return false;
  for (let i = 0; i < a.length; i++) if (!Number.isInteger(a[i])) return false;
  return true;
}

// Form prüfen: genau { from, path, cap } oder genau { puste }
function wellFormed(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const keys = Object.keys(m);
  if (keys.length === 1 && keys[0] === 'puste') return Number.isInteger(m.puste);
  if (keys.length !== 3 || !keys.includes('from') || !keys.includes('path') || !keys.includes('cap')) return false;
  if (!Number.isInteger(m.from) || !intList(m.path) || !intList(m.cap) || m.path.length < 1) return false;
  return m.cap.length === 0 ? m.path.length === 1 : m.cap.length === m.path.length;
}

// passenden Zug aus der Liste liefern (oder null); robust gegen Müll
function findLegal(state, move) {
  try {
    if (!state || typeof state !== 'object' || state.over || !wellFormed(move)) return null;
    for (const m of movesOf(state)) {
      if (m.puste !== undefined) {
        if (move.puste === m.puste) return m;
      } else if (move.from === m.from && sameList(m.path, move.path) && sameList(m.cap, move.cap)) {
        return m;
      }
    }
  } catch {
    // kaputter Zustand oder Zug → nicht legal
  }
  return null;
}

export function isLegal(state, move) {
  return findLegal(state, move) !== null;
}

function computeResult(s, key = positionKey(s)) {
  const side = s.turn === 0 ? 1 : -1, b = s.board;
  let own = 0, opp = 0;
  for (let i = 0; i < b.length; i++) {
    const v = b[i] * side;
    if (v > 0) own++;
    else if (v < 0) opp++;
  }
  if (own === 0) return { winner: 1 - s.turn, reason: 'keine Steine' };
  if (opp === 0) return { winner: s.turn, reason: 'keine Steine' };   // nach dem Pusten
  if (movesOf(s).length === 0) return { winner: 1 - s.turn, reason: 'keine Züge' };
  if (s.rep && s.rep[key] >= WDH) return { winner: null, reason: 'dreifache Wiederholung' };
  if (s.quiet >= RUHE) return { winner: null, reason: '25-Züge-Regel' };
  return null;
}

export function result(state) {
  if (!state) return null;
  return state.over || computeResult(state);
}

export function applyMove(state, move) {
  if (!state || typeof state !== 'object') throw new Error('Kein Spielzustand');
  if (state.over) throw new Error('Die Partie ist beendet');
  const m = findLegal(state, move);
  if (!m) throw new Error('Ungültiger Zug');
  const o = normalizeOptions(state.opts), n = state.n, ply = (state.ply | 0) + 1;
  let s;
  if (m.puste !== undefined) {
    // Pusten: Figur vom Brett, derselbe Spieler zieht danach normal
    const board = state.board.slice();
    board[m.puste] = EMPTY;
    s = { opts: o, n, board, turn: state.turn, ply, quiet: 0, rep: {}, pustbar: [], pusted: true, over: null };
  } else {
    const piece = state.board[m.from];
    const reversible = (piece === WK || piece === BK) && m.cap.length === 0;
    let pustbar = [];
    if (o.pusten && m.cap.length === 0) {
      // nicht geschlagen, obwohl möglich → diese Figuren darf der Gegner pusten
      const set = new Set();
      for (const x of movesOf(state)) if (x.cap && x.cap.length) set.add(x.from === m.from ? m.path[0] : x.from);
      pustbar = [...set].sort((a, b) => a - b);
    }
    s = {
      opts: o, n, board: _play(state.board, n, m), turn: 1 - state.turn, ply,
      quiet: reversible ? (state.quiet | 0) + 1 : 0,
      rep: reversible ? copyRep(state.rep) : {},
      pustbar, pusted: false, over: null,
    };
  }
  const key = positionKey(s);
  s.rep[key] = (s.rep[key] || 0) + 1;
  s.over = computeResult(s, key);
  return s;
}

// ---------- Anzeige ----------

export function moveKey(move) {
  if (!move || typeof move !== 'object') return '';
  if (move.puste !== undefined) return `p${move.puste}`;
  const path = Array.isArray(move.path) ? move.path : [], cap = Array.isArray(move.cap) ? move.cap : [];
  return cap.length ? `${move.from}x${path.join('x')}/${cap.join(',')}` : `${move.from}-${path.join('-')}`;
}

// Deutsch: 'c3–d4', 'c3×e5×g3'; International: '32–28', '28×19×10'; Pusten: 'gepustet c3'
export function describeMove(state, move) {
  const n = boardSize(state), name = (i) => squareName(i, n) || '?';
  if (!move || typeof move !== 'object') return '?';
  if (move.puste !== undefined) return `gepustet ${name(move.puste)}`;
  if (!Array.isArray(move.path) || !move.path.length) return '?';
  if (Array.isArray(move.cap) && move.cap.length) return [move.from, ...move.path].map(name).join('×');
  return `${name(move.from)}–${name(move.path[move.path.length - 1])}`;
}

// Bewertung aus Sicht von seat in „Steinen“: Stein 1, Dame 2 (eigene minus gegnerische); Ende = ±20 / 0
export function evaluate(state, seat) {
  const r = result(state);
  if (r) return r.winner === null || r.winner === undefined ? 0 : r.winner === seat ? 20 : -20;
  let d = 0;
  for (const v of state.board) d += v === 1 ? 1 : v === 2 ? 2 : v === -1 ? -1 : v === -2 ? -2 : 0;
  return seat === 0 ? d : -d;
}
