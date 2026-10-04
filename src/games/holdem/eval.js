// Texas Hold'em – Handbewertung (eigener, schneller Evaluator ohne Abhängigkeiten, rein, ohne DOM).
//
// Karten: Text wie bei Blackjack ('AS', 'TH', '2C': Rang + Farbe) oder Zahl 0–51 = Rang × 4 + Farbe
// (Rang 0 = Zwei … 12 = Ass, Farbe 0–3 = S, H, D, C). Für Rechenschleifen gibt es die Zahl-Form.
//
// Wert einer Hand (5, 6 oder 7 Karten = beste 5): eine ganze Zahl, größer = besser, gleich = Gleichstand.
//   Wert = Kategorie << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5
//   Kategorie 0 Höchste Karte, 1 Paar, 2 Zwei Paare, 3 Drilling, 4 Straße, 5 Flush, 6 Full House, 7 Vierling,
//   8 Straight Flush; k1 … k5 = entscheidende Ränge (0–12) in Reihenfolge der Wichtigkeit, nicht gebrauchte = 0.
//   Die Kodierung ist eindeutig: Es gibt genau 7 462 verschiedene Werte für 5-Karten-Hände (Test).
//   Wheel (A-2-3-4-5) ist die kleinste Straße (k1 = Rang der 5).
//
// Verfahren: je Farbe eine 13-Bit-Maske der Ränge. Flush aus der Farbmaske mit ≥ 5 Bits, Paare/Drillinge/Vierlinge
// aus UND-Verknüpfungen der vier Farbmasken (Rang in ≥ 2/3/4 Farben), Straßen und „höchste n Ränge“ aus Tabellen
// über alle 8192 Masken. Keine Schleifen über Kartenkombinationen → einige Millionen 7-Karten-Hände je Sekunde.

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'SHDC';
export const CATS = ['Höchste Karte', 'Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];

// ---------- Tabellen ----------
const HIGH = new Int8Array(8192);        // Index des höchsten Bits (−1 bei 0)
const POP = new Uint8Array(8192);        // Anzahl Bits
const STRAIGHT = new Int8Array(8192);    // Rang der höchsten Karte der besten Straße in der Maske, sonst −1
const TOP5 = new Int32Array(8192);       // die höchsten 5 Ränge als k1…k5 (für Flush/Höchste Karte)

for (let m = 1; m < 8192; m++) {
  HIGH[m] = 31 - Math.clz32(m);
  POP[m] = POP[m & (m - 1)] + 1;
}
HIGH[0] = -1;
for (let m = 0; m < 8192; m++) {
  let st = -1;
  for (let top = 12; top >= 4 && st < 0; top--) {
    const need = 0x1f << (top - 4);
    if ((m & need) === need) st = top;
  }
  if (st < 0 && (m & 0x100f) === 0x100f) st = 3;   // A-2-3-4-5: Ass + Zwei bis Fünf, höchste Karte = Fünf
  STRAIGHT[m] = st;
  let v = 0, x = m;
  for (let i = 0; i < 5; i++) {
    const hb = x ? HIGH[x] : 0;
    v = (v << 4) | hb;
    if (x) x &= ~(1 << hb);
  }
  TOP5[m] = v;
}

// die höchsten n Ränge einer Maske als Folge von 4-Bit-Feldern (n ≤ 3)
function topN(m, n) {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const hb = m ? HIGH[m] : 0;
    v = (v << 4) | hb;
    if (m) m &= ~(1 << hb);
  }
  return v;
}

// ---------- Kern ----------

// Bewertung aus den vier Farbmasken (je 13 Bit). Gültig für 5–7 Karten (bei 5–7 Karten sind Flush und
// Vierling/Full House nie gleichzeitig möglich, deshalb darf der Flush vor dem Vierling geprüft werden).
export function evalMasks(m0, m1, m2, m3) {
  let fm = 0;
  if (POP[m0] >= 5) fm = m0;
  else if (POP[m1] >= 5) fm = m1;
  else if (POP[m2] >= 5) fm = m2;
  else if (POP[m3] >= 5) fm = m3;
  if (fm) {
    const sf = STRAIGHT[fm];
    if (sf >= 0) return (8 << 20) | (sf << 16);
    return (5 << 20) | TOP5[fm];
  }
  const any = m0 | m1 | m2 | m3;
  const two = (m0 & m1) | (m0 & m2) | (m0 & m3) | (m1 & m2) | (m1 & m3) | (m2 & m3);
  if (!two) {
    const st = STRAIGHT[any];
    if (st >= 0) return (4 << 20) | (st << 16);
    return TOP5[any];
  }
  const four = m0 & m1 & m2 & m3;
  if (four) {
    const q = HIGH[four];
    return (7 << 20) | (q << 16) | (HIGH[any & ~(1 << q)] << 12);
  }
  const three = (m0 & m1 & m2) | (m0 & m1 & m3) | (m0 & m2 & m3) | (m1 & m2 & m3);
  if (three) {
    const t = HIGH[three];
    const rest = (three & ~(1 << t)) | (two & ~three);
    if (rest) return (6 << 20) | (t << 16) | (HIGH[rest] << 12);
    const st = STRAIGHT[any];
    if (st >= 0) return (4 << 20) | (st << 16);
    return (3 << 20) | (t << 16) | (topN(any & ~(1 << t), 2) << 8);
  }
  const st = STRAIGHT[any];
  if (st >= 0) return (4 << 20) | (st << 16);
  if (POP[two] >= 2) {
    const p1 = HIGH[two], p2 = HIGH[two & ~(1 << p1)];
    return (2 << 20) | (p1 << 16) | (p2 << 12) | (HIGH[any & ~(1 << p1) & ~(1 << p2)] << 8);
  }
  const p = HIGH[two];
  return (1 << 20) | (p << 16) | (topN(any & ~(1 << p), 3) << 4);
}

// Karte (Text oder Zahl) → Zahl 0–51
export function cardIndex(c) {
  if (typeof c === 'number') return c;
  return RANK_CHARS.indexOf(c[0]) * 4 + SUIT_CHARS.indexOf(c[1]);
}
export const cardText = (i) => RANK_CHARS[i >> 2] + SUIT_CHARS[i & 3];
export const rankOf = (c) => (typeof c === 'number' ? c >> 2 : RANK_CHARS.indexOf(c[0]));
export const suitOf = (c) => (typeof c === 'number' ? c & 3 : SUIT_CHARS.indexOf(c[1]));

// Wert der besten 5 aus 5–7 Karten
export function evaluate(cards) {
  const m = [0, 0, 0, 0];
  for (const c of cards) {
    const i = cardIndex(c);
    m[i & 3] |= 1 << (i >> 2);
  }
  return evalMasks(m[0], m[1], m[2], m[3]);
}

export const category = (v) => v >> 20;

// ---------- Namen (Deutsch) ----------
const R_ONE = ['Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn', 'Bube', 'Dame', 'König', 'Ass'];
const R_MANY = ['Zweien', 'Dreien', 'Vieren', 'Fünfen', 'Sechsen', 'Siebenen', 'Achten', 'Neunen', 'Zehnen', 'Buben', 'Damen', 'Könige', 'Asse'];
export const rankName = (r) => R_ONE[r];
export const rankPlural = (r) => R_MANY[r];
const k = (v, i) => (v >> (16 - 4 * i)) & 15;
// „bis zur Fünf“, „bis zum Buben“, „bis zur Dame“, „bis zum König“, „bis zum Ass“
const upTo = (r) => (r === 9 ? 'zum Buben' : r === 11 || r === 12 ? `zum ${R_ONE[r]}` : `zur ${R_ONE[r]}`);

// kurzer Name der Kategorie („Flush“, „Zwei Paare“; Royal Flush gesondert)
export function catName(v) {
  const c = category(v);
  if (c === 8 && k(v, 0) === 12) return 'Royal Flush';
  return CATS[c];
}

// ausführlicher Name: „Paar Könige“, „Zwei Paare, Asse und Achten“, „Flush, Ass hoch“, „Straße bis zur Fünf“
export function handName(v) {
  const c = category(v), a = k(v, 0), b = k(v, 1);
  switch (c) {
    case 0: return `Höchste Karte ${R_ONE[a]}`;
    case 1: return `Paar ${R_MANY[a]}`;
    case 2: return `Zwei Paare, ${R_MANY[a]} und ${R_MANY[b]}`;
    case 3: return `Drilling ${R_MANY[a]}`;
    case 4: return `Straße bis ${upTo(a)}`;
    case 5: return `Flush, ${R_ONE[a]} hoch`;
    case 6: return `Full House, ${R_MANY[a]} und ${R_MANY[b]}`;
    case 7: return `Vierling ${R_MANY[a]}`;
    default: return a === 12 ? 'Royal Flush' : `Straight Flush bis ${upTo(a)}`;
  }
}

// Die 5 Karten, die die Hand bilden (für die Anzeige am Showdown): beste Auswahl aus 5–7 Karten
export function bestFive(cards) {
  const list = cards.slice();
  if (list.length <= 5) return list;
  const target = evaluate(list);
  const n = list.length;
  // die (n − 5) weggelassenen Karten durchprobieren: n = 6 → eine, n = 7 → zwei
  for (let a = 0; a < n; a++) {
    for (let b = n === 6 ? a : a + 1; b < n; b++) {
      const five = list.filter((_, i) => i !== a && i !== b);
      if (five.length === 5 && evaluate(five) === target) return five;
    }
  }
  return list.slice(0, 5);
}

// ---------- Ziehen (Hilfen für Anzeige und Computer) ----------

// Hat die Karte (bzw. Hand) einen Flush- oder Straßen-Draw? Nur offene Karten des Spielers (Hand + Board).
// Liefert { flush: bool, straight: 'open'|'gut'|null }, wenn noch Karten kommen.
export function draws(cards) {
  const m = [0, 0, 0, 0];
  for (const c of cards) { const i = cardIndex(c); m[i & 3] |= 1 << (i >> 2); }
  const flush = m.some((x) => POP[x] === 4);
  const any = m[0] | m[1] | m[2] | m[3];
  if (STRAIGHT[any] >= 0) return { flush, straight: null };
  let outs = 0;
  for (let r = 0; r < 13; r++) if (!(any & (1 << r)) && STRAIGHT[any | (1 << r)] >= 0) outs++;
  return { flush, straight: outs >= 2 ? 'open' : outs === 1 ? 'gut' : null };
}
