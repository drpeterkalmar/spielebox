// Netz-Verbindung (src/net/netlink.js) ohne echtes Netz: Trystero-Raum und Relay als Attrappen (Konstruktor-Optionen
// joinRoom/makeRelay). Prüft: Peer kommt/geht, pid-Lernen über _hi, Dedupe s:i (direkt + Relay), Sitzungswechsel
// (Neuladen → fresh), Relay-Zuschaltung nach relayAfter, Nachrichten nur über Relay, Altersprüfung relativ zur Uhr
// der Gegenstelle (Versatz aus _hi, Grenze 30 min, Zähler stats.tooOld).
// Aufruf: node tests/node/netlink.test.mjs
import assert from 'node:assert/strict';
import { NetLink, LINK_TIMING } from '../../src/net/netlink.js';

let fails = 0;
async function ok(name, fn) {
  try { await fn(); console.log('✅ ' + name); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 2000, what = 'Bedingung') {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('Zeitüberschreitung: ' + what); await sleep(5); }
}
const copy = (x) => JSON.parse(JSON.stringify(x));

// ---- Trystero-Attrappe: Räume je roomId, Peers sehen sich direkt ----
class FakeTrystero {
  constructor() { this.rooms = new Map(); this.n = 0; }
  join = (cfg, roomId) => new FakeRoom(this, roomId, 'peer' + (++this.n));
}
class FakeRoom {
  constructor(net, roomId, peerId) {
    this.net = net; this.roomId = roomId; this.peerId = peerId; this.actions = {}; this.left = false;
    this.onPeerJoin = null; this.onPeerLeave = null;
    const list = net.rooms.get(roomId) || new Set();
    net.rooms.set(roomId, list);
    const others = [...list];
    list.add(this);
    setTimeout(() => { for (const o of others) { if (o.left || this.left) continue; this.onPeerJoin && this.onPeerJoin(o.peerId); o.onPeerJoin && o.onPeerJoin(this.peerId); } }, 1);
  }
  others() { return [...this.net.rooms.get(this.roomId)].filter((o) => o !== this && !o.left); }
  makeAction(name) {
    const a = {
      onMessage: null,
      send: (data, { target } = {}) => {
        for (const o of this.others()) {
          if (target && !target.includes(o.peerId)) continue;
          const text = JSON.stringify(data);
          setTimeout(() => { const b = o.actions[name]; if (!o.left && b && b.onMessage) b.onMessage(JSON.parse(text), { peerId: this.peerId }); }, 1);
        }
        return Promise.resolve();
      }
    };
    this.actions[name] = a;
    return a;
  }
  leave() {
    this.left = true;
    this.net.rooms.get(this.roomId).delete(this);
    for (const o of this.others()) o.onPeerLeave && o.onPeerLeave(this.peerId);
    return Promise.resolve();
  }
}

// ---- Relay-Attrappe: alle Kanäle mit gleichem Topic hören einander ----
class FakeRelayNet {
  constructor() { this.chans = new Set(); this.published = 0; }
  make = (opts) => {
    const net = this;
    const ch = {
      opts,
      start() { net.chans.add(ch); },
      close() { net.chans.delete(ch); },
      publish(content) {
        net.published++;
        for (const o of net.chans) if (o !== ch && o.opts.topic === opts.topic) setTimeout(() => o.opts.onMessage(content), 1);
        return Promise.resolve({ sentTo: 1 });
      },
      status: () => ({ open: 1, total: 1, relays: [] })
    };
    return ch;
  };
}

const WORDS = ['apfel', 'baum', 'wolke'];
async function link(pid, { trystero, relays, relayOnly = false, words = WORDS } = {}) {
  const l = new NetLink({ words, roomId: 'raum-' + words.join('-'), pid, name: 'Name ' + pid, relayOnly, joinRoom: trystero.join, makeRelay: relays.make });
  l.got = [];
  l.fresh = [];
  l.onMessage = (m, from) => l.got.push({ m, from });
  l.onPeers = (peers, fresh) => l.fresh.push(...fresh);
  await l.start();
  return l;
}

await ok('Zwei Geräte im Raum: pid über _hi gelernt, Nachrichten direkt, Peer geht → „weg“', async () => {
  const trystero = new FakeTrystero(), relays = new FakeRelayNet();
  const a = await link('A', { trystero, relays });
  const b = await link('B', { trystero, relays });
  await until(() => a.status().peers.some((p) => p.pid === 'B' && p.via === 'direkt') && b.status().peers.some((p) => p.pid === 'A' && p.via === 'direkt'), 2000, 'pid gelernt');
  assert.ok(a.fresh.includes('B') && b.fresh.includes('A'), 'onPeers mit fresh');
  a.send({ t: 'hello', x: 1 }, 'B');
  b.send({ t: 'state', y: 2 });
  await until(() => b.got.length === 1 && a.got.length === 1, 2000, 'Nachrichten');
  assert.deepEqual(b.got[0].m, { t: 'hello', x: 1 });
  assert.deepEqual(b.got[0].from, { pid: 'A', name: 'Name A', via: 'direct' });
  assert.equal(a.got[0].from.pid, 'B');
  assert.equal(relays.published, 0, 'kein Relay nötig');
  // B geht (Tab zu): A sieht B nicht mehr direkt, ohne Relay = „weg“
  await b.room.leave();
  await until(() => a.status().peers.find((p) => p.pid === 'B').via === 'weg', 2000, 'B weg');
  a.close(); b.close();
});

await ok('Dedupe: dieselbe Nachricht direkt und über Relay kommt nur einmal an (Schlüssel Sitzung:Nummer)', async () => {
  const trystero = new FakeTrystero(), relays = new FakeRelayNet();
  const a = await link('A', { trystero, relays });
  const env = { v: 1, f: 'B', n: 'Name B', s: 'sitzung1', i: 7, ts: Date.now(), m: { t: 'move', k: 1 } };
  a._accept(copy(env), 'direct', 'peerX');
  a._accept(copy(env), 'relay');
  a._accept({ ...copy(env), i: 8 }, 'relay');
  assert.equal(a.got.length, 2, 'i=7 einmal, i=8 einmal');
  assert.deepEqual(a.got.map((g) => g.from.via), ['direct', 'relay']);
  // eigene Nachrichten und fremde Empfänger werden ignoriert
  a._accept({ ...copy(env), f: 'A', i: 9 }, 'relay');
  a._accept({ ...copy(env), i: 10, to: 'C' }, 'relay');
  assert.equal(a.got.length, 2);
  a.close();
});

await ok('Sitzungswechsel: Gegenstelle lädt neu (neue Sitzung) → onPeers meldet sie wieder als fresh', async () => {
  const trystero = new FakeTrystero(), relays = new FakeRelayNet();
  const a = await link('A', { trystero, relays });
  let b = await link('B', { trystero, relays });
  await until(() => a.fresh.includes('B'), 2000, 'B bekannt');
  const n0 = a.fresh.filter((x) => x === 'B').length;
  b.close(); await b.room.leave();
  b = await link('B', { trystero, relays });
  await until(() => a.fresh.filter((x) => x === 'B').length > n0, 2000, 'B wieder fresh');
  // alte Sitzung schickt noch etwas Älteres hinterher → kein erneuter Wechsel
  const n1 = a.fresh.filter((x) => x === 'B').length;
  a._accept({ v: 1, f: 'B', n: 'B', s: 'alt', i: 99, ts: Date.now() - 60000, m: { t: 'hb' } }, 'relay');
  assert.equal(a.fresh.filter((x) => x === 'B').length, n1, 'ältere Sitzung zählt nicht als Neuladen');
  a.close(); b.close();
});

await ok('Relay: nach relayAfter ohne Direktverbindung zugeschaltet; nur über Relay kommen Nachrichten an (verschlüsselt)', async () => {
  const keep = { ...LINK_TIMING };
  LINK_TIMING.relayAfter = 40;
  try {
    const trystero = new FakeTrystero(), relays = new FakeRelayNet();
    const a = await link('A', { trystero, relays });
    assert.equal(a.relay, null);
    await sleep(60);
    a._tick();
    assert.ok(a.relay, 'Relay an');
    assert.equal(a.relayReason, 'keine Direktverbindung');
    // zweites Gerät nur über Relay (?relay=1)
    const b = await link('B', { trystero: new FakeTrystero(), relays, relayOnly: true });
    await until(() => a.status().peers.some((p) => p.pid === 'B' && p.via === 'relay'), 2000, 'B über Relay');
    a.send({ t: 'state', z: 3 }, 'B');
    await until(() => b.got.some((g) => g.m.t === 'state'), 2000, 'Nachricht über Relay');
    assert.equal(b.got.find((g) => g.m.t === 'state').from.via, 'relay');
    // Relay sieht nur verschlüsselte Inhalte
    const sniff = [];
    relays.chans.add({ opts: { topic: a.topic, onMessage: (c) => sniff.push(c) } });
    a.send({ t: 'geheim', text: 'Herz-Ass' });
    await until(() => sniff.length > 0, 2000, 'mitgelesen');
    assert.ok(!sniff.some((c) => c.includes('Herz-Ass') || c.includes('geheim')), 'Klartext auf dem Relay');
    // andere Wörter = anderer Schlüssel: fremde Nachrichten werden verworfen
    const x = await link('X', { trystero: new FakeTrystero(), relays, relayOnly: true, words: ['zug', 'hund', 'katze'] });
    assert.notEqual(x.topic, a.topic);
    a.close(); b.close(); x.close();
  } finally { Object.assign(LINK_TIMING, keep); }
});

await ok('Altersprüfung: falsch gehende Uhr der Gegenstelle (−2 h) wird über ihren Versatz akzeptiert; wirklich alte Nachrichten verworfen und gezählt', async () => {
  const trystero = new FakeTrystero(), relays = new FakeRelayNet();
  const a = await link('A', { trystero, relays });
  const now = Date.now();
  const skew = -2 * 3600000;
  // ohne _hi: Nachricht mit „2 h alter“ Uhr gilt als uralt
  a._accept({ v: 1, f: 'B', n: 'B', s: 's1', i: 1, ts: now + skew, m: { t: 'hb' } }, 'relay');
  assert.equal(a.got.length, 0);
  assert.equal(a.stats.tooOld, 1);
  // _hi mit derselben Uhr → Versatz gelernt → weitere Nachrichten kommen an
  a._accept({ v: 1, f: 'B', n: 'B', s: 's1', i: 2, ts: now + skew, m: { t: '_hi' } }, 'relay');
  a._accept({ v: 1, f: 'B', n: 'B', s: 's1', i: 3, ts: now + skew + 50, m: { t: 'state', q: 1 } }, 'relay');
  assert.equal(a.got.length, 1, 'mit Versatz akzeptiert');
  // richtig gehende Uhr, Nachricht 40 min alt (Relay-Rückblick) → verworfen
  a._accept({ v: 1, f: 'C', n: 'C', s: 's2', i: 1, ts: now, m: { t: '_hi' } }, 'relay');
  a._accept({ v: 1, f: 'C', n: 'C', s: 's2', i: 2, ts: now - 40 * 60000, m: { t: 'state', q: 2 } }, 'relay');
  a._accept({ v: 1, f: 'C', n: 'C', s: 's2', i: 3, ts: now - 20 * 60000, m: { t: 'state', q: 3 } }, 'relay');
  assert.deepEqual(a.got.map((g) => g.m.q), [1, 3], '40 min verworfen, 20 min angenommen (Grenze 30 min)');
  assert.equal(a.stats.tooOld, 2);
  assert.equal(a.status().stats.tooOld, 2, 'im Status (Verbindungs-Blatt)');
  a.close();
});

console.log(fails ? `\n${fails} Fall/Fälle rot` : '\nNetz-Verbindung grün');
process.exit(fails ? 1 : 0);
