// Speicher (src/store.js) mit localStorage-Attrappe: Online-Tische entprellt geschrieben (Zähler der Schreibvorgänge),
// Liste „Weiterspielen“ nur bei Änderung, sofort beim Verlassen, Speicher voll → ältesten Tisch verwerfen.
// Aufruf: node tests/node/store.test.mjs
import assert from 'node:assert/strict';

class FakeStorage {
  constructor() { this.m = new Map(); this.writes = {}; this.limit = Infinity; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    const size = [...this.m].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0) + v.length;
    if (size > this.limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.writes[k] = (this.writes[k] || 0) + 1;
    this.m.set(k, v);
  }
  removeItem(k) { this.m.delete(k); }
}
const ls = new FakeStorage();
globalThis.localStorage = ls;
// Seiten-Ereignisse wie im Browser (Node hat kein globales addEventListener)
const handlers = {};
globalThis.addEventListener = (type, fn) => { (handlers[type] ||= []).push(fn); };
const fire = (type) => (handlers[type] || []).forEach((fn) => fn());
const store = await import('../../src/store.js');

let fails = 0;
async function ok(name, fn) {
  try { await fn(); console.log('✅ ' + name); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const table = (seq, status = 'play', game = 'ludo') => ({ game, opts: {}, status, seq, seats: [{ name: 'A' }, { name: 'B' }], gs: { x: 'y'.repeat(200) } });
const entry = (roomId, t) => ({ roomId, words: ['a', 'b', 'c'], want: 'play', table: t });

await ok('30 Stände in schneller Folge → ein Schreibvorgang für den Tisch, Liste einmal; loadTable liefert sofort den neuesten', async () => {
  for (let i = 1; i <= 30; i++) {
    store.saveTable(entry('r1', table(i)));
    assert.equal(store.loadTable('r1').table.seq, i, 'neuester Stand sofort lesbar');
  }
  assert.equal(ls.writes['sb.t.r1'] || 0, 0, 'noch nichts geschrieben');
  await sleep(store.SAVE_MS + 80);
  assert.equal(ls.writes['sb.t.r1'], 1, 'genau einmal geschrieben');
  assert.equal(JSON.parse(ls.getItem('sb.t.r1')).table.seq, 30);
  assert.equal(ls.writes['sb.tables'], 1);
});

await ok('Weitere Züge ohne Änderung an Sitzen/Status → Tisch neu, Liste nicht; Statuswechsel → Liste neu', async () => {
  store.saveTable(entry('r1', table(31)));
  store.flushTables();
  assert.equal(ls.writes['sb.t.r1'], 2);
  assert.equal(ls.writes['sb.tables'], 1, 'Liste unverändert');
  store.saveTable(entry('r1', table(32, 'over')));
  store.flushTables();
  assert.equal(ls.writes['sb.tables'], 2, 'Status geändert → Liste');
  assert.equal(store.tableList()[0].status, 'over');
});

await ok('Anderer Tisch wird geöffnet → steht vorn; zurück zum ersten → wieder vorn', async () => {
  store.saveTable(entry('r2', table(1)));
  store.flushTables();
  assert.deepEqual(store.tableList().map((e) => e.roomId), ['r2', 'r1']);
  store.saveTable(entry('r1', table(33, 'over')));
  store.flushTables();
  assert.deepEqual(store.tableList().map((e) => e.roomId), ['r1', 'r2']);
});

await ok('Sofort schreiben beim Verlassen der Seite (pagehide)', async () => {
  const before = ls.writes['sb.t.r2'];
  store.saveTable(entry('r2', table(2)));
  fire('pagehide');
  assert.equal(ls.writes['sb.t.r2'], before + 1);
  store.saveTable(entry('r2', table(3)));
  globalThis.document = { visibilityState: 'hidden' };
  fire('visibilitychange');
  assert.equal(ls.writes['sb.t.r2'], before + 2, 'auch bei visibilitychange: hidden');
});

await ok('Speicher voll → ältesten anderen Tisch verwerfen, dann klappt es', async () => {
  store.saveTable(entry('r3', table(1)));
  store.flushTables();
  assert.deepEqual(store.tableList().map((e) => e.roomId), ['r3', 'r2', 'r1']);
  const used = [...ls.m.values()].reduce((a, v) => a + v.length, 0);
  const big = table(2); big.gs.x = 'z'.repeat(900);
  // der größere Stand passt nur, wenn ein alter Tisch geht
  ls.limit = used + JSON.stringify(entry('r3', big)).length - ls.getItem('sb.t.r3').length - 50;
  store.saveTable(entry('r3', big));
  store.flushTables();
  assert.equal(JSON.parse(ls.getItem('sb.t.r3')).table.gs.x.length, 900, 'neuer Stand geschrieben');
  assert.equal(ls.getItem('sb.t.r1'), null, 'ältester Tisch verworfen');
  assert.deepEqual(store.tableList().map((e) => e.roomId), ['r3', 'r2']);
  ls.limit = Infinity;
});

console.log(fails ? `\n${fails} Fall/Fälle rot` : '\nSpeicher grün');
process.exit(fails ? 1 : 0);
