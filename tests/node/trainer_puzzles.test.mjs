// Tests Schach-Trainer: Taktik-Aufgaben (src/trainer/data/puzzles.js) und Aufgaben-Logik (src/trainer/puzzle.js).
// Aufruf: node tests/node/trainer_puzzles.test.mjs
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from '../../lib/chess.js';
import { MOTIFS, PUZZLES } from '../../src/trainer/data/puzzles.js';
import * as P from '../../src/trainer/puzzle.js';

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 5).join('\n   ')}`);
  }
}
const cm = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), ...(u[4] ? { promotion: u[4] } : {}) });
const uciOf = (m) => m.from + m.to + (m.promotion || '');
const MATE_N = { matt1: 1, matt2: 2, matt3: 3 };
const all = PUZZLES.map(P.puzzleObj);

test('Datendatei < 300 KB', () => {
  const size = statSync(fileURLToPath(new URL('../../src/trainer/data/puzzles.js', import.meta.url))).size;
  assert.ok(size < 300 * 1024, `${size} Bytes`);
  return `${(size / 1024).toFixed(1)} KB, ${PUZZLES.length} Aufgaben`;
});

test('MOTIFS: 12 Motive mit id/name/themes/intro/hint', () => {
  assert.equal(MOTIFS.length, 12);
  assert.deepEqual(MOTIFS.map((m) => m.id), ['gabel', 'doppelangriff', 'fesselung', 'spiess', 'abzug', 'verteidiger', 'ablenkung', 'hinlenkung', 'grundreihe', 'matt1', 'matt2', 'matt3']);
  for (const m of MOTIFS) {
    for (const k of ['id', 'name', 'intro', 'hint']) assert.ok(typeof m[k] === 'string' && m[k].trim().length > 2, `${m.id}.${k}`);
    assert.ok(Array.isArray(m.themes) && m.themes.length, `${m.id}.themes`);
  }
});

test('IDs eindeutig, Zeilenformat stimmt, Motiv bekannt', () => {
  const ids = new Set();
  const motifIds = new Set(MOTIFS.map((m) => m.id));
  for (const r of PUZZLES) {
    assert.equal(r.length, 5);
    assert.ok(typeof r[0] === 'string' && r[0].length > 0);
    assert.ok(!ids.has(r[0]), `doppelt: ${r[0]}`);
    ids.add(r[0]);
    assert.ok(/^([a-h][1-8]){2}[qrbn]?( ([a-h][1-8]){2}[qrbn]?)+$/.test(r[2]), `${r[0]} Züge: ${r[2]}`);
    assert.ok(Number.isInteger(r[3]));
    assert.ok(motifIds.has(r[4]), `${r[0]} Motiv ${r[4]}`);
  }
  return `${ids.size} IDs`;
});

test('je Motiv 15–30 Aufgaben, Rating 600–2000, aufsteigend sortiert', () => {
  const info = [];
  for (const m of MOTIFS) {
    const list = all.filter((p) => p.motif === m.id);
    assert.ok(list.length >= 15 && list.length <= 30, `${m.id}: ${list.length}`);
    for (let i = 0; i < list.length; i++) {
      assert.ok(list[i].rating >= 600 && list[i].rating <= 2000, `${list[i].id}: ${list[i].rating}`);
      if (i) assert.ok(list[i].rating >= list[i - 1].rating, `${m.id} nicht sortiert bei ${list[i].id}`);
    }
    info.push(`${m.id} ${list.length}`);
  }
  return info.join(', ');
});

test('jede Aufgabe: FEN gültig, alle Züge legal, Spielerfarbe = Gegenteil der Seite am Zug', () => {
  for (const p of all) {
    const g = new Chess(p.fen); // wirft bei ungültiger FEN
    const before = g.turn();
    for (const u of p.moves) {
      let mv = null;
      try { mv = g.move(cm(u)); } catch { /* unten gemeldet */ }
      assert.ok(mv, `${p.id}: illegaler Zug ${u}`);
    }
    const s = P.startOf(p);
    assert.equal(s.userColor, before === 'w' ? 'b' : 'w', `${p.id} Spielerfarbe`);
    assert.equal(s.prevFen, p.fen);
    assert.deepEqual(s.opp, { from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), ...(p.moves[0][4] ? { promo: p.moves[0][4] } : {}) });
    assert.equal(new Chess(s.fen).turn(), s.userColor);
    assert.equal(p.moves.length % 2, 0, `${p.id}: Aufgabe endet nicht mit Spielerzug`);
  }
  return `${all.length} Aufgaben, ${all.reduce((n, p) => n + p.moves.length, 0)} Züge`;
});

test('Matt-Motive: genau N Spielerzüge und Matt am Ende; Grundreihe endet mit Matt; Motive 1–8 höchstens 3 Spielerzüge', () => {
  let mates = 0;
  for (const p of all) {
    const g = new Chess(p.fen);
    for (const u of p.moves) g.move(cm(u));
    if (p.motif in MATE_N) {
      assert.equal(P.userSteps(p), MATE_N[p.motif], `${p.id} (${p.motif}) Spielerzüge`);
      assert.ok(g.isCheckmate(), `${p.id} (${p.motif}) endet nicht mit Matt`);
      mates++;
    } else if (p.motif === 'grundreihe') {
      assert.ok(g.isCheckmate(), `${p.id} (grundreihe) endet nicht mit Matt`);
      mates++;
    } else {
      assert.ok(P.userSteps(p) <= 3, `${p.id} hat ${P.userSteps(p)} Spielerzüge`);
    }
  }
  return `${mates} Matt-Aufgaben geprüft`;
});

test('Gabel: Schlüsselzug mit Springer/Bauer, Doppelangriff: mit D/T/L/K', () => {
  for (const p of all.filter((x) => x.motif === 'gabel' || x.motif === 'doppelangriff')) {
    const g = new Chess(P.startOf(p).fen);
    const piece = g.get(P.hintSquare(p, 0)).type;
    if (p.motif === 'gabel') assert.ok('np'.includes(piece), `${p.id}: ${piece}`);
    else assert.ok('qrbk'.includes(piece), `${p.id}: ${piece}`);
  }
});

test('API: userSteps/expected/reply/isLast/hintSquare/fenBefore passen zu den Zügen', () => {
  for (const p of all) {
    const n = P.userSteps(p);
    assert.equal(n, p.moves.length / 2);
    for (let s = 0; s < n; s++) {
      const e = P.expected(p, s);
      assert.equal(e.from + e.to + (e.promo || ''), p.moves[1 + 2 * s]);
      assert.equal(P.hintSquare(p, s), e.from);
      assert.equal(P.isLast(p, s), s === n - 1);
      const r = P.reply(p, s);
      if (s === n - 1) assert.equal(r, null);
      else assert.equal(r.from + r.to + (r.promo || ''), p.moves[2 + 2 * s]);
    }
    assert.equal(P.expected(p, n), null);
  }
  // Datenzeile und Objekt werden gleich behandelt
  const row = PUZZLES[0];
  assert.deepEqual(P.startOf(row), P.startOf(P.puzzleObj(row)));
  assert.equal(P.PUZZLE_BY_ID.get(row[0]), row);
  assert.equal(P.fenBefore(row, 0), P.startOf(row).fen);
});

test('judge: erwarteter Zug -> correct (für jeden Schritt jeder Aufgabe), ein falscher Zug -> wrong', () => {
  let wrongChecked = 0;
  for (const p of all) {
    for (let s = 0; s < P.userSteps(p); s++) {
      const exp = p.moves[1 + 2 * s];
      assert.equal(P.judge(p, s, exp), 'correct', `${p.id} Schritt ${s}`);
      assert.equal(P.judge(p, s, P.expected(p, s)), 'correct', `${p.id} Schritt ${s} (Objekt)`);
      const g = new Chess(P.fenBefore(p, s));
      const other = g.moves({ verbose: true }).find((m) => uciOf(m) !== exp && !(() => { const h = new Chess(g.fen()); h.move(m); return h.isCheckmate(); })());
      if (other) { assert.equal(P.judge(p, s, uciOf(other)), 'wrong', `${p.id} Schritt ${s}: ${uciOf(other)}`); wrongChecked++; }
    }
    // illegale Eingaben
    assert.equal(P.judge(p, 0, 'a1a1'), 'wrong');
  }
  return `${wrongChecked} falsche Züge geprüft`;
});

test('judge: Umwandlung ohne Angabe gilt als Dame', () => {
  const p = { id: 'T1', fen: '7k/P7/8/8/8/8/8/K7 b - - 0 1', moves: ['h8g7', 'a7a8q'], rating: 1000, motif: 'test' };
  // nach Kg7: Spieler a7a8 (=D) – ohne Angabe korrekt, mit q korrekt, mit n falsch
  assert.equal(P.judge(p, 0, 'a7a8'), 'correct');
  assert.equal(P.judge(p, 0, 'a7a8q'), 'correct');
  assert.equal(P.judge(p, 0, 'a7a8n'), 'wrong');
  assert.equal(P.judge(p, 0, { from: 'a7', to: 'a8' }), 'correct');
});

test('judge: alternatives Matt wird als mate akzeptiert (eigene Aufgabe und echte Matt-in-1-Aufgabe)', () => {
  // Eigene Testaufgabe: Schwarz zieht Kg8-h8, danach hat Weiß zwei Grundreihenmatts: Db8# (Lösung) und Ta8#.
  const own = { id: 'T2', fen: '6k1/5ppp/8/8/8/8/1Q3PPP/R5K1 b - - 0 1', moves: ['g8h8', 'b2b8'], rating: 800, motif: 'matt1' };
  const g = new Chess(P.startOf(own).fen);
  const mates = g.moves({ verbose: true }).filter((m) => { const h = new Chess(g.fen()); h.move(m); return h.isCheckmate(); }).map(uciOf);
  assert.ok(mates.includes('b2b8') && mates.includes('a1a8'), mates.join(','));
  assert.equal(P.judge(own, 0, 'b2b8'), 'correct');
  assert.equal(P.judge(own, 0, 'a1a8'), 'mate');
  assert.equal(P.judge(own, 0, 'a1a7'), 'wrong');
  // Echte Daten: Matt-in-1-Aufgaben mit mehreren Matt-Zügen
  let multi = 0;
  for (const p of all.filter((x) => x.motif === 'matt1' || P.userSteps(x) === 1)) {
    const h = new Chess(P.startOf(p).fen);
    for (const m of h.moves({ verbose: true })) {
      const k = new Chess(h.fen()); k.move(m);
      if (k.isCheckmate() && uciOf(m) !== p.moves[1]) { assert.equal(P.judge(p, 0, uciOf(m)), 'mate', `${p.id}: ${uciOf(m)}`); multi++; }
    }
  }
  return `eigene Aufgabe ok, ${multi} alternative Matts in den Daten akzeptiert`;
});

test('alle Aufgaben, alle Schritte: jeder sofort mattsetzende Zug wird angenommen', () => {
  let alt = 0, steps = 0;
  for (const p of all) {
    for (let s = 0; s < P.userSteps(p); s++) {
      steps++;
      const g = new Chess(P.fenBefore(p, s));
      for (const m of g.moves({ verbose: true })) {
        const h = new Chess(g.fen()); h.move(m);
        if (!h.isCheckmate()) continue;
        const v = P.judge(p, s, uciOf(m));
        assert.ok(v === 'correct' || v === 'mate', `${p.id} Schritt ${s}: Matt ${uciOf(m)} -> ${v}`);
        if (v === 'mate') alt++;
      }
    }
  }
  return `${steps} Spielerzüge, ${alt} alternative Matts`;
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
