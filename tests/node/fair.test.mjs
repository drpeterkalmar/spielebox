// Fair Play (src/net/fair.js): SHA-256, Hash-Ketten, Würfel/Mischung gleichverteilt, Manipulation wird erkannt.
// Aufruf: node tests/node/fair.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256, chainLink, verifyLink, mixLinks, diceFrom, permFrom, verifyFair, CHAIN } from '../../src/net/fair.js';

let fails = 0;
function test(name, fn) {
  try { const info = fn(); console.log(`✅ ${name}${info ? ` (${info})` : ''}`); } catch (e) { fails++; console.log(`❌ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n   ')}`); }
}

test('SHA-256 = Node-crypto (leer, abc, lang, Umlaute)', () => {
  for (const s of ['', 'abc', 'x'.repeat(1000), 'Schnapsen – Herz-Daus ÄÖÜß', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64)]) {
    assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
  }
});

test('Hash-Kette: jedes Glied passt zum vorigen, fremdes Glied nicht', () => {
  const c0 = chainLink('seed-a', 0);
  let prev = c0;
  for (let k = 1; k <= 20; k++) { const l = chainLink('seed-a', k); assert.ok(verifyLink(prev, l)); prev = l; }
  assert.ok(!verifyLink(c0, chainLink('seed-b', 1)));
  assert.ok(!verifyLink(c0, chainLink('seed-a', 2)), 'Glied übersprungen');
  assert.equal(chainLink('seed-a', CHAIN).length, 64);
});

test('Würfel gleichverteilt (60 000 Würfe, jede Augenzahl 16,7 % ± 0,6)', () => {
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 30000; i++) { const [a, b] = diceFrom(sha256('w' + i)); cnt[a]++; cnt[b]++; }
  for (let v = 1; v <= 6; v++) assert.ok(Math.abs(cnt[v] / 60000 - 1 / 6) < 0.006, `${v}: ${cnt[v]}`);
  return cnt.slice(1).join(' / ');
});

test('Mischung ist Permutation, Positionen gleichverteilt', () => {
  const pos0 = new Array(20).fill(0);
  for (let i = 0; i < 20000; i++) {
    const p = permFrom(sha256('m' + i), 20);
    assert.equal(new Set(p).size, 20);
    pos0[p[0]]++;
  }
  for (const c of pos0) assert.ok(Math.abs(c / 20000 - 0.05) < 0.008, String(c));
});

test('Manipulation erkannt: falscher Wurf, falscher Seed, andere Mischung, fehlendes Glied', () => {
  const commits = [chainLink('A', 0), chainLink('B', 0)];
  const log = [];
  for (let k = 1; k <= 3; k++) {
    const links = [chainLink('A', k), chainLink('B', k)];
    log.push({ k, kind: 'dice', links, value: diceFrom(mixLinks(links, k, 'dice')) });
  }
  const links4 = [chainLink('A', 4), chainLink('B', 4)];
  log.push({ k: 4, kind: 'shuffle', n: 20, links: links4, value: permFrom(mixLinks(links4, 4, 'shuffle'), 20) });
  const ok = verifyFair({ commits, log });
  assert.ok(ok.ok && ok.checked === 4, JSON.stringify(ok));
  const clone = () => JSON.parse(JSON.stringify({ commits, log }));
  let f = clone(); f.log[1].value = f.log[1].value[0] === 6 ? [1, 1] : [6, 6];
  assert.ok(!verifyFair(f).ok, 'Wurf');
  f = clone(); f.log[2].links[0] = chainLink('X', 3);
  assert.ok(!verifyFair(f).ok, 'Seed');
  f = clone(); f.log[3].value = [...f.log[3].value].reverse();
  assert.ok(!verifyFair(f).ok, 'Mischung');
  f = clone(); f.log[0].links[1] = null;
  assert.ok(!verifyFair(f).ok, 'fehlendes Glied');
  // Lücke durch ein ungeprüftes Ereignis wird überbrückt
  f = clone(); f.log[1] = { k: 2, kind: 'dice', fallback: true, value: [3, 4] };
  const g = verifyFair(f);
  assert.ok(g.ok && g.unchecked === 1, JSON.stringify(g));
});

console.log(fails ? `\n${fails} rot` : '\nFair Play grün');
process.exit(fails ? 1 : 0);
