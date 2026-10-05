// Fair Play am Tisch (src/net/fairhost.js): Log in Stücken, Stücke zusammenführen, Zeitpunkt der Veröffentlichung von
// Mischungen (publishShuffleWhen), neue Zufallsrunde (_restartFair), Kettenglieder prüfen auch ohne fairPriv.
// Aufruf: node tests/node/fairhost.test.mjs
import assert from 'node:assert/strict';
import { TableSession, newTable } from '../../src/net/table.js';
import { FAIR_CHUNK, fairChunks, mergeFairLog, sameFair, publishShuffleNow } from '../../src/net/fairhost.js';
import { chainLink, verifyFair } from '../../src/net/fair.js';

let fails = 0;
function test(name, fn) {
  try { const info = fn(); console.log(`✅ ${name}${info ? ` (${info})` : ''}`); } catch (e) { fails++; console.log(`❌ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n   ')}`); }
}
const entry = (k) => ({ k, kind: 'dice', n: 1, links: ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)], value: [1 + (k % 6)] });
const log = Array.from({ length: 120 }, (_, i) => entry(i + 1));

test('fairChunks: Stücke ≤ FAIR_CHUNK, lückenlos, ab from', () => {
  const fair = { round: 3, gen: 1, log };
  const cs = fairChunks(fair, 0);
  assert.ok(cs.length > 1, 'mehrere Stücke');
  for (const c of cs) {
    assert.ok(JSON.stringify(c.log).length <= FAIR_CHUNK + 2, 'Stück zu groß');
    assert.equal(c.round, 3);
    assert.equal(c.gen, 1);
  }
  assert.deepEqual(cs.flatMap((c) => c.log), log);
  cs.forEach((c, i) => assert.equal(c.from, i ? cs[i - 1].from + cs[i - 1].log.length : 0));
  const tail = fairChunks(fair, 100);
  assert.equal(tail[0].from, 100);
  assert.deepEqual(tail.flatMap((c) => c.log), log.slice(100));
  assert.deepEqual(fairChunks(fair, 120), []);
  assert.deepEqual(fairChunks(null, 0), []);
  return `${cs.length} Stücke für ${log.length} Würfe`;
});

test('mergeFairLog: anhängen, Lücke lässt alles stehen, Überlappung, verspätetes Stück behält den Rest', () => {
  const a = log.slice(0, 10);
  assert.deepEqual(mergeFairLog(a, { from: 10, log: log.slice(10, 15) }), log.slice(0, 15));
  assert.equal(mergeFairLog(a, { from: 12, log: log.slice(12, 15) }), a, 'Lücke → unverändert');
  assert.deepEqual(mergeFairLog(a, { from: 8, log: log.slice(8, 12) }), log.slice(0, 12), 'Überlappung');
  assert.deepEqual(mergeFairLog(log.slice(0, 20), { from: 5, log: log.slice(5, 7) }), log.slice(0, 20), 'verspätet');
  for (const bad of [null, {}, { from: -1, log: [] }, { from: 1.5, log: [] }, { from: 0, log: 'x' }]) assert.equal(mergeFairLog(a, bad), a);
});

test('sameFair: Runde und Generation (fehlende Generation = 0)', () => {
  assert.ok(sameFair({ round: 2 }, { round: 2, gen: 0 }));
  assert.ok(!sameFair({ round: 2, gen: 1 }, { round: 2 }));
  assert.ok(!sameFair({ round: 2 }, { round: 3 }));
  assert.ok(!sameFair(null, { round: 2 }));
});

test('publishShuffleNow: Engine-Feld publishShuffleWhen, sonst Phase deal/bet (ohne phase(): immer)', () => {
  assert.equal(publishShuffleNow({ publishShuffleWhen: (gs) => gs.x === 1, phase: () => 'deal' }, { x: 2 }), false);
  assert.equal(publishShuffleNow({ publishShuffleWhen: (gs) => gs.x === 1 }, { x: 1 }), true);
  assert.equal(publishShuffleNow({ phase: (gs) => gs.ph }, { ph: 'deal' }), true);
  assert.equal(publishShuffleNow({ phase: (gs) => gs.ph }, { ph: 'bet' }), true);
  assert.equal(publishShuffleNow({ phase: (gs) => gs.ph }, { ph: 'play' }), false);
  assert.equal(publishShuffleNow({}, {}), true);
});

// Host allein mit Computer-Sitzen (alle Glieder sofort bekannt), Netz-Attrappe ohne Gegenstellen
const link = { send() {}, status: () => ({ peers: [] }) };
function hostLudo(players = 3) {
  const me = { pid: 'H', name: 'Peter' };
  const t = newTable({ game: 'ludo', opts: { players }, host: me });
  for (let i = 1; i < players; i++) t.seats[i] = { pid: 'bot' + i, name: 'Computer', bot: 2 };
  t.status = 'play';
  return new TableSession({ mode: 'online', me, table: t, link, secret: 'geheim', chain: 64 });
}
const roll = (s) => { s.table.gs = { ...s.table.gs, phase: 'rolling', die: null }; assert.ok(s._resolveChance()); };

test('_restartFair: neue Generation, neue Commits aller Sitze, Prüfung je Generation grün', () => {
  const s = hostLudo();
  s._ensureFair();
  for (let i = 0; i < 3; i++) roll(s);
  const f0 = s.table.fair;
  assert.equal(f0.log.length, 3);
  assert.ok(verifyFair(f0).ok);
  s._restartFair();
  const f1 = s.table.fair;
  assert.equal(f1.gen, 1);
  assert.equal(f1.k, 0);
  assert.deepEqual(f1.log, []);
  assert.ok(f1.commits.every(Boolean), 'Host und Computer haben sofort neue Commits');
  f1.commits.forEach((c, i) => assert.notEqual(c, f0.commits[i], 'neue Kette je Generation'));
  for (let i = 0; i < 3; i++) roll(s);
  assert.ok(verifyFair(s.table.fair).ok, 'Prüfung der neuen Generation');
  assert.equal(s.table.fair.log.length, 3);
});

test('_takeReveal: passendes Glied angenommen, falsches abgelehnt – auch ohne fairPriv (nach Übernahme)', () => {
  const me = { pid: 'H', name: 'Peter' };
  const t = newTable({ game: 'ludo', opts: { players: 2 }, host: me });
  t.seats[1] = { pid: 'G', name: 'Anna' };
  t.status = 'play';
  const s = new TableSession({ mode: 'online', me, table: t, link, secret: 'geheim', chain: 64 });
  s._ensureFair();
  t.fair.commits[1] = chainLink('gast', 0, 64);
  delete t.fairPriv;                                   // wie bei einem Gast, der Host geworden ist
  assert.equal(s._takeReveal(1, { k: 1, link: chainLink('fremd', 1, 64) }), false);
  assert.equal(s._takeReveal(1, { k: 1, link: chainLink('gast', 1, 64) }), true);
  assert.ok(t.fairPriv && t.fairPriv.pending[1][1], 'fairPriv angelegt, Glied gemerkt');
  assert.equal(s._takeReveal(1, { k: 3, link: chainLink('gast', 3, 64) }), false, 'nur das nächste Ereignis');
});

console.log(fails ? `\n${fails} rot` : '\nFair-Host grün');
process.exit(fails ? 1 : 0);
