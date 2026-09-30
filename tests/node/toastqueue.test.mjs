// Meldungs-Warteschlange (src/ui/toastqueue.js): eine Meldung nach der anderen, jede ≥ 5 s, Antippen schließt,
// keine Doppelten. Mit künstlicher Uhr.
// Aufruf: node tests/node/toastqueue.test.mjs
import assert from 'node:assert/strict';
import { ToastQueue, TOAST_MS, TOAST_MAX } from '../../src/ui/toastqueue.js';

let fails = 0, passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('✅ ' + name); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}

// künstliche Uhr: setTimeout/clearTimeout, tick(ms) lässt die Zeit laufen
function clock() {
  let now = 0, id = 0;
  const due = new Map();
  return {
    setTimeout(fn, ms) { due.set(++id, { at: now + ms, fn }); return id; },
    clearTimeout(i) { due.delete(i); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...due.entries()].filter(([, d]) => d.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        due.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
    get now() { return now; }
  };
}

function setup() {
  const c = clock();
  const log = [];
  const q = new ToastQueue({ timers: c, show: (it) => log.push(['show', it.text, c.now]), hide: (it) => log.push(['hide', it.text, c.now]) });
  return { c, q, log, visible: () => (q.cur ? q.cur.text : null) };
}

ok('Standard 5 s (vorher 2,6 s)', () => {
  assert.equal(TOAST_MS, 5000);
});

ok('Nacheinander statt übereinander: B erscheint erst, wenn A 5 s stand', () => {
  const { c, q, log, visible } = setup();
  q.push('A'); q.push('B'); q.push('C');
  assert.equal(visible(), 'A');
  assert.equal(q.pending, 2);
  c.tick(4999);
  assert.equal(visible(), 'A');
  c.tick(1);
  assert.equal(visible(), 'B');
  c.tick(5000);
  assert.equal(visible(), 'C');
  c.tick(5000);
  assert.equal(visible(), null);
  assert.deepEqual(log.map((x) => x.slice(0, 2).join(' ')), ['show A', 'hide A', 'show B', 'hide B', 'show C', 'hide C']);
  // jede stand genau 5 s
  const shows = log.filter((x) => x[0] === 'show').map((x) => x[2]);
  assert.deepEqual(shows, [0, 5000, 10000]);
});

ok('Antippen schließt sofort, die nächste kommt gleich', () => {
  const { c, q, visible } = setup();
  const a = q.push('A'); q.push('B');
  c.tick(800);
  q.close(a);
  assert.equal(visible(), 'B');
  c.tick(4999);
  assert.equal(visible(), 'B', 'B hat wieder volle 5 s');
  c.tick(1);
  assert.equal(visible(), null);
  q.close(a);   // doppeltes Schließen schadet nicht
  assert.equal(visible(), null);
});

ok('Gleiche Meldung nicht doppelt, eigene Dauer möglich (nie unter 0), Schlange begrenzt', () => {
  const { c, q, visible } = setup();
  q.push('Zug abgelehnt'); q.push('Zug abgelehnt'); q.push('X'); q.push('X');
  assert.equal(q.pending, 1);
  c.tick(5000);
  assert.equal(visible(), 'X');
  c.tick(5000);
  q.push('lang', 8000);
  c.tick(7999);
  assert.equal(visible(), 'lang');
  c.tick(1);
  assert.equal(visible(), null);
  for (let i = 0; i < 20; i++) q.push('M' + i);
  assert.equal(q.pending, TOAST_MAX);
  assert.equal(visible(), 'M0');
});

console.log(fails ? `\n${fails} Toast-Test(s) rot` : `\nToast-Tests: ${passed} grün`);
process.exitCode = fails ? 1 : 0;
