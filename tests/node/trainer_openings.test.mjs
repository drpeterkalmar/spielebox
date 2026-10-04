// Tests Schach-Trainer, Eröffnungs-Katalog: Legalität, Umfang, Pflichtfamilien, lichess-Namen, Logik.
// Aufruf: node tests/node/trainer_openings.test.mjs
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from '../../lib/chess.js';
import { FAMILIES, LINES } from '../../src/trainer/data/openings.js';
import * as O from '../../src/trainer/opening.js';

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
const fam = new Map(FAMILIES.map((f) => [f.id, f]));
const line = (id) => LINES.find((l) => l.id === id);
const plies = (l) => l.moves.split(' ');

// lichess-Name muss zur Familie passen
const NAME_RE = {
  italienisch: /^Italian Game/,
  zweispringer: /Two Knights/,
  spanisch: /^Ruy Lopez/,
  schottisch: /^Scotch Game/,
  vierspringer: /^Four Knights/,
  koenigsgambit: /^King's Gambit/,
  sizilianisch: /^Sicilian Defense/,
  franzoesisch: /^French Defense/,
  carokann: /^Caro-Kann Defense/,
  skandinavisch: /^Scandinavian Defense/,
  damengambit: /^Queen's Gambit/,
  slawisch: /^Slav Defense/,
  londoner: /London System/,
  koenigsindisch: /^King's Indian Defense/,
  gruenfeld: /^Grünfeld Defense/,
  nimzoindisch: /^Nimzo-Indian Defense/,
  damenindisch: /^Queen's Indian Defense/,
  hollaendisch: /^Dutch Defense/,
  englisch: /^English Opening/
};

test('Katalog-Umfang: ~30 Linien, Familien mit side und intro', () => {
  assert.ok(LINES.length >= 28 && LINES.length <= 40, `${LINES.length} Linien`);
  for (const f of FAMILIES) {
    assert.ok(['w', 'b'].includes(f.side), f.id);
    assert.ok(f.name && f.intro && f.intro.length < 300, f.id);
    assert.ok(LINES.some((l) => l.family === f.id), `Familie ${f.id} ohne Linie`);
  }
  assert.equal(new Set(FAMILIES.map((f) => f.id)).size, FAMILIES.length, 'Familien-IDs eindeutig');
  return `${LINES.length} Linien, ${FAMILIES.length} Familien`;
});

test('jede Linie legal (chess.js), SAN kanonisch, 12–24 Halbzüge', () => {
  let total = 0;
  for (const l of LINES) {
    const ms = plies(l);
    assert.ok(ms.length >= 12 && ms.length <= 24, `${l.id}: ${ms.length} Halbzüge`);
    const c = new Chess();
    for (const s of ms) {
      let m = null;
      try { m = c.move(s); } catch { /* illegal */ }
      assert.ok(m, `${l.id}: illegaler Zug ${s}`);
      assert.equal(m.san, s, `${l.id}: SAN ${s}`);
    }
    total += ms.length;
  }
  return `${total} Halbzüge geprüft`;
});

test('IDs eindeutig, Familie existiert, side ∈ {w,b}, idea 1–299 Zeichen', () => {
  assert.equal(new Set(LINES.map((l) => l.id)).size, LINES.length);
  for (const l of LINES) {
    assert.ok(fam.has(l.family), `${l.id}: Familie ${l.family}`);
    assert.ok(['w', 'b'].includes(l.side), `${l.id}: side ${l.side}`);
    assert.ok(typeof l.name === 'string' && l.name.trim(), `${l.id}: name`);
    assert.ok(typeof l.idea === 'string' && l.idea.trim().length > 0 && l.idea.length < 300, `${l.id}: idea (${l.idea.length})`);
  }
});

test('notes: Halbzugindex in der Linie, Text kurz', () => {
  let n = 0;
  for (const l of LINES) {
    for (const [k, v] of Object.entries(l.notes || {})) {
      const i = Number(k);
      assert.ok(Number.isInteger(i) && i >= 0 && i < plies(l).length, `${l.id}: notes-Index ${k}`);
      assert.ok(typeof v === 'string' && v.trim() && v.length < 200, `${l.id}: notes[${k}]`);
      n++;
    }
  }
  return `${n} Hinweise`;
});

test('eco/lichess gesetzt, lichessPly in der Linie', () => {
  for (const l of LINES) {
    assert.match(l.eco, /^[A-E]\d\d$/, l.id);
    assert.ok(typeof l.lichess === 'string' && l.lichess.length > 3, `${l.id}: lichess`);
    assert.ok(Number.isInteger(l.lichessPly) && l.lichessPly >= 0 && l.lichessPly <= plies(l).length, `${l.id}: lichessPly`);
    assert.ok(l.lichessPly < plies(l).length, `${l.id}: lichessPly < Länge (0-basiert)`);
  }
});

test('Plausibilität: lichess-Name passt zur Familie', () => {
  for (const f of FAMILIES) assert.ok(NAME_RE[f.id], `keine Regel für Familie ${f.id}`);
  for (const l of LINES) assert.match(l.lichess, NAME_RE[l.family], `${l.id}: ${l.lichess}`);
});

test('Pflichtfamilien und Pflichtlinien vorhanden', () => {
  const need = ['italienisch', 'zweispringer', 'spanisch', 'schottisch', 'sizilianisch', 'franzoesisch', 'carokann',
    'skandinavisch', 'damengambit', 'koenigsindisch', 'londoner', 'englisch', 'damenindisch', 'nimzoindisch'];
  for (const id of need) assert.ok(LINES.some((l) => l.family === id), `Familie ${id}`);
  const by = (fid, re) => LINES.some((l) => l.family === fid && re.test(l.name));
  assert.ok(by('italienisch', /Giuoco Piano/), 'Giuoco Piano');
  assert.ok(by('damengambit', /Angenommen/), 'Damengambit angenommen');
  assert.ok(by('damengambit', /Abgelehnt/), 'Damengambit abgelehnt');
  assert.ok(by('sizilianisch', /Najdorf/), 'Najdorf');
  assert.ok(by('sizilianisch', /Drache/), 'Drache');
  assert.ok(by('sizilianisch', /Alapin/), 'Alapin');
  const open = LINES.filter((l) => l.family === 'sizilianisch' && plies(l).slice(0, 7).includes('Nxd4') && plies(l)[1] === 'c5');
  assert.ok(open.length >= 2, 'offene Sizilianische (…cxd4 Sxd4)');
  // lichess-Kennungen der Pflichtlinien
  assert.match(line('si-najdorf').lichess, /Najdorf/);
  assert.match(line('si-drache').lichess, /Dragon/);
  assert.match(line('si-alapin').lichess, /Alapin/);
  assert.match(line('dg-angenommen').lichess, /Queen's Gambit Accepted/);
  assert.match(line('dg-abgelehnt').lichess, /Queen's Gambit Declined/);
  assert.match(line('ni-rubinstein').moves, /^d4 Nf6 c4 e6 Nc3 Bb4 e3/);
  assert.match(line('di-la6').moves, /^d4 Nf6 c4 e6 Nf3 b6 g3 Ba6/);
  return `${open.length} offene Sizilianer`;
});

test('keine zwei Linien identisch, keine Linie Anfang einer anderen', () => {
  const ms = LINES.map((l) => l.moves);
  assert.equal(new Set(ms).size, ms.length);
  for (const a of LINES) for (const b of LINES) {
    if (a !== b) assert.ok(!b.moves.startsWith(a.moves + ' '), `${a.id} ist Anfang von ${b.id}`);
  }
});

test('Datendatei < 40 KB', () => {
  const size = statSync(fileURLToPath(new URL('../../src/trainer/data/openings.js', import.meta.url))).size;
  assert.ok(size < 40 * 1024, `${size} Bytes`);
  return `${(size / 1024).toFixed(1)} KB`;
});

test('lineMoves: from/to/fen/ply/de stimmen, gecacht', () => {
  const l = line('it-piano');
  const ms = O.lineMoves(l);
  assert.equal(ms.length, plies(l).length);
  assert.deepEqual({ san: ms[0].san, from: ms[0].from, to: ms[0].to, ply: ms[0].ply }, { san: 'e4', from: 'e2', to: 'e4', ply: 0 });
  assert.equal(ms[2].de, 'Sf3');
  assert.equal(ms[4].de, 'Lc4');
  assert.equal(ms[11].san, 'Bb4+');
  assert.equal(ms[11].de, 'Lb4+');
  const castle = ms.find((m) => m.san === 'O-O');
  assert.deepEqual([castle.from, castle.to], ['e1', 'g1']);
  assert.equal(ms[0].fen, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  assert.ok(!('promo' in ms[0]));
  assert.equal(O.lineMoves(l), ms, 'Cache liefert dasselbe Array');
  // alle Linien: fen nach jedem Zug = chess.js
  for (const L of LINES) {
    const c = new Chess();
    O.lineMoves(L).forEach((m, i) => { c.move(plies(L)[i]); assert.equal(m.fen, c.fen(), `${L.id}@${i}`); });
  }
});

test('lineName, byFamily, lineById', () => {
  assert.equal(O.lineName(line('it-piano')), 'Italienisch – Giuoco Piano');
  assert.equal(O.lineName(line('si-najdorf')), 'Sizilianisch – Najdorf (Englischer Angriff)');
  const groups = O.byFamily();
  assert.equal(groups.length, FAMILIES.length);
  assert.equal(groups.reduce((n, g) => n + g.lines.length, 0), LINES.length);
  assert.ok(groups.every((g) => g.lines.every((l) => l.family === g.id)));
  assert.equal(O.lineById('sp-berlin'), line('sp-berlin'));
  assert.equal(O.lineById('gibt-es-nicht'), null);
});

test('checkMove: richtig/falsch', () => {
  const l = line('it-piano');
  assert.equal(O.checkMove(l, 0, { from: 'e2', to: 'e4' }), true);
  assert.equal(O.checkMove(l, 0, { from: 'd2', to: 'd4' }), false);
  assert.equal(O.checkMove(l, 1, { from: 'e7', to: 'e5' }), true);
  assert.equal(O.checkMove(l, 1, { from: 'e2', to: 'e4' }), false, 'falscher Halbzug');
  assert.equal(O.checkMove(l, 6, { from: 'c2', to: 'c3' }), true);
  assert.equal(O.checkMove(l, 6, { from: 'c2', to: 'c4' }), false);
  assert.equal(O.checkMove(l, 20, { from: 'e1', to: 'g1' }), true, 'Rochade als Königszug');
  assert.equal(O.checkMove(l, 20, { from: 'e1', to: 'g1', promo: 'q' }), false, 'unnötige Umwandlung');
  assert.equal(O.checkMove(l, 99, { from: 'e2', to: 'e4' }), false, 'jenseits der Linie');
  assert.equal(O.checkMove(l, -1, { from: 'e2', to: 'e4' }), false);
  // jede Linie: jeder Linienzug wird akzeptiert, ein anderer legaler Zug nicht
  let n = 0;
  for (const L of LINES) {
    const c = new Chess();
    O.lineMoves(L).forEach((m, i) => {
      assert.ok(O.checkMove(L, i, { from: m.from, to: m.to }), `${L.id}@${i}`);
      const other = c.moves({ verbose: true }).find((x) => x.from !== m.from || x.to !== m.to);
      if (other) assert.equal(O.checkMove(L, i, { from: other.from, to: other.to }), false, `${L.id}@${i} anders`);
      c.move(m.san);
      n++;
    });
  }
  return `${n} Halbzüge`;
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
