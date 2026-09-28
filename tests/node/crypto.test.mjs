// Tests für src/net/crypto.js (ohne Netz). Aufruf: node tests/node/crypto.test.mjs
import assert from 'node:assert/strict';
import { sha256Hex, roomIdFor, relayTopicFor, deriveKey, seal, open } from '../../src/net/crypto.js';

let fehler = 0;
async function fall(name, fn) {
  try {
    await fn();
    console.log('✅ ' + name);
  } catch (e) {
    fehler++;
    console.log('❌ ' + name + '\n   ' + (e && e.stack ? e.stack : e));
  }
}

// base64 an einer Stelle verändern (ein Bit im Ciphertext kippen)
function kippeBit(b64, byteIndex) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  bytes[byteIndex] ^= 0x01;
  return btoa(String.fromCharCode(...bytes));
}

const WOERTER = ['baum', 'wolke', 'ball'];

await fall('sha256Hex: Testvektor "abc"', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

await fall('roomIdFor = sha256Hex der Wörter mit Leerzeichen', async () => {
  const id = await roomIdFor(WOERTER);
  assert.equal(id, await sha256Hex('baum wolke ball'));
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.notEqual(id, await roomIdFor(['baum', 'ball', 'wolke']), 'Reihenfolge zählt');
});

await fall('relayTopicFor = sha256Hex("spielebox-v1/relay/" + roomId), ≠ roomId', async () => {
  const roomId = await roomIdFor(WOERTER);
  const topic = await relayTopicFor(roomId);
  assert.equal(topic, await sha256Hex('spielebox-v1/relay/' + roomId));
  assert.notEqual(topic, roomId);
});

let key1;
await fall('deriveKey: AES-GCM-256, nicht extrahierbar', async () => {
  const t0 = performance.now();
  key1 = await deriveKey(WOERTER);
  const ms = performance.now() - t0;
  assert.equal(key1.type, 'secret');
  assert.equal(key1.algorithm.name, 'AES-GCM');
  assert.equal(key1.algorithm.length, 256);
  assert.equal(key1.extractable, false);
  assert.deepEqual([...key1.usages].sort(), ['decrypt', 'encrypt']);
  await assert.rejects(globalThis.crypto.subtle.exportKey('raw', key1));
  console.log(`   deriveKey (PBKDF2, 150 000 Runden): ${ms.toFixed(0)} ms`);
});

await fall('deriveKey deterministisch: seal mit Schlüssel 1, open mit neu abgeleitetem', async () => {
  const obj = { typ: 'zug', von: 3, nach: [4, 5], n: 17 };
  const box = await seal(key1, obj);
  const key2 = await deriveKey(['baum', 'wolke', 'ball']);
  assert.deepEqual(await open(key2, box), obj);
});

await fall('seal-Format: base64(iv[12] ‖ ciphertext+tag[16])', async () => {
  const box = await seal(key1, { a: 1 });
  assert.match(box, /^[A-Za-z0-9+/]+=*$/);
  const len = atob(box).length;
  assert.equal(len, 12 + JSON.stringify({ a: 1 }).length + 16);
});

await fall('falsche Wörter → open wirft', async () => {
  const box = await seal(key1, { geheim: true });
  const falsch = await deriveKey(['baum', 'wolke', 'balL']);
  await assert.rejects(open(falsch, box));
});

await fall('manipulierter Ciphertext / IV / Tag / Kürzung → open wirft', async () => {
  const box = await seal(key1, { punkte: 42 });
  const n = atob(box).length;
  await assert.rejects(open(key1, kippeBit(box, 20)), 'Ciphertext');
  await assert.rejects(open(key1, kippeBit(box, 3)), 'IV');
  await assert.rejects(open(key1, kippeBit(box, n - 1)), 'Tag');
  await assert.rejects(open(key1, btoa(atob(box).slice(0, n - 4))), 'gekürzt');
  await assert.rejects(open(key1, btoa('zu kurz')), 'zu kurz');
  await assert.rejects(open(key1, '!!!kein base64!!!'), 'kein base64');
  await assert.rejects(open(key1, 42), 'kein String');
});

await fall('zwei seal-Aufrufe derselben Nachricht → verschiedene Ciphertexte (IV zufällig)', async () => {
  const obj = { gleich: 'nachricht' };
  const a = await seal(key1, obj);
  const b = await seal(key1, obj);
  assert.notEqual(a, b);
  assert.notEqual(atob(a).slice(0, 12), atob(b).slice(0, 12), 'IV verschieden');
  assert.deepEqual(await open(key1, a), obj);
  assert.deepEqual(await open(key1, b), obj);
});

await fall('Unicode-Rundreise (Umlaute, Emoji, Sonderzeichen)', async () => {
  const obj = { name: 'Jürgen Größe ÄÖÜ ß', emoji: '🎲♟️🃏👩‍👩‍👧', zh: '棋盘', text: 'a"b\\c\n\u0000', arr: [1.5, null, true] };
  assert.deepEqual(await open(key1, await seal(key1, obj)), obj);
  // Unicode-Wörter für den Schlüssel
  const k = await deriveKey(['bär', 'größe', 'öl']);
  assert.deepEqual(await open(k, await seal(k, obj)), obj);
  assert.equal(await roomIdFor(['bär', 'größe', 'öl']), await sha256Hex('bär größe öl'));
});

await fall('größere Nachricht (100 kB) übersteht base64-Umwandlung', async () => {
  const obj = { daten: 'x'.repeat(100000) + 'ende' };
  assert.deepEqual(await open(key1, await seal(key1, obj)), obj);
});

console.log(fehler ? `\n${fehler} Fehler` : '\nalle Krypto-Tests grün');
process.exit(fehler ? 1 : 0);
