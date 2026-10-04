// Hold'em – Gewinnchance (Equity) per Monte-Carlo, Startkarten-Klassen und Hand-Bereiche (rein, ohne DOM).
// Wird vom Computer (Worker) und von „Wer gewinnt?“ benutzt. Kennt nur die eigenen Karten und das Board –
// fremde Hände werden zufällig (bzw. aus einem geschätzten Bereich) gezogen.
import { evalMasks, cardIndex } from './eval.js';
import { EQ, ORDER } from './preflop.js';

const R = '23456789TJQKA';

// Startkarten-Klasse zweier Karten: 'AKs', 'T9o', '77'
export function handClass(a, b) {
  const x = cardIndex(a), y = cardIndex(b);
  const r1 = x >> 2, r2 = y >> 2;
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (hi === lo) return R[hi] + R[lo];
  return R[hi] + R[lo] + ((x & 3) === (y & 3) ? 's' : 'o');
}

// Equity einer Klasse gegen n zufällige Hände (Tabelle, n = 1 … 7; dazwischen interpoliert)
export function preflopEquity(cls, nOpp) {
  const e = EQ[cls];
  if (!e) return 0.5;
  if (nOpp <= 1) return e[0];
  if (nOpp === 2) return e[1];
  if (nOpp <= 4) return e[1] + (e[2] - e[1]) * ((nOpp - 2) / 2);
  return e[2] * Math.pow(e[2] / e[1], (nOpp - 4) / 2);
}

// Rang der Klasse in Prozent aller Kombinationen (0 = AA … 100 = 72o)
const COMBOS = (c) => (c.length === 2 ? 6 : c[2] === 's' ? 4 : 12);
export const PERCENTILE = {};
{
  let acc = 0;
  for (const c of ORDER) { PERCENTILE[c] = (acc + COMBOS(c) / 2) / 1326 * 100; acc += COMBOS(c); }
}

// alle 1326 Kombinationen als [x, y] (Zahlen) je Klasse
const CLASS_COMBOS = {};
for (let x = 0; x < 52; x++) for (let y = x + 1; y < 52; y++) {
  const c = handClass(x, y);
  (CLASS_COMBOS[c] ||= []).push([x, y]);
}

// Bereich = Liste von [x, y, Gewicht]. top(pct): die besten pct % (nach Equity gegen eine Hand), optional ohne die
// besten skip % (z. B. „mitgehen, aber nicht erhöhen“ = 5 … 40 %). Am Rand mit Teilgewicht.
export function rangeTop(pct, skip = 0) {
  const out = [];
  let acc = 0;
  const lo = (skip / 100) * 1326, hi = (Math.min(100, Math.max(pct, skip + 0.5)) / 100) * 1326;
  for (const c of ORDER) {
    const n = COMBOS(c), a = acc, b = acc + n;
    acc = b;
    const overlap = Math.min(b, hi) - Math.max(a, lo);
    if (overlap <= 0) continue;
    const w = overlap / n;
    for (const [x, y] of CLASS_COMBOS[c]) out.push([x, y, w]);
  }
  return out;
}
export const RANDOM_RANGE = rangeTop(100);

function masksOf(cards) {
  const m = [0, 0, 0, 0];
  for (const c of cards) { const i = cardIndex(c); m[i & 3] |= 1 << (i >> 2); }
  return m;
}

// Monte-Carlo: eigene Hand gegen Gegner aus Bereichen (ranges: je Gegner eine Liste [x, y, w] oder null = zufällig).
// iters Durchgänge (oder bis deadline in ms), rng in [0, 1). Liefert { eq, n } (Gleichstand = geteilter Anteil).
export function equity(hole, board, ranges, { iters = 2000, rng = Math.random, deadline = 0 } = {}) {
  const h = hole.map(cardIndex), b = board.map(cardIndex);
  const nOpp = ranges.length;
  if (!nOpp) return { eq: 1, n: 0 };
  const dead = new Uint8Array(52);
  for (const c of h) dead[c] = 1;
  for (const c of b) dead[c] = 1;
  const bm0 = masksOf(b);
  const need = 5 - b.length;
  // Bereiche vorbereiten: tote Karten raus, kumulierte Gewichte für schnelles Ziehen
  const prep = ranges.map((r) => {
    if (!r) return null;
    const list = r.filter(([x, y, w]) => w > 0 && !dead[x] && !dead[y]);
    if (!list.length) return null;
    const cum = new Float64Array(list.length);
    let s = 0;
    list.forEach((e, i) => { s += e[2]; cum[i] = s; });
    return { list, cum, total: s };
  });
  const used = new Uint8Array(52);
  const opp = new Int32Array(nOpp * 2);
  let win = 0, n = 0;
  const t0 = deadline ? Date.now() : 0;
  for (let it = 0; it < iters; it++) {
    if (deadline && (it & 127) === 0 && it > 0 && Date.now() - t0 > deadline) break;
    used.set(dead);
    let okDeal = true;
    for (let o = 0; o < nOpp; o++) {
      const p = prep[o];
      let x, y, tries = 0;
      if (p) {
        do {
          const t = rng() * p.total;
          let lo = 0, hi = p.list.length - 1;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (p.cum[mid] < t) lo = mid + 1; else hi = mid; }
          [x, y] = p.list[lo];
          tries++;
        } while ((used[x] || used[y]) && tries < 40);
        if (used[x] || used[y]) { okDeal = false; break; }
      } else {
        do x = (rng() * 52) | 0; while (used[x]);
        used[x] = 1;
        do y = (rng() * 52) | 0; while (used[y]);
      }
      used[x] = used[y] = 1;
      opp[o * 2] = x; opp[o * 2 + 1] = y;
    }
    if (!okDeal) continue;
    let m0 = bm0[0], m1 = bm0[1], m2 = bm0[2], m3 = bm0[3];
    for (let k = 0; k < need; k++) {
      let c;
      do c = (rng() * 52) | 0; while (used[c]);
      used[c] = 1;
      const bit = 1 << (c >> 2);
      switch (c & 3) { case 0: m0 |= bit; break; case 1: m1 |= bit; break; case 2: m2 |= bit; break; default: m3 |= bit; }
    }
    // eigene Hand und Gegner ohne Hilfs-Arrays bewerten (heiße Schleife)
    const h0 = h[0], h1 = h[1];
    let a0 = m0, a1 = m1, a2 = m2, a3 = m3;
    for (const c of [h0, h1]) { const bit = 1 << (c >> 2); switch (c & 3) { case 0: a0 |= bit; break; case 1: a1 |= bit; break; case 2: a2 |= bit; break; default: a3 |= bit; } }
    const me = evalMasks(a0, a1, a2, a3);
    let ties = 0, lost = false;
    for (let o = 0; o < nOpp && !lost; o++) {
      let b0 = m0, b1 = m1, b2 = m2, b3 = m3;
      const x = opp[o * 2], y = opp[o * 2 + 1];
      let bit = 1 << (x >> 2);
      switch (x & 3) { case 0: b0 |= bit; break; case 1: b1 |= bit; break; case 2: b2 |= bit; break; default: b3 |= bit; }
      bit = 1 << (y >> 2);
      switch (y & 3) { case 0: b0 |= bit; break; case 1: b1 |= bit; break; case 2: b2 |= bit; break; default: b3 |= bit; }
      const v = evalMasks(b0, b1, b2, b3);
      if (v > me) lost = true;
      else if (v === me) ties++;
    }
    if (!lost) win += 1 / (ties + 1);
    n++;
  }
  return { eq: n ? win / n : 0.5, n };
}

// Draw-Erkennung über Masken: 4 Karten einer Farbe bzw. 4 von 5 Rängen eines Straßen-Fensters (ohne fertige Straße)
const POP4 = (v) => { let c = 0; while (v) { v &= v - 1; c++; } return c; };
const NEAR = new Uint8Array(8192);
for (let m = 0; m < 8192; m++) {
  let near = false, made = false;
  for (let top = 12; top >= 3; top--) {
    const need = top === 3 ? 0x100f : 0x1f << (top - 4);
    const k = POP4(m & need);
    if (k === 5) made = true;
    if (k === 4) near = true;
  }
  NEAR[m] = near && !made ? 1 : 0;
}
const SUIT4 = new Uint8Array(8192);
for (let m = 0; m < 8192; m++) SUIT4[m] = POP4(m) === 4 ? 1 : 0;
// Hat Hand (x, y) mit dem Board (Masken) einen Flush- oder Straßen-Draw?
export function hasDraw(x, y, bm) {
  const m = bm.slice();
  m[x & 3] |= 1 << (x >> 2);
  m[y & 3] |= 1 << (y >> 2);
  return !!(SUIT4[m[0]] || SUIT4[m[1]] || SUIT4[m[2]] || SUIT4[m[3]] || NEAR[m[0] | m[1] | m[2] | m[3]]);
}

// Stärke einer Hand auf dem aktuellen Board (für das Eingrenzen von Bereichen): Bewertung von Hand + Board
export function strengthOn(x, y, boardMasks) {
  const m = boardMasks.slice();
  m[x & 3] |= 1 << (x >> 2);
  m[y & 3] |= 1 << (y >> 2);
  return evalMasks(m[0], m[1], m[2], m[3]);
}
export { masksOf };
