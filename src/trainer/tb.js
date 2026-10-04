// Exakte Endspiel-Tabellen (Distance-to-Mate) für KQK, KRK und KPK per Retrograd-Analyse.
// Ohne DOM: läuft in Node, im Web Worker und im Hauptthread. Die Tabellen werden beim ersten Bedarf
// gebaut und im Modul zwischengespeichert (je 512 KB, ein Byte je Stellung).
// Intern ist die starke Seite immer Weiß (Feld 0 = a1 … 63 = h8); ist sie Schwarz, werden Farben
// getauscht und Reihen gespiegelt (sq ^ 56), der Bauer läuft dann in Wirklichkeit nach unten.
// Index: stm·2^18 + wK·4096 + bK·64 + X (stm 0 = starke Seite am Zug, X = Dame/Turm/Bauer).
// Wert je Stellung: 0 = Remis, 255 = illegal, sonst dtm+1 (dtm = Halbzüge bis Matt; ungerade = Sieg
// für die Seite am Zug, gerade = Niederlage, 0 = ist matt). Rochade und en passant kommen nicht vor,
// die 50-Züge-Regel wird ignoriert. Zuggenerierung und SAN sind eigen (kein chess.js nötig).

const N = 1 << 19, HALF = 1 << 18;
const ILLEGAL = 255;
const Q = 0, R = 1, P = 2, B = 3, NN = 4; // L/S nur für Unterverwandlung (Schach-Zeichen in SAN)
const KIND = { KQK: Q, KRK: R, KPK: P };
const MAT_OF = ['KQK', 'KRK', 'KPK'];

// --- Vorberechnete Geometrie ---
const file = (s) => s & 7, rank = (s) => s >> 3;
const DIST = new Uint8Array(64 * 64); // Königsabstand (Chebyshev)
const DIR = new Int8Array(64 * 64).fill(-1); // Richtung 0–3 gerade, 4–7 schräg, -1 = keine Linie
const DF = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
const KN = new Int8Array(64 * 8), KNC = new Uint8Array(64); // Königsnachbarn
const RAY = new Int8Array(64 * 8 * 7), RAYC = new Uint8Array(64 * 8); // Strahlen je Richtung
const PATK = new Uint8Array(64 * 64); // weißer Bauer auf a greift b an
const NATK = new Uint8Array(64 * 64); // Springer
for (let a = 0; a < 64; a++) {
  for (let b = 0; b < 64; b++) {
    const df = file(b) - file(a), dr = rank(b) - rank(a);
    DIST[a * 64 + b] = Math.max(Math.abs(df), Math.abs(dr));
    if (a !== b) {
      for (let d = 0; d < 8; d++) {
        const k = Math.max(Math.abs(df), Math.abs(dr));
        if (df === DF[d] * k && dr === DR[d] * k) DIR[a * 64 + b] = d;
      }
    }
    if (dr === 1 && Math.abs(df) === 1) PATK[a * 64 + b] = 1;
    if (Math.abs(df * dr) === 2) NATK[a * 64 + b] = 1;
  }
  for (let d = 0; d < 8; d++) {
    let f = file(a) + DF[d], r = rank(a) + DR[d], c = 0;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) KN[a * 8 + KNC[a]++] = r * 8 + f;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) { RAY[(a * 8 + d) * 7 + c++] = r * 8 + f; f += DF[d]; r += DR[d]; }
    RAYC[a * 8 + d] = c;
  }
}
const adj = (a, b) => DIST[a * 64 + b] <= 1;

// Greift die weiße Figur (Art kind) auf x das Feld t an? Einziger möglicher Sperrstein: der weiße König wk.
function attacks(kind, x, t, wk) {
  if (kind === P) return PATK[x * 64 + t] === 1;
  if (kind === NN) return NATK[x * 64 + t] === 1;
  const d = DIR[x * 64 + t];
  if (d < 0 || (kind === R && d > 3) || (kind === B && d < 4)) return false;
  return !(DIR[x * 64 + wk] === d && DIST[x * 64 + wk] < DIST[x * 64 + t]);
}

// Legal nach den Regeln oben (stm 1 = schwache Seite am Zug darf im Schach stehen)
function legal(kind, stm, wk, bk, x) {
  if (wk === bk || wk === x || bk === x || adj(wk, bk)) return false;
  if (kind === P && (x < 8 || x >= 56)) return false;
  return stm === 1 || !attacks(kind, x, bk, wk);
}

const tables = {}; // mat → { tab, info }

// --- Bau ---
export function build(mat) {
  if (tables[mat]) return tables[mat].info;
  const kind = KIND[mat];
  if (kind === undefined) throw new Error(`Material nicht unterstützt: ${mat}`);
  if (kind === P) { build('KQK'); build('KRK'); }
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const tab = new Uint8Array(N);
  const cnt = new Uint8Array(HALF); // offene Züge je Stellung mit Schwarz am Zug
  const queue = new Int32Array(N);
  let qEnd = 0, positions = 0;

  // 1) Legalität, Zugzähler für Schwarz, Matt-Stellungen (Tiefe 0)
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let x = 0; x < 64; x++) {
    const base = (wk << 12) | (bk << 6) | x;
    if (!legal(kind, 1, wk, bk, x)) { tab[base] = ILLEGAL; tab[HALF | base] = ILLEGAL; continue; }
    positions++;
    if (!legal(kind, 0, wk, bk, x)) tab[base] = ILLEGAL; else positions++;
    let c = 0;
    for (let i = 0; i < KNC[bk]; i++) {
      const n = KN[bk * 8 + i];
      if (adj(n, wk)) continue;
      if (n === x) c++; // Schlagen → K gegen K, Remis (wird nie abgebaut)
      else if (!attacks(kind, x, n, wk)) c++;
    }
    cnt[base] = c;
    if (c === 0 && attacks(kind, x, bk, wk)) { tab[HALF | base] = 1; queue[qEnd++] = HALF | base; }
  }

  // 2) KPK: Umwandlungen als Saaten (Weiß am Zug, Bauer auf der 7. Reihe), Tiefe = dtm der Folgestellung + 1
  const seeds = [];
  if (kind === P) {
    const tq = tables.KQK.tab, tr = tables.KRK.tab;
    for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let x = 48; x < 56; x++) {
      const i = (wk << 12) | (bk << 6) | x;
      const to = x + 8;
      if (tab[i] === ILLEGAL || to === wk || to === bk) continue;
      const j = HALF | (wk << 12) | (bk << 6) | to;
      let best = 0;
      for (const v of [tq[j], tr[j]]) if (v > 0 && v !== ILLEGAL && !((v - 1) & 1) && (!best || v < best)) best = v;
      if (best) (seeds[best] ||= []).push(i); // Sieg mit dtm = (best-1)+1 = best
    }
  }

  // 3) Rückwärts in Tiefen-Reihenfolge (Bucket-Queue: eine Ebene nach der anderen)
  let qHead = 0, level = 0, maxDtm = 0;
  for (;;) {
    // Saaten dieser Ebene anhängen (nur wenn noch nicht kürzer gelöst)
    const s = seeds[level];
    if (s) for (const i of s) if (tab[i] === 0) { tab[i] = level + 1; queue[qEnd++] = i; }
    const lvEnd = qEnd;
    if (qHead === lvEnd) { if (level >= seeds.length) break; level++; continue; }
    for (; qHead < lvEnd; qHead++) {
      const i = queue[qHead];
      const wk = (i >> 12) & 63, bk = (i >> 6) & 63, x = i & 63;
      const nv = level + 2; // Wert der Vorgänger: dtm+1 = level+1+1
      if (i & HALF) {
        // Schwarz verliert → alle weißen Vorgänger gewinnen
        const pre = (wk << 12) | (bk << 6) | x;
        for (let k = 0; k < KNC[wk]; k++) {
          const n = KN[wk * 8 + k];
          if (n === x || n === bk) continue;
          const p = pre - (wk << 12) + (n << 12);
          if (tab[p] === 0) { tab[p] = nv; queue[qEnd++] = p; }
        }
        const pre0 = pre - x;
        if (kind === P) {
          if (x >= 16) {
            const s1 = x - 8;
            if (s1 !== wk && s1 !== bk) {
              if (tab[pre0 + s1] === 0) { tab[pre0 + s1] = nv; queue[qEnd++] = pre0 + s1; }
              const s2 = x - 16;
              if (rank(x) === 3 && s2 !== wk && s2 !== bk && tab[pre0 + s2] === 0) { tab[pre0 + s2] = nv; queue[qEnd++] = pre0 + s2; }
            }
          }
        } else {
          const nd = kind === Q ? 8 : 4;
          for (let d = 0; d < nd; d++) {
            const rc = RAYC[x * 8 + d], ro = (x * 8 + d) * 7;
            for (let k = 0; k < rc; k++) {
              const s2 = RAY[ro + k];
              if (s2 === wk || s2 === bk) break;
              if (tab[pre0 + s2] === 0) { tab[pre0 + s2] = nv; queue[qEnd++] = pre0 + s2; }
            }
          }
        }
      } else {
        // Weiß gewinnt → schwarze Vorgänger verlieren, sobald kein Ausweg mehr bleibt
        const pre = HALF | (wk << 12) | x;
        for (let k = 0; k < KNC[bk]; k++) {
          const n = KN[bk * 8 + k];
          const p = pre | (n << 6);
          if (tab[p] !== 0) continue;
          if (--cnt[p & (HALF - 1)] === 0) { tab[p] = nv; queue[qEnd++] = p; }
        }
      }
      if (!(i & HALF) && level > maxDtm) maxDtm = level;
    }
    level++;
  }
  const ms = Math.round(((typeof performance !== 'undefined' ? performance : Date).now() - t0) * 10) / 10;
  const info = { mat, ms, positions, maxDtm };
  tables[mat] = { tab, info };
  return info;
}

// --- FEN ↔ interne Stellung ---
const sqOf = (alg) => (alg.charCodeAt(1) - 49) * 8 + (alg.charCodeAt(0) - 97);
const algOf = (s) => String.fromCharCode(97 + file(s)) + (rank(s) + 1);

// Liest Brett und Zugrecht; liefert { mat, strong, wk, bk, x, stm } in interner Sicht oder null
function parse(fen) {
  const [board, turn] = fen.trim().split(/\s+/);
  let K = -1, k = -1, piece = null, ps = -1, n = 0, r = 7, f = 0;
  for (const ch of board) {
    if (ch === '/') { r--; f = 0; continue; }
    if (ch >= '1' && ch <= '8') { f += +ch; continue; }
    const s = r * 8 + f++;
    if (ch === 'K') K = s; else if (ch === 'k') k = s;
    else { n++; piece = ch; ps = s; }
  }
  if (K < 0 || k < 0 || n !== 1) return null;
  const mat = { q: 'KQK', r: 'KRK', p: 'KPK' }[piece.toLowerCase()];
  if (!mat) return null;
  const strong = piece === piece.toUpperCase() ? 'w' : 'b';
  const m = strong === 'w' ? 0 : 56;
  return { mat, strong, wk: (strong === 'w' ? K : k) ^ m, bk: (strong === 'w' ? k : K) ^ m, x: ps ^ m, stm: turn === strong ? 0 : 1 };
}

export function materialOf(fen) {
  const p = parse(fen);
  return p ? { mat: p.mat, strong: p.strong } : null;
}

// Rohwert (0 = Remis, sonst dtm+1) einer internen Stellung; Material ggf. bauen
function raw(mat, stm, wk, bk, x) {
  if (!tables[mat]) build(mat);
  const v = tables[mat].tab[(stm << 18) | (wk << 12) | (bk << 6) | x];
  if (v === ILLEGAL) throw new Error('Illegale Stellung');
  return v;
}

function toResult(v) {
  if (v === 0) return { result: 'draw', dtm: null, mateIn: null };
  const dtm = v - 1;
  return dtm & 1 ? { result: 'win', dtm, mateIn: (dtm + 1) / 2 } : { result: 'loss', dtm, mateIn: dtm / 2 };
}

export function probe(fen) {
  const p = parse(fen);
  if (!p) throw new Error(`Material nicht unterstützt: ${fen}`);
  return toResult(raw(p.mat, p.stm, p.wk, p.bk, p.x));
}

// Legale Züge einer internen Stellung; je Zug die Folgestellung (kind -1 = Figur weg → Remis)
function genMoves(kind, stm, wk, bk, x) {
  const out = [];
  if (stm === 1) {
    for (let i = 0; i < KNC[bk]; i++) {
      const n = KN[bk * 8 + i];
      if (adj(n, wk)) continue;
      if (n === x) out.push({ from: bk, to: n, pc: 'K', cap: true, kind: -1, wk, bk: n, x });
      else if (!attacks(kind, x, n, wk)) out.push({ from: bk, to: n, pc: 'K', cap: false, kind, wk, bk: n, x });
    }
    return out;
  }
  if (kind === P) {
    const to = x + 8;
    if (to !== wk && to !== bk) {
      if (to >= 56) for (const [pr, k] of [['q', Q], ['r', R], ['b', B], ['n', NN]]) out.push({ from: x, to, pc: '', promo: pr, kind: k, wk, bk, x: to });
      else {
        out.push({ from: x, to, pc: '', kind, wk, bk, x: to });
        if (rank(x) === 1 && to + 8 !== wk && to + 8 !== bk) out.push({ from: x, to: to + 8, pc: '', kind, wk, bk, x: to + 8 });
      }
    }
  } else {
    for (let d = 0; d < (kind === Q ? 8 : 4); d++) {
      const rc = RAYC[x * 8 + d], ro = (x * 8 + d) * 7;
      for (let k = 0; k < rc; k++) {
        const t = RAY[ro + k];
        if (t === wk || t === bk) break;
        out.push({ from: x, to: t, pc: kind === Q ? 'Q' : 'R', kind, wk, bk, x: t });
      }
    }
  }
  for (let i = 0; i < KNC[wk]; i++) {
    const n = KN[wk * 8 + i];
    if (n !== x && !adj(n, bk)) out.push({ from: wk, to: n, pc: 'K', kind, wk: n, bk, x });
  }
  return out;
}

// Alle Züge mit Wert aus Sicht des Ziehenden, intern auch mit Folgestellung (für bestMove)
function scoreAll(fen) {
  const p = parse(fen);
  if (!p) throw new Error(`Material nicht unterstützt: ${fen}`);
  raw(p.mat, p.stm, p.wk, p.bk, p.x); // prüft Legalität, baut bei Bedarf
  const m = p.strong === 'w' ? 0 : 56;
  const out = [];
  for (const g of genMoves(KIND[p.mat], p.stm, p.wk, p.bk, p.x)) {
    const gone = g.kind < 0 || g.kind > P;
    // Folgestellung: Gegner am Zug; Sieg/Niederlage für den Ziehenden umdrehen
    let r = toResult(0);
    if (!gone) { const v = raw(MAT_OF[g.kind], p.stm ^ 1, g.wk, g.bk, g.x); if (v) r = toResult(v + 1); }
    let san = g.pc + (g.cap ? 'x' : '') + algOf(g.to ^ m) + (g.promo ? '=' + g.promo.toUpperCase() : '');
    if (p.stm === 0 && attacks(g.kind, g.x, g.bk, g.wk)) san += genMoves(g.kind, 1, g.wk, g.bk, g.x).length ? '+' : '#';
    const e = { from: algOf(g.from ^ m), to: algOf(g.to ^ m), ...(g.promo ? { promo: g.promo } : {}), san, result: r.result, dtm: r.dtm, mateIn: r.mateIn };
    out.push({ e, wk: g.wk, bk: g.bk, x: g.x, gone, mover: p.stm });
  }
  return out;
}

export function scoreMoves(fen) {
  return scoreAll(fen).map((s) => s.e);
}

// Bester Zug: Sieg → kürzestes Matt, Niederlage → längster Widerstand, Remis → Remis halten
// (schwache Seite schlägt wenn möglich, sonst nah an Figur/Mitte; starke Seite stellt nichts ein).
export function bestMove(fen, { rng } = {}) {
  const cur = probe(fen);
  const all = scoreAll(fen);
  let cand, key;
  if (cur.result === 'win') { cand = all.filter((s) => s.e.result === 'win'); key = (s) => s.e.dtm; }
  else if (cur.result === 'loss') { cand = all; key = (s) => -s.e.dtm; }
  else {
    cand = all.filter((s) => s.e.result === 'draw');
    const center = (s) => Math.max(Math.abs(file(s) * 2 - 7), Math.abs(rank(s) * 2 - 7)); // 1 … 7
    key = (s) => {
      if (s.mover === 1) return s.gone ? -1000 : DIST[s.bk * 64 + s.x] * 10 + center(s.bk);
      if (s.gone) return 100000; // eigene Figur verwandelt in L/S – nur als Notlösung
      const hangs = adj(s.bk, s.x) && !adj(s.wk, s.x); // schwacher König kann sofort schlagen
      return (hangs ? 1000 : 0) + DIST[s.wk * 64 + s.x] * 10 + center(s.wk);
    };
  }
  if (!cand.length) return null;
  let best = Infinity, ties = [];
  for (const s of cand) {
    const k = key(s);
    if (k < best) { best = k; ties = [s]; } else if (k === best) ties.push(s);
  }
  const s = rng ? ties[Math.floor(rng() * ties.length)] : ties[0];
  return { from: s.e.from, to: s.e.to, ...(s.e.promo ? { promo: s.e.promo } : {}) };
}
