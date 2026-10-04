// Endspiel-Tabellen (src/trainer/tb.js): Maxima, Konsistenz gegen chess.js, bestMove-Partien bis Matt,
// KPK-Lehrbuchstellungen, Farbspiegelung, Bauzeiten.
// Aufruf: node tests/node/trainer_tb.test.mjs
import assert from 'node:assert/strict';
import { Chess } from '../../lib/chess.js';
import * as TB from '../../src/trainer/tb.js';
import { mulberry32, randInt } from '../../src/rng.js';

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  const t = performance.now();
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''} [${((performance.now() - t) / 1000).toFixed(1)} s]`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 5).join('\n   ')}`);
  }
}

const rng = mulberry32(20261004);
const DRAW = { result: 'draw', dtm: null };

// FEN aus Feldern (0 = a1 … 63 = h8)
function fenOf(pieces, turn) {
  const b = Array(64).fill('');
  for (const [ch, s] of pieces) b[s] = ch;
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) {
      const ch = b[r * 8 + f];
      if (!ch) { e++; continue; }
      if (e) { row += e; e = 0; }
      row += ch;
    }
    rows.push(row + (e || ''));
  }
  return `${rows.join('/')} ${turn} - - 0 1`;
}

// Zufällige legale Stellung (unabhängig von tb.js geprüft: Könige getrennt, Seite NICHT am Zug nicht im Schach)
function randomFen(mat, strong = rng() < 0.5 ? 'w' : 'b', turn = rng() < 0.5 ? 'w' : 'b') {
  const pc = { KQK: 'q', KRK: 'r', KPK: 'p' }[mat];
  for (;;) {
    const K = randInt(rng, 64), k = randInt(rng, 64), x = randInt(rng, 64);
    if (K === k || K === x || k === x) continue;
    if (Math.max(Math.abs((K & 7) - (k & 7)), Math.abs((K >> 3) - (k >> 3))) <= 1) continue;
    if (pc === 'p' && (x < 8 || x >= 56)) continue;
    const pieces = [['K', K], ['k', k], [strong === 'w' ? pc.toUpperCase() : pc, x]];
    const other = fenOf(pieces, turn === 'w' ? 'b' : 'w');
    if (new Chess(other).inCheck()) continue;
    return fenOf(pieces, turn);
  }
}

const invert = (r) => (r.result === 'draw' ? DRAW : { result: r.result === 'win' ? 'loss' : 'win', dtm: r.dtm + 1 });
const short = (r) => ({ result: r.result, dtm: r.dtm });

// Minimax über die Folgezüge aus chess.js; Folgestellungen per probe, Endstellungen per chess.js.
// Schnelle interne API von chess.js (_moves/_makeMove/_undoMove, wie im Schach-Bot), Brett per fen().
function expected(fen) {
  const c = new Chess(fen);
  const moves = c._moves({ legal: true });
  if (!moves.length) return c._isKingAttacked(c._turn) ? { result: 'loss', dtm: 0 } : DRAW;
  let win = Infinity, loss = -1, draw = false;
  for (const m of moves) {
    c._makeMove(m);
    let v;
    if (!c._moves({ legal: true }).length) v = c._isKingAttacked(c._turn) ? { result: 'win', dtm: 1 } : DRAW;
    else if (c.isInsufficientMaterial()) v = DRAW;
    else v = invert(TB.probe(c.fen()));
    c._undoMove();
    if (v.result === 'win') win = Math.min(win, v.dtm);
    else if (v.result === 'draw') draw = true;
    else loss = Math.max(loss, v.dtm);
  }
  if (win < Infinity) return { result: 'win', dtm: win };
  if (draw) return DRAW;
  return { result: 'loss', dtm: loss };
}

// Zugliste von tb.js == chess.js (Felder, Umwandlung, SAN)
function sameMoves(fen) {
  const key = (m) => `${m.from}${m.to}${m.promo || m.promotion || ''} ${m.san}`;
  const a = TB.scoreMoves(fen).map(key).sort();
  const b = new Chess(fen).moves({ verbose: true }).map(key).sort();
  assert.deepEqual(a, b, fen);
}

// Partie mit bestMove für beide Seiten; prüft min/max-dtm je Zug und Matt nach genau dtm Halbzügen
function playOut(fen) {
  const start = TB.probe(fen);
  assert.equal(start.result, 'win', fen);
  const c = new Chess(fen);
  for (let ply = 0; ply < start.dtm; ply++) {
    assert.ok(!c.isGameOver(), `${fen}: vorzeitig vorbei nach ${ply}`);
    const f = c.fen();
    const p = TB.probe(f);
    assert.equal(p.dtm, start.dtm - ply, `${fen}: dtm nach ${ply} Halbzügen`);
    const sm = TB.scoreMoves(f);
    const bm = TB.bestMove(f);
    const me = sm.find((m) => m.from === bm.from && m.to === bm.to && m.promo === bm.promo);
    assert.ok(me, `${f}: bestMove nicht in scoreMoves`);
    if (ply % 2 === 0) {
      assert.equal(me.result, 'win', f);
      assert.equal(me.dtm, Math.min(...sm.filter((m) => m.result === 'win').map((m) => m.dtm)), `${f}: Angreifer nicht kürzest`);
    } else {
      assert.equal(me.result, 'loss', f);
      assert.equal(me.dtm, Math.max(...sm.map((m) => m.dtm)), `${f}: Verteidiger nicht längst`);
    }
    c.move({ from: bm.from, to: bm.to, promotion: bm.promo });
  }
  assert.ok(c.isCheckmate(), `${fen}: nach ${start.dtm} Halbzügen kein Matt (${c.fen()})`);
  return start.dtm;
}

function randomWon(mat, n) {
  const out = [];
  while (out.length < n) {
    const strong = rng() < 0.5 ? 'w' : 'b';
    const fen = randomFen(mat, strong, strong);
    if (TB.probe(fen).result === 'win') out.push(fen);
  }
  return out;
}

// --- 6. Bauzeiten (zuerst, damit die Messung ohne Vorlauf stattfindet) ---
const infos = {};
test('Bauzeiten KQK, KRK, KPK', () => {
  const t = performance.now();
  for (const m of ['KQK', 'KRK', 'KPK']) infos[m] = TB.build(m);
  const total = performance.now() - t;
  assert.ok(total < 3000, `zu langsam: ${total.toFixed(0)} ms`);
  return `${['KQK', 'KRK', 'KPK'].map((m) => `${m} ${infos[m].ms} ms`).join(', ')}, gesamt ${total.toFixed(0)} ms`;
});

// --- 1. Bekannte Maxima ---
test('Maxima: KQK 19 Halbzüge (Matt in 10), KRK 31 (Matt in 16)', () => {
  assert.equal(infos.KQK.maxDtm, 19);
  assert.equal(infos.KRK.maxDtm, 31);
  assert.equal(TB.build('KQK'), infos.KQK, 'zweiter Aufruf aus dem Zwischenspeicher');
  return `Stellungen KQK ${infos.KQK.positions}, KRK ${infos.KRK.positions}`;
});

test('KPK: Maximum plausibel', () => {
  const m = infos.KPK.maxDtm;
  assert.ok(m & 1, 'ungerade (Seite am Zug gewinnt)');
  assert.ok(m > 31 && m < 80, String(m));
  return `${m} Halbzüge = Matt in ${(m + 1) / 2}, Stellungen ${infos.KPK.positions}`;
});

test('materialOf und Fehlerfälle', () => {
  assert.deepEqual(TB.materialOf('8/8/8/4k3/8/8/8/4K2R w - - 0 1'), { mat: 'KRK', strong: 'w' });
  assert.deepEqual(TB.materialOf('8/8/8/4k3/8/3q4/8/4K3 w - - 0 1'), { mat: 'KQK', strong: 'b' });
  assert.deepEqual(TB.materialOf('8/4p3/8/4k3/8/8/8/4K3 b - - 0 1'), { mat: 'KPK', strong: 'b' });
  assert.equal(TB.materialOf('8/8/8/4k3/8/8/8/4KB1R w - - 0 1'), null);
  assert.equal(TB.materialOf('8/8/8/4k3/8/8/8/4K1N1 w - - 0 1'), null);
  assert.throws(() => TB.probe('8/8/8/4k3/8/8/8/4KB1R w - - 0 1'));
  assert.throws(() => TB.probe('8/8/8/4k3/4K3/8/8/7R w - - 0 1'), /Illegal/); // Könige benachbart
  assert.throws(() => TB.build('KBNK'));
});

// --- 2. Konsistenz gegen chess.js ---
for (const mat of ['KQK', 'KRK', 'KPK']) {
  test(`${mat}: 3000 Zufallsstellungen == Minimax über chess.js-Züge, Zuglisten/SAN wie chess.js`, () => {
    const stat = { win: 0, loss: 0, draw: 0 };
    let bStrong = 0;
    for (let i = 0; i < 3000; i++) {
      const fen = randomFen(mat);
      const got = TB.probe(fen);
      assert.deepEqual(short(got), expected(fen), fen);
      if (i < 1000) sameMoves(fen);
      if (got.result === 'win') assert.equal(got.mateIn, (got.dtm + 1) / 2);
      if (got.result === 'loss') assert.equal(got.mateIn, got.dtm / 2);
      stat[got.result]++;
      if (TB.materialOf(fen).strong === 'b') bStrong++;
    }
    assert.ok(stat.win && stat.loss && bStrong > 1000, JSON.stringify(stat));
    return `${stat.win} Sieg, ${stat.loss} Niederlage, ${stat.draw} Remis, starke Seite Schwarz ${bStrong}×`;
  });
}

test('scoreMoves: Matt = win 1, Patt/Schlagen = Remis, SAN', () => {
  const m = TB.scoreMoves('6k1/8/6K1/8/8/8/8/R7 w - - 0 1');
  const ra8 = m.find((x) => x.to === 'a8');
  assert.deepEqual([ra8.san, ra8.result, ra8.dtm], ['Ra8#', 'win', 1]);
  const st = TB.scoreMoves('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1').find((x) => x.from === 'g1' && x.to === 'g6');
  assert.deepEqual([st.result, st.dtm], ['draw', null], 'Dg6 ist Patt');
  const cap = TB.scoreMoves('8/8/8/8/8/3k4/3Q4/7K b - - 0 1').find((x) => x.to === 'd2');
  assert.deepEqual([cap.san, cap.result, cap.dtm], ['Kxd2', 'draw', null]);
  assert.deepEqual(TB.bestMove('8/8/8/8/8/3k4/3Q4/7K b - - 0 1'), { from: 'd3', to: 'd2' });
});

// --- 3. bestMove-Partien KQK/KRK ---
for (const mat of ['KQK', 'KRK']) {
  test(`${mat}: 200 gewonnene Stellungen, beide spielen bestMove → Matt nach genau dtm`, () => {
    let sum = 0, max = 0;
    for (const fen of randomWon(mat, 200)) { const d = playOut(fen); sum += d; max = Math.max(max, d); }
    return `Ø ${(sum / 200).toFixed(1)} Halbzüge, längste ${max}`;
  });
}

// --- 4. KPK-Lehrbuch ---
const book = [
  ['König auf der 6. Reihe vor dem Bauern, Weiß am Zug', '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', 'win'],
  ['König auf der 6. Reihe vor dem Bauern, Schwarz am Zug', '4k3/8/4K3/4P3/8/8/8/8 b - - 0 1', 'win'],
  ['König zwei Reihen vor dem Bauern, Weiß am Zug', '8/4k3/8/4K3/8/4P3/8/8 w - - 0 1', 'win'],
  ['König zwei Reihen vor dem Bauern, Schwarz am Zug', '8/4k3/8/4K3/8/4P3/8/8 b - - 0 1', 'win'],
  ['Opposition: Ke5/Pe4 gegen Ke7, Weiß am Zug (Schwarz hat die Opposition)', '8/4k3/8/4K3/4P3/8/8/8 w - - 0 1', 'draw'],
  ['Opposition: Ke5/Pe4 gegen Ke7, Schwarz am Zug (Weiß hat die Opposition)', '8/4k3/8/4K3/4P3/8/8/8 b - - 0 1', 'win'],
  ['Randbauer, schwarzer König in der Ecke', 'k7/8/K7/P7/8/8/8/8 w - - 0 1', 'draw'],
  ['Randbauer, schwarzer König in der Ecke, Schwarz am Zug', 'k7/8/2K5/8/P7/8/8/8 b - - 0 1', 'draw'],
  ['Quadratregel: Bauer läuft durch', '8/8/8/P4k2/8/8/8/7K b - - 0 1', 'win'],
  ['Quadratregel: Bauer wird eingeholt', '8/8/8/P2k4/8/8/8/7K b - - 0 1', 'draw'],
  ['Patt-Falle Ke6/Pe7 gegen Ke8, Schwarz am Zug', '4k3/4P3/4K3/8/8/8/8/8 b - - 0 1', 'draw'],
  ['Schwarzer Bauer (gespiegelt): König auf der 3. Reihe vor dem Bauern', '8/8/8/8/4p3/4k3/8/4K3 w - - 0 1', 'win']
];
// Ergebnis jeweils aus Sicht der starken Seite; probe antwortet aus Sicht der Seite am Zug
for (const [name, fen, res] of book) {
  test(`KPK: ${name} → ${res === 'win' ? 'gewonnen' : 'Remis'}`, () => {
    const p = TB.probe(fen);
    const toMove = fen.split(' ')[1] === TB.materialOf(fen).strong;
    assert.equal(p.result, res === 'win' && !toMove ? 'loss' : res, fen);
    return p.mateIn ? `Matt in ${p.mateIn}` : '';
  });
}

test('KPK: Patt-Falle auch laut chess.js Patt', () => {
  const c = new Chess('4k3/4P3/4K3/8/8/8/8/8 b - - 0 1');
  assert.ok(c.isStalemate());
  assert.deepEqual(TB.scoreMoves(c.fen()), []);
  assert.equal(TB.bestMove(c.fen()), null);
});

test('KPK: Unterverwandlung = Remis, Turm statt Dame bei Patt-Gefahr', () => {
  const sm = TB.scoreMoves('k7/2P5/1K6/8/8/8/8/8 w - - 0 1');
  const by = (p) => sm.find((m) => m.promo === p);
  assert.equal(by('b').result, 'draw');
  assert.equal(by('n').result, 'draw');
  assert.deepEqual([by('q').san, by('q').result, by('q').dtm], ['c8=Q#', 'win', 1]);
  assert.deepEqual([by('r').san, by('r').result, by('r').dtm], ['c8=R#', 'win', 1]);
  // Ka1/Kc2, Bauer g7: g8=D ist Patt, g8=T gewinnt (Ka2, Ta8#)
  const fen = '8/6P1/8/8/8/8/2K5/k7 w - - 0 1';
  const sm2 = TB.scoreMoves(fen);
  assert.equal(sm2.find((m) => m.promo === 'q').result, 'draw');
  assert.deepEqual([sm2.find((m) => m.promo === 'r').result, sm2.find((m) => m.promo === 'r').dtm], ['win', 3]);
  assert.deepEqual(TB.probe(fen), { result: 'win', dtm: 3, mateIn: 2 });
  assert.deepEqual(TB.bestMove(fen), { from: 'g7', to: 'g8', promo: 'r' });
  // Dame sofort schlagbar → Remis
  const cap = TB.scoreMoves('8/1Pk5/8/4K3/8/8/8/8 w - - 0 1').find((m) => m.promo === 'q');
  assert.equal(cap.result, 'draw');
});

test('KPK: 200 gewonnene Stellungen, beide spielen bestMove → Matt nach genau dtm', () => {
  let sum = 0, max = 0;
  for (const fen of randomWon('KPK', 200)) { const d = playOut(fen); sum += d; max = Math.max(max, d); }
  return `Ø ${(sum / 200).toFixed(1)} Halbzüge, längste ${max}`;
});

test('Remis-Stellungen: bestMove hält das Remis, schwache Seite schlägt, starke Seite stellt nichts ein', () => {
  // Schwacher König kann den ungedeckten Bauern schlagen
  assert.deepEqual(TB.bestMove('8/8/8/8/3k4/3P4/8/7K b - - 0 1'), { from: 'd4', to: 'd3' });
  let n = 0, hung = 0;
  for (let i = 0; i < 400; i++) {
    const fen = randomFen('KPK');
    if (TB.probe(fen).result !== 'draw') continue;
    const bm = TB.bestMove(fen);
    if (!bm) continue;
    const c = new Chess(fen);
    const mover = c.turn();
    c.move({ from: bm.from, to: bm.to, promotion: bm.promo });
    if (!c.isGameOver()) assert.equal(TB.probe(c.fen()).result, 'draw', `${fen} ${bm.from}${bm.to}`);
    n++;
    // starke Seite: Bauer hängt nach dem Zug nur, wenn es keinen Remis-Zug ohne Hängen gab
    if (TB.materialOf(fen).strong === mover && !c.isGameOver()) {
      const caps = c.moves({ verbose: true }).filter((m) => m.captured);
      if (caps.length) {
        hung++;
        const alt = TB.scoreMoves(fen).filter((m) => m.result === 'draw').some((m) => {
          const d = new Chess(fen);
          d.move({ from: m.from, to: m.to, promotion: m.promo });
          return !d.moves({ verbose: true }).some((x) => x.captured);
        });
        assert.ok(!alt, `${fen}: ${bm.from}${bm.to} stellt den Bauern ein, obwohl vermeidbar`);
      }
    }
  }
  return `${n} Remis-Stellungen, ${hung}× unvermeidbar hängend`;
});

test('bestMove mit rng wählt nur unter Gleichwertigen', () => {
  const fen = '8/8/8/4k3/8/8/8/4K2R w - - 0 1';
  const sm = TB.scoreMoves(fen);
  const min = Math.min(...sm.filter((m) => m.result === 'win').map((m) => m.dtm));
  const r2 = mulberry32(7);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const b = TB.bestMove(fen, { rng: r2 });
    seen.add(b.from + b.to);
    assert.equal(sm.find((m) => m.from === b.from && m.to === b.to).dtm, min);
  }
  return `${seen.size} verschiedene beste Züge`;
});

// --- 5. Farbspiegelung ---
const mirror = (fen) => {
  const [b, t] = fen.split(' ');
  const sw = (ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase());
  return `${b.split('/').reverse().map((r) => [...r].map(sw).join('')).join('/')} ${t === 'w' ? 'b' : 'w'} - - 0 1`;
};
test('Gespiegelte Farben: probe gleich (500 Zufallsstellungen)', () => {
  for (let i = 0; i < 500; i++) {
    const fen = randomFen(['KQK', 'KRK', 'KPK'][i % 3]);
    assert.deepEqual(TB.probe(mirror(fen)), TB.probe(fen), fen);
    const a = TB.scoreMoves(fen).map((m) => `${m.result}${m.dtm}`).sort();
    const b = TB.scoreMoves(mirror(fen)).map((m) => `${m.result}${m.dtm}`).sort();
    assert.deepEqual(b, a, fen);
  }
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
