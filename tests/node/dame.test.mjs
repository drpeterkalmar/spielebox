// Regeltests Dame: echte Stellungen per setup, je Fall Regel und Quelle im Namen.
// Quellen: de.wikipedia „Dame (Spiel)“ (Deutsch), strategy-games.de (Steine schlagen nur vorwärts,
// Kurze Dame), FMJD-Regeln (International: Art. 3–4 Schlagen, Mehrheit, fliegende Dame, türkischer Schlag).
// Aufruf: node tests/node/dame.test.mjs
import assert from 'node:assert/strict';
import * as D from '../../src/games/dame/engine.js';
import { chooseMove } from '../../src/games/dame/bot.js';
import { mulberry32 } from '../../src/rng.js';

const t0 = performance.now();
let ok = 0, bad = 0;
function test(name, fn) {
  try {
    fn();
    ok++;
    console.log(`✅ ${name}`);
  } catch (e) {
    bad++;
    console.log(`❌ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n   ')}`);
  }
}

const DE = { rules: 'deutsch' }, INT = { rules: 'international' };

// Feldname ('c3' bzw. 28) → Index
function sq(name, n) {
  for (let i = 0; i < n * n; i++) if (D.squareName(i, n) === String(name)) return i;
  throw new Error(`unbekanntes Feld ${name}`);
}
// Stellung aus Figurenlisten bauen (w/W/b/B → Felder) und per setup laden
function pos(pieces, opts = DE, turn = 0) {
  const n = D.boardSize(opts);
  const g = Array.from({ length: n }, () => Array(n).fill('.'));
  for (const [ch, list] of Object.entries(pieces)) {
    for (const name of list) {
      const [r, c] = D.rcOf(sq(name, n), n);
      g[r][c] = ch;
    }
  }
  return D.setup(g.map((row) => row.join('')), opts, turn);
}
const list = (s) => D.legalMoves(s).map((m) => D.describeMove(s, m)).sort();
const sorted = (a) => [...a].sort();
function mv(s, text) {
  const ms = D.legalMoves(s).filter((m) => D.describeMove(s, m) === text);
  assert.equal(ms.length, 1, `Zug ${text} nicht (eindeutig) legal: ${list(s).join(' ')}`);
  return ms[0];
}
function count(s) {
  const c = { w: 0, W: 0, b: 0, B: 0 };
  for (const v of s.board) if (v) c[{ 1: 'w', 2: 'W', '-1': 'b', '-2': 'B' }[v]]++;
  return c;
}
function illegal(s, move, why) {
  assert.equal(D.isLegal(s, move), false, `isLegal müsste false sein: ${why}`);
  assert.throws(() => D.applyMove(s, move), Error, `applyMove müsste werfen: ${why}`);
}

// ---------- Brett, Optionen, setup ----------

test('Anfangsstellung 8×8: je 12 Steine, Weiß beginnt mit 7 Zügen (de.wikipedia)', () => {
  const s = D.initialState();
  assert.deepEqual(count(s), { w: 12, W: 0, b: 12, B: 0 });
  assert.equal(D.currentPlayer(s), 0);
  assert.equal(s.n, 8);
  assert.deepEqual(list(s), sorted(['a3–b4', 'c3–b4', 'c3–d4', 'e3–d4', 'e3–f4', 'g3–f4', 'g3–h4']));
  const s2 = D.applyMove(s, mv(s, 'c3–d4'));
  assert.equal(D.currentPlayer(s2), 1);
  assert.equal(D.legalMoves(s2).length, 7);
});

test('Anfangsstellung 10×10: je 20 Steine auf 1–20 / 31–50, Weiß hat 9 Züge (FMJD)', () => {
  const s = D.initialState(INT);
  assert.deepEqual(count(s), { w: 20, W: 0, b: 20, B: 0 });
  assert.equal(s.n, 10);
  for (let k = 1; k <= 20; k++) assert.equal(s.board[sq(k, 10)], D.BM);
  for (let k = 31; k <= 50; k++) assert.equal(s.board[sq(k, 10)], D.WM);
  assert.deepEqual(list(s), sorted(['31–26', '31–27', '32–27', '32–28', '33–28', '33–29', '34–29', '34–30', '35–30']));
});

test('Feldnamen und Koordinaten: a1 links unten, FMJD 1 oben links, 46 unten links', () => {
  assert.equal(D.squareName(D.indexOf(7, 0, 8), 8), 'a1');
  assert.equal(D.squareName(D.indexOf(0, 7, 8), 8), 'h8');
  assert.equal(D.squareName(D.indexOf(0, 1, 10), 10), '1');
  assert.equal(D.squareName(D.indexOf(0, 9, 10), 10), '5');
  assert.equal(D.squareName(D.indexOf(1, 0, 10), 10), '6');
  assert.equal(D.squareName(D.indexOf(9, 0, 10), 10), '46');
  assert.equal(D.squareName(D.indexOf(9, 8, 10), 10), '50');
  assert.equal(D.squareName(0, 10), '');                       // helles Feld
  const [r, c] = D.rcOf(42, 8);
  assert.deepEqual([r, c], [5, 2]);
  assert.equal(D.rcOf(42, 8).r, 5);
  assert.equal(D.rcOf(42, 8).c, 2);
  assert.equal(D.isDark(7, 0), true);
  assert.equal(D.isDark(0, 0), false);
  assert.equal(D.boardSize(INT), 10);
  assert.equal(D.boardSize(D.initialState()), 8);
  assert.deepEqual([D.EMPTY, D.WM, D.WK, D.BM, D.BK], [0, 1, 2, -1, -2]);
  assert.equal(D.id, 'dame');
  assert.deepEqual(D.PLAYERS, ['Weiß', 'Schwarz']);
});

test('normalizeOptions: Standard deutsch/aus/aus, Unbekanntes wird verworfen', () => {
  assert.deepEqual(D.normalizeOptions(), { rules: 'deutsch', kurz: false, pusten: false });
  assert.deepEqual(D.normalizeOptions(null), { rules: 'deutsch', kurz: false, pusten: false });
  assert.deepEqual(D.normalizeOptions({ rules: 'russisch', kurz: 'ja', pusten: 1, foo: 3 }), { rules: 'deutsch', kurz: false, pusten: false });
  assert.deepEqual(D.normalizeOptions({ rules: 'international', kurz: true, pusten: true }), { rules: 'international', kurz: true, pusten: true });
});

test('setup: Figur auf hellem Feld, falsche Zeilenzahl, unbekanntes Zeichen → Error', () => {
  const rows = ['........', '........', '........', '........', '........', '........', '........', '........'];
  assert.throws(() => D.setup(['w.......', ...rows.slice(1)], DE), /hellem Feld/);
  assert.throws(() => D.setup(rows.slice(1), DE), /Zeilen/);
  assert.throws(() => D.setup(['.x......', ...rows.slice(1)], DE), /Zeichen/);
  assert.throws(() => D.setup(['.w......', ...rows.slice(1)], DE), /Umwandlungsreihe/);
  // Leerzeichen zur Lesbarkeit sind erlaubt
  const s = D.setup(['. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '. . . . b . . .', '. . . . . . . .', '. . w . . . . .', '. . . . . . . .', '. . . . . . . .'], DE);
  assert.equal(s.board[sq('c3', 8)], D.WM);
  assert.equal(s.board[sq('e5', 8)], D.BM);
});

// ---------- Schlagen: Richtung, Zwang, Mehrfachsprung ----------

test('Deutsch: Stein schlägt NICHT rückwärts (strategy-games.de)', () => {
  const s = pos({ w: ['d4'], b: ['c3', 'a7'] });
  assert.deepEqual(list(s), ['d4–c5', 'd4–e5']);
});

test('International: Stein schlägt auch rückwärts, Schlagzwang (FMJD)', () => {
  const s = pos({ w: [28], b: [33, 6] }, INT);
  assert.deepEqual(list(s), ['28×39']);
});

test('Schlagzwang: normaler Zug ist illegal, wenn ein Schlag möglich ist', () => {
  const s = pos({ w: ['c3', 'g3'], b: ['d4', 'a7'] });
  assert.deepEqual(list(s), ['c3×e5']);
  illegal(s, { from: sq('g3', 8), path: [sq('h4', 8)], cap: [] }, 'g3–h4 trotz Schlagpflicht');
});

test('Mehrfachsprung ist Pflicht bis zum Ende: Teilsprung illegal', () => {
  const s = pos({ w: ['c3'], b: ['d4', 'f6', 'a7'] });
  assert.deepEqual(list(s), ['c3×e5×g7']);
  illegal(s, { from: sq('c3', 8), path: [sq('e5', 8)], cap: [sq('d4', 8)] }, 'nur c3×e5');
  const t = D.applyMove(s, mv(s, 'c3×e5×g7'));
  assert.deepEqual(count(t), { w: 1, W: 0, b: 1, B: 0 });   // geschlagene erst nach dem Zug weg
  assert.equal(t.board[sq('g7', 8)], D.WM);
});

test('International: Mehrheits-Schlagzwang – Folge mit 3 Steinen Pflicht statt 2 (FMJD Art. 4.13)', () => {
  const s = pos({ w: [31, 40], b: [27, 18, 34, 24, 14] }, INT);
  assert.deepEqual(list(s), ['40×29×20×9']);
  assert.deepEqual(mv(s, '40×29×20×9').cap, [34, 24, 14].map((k) => sq(k, 10)));
  illegal(s, { from: sq(31, 10), path: [sq(22, 10), sq(13, 10)], cap: [sq(27, 10), sq(18, 10)] }, '2er-Schlag trotz 3er');
});

test('International: Dame und Stein zählen gleich – 2 Damen schlagen ist NICHT besser als 3 Steine', () => {
  const s = pos({ w: [31, 40], B: [27, 18], b: [34, 24, 14] }, INT);
  assert.deepEqual(list(s), ['40×29×20×9']);
  // gleich viele (2 Damen gegen 2 Steine) → freie Wahl
  const s2 = pos({ w: [31, 40], B: [27, 18], b: [34, 24] }, INT);
  assert.deepEqual(list(s2), ['31×22×13', '40×29×20']);
});

test('Deutsch: freie Wahl zwischen Folgen verschiedener Länge (kein Mehrheitszwang)', () => {
  const s = pos({ w: ['a3', 'e3'], b: ['b4', 'f4', 'f6'] });
  assert.deepEqual(list(s), ['a3×c5', 'e3×g5×e7']);
  const s2 = pos({ w: ['e3'], b: ['d4', 'f4', 'f6'] });       // derselbe Stein: 1 oder 2
  assert.deepEqual(list(s2), ['e3×c5', 'e3×g5×e7']);
});

// ---------- Umwandlung ----------

test('Deutsch: Umwandlung zur Dame beendet den Zug (auch wenn die Dame weiter schlagen könnte)', () => {
  const s = pos({ w: ['d6'], b: ['e7', 'g7'] });
  assert.deepEqual(list(s), ['d6×f8']);
  const t = D.applyMove(s, mv(s, 'd6×f8'));
  assert.equal(t.board[sq('f8', 8)], D.WK);
  assert.equal(t.board[sq('g7', 8)], D.BM);
  assert.equal(D.currentPlayer(t), 1);
});

test('International: Stein überquert die Grundlinie schlagend und bleibt Stein; endet er dort, wird er Dame', () => {
  const s = pos({ w: [12], b: [8, 9, 36] }, INT);
  assert.deepEqual(list(s), ['12×3×14']);
  const t = D.applyMove(s, mv(s, '12×3×14'));
  assert.equal(t.board[sq(14, 10)], D.WM);
  const s2 = pos({ w: [12], b: [8, 36] }, INT);
  const t2 = D.applyMove(s2, mv(s2, '12×3'));
  assert.equal(t2.board[sq(3, 10)], D.WK);
});

// ---------- Dame ----------

test('Deutsche Dame: Fernschlag, Landung direkt dahinter; weiter weg landen ist illegal', () => {
  const s = pos({ W: ['a1'], b: ['d4', 'a7'] });
  assert.deepEqual(list(s), ['a1×e5']);
  illegal(s, { from: sq('a1', 8), path: [sq('f6', 8)], cap: [sq('d4', 8)] }, 'Landung f6 statt e5');
  const s2 = pos({ W: ['c3'], b: ['d4', 'f4', 'a7'] });       // Beispiel aus dem Auftrag
  assert.deepEqual(list(s2), ['c3×e5×g3']);
});

test('Deutsche Dame: Feld direkt dahinter besetzt → kein Schlag (auch wenn weiter hinten frei)', () => {
  assert.deepEqual(list(pos({ W: ['a1'], b: ['d4', 'e5'] })), ['a1–b2', 'a1–c3']);
  assert.deepEqual(list(pos({ W: ['a1'], w: ['e5'], b: ['d4', 'a7'] })), sorted(['a1–b2', 'a1–c3', 'e5–d6', 'e5–f6']));
});

test('Zwei hintereinander stehende Steine sind nicht schlagbar (Stein und fliegende Dame)', () => {
  assert.deepEqual(list(pos({ w: ['c3'], b: ['d4', 'e5'] })), ['c3–b4']);
  assert.deepEqual(list(pos({ W: [46], b: [37, 32] }, INT)), ['46–41']);
});

test('International: fliegende Dame hat mehrere Landefelder; die Mehrheit bestimmt das Landefeld', () => {
  const s = pos({ W: [46], b: [32, 16] }, INT);
  assert.deepEqual(list(s), sorted(['46×28', '46×23', '46×19', '46×14', '46×10', '46×5']));
  const s2 = pos({ W: [46], b: [32, 13, 16] }, INT);          // nur von 19 aus geht es weiter
  assert.deepEqual(list(s2), ['46×19×2', '46×19×8']);
  // deutsche Dame im selben Muster: nur direkt dahinter
  assert.deepEqual(list(pos({ W: ['a1'], b: ['c3', 'a7'] })), ['a1×d4']);
});

test('Türkischer Schlag verboten: derselbe Stein darf nicht zweimal übersprungen werden', () => {
  assert.deepEqual(list(pos({ W: ['a1'], b: ['c3', 'a7'] })), ['a1×d4']);   // nicht a1×d4×b2
  const s = pos({ W: [46], b: [37, 16] }, INT);
  assert.deepEqual(list(s), sorted(['46×32', '46×28', '46×23', '46×19', '46×14', '46×10', '46×5']));
});

test('Türkischer Schlag verboten: geschlagene Steine bleiben bis Zugende stehen und blockieren (FMJD Art. 4.12)', () => {
  // 46×19×30×48 schlägt 37, 24, 43; von 48 aus blockiert der schon geschlagene 37 den Weg zu 31
  const s = pos({ W: [46], b: [37, 24, 43, 31] }, INT);
  assert.deepEqual(list(s), ['46×19×30×48']);
  const m = mv(s, '46×19×30×48');
  assert.deepEqual(m.cap, [37, 24, 43].map((k) => sq(k, 10)));
  const t = D.applyMove(s, m);
  assert.equal(t.board[sq(31, 10)], D.BM);
});

test('Startfeld gilt beim Schlagen als leer: Rundschlag zurück aufs Startfeld (International)', () => {
  const s = pos({ w: [28], b: [22, 12, 13, 23, 6] }, INT);
  assert.deepEqual(list(s), ['28×17×8×19×28', '28×19×8×17×28']);
  const t = D.applyMove(s, D.legalMoves(s)[0]);
  assert.equal(t.board[sq(28, 10)], D.WM);
  assert.deepEqual(count(t), { w: 1, W: 0, b: 1, B: 0 });
});

test('Kurze Dame: zieht nur 1 Feld (alle 4 Richtungen), schlägt nur direkt benachbart', () => {
  const kurz = { rules: 'deutsch', kurz: true };
  assert.deepEqual(list(pos({ W: ['d4'], b: ['f6'] }, DE)), ['d4×g7']);                  // lang: Fernschlag
  assert.deepEqual(list(pos({ W: ['d4'], b: ['f6'] }, kurz)), ['d4–c3', 'd4–c5', 'd4–e3', 'd4–e5']);
  assert.deepEqual(list(pos({ W: ['d4'], b: ['e5', 'a7'] }, kurz)), ['d4×f6']);
  assert.deepEqual(list(pos({ W: ['d4'], b: ['c3', 'a7'] }, kurz)), ['d4×b2']);          // auch rückwärts
  const ik = { rules: 'international', kurz: true };
  assert.deepEqual(list(pos({ W: [28], b: [19] }, INT)), ['28×10', '28×14', '28×5']);
  assert.deepEqual(list(pos({ W: [28], b: [19] }, ik)), ['28–22', '28–23', '28–32', '28–33']);
});

// ---------- Pusten ----------

const PU = { rules: 'deutsch', pusten: true };

test('Pusten: Nicht-Schlagen erlaubt; Gegner darf genau die schlagfähige Figur pusten', () => {
  const s = pos({ w: ['b2', 'c3', 'g3'], b: ['d4', 'a7'] }, PU);
  assert.deepEqual(list(s), sorted(['b2–a3', 'c3×e5', 'c3–b4', 'g3–f4', 'g3–h4']));
  const t = D.applyMove(s, mv(s, 'g3–h4'));
  assert.deepEqual(t.pustbar, [sq('c3', 8)]);
  assert.deepEqual(list(t), sorted(['a7–b6', 'd4–e3', 'gepustet c3']));
  // nach dem Pusten zieht derselbe Spieler, kein zweites Pusten, pustbar leer
  const u = D.applyMove(t, mv(t, 'gepustet c3'));
  assert.equal(D.currentPlayer(u), 1);
  assert.equal(u.pusted, true);
  assert.deepEqual(u.pustbar, []);
  assert.equal(u.board[sq('c3', 8)], D.EMPTY);
  assert.deepEqual(list(u), sorted(['a7–b6', 'd4–c3', 'd4–e3']));
  const v = D.applyMove(u, mv(u, 'a7–b6'));
  assert.equal(D.currentPlayer(v), 0);
  assert.deepEqual(v.pustbar, []);
  assert.equal(v.pusted, false);
});

test('Pusten: der gezogene Stein zählt mit seinem neuen Feld; mehrere schlagfähige → alle pustbar', () => {
  const s = pos({ w: ['b2', 'c3', 'g3'], b: ['d4', 'a7'] }, PU);
  const t = D.applyMove(s, mv(s, 'c3–b4'));
  assert.deepEqual(t.pustbar, [sq('b4', 8)]);
  const s2 = pos({ w: ['a1', 'c3', 'g3'], b: ['d4', 'f4', 'a7'] }, PU);
  const t2 = D.applyMove(s2, mv(s2, 'a1–b2'));
  assert.deepEqual(t2.pustbar, [sq('c3', 8), sq('g3', 8)]);
  assert.deepEqual(D.legalMoves(t2).filter((m) => m.puste !== undefined).map((m) => D.describeMove(t2, m)), ['gepustet c3', 'gepustet g3']);
});

test('Pusten: wer schlägt, wird nicht gepustet; ohne Schlagmöglichkeit auch nicht', () => {
  const s = pos({ w: ['a1', 'c3', 'g3'], b: ['d4', 'f4', 'a7'] }, PU);
  const t = D.applyMove(s, mv(s, 'c3×e5'));
  assert.deepEqual(t.pustbar, []);
  assert.equal(D.legalMoves(t).some((m) => m.puste !== undefined), false);
  const s2 = D.initialState(PU);
  assert.deepEqual(D.applyMove(s2, mv(s2, 'c3–d4')).pustbar, []);
});

test('Pusten + International: nur Maximalschläge, dazu normale Züge; pustbar nur, wer legal schlagen konnte', () => {
  const s = pos({ w: [31, 40], b: [27, 18, 34, 24, 14] }, { rules: 'international', pusten: true });
  assert.deepEqual(list(s), sorted(['31–26', '40–35', '40×29×20×9']));
  const t = D.applyMove(s, mv(s, '31–26'));
  assert.deepEqual(t.pustbar, [sq(40, 10)]);
  assert.equal(D.describeMove(t, { puste: sq(40, 10) }), 'gepustet 40');
});

test('Pusten: letzte Figur gepustet → der Pustende gewinnt sofort', () => {
  const s = pos({ w: ['c3'], b: ['d4', 'a7'] }, PU);
  const t = D.applyMove(s, mv(s, 'c3–b4'));
  const u = D.applyMove(t, mv(t, 'gepustet b4'));
  assert.deepEqual(u.over, { winner: 1, reason: 'keine Steine' });
  assert.deepEqual(D.result(u), u.over);
  assert.deepEqual(D.legalMoves(u), []);
});

// ---------- Partieende ----------

test('Sieg: Gegner hat keine Steine mehr', () => {
  const s = pos({ w: ['c3'], b: ['d4'] });
  const t = D.applyMove(s, mv(s, 'c3×e5'));
  assert.deepEqual(t.over, { winner: 0, reason: 'keine Steine' });
  assert.deepEqual(D.legalMoves(t), []);
  assert.throws(() => D.applyMove(t, { from: sq('e5', 8), path: [sq('d6', 8)], cap: [] }), Error);
});

test('Sieg: Gegner hat keine Züge (blockiert)', () => {
  const s = pos({ w: ['a1', 'g5', 'f4'], b: ['h6'] });
  assert.equal(s.over, null);
  const t = D.applyMove(s, mv(s, 'a1–b2'));
  assert.deepEqual(t.over, { winner: 0, reason: 'keine Züge' });
  assert.deepEqual(D.result(t), { winner: 0, reason: 'keine Züge' });
  const blocked = pos({ w: ['b2', 'g5', 'f4'], b: ['h6'] }, DE, 1);      // direkt per setup
  assert.deepEqual(blocked.over, { winner: 0, reason: 'keine Züge' });
});

test('Remis: dreifache Wiederholung (Damen ziehen hin und her)', () => {
  let s = pos({ W: ['a1'], B: ['h2'] });
  const seq = ['a1–b2', 'h2–g1', 'b2–a1', 'g1–h2'];
  for (let k = 0; k < 8; k++) {
    assert.equal(s.over, null, `zu früh beendet nach ${k} Halbzügen`);
    s = D.applyMove(s, mv(s, seq[k % 4]));
  }
  assert.deepEqual(s.over, { winner: null, reason: 'dreifache Wiederholung' });
  assert.equal(s.rep[D.positionKey(s)], 3);
});

test('Remis: 25-Züge-Regel – 50 Halbzüge in Folge nur Damenzüge ohne Schlagen', () => {
  let s = pos({ W: ['a1', 'c1'], B: ['f8', 'h8'] });
  for (let k = 0; k < 50; k++) {
    assert.equal(s.over, null, `zu früh beendet nach ${k} Halbzügen: ${JSON.stringify(s.over)}`);
    let best = null, bestCount = Infinity;
    for (const m of D.legalMoves(s)) {                           // ruhiger Zug, möglichst neue Stellung
      assert.equal(m.cap.length, 0);
      const t = D.applyMove(s, m);
      if (t.over && t.over.reason !== '25-Züge-Regel') continue;
      if (D.legalMoves(t).some((x) => x.cap.length)) continue;
      const c = t.rep[D.positionKey(t)];
      if (c < bestCount) {
        best = t;
        bestCount = c;
      }
    }
    assert.ok(best, 'kein ruhiger Damenzug gefunden');
    s = best;
  }
  assert.equal(s.quiet, 50);
  assert.deepEqual(s.over, { winner: null, reason: '25-Züge-Regel' });
});

test('Zähler: Damenzug zählt quiet hoch, Steinzug setzt quiet und rep zurück', () => {
  let s = pos({ W: ['c1'], w: ['g3'], B: ['h8'], b: ['b6'] });
  s = D.applyMove(s, mv(s, 'c1–d2'));
  assert.equal(s.quiet, 1);
  assert.equal(Object.keys(s.rep).length, 2);
  s = D.applyMove(s, mv(s, 'h8–g7'));
  assert.equal(s.quiet, 2);
  assert.equal(Object.keys(s.rep).length, 3);
  s = D.applyMove(s, mv(s, 'g3–h4'));
  assert.equal(s.quiet, 0);
  assert.deepEqual(Object.values(s.rep), [1]);
  assert.equal(s.ply, 3);
});

// ---------- Robustheit ----------

test('isLegal lehnt Müll, falsches cap/path und Zusatzfelder ab; applyMove wirft', () => {
  const s = D.initialState();
  const c3 = sq('c3', 8), d4 = sq('d4', 8);
  assert.equal(D.isLegal(s, { from: c3, path: [d4], cap: [] }), true);
  assert.equal(D.isLegal(s, { cap: [], path: [d4], from: c3 }), true);   // Reihenfolge egal
  const throwing = new Proxy({}, { ownKeys() { throw new Error('böse'); } });
  const getter = { from: c3, cap: [], get path() { throw new Error('böse'); } };
  const garbage = [
    null, undefined, 0, 42, NaN, true, 'c3–d4', `${c3}-${d4}`, [], [c3, d4], {}, throwing, getter,
    { from: c3 }, { from: c3, path: [d4] }, { path: [d4], cap: [] },
    { from: c3, path: [d4], cap: [], extra: 1 }, { from: c3, path: [d4], cap: [], puste: c3 },
    { from: String(c3), path: [d4], cap: [] }, { from: c3, path: [String(d4)], cap: [] },
    { from: c3 + 0.5, path: [d4], cap: [] }, { from: c3, path: [d4 + 1e-9], cap: [] }, { from: NaN, path: [d4], cap: [] },
    { from: Infinity, path: [d4], cap: [] }, { from: -1, path: [d4], cap: [] }, { from: 1e9, path: [d4], cap: [] },
    { from: c3, path: [d4, d4], cap: [] }, { from: c3, path: [], cap: [] }, { from: c3, path: d4, cap: [] },
    { from: c3, path: [d4], cap: null }, { from: c3, path: [d4], cap: [sq('e5', 8)] }, { from: c3, path: [null], cap: [] },
    { from: c3, path: new Array(1), cap: [] }, { from: sq('d6', 8), path: [sq('c5', 8)], cap: [] },   // fremde Figur
    { from: c3, path: [sq('c4', 8)], cap: [] }, { puste: c3 }, { puste: String(c3) }, { puste: NaN }, { puste: 1.5 },
  ];
  for (const g of garbage) {
    let label;
    try { label = JSON.stringify(g); } catch { label = String(g); }
    assert.equal(D.isLegal(s, g), false, `isLegal(${label})`);
    assert.throws(() => D.applyMove(s, g), Error, `applyMove(${label})`);
  }
  // Schlagfolge: falsches cap, falscher path, Teilfolge, fehlendes cap
  const t = pos({ w: ['c3'], b: ['d4', 'f6', 'a7'] });
  const [x, e5, g7, d4b, f6] = ['c3', 'e5', 'g7', 'd4', 'f6'].map((k) => sq(k, 8));
  assert.equal(D.isLegal(t, { from: x, path: [e5, g7], cap: [d4b, f6] }), true);
  illegal(t, { from: x, path: [e5, g7], cap: [f6, d4b] }, 'cap vertauscht');
  illegal(t, { from: x, path: [e5, g7], cap: [d4b, e5] }, 'cap falsch');
  illegal(t, { from: x, path: [e5, sq('h8', 8)], cap: [d4b, f6] }, 'path falsch');
  illegal(t, { from: x, path: [e5, g7], cap: [d4b] }, 'cap zu kurz');
  illegal(t, { from: x, path: [e5, g7] }, 'cap fehlt');
  illegal(t, { from: x, path: [g7], cap: [] }, 'als normaler Zug');
  illegal(t, { from: x, path: [e5, g7], cap: [d4b, f6], promote: true }, 'Zusatzfeld');
  assert.equal(D.isLegal(null, { from: x, path: [e5, g7], cap: [d4b, f6] }), false);
  assert.equal(D.isLegal('Müll', { from: x, path: [e5, g7], cap: [d4b, f6] }), false);
});

test('Kaputter Zustand: isLegal false, legalMoves/applyMove werfen einen klaren Error', () => {
  const s = D.initialState();
  const m = D.legalMoves(s)[0];
  for (const bad of [{ ...s, n: 1e6 }, { ...s, n: 10 }, { ...s, board: s.board.slice(0, 10) }, { ...s, board: null }, {}, 'x']) {
    assert.equal(D.isLegal(bad, m), false);
    assert.throws(() => D.legalMoves(bad), /Ungültiger Spielzustand/);
    assert.throws(() => D.applyMove(bad, m), Error);
  }
});

function deepFreeze(o) {
  Object.freeze(o);
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  return o;
}

test('applyMove ändert die Eingabe nicht (tief eingefrorener Zustand, normaler Zug, Schlag, Pusten)', () => {
  const cases = [
    [D.initialState(), 'c3–d4'],
    [pos({ w: ['c3'], b: ['d4', 'f6', 'a7'] }), 'c3×e5×g7'],
  ];
  const p = pos({ w: ['b2', 'c3', 'g3'], b: ['d4', 'a7'] }, PU);
  cases.push([D.applyMove(p, mv(p, 'g3–h4')), 'gepustet c3']);
  for (const [s, text] of cases) {
    const before = JSON.stringify(s);
    const m = mv(s, text);
    deepFreeze(s);
    const t = D.applyMove(s, m);
    assert.equal(JSON.stringify(s), before);
    assert.notEqual(t, s);
    assert.notEqual(t.board, s.board);
  }
});

test('legalMoves liefert Kopien; manuell geänderter Zustand wird erkannt', () => {
  const s = D.initialState();
  const a = D.legalMoves(s);
  a[0].path[0] = 99;
  a.length = 0;
  assert.equal(D.legalMoves(s).length, 7);
  assert.equal(D.isLegal(s, { from: sq('c3', 8), path: [sq('d4', 8)], cap: [] }), true);
  const t = pos({ w: ['c3'], b: ['a7'] });
  assert.deepEqual(list(t), ['c3–b4', 'c3–d4']);
  t.board[sq('b4', 8)] = D.BM;                                  // jemand ändert den Zustand von Hand
  assert.deepEqual(list(t), ['c3×a5']);
});

test('JSON-Rundreise: Zustand übers Netz ergibt dieselben Züge, Schlüssel und Folgezustände', () => {
  for (const opts of [DE, { rules: 'international', pusten: true }, { rules: 'deutsch', kurz: true, pusten: true }]) {
    const rng = mulberry32(7);
    let s = D.initialState(opts);
    for (let k = 0; k < 80 && !s.over; k++) {
      const r = JSON.parse(JSON.stringify(s));
      assert.deepEqual(r, s);
      assert.deepEqual(D.legalMoves(r).map(D.moveKey), D.legalMoves(s).map(D.moveKey));
      assert.equal(D.positionKey(r), D.positionKey(s));
      assert.deepEqual(D.result(r), D.result(s));
      const ms = D.legalMoves(s);
      const m = JSON.parse(JSON.stringify(ms[Math.floor(rng() * ms.length)]));
      const a = D.applyMove(s, m), b = D.applyMove(r, m);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
      s = a;
    }
  }
});

test('describeMove und moveKey: Deutsch algebraisch, International Feldnummern, Pusten', () => {
  const s = D.initialState();
  assert.equal(D.describeMove(s, { from: sq('c3', 8), path: [sq('d4', 8)], cap: [] }), 'c3–d4');
  const s2 = pos({ W: ['c3'], b: ['d4', 'f4', 'a7'] });
  assert.equal(D.describeMove(s2, D.legalMoves(s2)[0]), 'c3×e5×g3');
  const i = D.initialState(INT);
  assert.equal(D.describeMove(i, { from: sq(32, 10), path: [sq(28, 10)], cap: [] }), '32–28');
  const i2 = pos({ w: [28], b: [23, 14, 6] }, INT);
  assert.deepEqual(list(i2), ['28×19×10']);
  const p = pos({ w: ['b2', 'c3', 'g3'], b: ['d4', 'a7'] }, PU);
  const pt = D.applyMove(p, mv(p, 'g3–h4'));
  assert.equal(D.describeMove(pt, { puste: sq('c3', 8) }), 'gepustet c3');
  assert.equal(D.describeMove(i, { puste: sq(28, 10) }), 'gepustet 28');
  assert.equal(D.describeMove(s, null), '?');
  const keys = D.legalMoves(i2).concat(D.legalMoves(i)).map(D.moveKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(D.moveKey({ puste: 5 }), 'p5');
  assert.equal(D.moveKey(null), '');
});

// ---------- Bot (Kurzprüfung; Stärke im Schwarmtest) ----------

test('Bot: alle Stufen liefern legale Züge; Stufe 1/2 deterministisch bei gleichem rng', () => {
  for (const opts of [DE, INT, { rules: 'deutsch', pusten: true, kurz: true }]) {
    for (const level of [1, 2]) {
      const play = (seed) => {
        const rng = mulberry32(seed), out = [];
        let s = D.initialState(opts);
        for (let k = 0; k < 30 && !s.over; k++) {
          const m = chooseMove(s, { level, rng });
          assert.equal(D.isLegal(s, m), true);
          out.push(D.moveKey(m));
          s = D.applyMove(s, m);
        }
        return out.join(' ');
      };
      assert.equal(play(11), play(11), `Stufe ${level} nicht deterministisch`);
    }
  }
  const s = pos({ W: ['a1'], b: ['d4', 'a7'] });
  assert.equal(D.moveKey(chooseMove(s, { level: 3, timeMs: 50 })), D.moveKey(mv(s, 'a1×e5')));
  assert.equal(chooseMove(D.applyMove(pos({ w: ['c3'], b: ['d4'] }), mv(pos({ w: ['c3'], b: ['d4'] }), 'c3×e5'))), null);
});

test('Bot: Stufe 3 hält das Zeitlimit (timeMs + 50 ms), Stufe 2 nutzt Pusten', () => {
  const s = D.initialState(INT);
  const t = performance.now();
  const m = chooseMove(s, { level: 3, timeMs: 150, rng: mulberry32(1) });
  const dt = performance.now() - t;
  assert.ok(D.isLegal(s, m));
  assert.ok(dt <= 200, `Stufe 3 brauchte ${dt.toFixed(0)} ms`);
  const p = pos({ w: ['b2', 'c3', 'g3'], b: ['d4', 'a7'] }, PU);
  const pt = D.applyMove(p, mv(p, 'g3–h4'));
  assert.equal(D.describeMove(pt, chooseMove(pt, { level: 2, rng: mulberry32(3) })), 'gepustet c3');
});

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen – Laufzeit ${(performance.now() - t0).toFixed(0)} ms`);
process.exit(bad ? 1 : 0);
