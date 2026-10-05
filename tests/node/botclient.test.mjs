// Bot-Anbindung (src/botclient.js) mit Worker-Attrappe: Zeitlimit → Zug im Hauptthread und neuer Worker,
// normale Antwort, Bewertungen „Wer gewinnt?“ zusammengefasst (höchstens eine in Arbeit, nur die neueste wartet).
// Aufruf: node tests/node/botclient.test.mjs
import assert from 'node:assert/strict';
import { chooseBotMove, evaluateBoard, setWorkerFactory, BOT_LIMIT } from '../../src/botclient.js';
import { gameOf } from '../../src/games/registry.js';

let fails = 0;
async function ok(name, fn) {
  try { await fn(); console.log('✅ ' + name); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Attrappe: merkt sich Nachrichten; answer(i, v) antwortet auf die i-te
class StubWorker {
  constructor(log) { this.posted = []; this.terminated = false; this.onmessage = null; this.onerror = null; log.push(this); }
  postMessage(m) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  answer(i, move) { this.onmessage({ data: { id: this.posted[i].id, move } }); }
}

const muehle = gameOf('muehle').engine;
const gs0 = muehle.initialState();

await ok('Worker antwortet nie → nach dem Zeitlimit Zug im Hauptthread, Worker beendet, Notiz im Tisch', async () => {
  const made = [];
  setWorkerFactory(() => new StubWorker(made));
  BOT_LIMIT.ms = 80;
  const notes = [];
  const t0 = Date.now();
  const move = await chooseBotMove('muehle', gs0, 2, { note: (x) => notes.push(x) });
  assert.ok(Date.now() - t0 >= 70, 'erst nach dem Zeitlimit');
  assert.ok(muehle.isLegal(gs0, move), 'legaler Zug ' + JSON.stringify(move));
  assert.equal(made.length, 1);
  assert.equal(made[0].terminated, true, 'hängender Worker beendet');
  assert.equal(notes.length, 1);
  assert.match(notes[0], /Zeitlimit/);
  // nächster Zug: neuer Worker, diesmal mit Antwort
  const p = chooseBotMove('muehle', gs0, 2);
  await sleep(5);
  assert.equal(made.length, 2, 'neuer Worker angelegt');
  made[1].answer(0, { to: 7 });
  assert.deepEqual(await p, { to: 7 }, 'Antwort des Workers');
});

await ok('Bewertungen: höchstens eine in Arbeit, die neueste wartet, ältere werden verworfen', async () => {
  const made = [];
  setWorkerFactory(() => new StubWorker(made));
  BOT_LIMIT.ms = 5000;
  const res = [];
  const p1 = evaluateBoard('muehle', gs0, 0).then((r) => res.push(['1', r]), () => res.push(['1', 'verworfen']));
  const p2 = evaluateBoard('muehle', gs0, 0).then((r) => res.push(['2', r]), () => res.push(['2', 'verworfen']));
  const p3 = evaluateBoard('muehle', gs0, 1).then((r) => res.push(['3', r]), () => res.push(['3', 'verworfen']));
  await sleep(5);
  const w = made[0];
  assert.equal(w.posted.length, 1, 'nur eine Bewertung an den Worker');
  assert.deepEqual(res, [['2', 'verworfen']], 'die mittlere ist veraltet');
  w.answer(0, { x: 1 });
  await sleep(5);
  assert.equal(w.posted.length, 2, 'danach die neueste');
  assert.equal(w.posted[1].evalSeat, 1);
  w.answer(1, { x: 3 });
  await Promise.all([p1, p2, p3]);
  assert.deepEqual(res, [['2', 'verworfen'], ['1', { x: 1 }], ['3', { x: 3 }]]);
  // Computer-Zug läuft an der Bewertungs-Schlange vorbei
  const pm = chooseBotMove('muehle', gs0, 1);
  await sleep(5);
  assert.equal(w.posted[2].level, 1);
  w.answer(2, { to: 3 });
  assert.deepEqual(await pm, { to: 3 });
});

await ok('Kein Worker möglich (Node ohne Worker) → direkt im Hauptthread', async () => {
  setWorkerFactory(() => { throw new Error('kein Worker'); });
  const move = await chooseBotMove('muehle', gs0, 1);
  assert.ok(muehle.isLegal(gs0, move));
  const r = await evaluateBoard('muehle', gs0, 0);
  assert.ok(r && typeof r === 'object');
});

console.log(fails ? `\n${fails} Fall/Fälle rot` : '\nBot-Anbindung grün');
process.exit(fails ? 1 : 0);
