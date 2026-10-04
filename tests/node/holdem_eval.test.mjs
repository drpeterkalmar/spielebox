// Hold'em-Evaluator: alle 2 598 960 Fünf-Karten-Hände (genau 7 462 Klassen, Häufigkeiten je Kategorie wie in der
// Literatur), alle 133 784 560 Sieben-Karten-Hände (Häufigkeiten je Kategorie, ~3 s),
// 1 Mio. zufällige Sieben-Karten-Hände gegen einen naiven Referenz-Evaluator (beste von 21 Fünfer-Auswahlen),
// Einzelfälle (Wheel, Kicker, drei Paare, zwei Drillinge, Namen).
// Aufruf: node tests/node/holdem_eval.test.mjs
import * as V from '../../src/games/holdem/eval.js';
import { mulberry32 } from '../../src/rng.js';

let passed = 0, failed = 0;
function test(name, fn) {
  const t = performance.now();
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''} – ${((performance.now() - t) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n   ')}`);
  }
}
const fail = (m) => { throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const ev = (s) => V.evaluate(s.split(' '));

// ---------- naive Referenz: 5 Karten nach Lehrbuch ----------
function naive5(cards) {
  const r = cards.map((c) => c >> 2).sort((a, b) => b - a);
  const flush = cards.every((c) => (c & 3) === (cards[0] & 3));
  const cnt = {};
  for (const x of r) cnt[x] = (cnt[x] || 0) + 1;
  // Gruppen: nach Anzahl, dann Rang absteigend
  const groups = Object.entries(cnt).map(([x, n]) => [n, Number(x)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const uniq = [...new Set(r)];
  let straight = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straight = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[4] === 0) straight = 3;
  }
  const code = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] || 0); return v; };
  if (straight >= 0 && flush) return code(8, [straight]);
  if (groups[0][0] === 4) return code(7, [groups[0][1], groups[1][1]]);
  if (groups[0][0] === 3 && groups[1][0] === 2) return code(6, [groups[0][1], groups[1][1]]);
  if (flush) return code(5, r);
  if (straight >= 0) return code(4, [straight]);
  if (groups[0][0] === 3) return code(3, [groups[0][1], groups[1][1], groups[2][1]]);
  if (groups[0][0] === 2 && groups[1][0] === 2) return code(2, [groups[0][1], groups[1][1], groups[2][1]]);
  if (groups[0][0] === 2) return code(1, [groups[0][1], groups[1][1], groups[2][1], groups[3][1]]);
  return code(0, r);
}
function naive7(cards) {
  let best = -1;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    best = Math.max(best, naive5(five));
  }
  return best;
}

test('5 Karten: alle 2 598 960 Hände, 7 462 Klassen, Häufigkeiten je Kategorie', () => {
  const seen = new Set();
  const perCat = Array(9).fill(0), perCatClasses = Array(9).fill(null).map(() => new Set());
  let n = 0;
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
    for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
      const m = [0, 0, 0, 0];
      for (const x of [a, b, c, d, e]) m[x & 3] |= 1 << (x >> 2);
      const v = V.evalMasks(m[0], m[1], m[2], m[3]);
      seen.add(v);
      perCat[v >> 20]++;
      perCatClasses[v >> 20].add(v);
      n++;
      // jede 97. Hand zusätzlich gegen die Referenz (Reihenfolge muss stimmen)
      if (n % 97 === 0) {
        const r = naive5([a, b, c, d, e]);
        const vr = Number(r);
        const enc = (v >> 20) * 16 ** 5 + (v & 0xfffff);
        if (enc !== vr) fail(`Abweichung bei ${[a, b, c, d, e].map(V.cardText)}: ${enc} ≠ ${vr}`);
      }
    }
  eq(n, 2598960, 'Anzahl');
  eq(seen.size, 7462, 'Klassen');
  // Häufigkeiten: Höchste Karte … Straight Flush (inkl. 4 Royal Flush)
  eq(perCat, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40], 'Hände je Kategorie');
  eq(perCatClasses.map((s) => s.size), [1277, 2860, 858, 858, 10, 1277, 156, 156, 10], 'Klassen je Kategorie');
  return '7 462 Klassen';
});

test('Reihenfolge der 7 462 Klassen stimmt mit der Referenz überein', () => {
  // Alle Klassen (je ein Vertreter) nach Evaluator sortieren und mit der Referenz-Ordnung vergleichen
  const rep = new Map();
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
    for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
      const v = V.evaluate([a, b, c, d, e]);
      if (!rep.has(v)) rep.set(v, [a, b, c, d, e]);
    }
  const vs = [...rep.keys()].sort((x, y) => x - y);
  let prev = -1;
  for (const v of vs) {
    const r = naive5(rep.get(v));
    if (r <= prev) fail(`Ordnung falsch bei ${rep.get(v).map(V.cardText)}`);
    prev = r;
  }
  return `${vs.length} Klassen streng steigend`;
});

test('1 000 000 zufällige 7-Karten-Hände = naive Referenz (beste von 21)', () => {
  const rng = mulberry32(20261004);
  for (let i = 0; i < 1000000; i++) {
    const deck = [];
    while (deck.length < 7) {
      const x = Math.floor(rng() * 52);
      if (!deck.includes(x)) deck.push(x);
    }
    const v = V.evaluate(deck);
    const enc = (v >> 20) * 16 ** 5 + (v & 0xfffff);
    const r = naive7(deck);
    if (enc !== r) fail(`Hand ${deck.map(V.cardText).join(' ')}: ${V.handName(v)} ${enc} ≠ ${r}`);
  }
  return '1 Mio. gleich';
});

test('Tempo: Sieben-Karten-Bewertungen je Sekunde', () => {
  const rng = mulberry32(7);
  const hands = [];
  for (let i = 0; i < 200000; i++) {
    const d = new Set();
    while (d.size < 7) d.add(Math.floor(rng() * 52));
    hands.push([...d]);
  }
  const t = performance.now();
  let sum = 0;
  for (let rep = 0; rep < 10; rep++) for (const h of hands) {
    let m0 = 0, m1 = 0, m2 = 0, m3 = 0;
    for (let j = 0; j < 7; j++) { const c = h[j], b = 1 << (c >> 2); switch (c & 3) { case 0: m0 |= b; break; case 1: m1 |= b; break; case 2: m2 |= b; break; default: m3 |= b; } }
    sum += V.evalMasks(m0, m1, m2, m3) & 1;
  }
  const per = 2000000 / ((performance.now() - t) / 1000);
  if (per < 2e6) fail(`zu langsam: ${Math.round(per)}/s`);
  return `${(per / 1e6).toFixed(1)} Mio./s (${sum % 2})`;
});

{
  test('7 Karten: alle 133 784 560 Hände, Häufigkeiten je Kategorie', () => {
    const per = Array(9).fill(0);
    const m = new Int32Array(4);
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
      for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
        const base = [0, 0, 0, 0];
        for (const x of [a, b, c, d, e]) base[x & 3] |= 1 << (x >> 2);
        for (let f = e + 1; f < 52; f++) for (let g = f + 1; g < 52; g++) {
          m[0] = base[0]; m[1] = base[1]; m[2] = base[2]; m[3] = base[3];
          m[f & 3] |= 1 << (f >> 2);
          m[g & 3] |= 1 << (g >> 2);
          per[V.evalMasks(m[0], m[1], m[2], m[3]) >> 20]++;
        }
      }
    eq(per, [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584], 'Hände je Kategorie');
    return '133 784 560 Hände';
  });
}

test('Einzelfälle: Wheel, Kicker, drei Paare, zwei Drillinge, Straße schlägt Drilling', () => {
  if (!(ev('AS 2D 3C 4H 5S') < ev('2S 3D 4C 5H 6S'))) fail('Wheel muss die kleinste Straße sein');
  if (!(ev('AS 2D 3C 4H 5S') > ev('AS AD KC QH JS'))) fail('Wheel schlägt Drilling? (Straße > Paar)');
  eq(V.handName(ev('AS 2D 3C 4H 5S 9C KD')), 'Straße bis zur Fünf', 'Wheel-Name');
  eq(V.handName(ev('AH 2H 3H 4H 5H')), 'Straight Flush bis zur Fünf', 'Steel Wheel');
  eq(V.handName(ev('AH KH QH JH TH 2C 2D')), 'Royal Flush', 'Royal');
  eq(V.handName(ev('9S TS JS QS KS')), 'Straight Flush bis zum König', 'SF König');
  // Kicker
  if (!(ev('AS AD KC 7H 3S') > ev('AH AC QD JH TS'))) fail('Kicker König schlägt Dame');
  eq(ev('AS AD KC 7H 3S 2C 4D'), ev('AH AC KD 7C 3D 2S 4H'), 'gleiche Hand, andere Farben');
  // 5. Kicker zählt bei Höchster Karte
  if (!(ev('AS KD 9C 7H 4S') > ev('AH KC 9D 7C 3D'))) fail('fünfte Karte entscheidet');
  // drei Paare → die besten zwei + bester Kicker
  eq(V.handName(ev('KS KD 8C 8H 4S 4D 2C')), 'Zwei Paare, Könige und Achten', 'drei Paare');
  eq(ev('KS KD 8C 8H 4S 4D 2C'), ev('KH KC 8S 8D 4C 3D 2H'), 'Kicker 4 aus drittem Paar = 4');
  if (!(ev('KS KD 8C 8H 4S 4D 2C') < ev('KS KD 8C 8H 5S 4D 2C'))) fail('Kicker 5 > 4');
  // zwei Drillinge → Full House
  eq(V.handName(ev('7S 7D 7C 5H 5S 5D AC')), 'Full House, Siebenen und Fünfen', 'zwei Drillinge');
  // Straße schlägt Drilling auch in 7 Karten
  eq(V.catName(ev('5S 5D 5C 6H 7S 8D 9C')), 'Straße', 'Straße mit Drilling');
  eq(V.catName(ev('5S 5D 6C 6H 7S 8D 9C')), 'Straße', 'Straße mit zwei Paaren');
  // Vierling mit bestem Kicker aus dem Board
  eq(ev('9S 9D 9C 9H AS 2D 3C'), ev('9S 9D 9C 9H AS KD QC'), 'Vierling: nur ein Kicker zählt');
  // Flush: 6 Karten einer Farbe → die besten 5
  eq(V.handName(ev('AS KS 9S 7S 4S 2S 3D')), 'Flush, Ass hoch', 'Flush mit 6 Karten');
  if (!(ev('AS KS 9S 7S 4S 2S 3D') > ev('AS KS 9S 7S 3S 2S QD'))) fail('Flush: 5. Karte 4 > 3');
  // Namen
  eq(V.handName(ev('2S 2D 5C 9H KS')), 'Paar Zweien', 'Paar');
  eq(V.handName(ev('2S 3D 5C 9H KS')), 'Höchste Karte König', 'High Card');
  eq(V.handName(ev('TS TD TC 9H KS')), 'Drilling Zehnen', 'Drilling');
  eq(V.handName(ev('TS JD QC KH AS')), 'Straße bis zum Ass', 'Broadway');
  eq(V.handName(ev('6S 7D 8C 9H TS')), 'Straße bis zur Zehn', 'Straße Zehn');
  eq(V.bestFive('AS KS 9S 7S 4S 2S 3D'.split(' ')).sort(), ['4S', '7S', '9S', 'AS', 'KS'].sort(), 'beste fünf');
  eq(V.bestFive('AS 2D 3C 4H 5S 9C KD'.split(' ')).sort(), ['2D', '3C', '4H', '5S', 'AS'].sort(), 'beste fünf Wheel');
  eq(V.draws('AS KS 9S 7S 2D'.split(' ')), { flush: true, straight: null }, 'Flush-Draw');
  eq(V.draws('8S 9D TC JH 2D'.split(' ')).straight, 'open', 'offener Straßen-Draw');
  eq(V.draws('8S 9D JC QH 2D'.split(' ')).straight, 'gut', 'Bauchschuss');
});

console.log(`\n${passed} ✅, ${failed} ❌`);
process.exit(failed ? 1 : 0);
