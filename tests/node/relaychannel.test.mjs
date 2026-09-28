// Tests für src/net/relaychannel.js OHNE echtes Netz: globalThis.WebSocket wird durch
// einen Fake ersetzt, der Nostr-Relays simuliert. Events/Signaturen kommen echt aus lib/trystero.js.
// Aufruf: node tests/node/relaychannel.test.mjs
import assert from 'node:assert/strict';
import { createEvent } from '../../lib/trystero.js';
import { RelayChannel } from '../../src/net/relaychannel.js';

// ---- Fake-Relays ----

const relays = new Map(); // url → FakeRelay

// Filter nach NIP-01 (nur was der Kanal nutzt)
function passt(filter, ev) {
  if (filter.ids && !filter.ids.includes(ev.id)) return false;
  if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
  if (filter.since !== undefined && ev.created_at < filter.since) return false;
  if (filter['#x'] && !ev.tags.some((t) => t[0] === 'x' && filter['#x'].includes(t[1]))) return false;
  return true;
}

class FakeRelay {
  // modus: 'ok' | 'verweigern' (keine Verbindung) | 'auth' (auth-required) | 'restricted' (EVENT abgelehnt)
  //        | 'stumm' (nimmt an, antwortet nie)
  constructor(url, modus = 'ok') {
    this.url = url;
    this.modus = modus;
    this.sockets = new Set();
    this.verbindungen = 0;
    this.reqs = [];
    this.events = 0;
    this.schlucken = 0; // so viele EVENTs ohne OK und ohne Weitergabe verschlucken
    this.geschluckt = null; // Socket, dessen Event zuletzt verschluckt wurde
    relays.set(url, this);
  }
  annehmen(ws) {
    if (this.modus === 'verweigern') ws._scheitern();
    else ws._oeffnen();
  }
  verarbeiten(ws, text) {
    if (this.modus === 'stumm') return;
    const msg = JSON.parse(text);
    if (msg[0] === 'REQ') {
      this.reqs.push({ ws, subId: msg[1], filter: msg[2] });
      if (this.modus === 'auth') return ws._liefern(['CLOSED', msg[1], 'auth-required: bitte anmelden']);
      ws.subs.set(msg[1], msg.slice(2));
      ws._liefern(['EOSE', msg[1]]);
    } else if (msg[0] === 'CLOSE') {
      ws.subs.delete(msg[1]);
    } else if (msg[0] === 'EVENT') {
      this.events++;
      const ev = msg[1];
      if (this.schlucken > 0) {
        this.schlucken--;
        this.geschluckt = ws;
        return;
      }
      if (this.modus === 'restricted') return ws._liefern(['OK', ev.id, false, 'restricted: nur für zahlende Mitglieder']);
      ws._liefern(['OK', ev.id, true, '']);
      this.verteilen(ev);
    }
  }
  // wie ein Relay: Event an alle passenden Abos (auch an den Absender)
  verteilen(ev) {
    for (const ws of this.sockets) {
      for (const [subId, filter] of ws.subs) {
        if (filter.some((f) => passt(f, ev))) ws._liefern(['EVENT', subId, ev]);
      }
    }
  }
  // Event an alle Abos schicken, ohne Filter (für Tag-/ID-Prüfung im Kanal)
  ungefiltert(ev) {
    for (const ws of this.sockets) for (const subId of ws.subs.keys()) ws._liefern(['EVENT', subId, ev]);
  }
  senden(msg) {
    for (const ws of this.sockets) ws._liefern(msg);
  }
  // Relay bricht Verbindungen ab (alle oder nur die mit wahr = welche(ws))
  abbrechen(welche = () => true) {
    for (const ws of [...this.sockets]) if (welche(ws)) ws._abbruch(1006);
  }
}

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.subs = new Map();
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this.relay = relays.get(url);
    if (!this.relay) throw new SyntaxError('unbekannte URL ' + url);
    this.relay.verbindungen++;
    setTimeout(() => this.relay.annehmen(this), 5);
  }
  send(data) {
    if (this.readyState !== 1) throw new Error('InvalidStateError');
    const text = String(data);
    setTimeout(() => {
      if (this.readyState === 1) this.relay.verarbeiten(this, text);
    }, 1);
  }
  close() {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.relay.sockets.delete(this);
    setTimeout(() => this.onclose?.({ code: 1000, reason: '' }), 1);
  }
  _oeffnen() {
    if (this.readyState !== 0) return;
    this.readyState = 1;
    this.relay.sockets.add(this);
    this.onopen?.({});
  }
  _scheitern() {
    if (this.readyState !== 0) return;
    this.readyState = 3;
    this.onerror?.({});
    this.onclose?.({ code: 1006, reason: '' });
  }
  _abbruch(code) {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.relay.sockets.delete(this);
    setTimeout(() => this.onclose?.({ code, reason: '' }), 1);
  }
  _liefern(msg) {
    const text = JSON.stringify(msg);
    setTimeout(() => {
      if (this.readyState === 1) this.onmessage?.({ data: text });
    }, 1);
  }
}
Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, writable: true, configurable: true });

// ---- Hilfen ----

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

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, ms = 3000, text = 'Bedingung') {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (fn()) return;
    await schlaf(10);
  }
  throw new Error('Zeitüberschreitung: ' + text);
}

let nr = 0;
const zufallsTopic = () => 'test-topic-' + (++nr) + '-' + Math.random().toString(16).slice(2);

// Kanal mit Mitschrift von Nachrichten und Statusmeldungen
function kanal(urls, topic, extra = {}) {
  const msgs = [];
  const stati = [];
  const ch = new RelayChannel({
    urls,
    topic,
    onMessage: (content, meta) => msgs.push({ content, meta }),
    onStatus: (s) => stati.push(s),
    ...extra
  });
  return { ch, msgs, stati, rel: (url) => ch.status().relays.find((r) => r.url === url) };
}

const offene = []; // zum Aufräumen
function neu(urls, topic, extra) {
  const k = kanal(urls, topic, extra);
  offene.push(k.ch);
  return k;
}

// ---- Fälle ----

await fall('Dedupe: gleiches Event über 3 Relays → 1× onMessage', async () => {
  const urls = ['wss://d1', 'wss://d2', 'wss://d3'].map((u) => new FakeRelay(u).url);
  const topic = zufallsTopic();
  const B = neu(urls, topic);
  B.ch.start();
  await warteBis(() => B.ch.status().open === 3, 2000, '3 Relays offen');
  await warteBis(() => urls.every((u) => relays.get(u).reqs.length === 1), 1000, 'Abos');
  const text = await createEvent(topic, 'hallo');
  const ev = JSON.parse(text)[1];
  for (const u of urls) relays.get(u).verteilen(ev);
  await warteBis(() => B.ch.status().relays.every((r) => r.received === 1), 2000, 'alle empfangen');
  await schlaf(30);
  assert.equal(B.msgs.length, 1);
  assert.equal(B.msgs[0].content, 'hallo');
  assert.equal(B.msgs[0].meta.eventId, ev.id);
  assert.equal(B.msgs[0].meta.createdAt, ev.created_at);
  assert.ok(urls.includes(B.msgs[0].meta.relay));
  // später nochmal dasselbe Event → wieder nicht gemeldet
  relays.get(urls[0]).verteilen(ev);
  await warteBis(() => B.rel(urls[0]).received === 2, 1000, 'erneut empfangen');
  assert.equal(B.msgs.length, 1);
  B.ch.close();
});

await fall('Subscription: Trystero-Filter (kind, #x), since mit 60 s Toleranz; sinceSlackSec 0 = exakt', async () => {
  const u = new FakeRelay('wss://s1').url;
  const topic = zufallsTopic();
  const A = neu([u], topic);
  const B = neu([u], topic, { sinceSlackSec: 0 });
  A.ch.start();
  B.ch.start();
  await warteBis(() => relays.get(u).reqs.length === 2, 2000, '2 REQs');
  const jetzt = Math.floor(Date.now() / 1000);
  const [fa, fb] = relays.get(u).reqs.map((r) => r.filter);
  const kind = 20000 + topic.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 10000;
  assert.deepEqual(fa.kinds, [kind]);
  assert.deepEqual(fa['#x'], [topic]);
  assert.ok(Math.abs(fa.since - (jetzt - 60)) <= 1, 'since ≈ jetzt − 60');
  assert.ok(Math.abs(fb.since - jetzt) <= 1, 'since ≈ jetzt');
  A.ch.close();
  B.ch.close();
});

await fall('Zustellung A→B, eigene Events nicht gemeldet, status()-Zahlen stimmen', async () => {
  const urls = ['wss://z1', 'wss://z2', 'wss://z3'].map((u) => new FakeRelay(u).url);
  const topic = zufallsTopic();
  const A = neu(urls, topic);
  const B = neu(urls, topic);
  A.ch.start();
  B.ch.start();
  await warteBis(() => A.ch.status().open === 3 && B.ch.status().open === 3, 2000, 'offen');
  await warteBis(() => urls.every((u) => relays.get(u).reqs.length === 2), 1000, 'Abos');
  const r1 = await A.ch.publish('zug-1');
  const r2 = await A.ch.publish('zug-2');
  const r3 = await B.ch.publish('antwort-1');
  assert.equal(r1.sentTo, 3);
  assert.match(r1.eventId, /^[0-9a-f]{64}$/);
  assert.notEqual(r1.eventId, r2.eventId);
  await warteBis(() => B.msgs.length === 2 && A.msgs.length === 1, 2000, 'Zustellung');
  await warteBis(() => A.ch.status().relays.every((r) => r.ok === 2), 1000, 'OKs bei A');
  await schlaf(50);
  assert.deepEqual(B.msgs.map((m) => m.content), ['zug-1', 'zug-2']);
  assert.deepEqual(A.msgs.map((m) => m.content), ['antwort-1'], 'A sieht nur B, nicht die eigenen Echos');
  assert.equal(A.msgs[0].meta.eventId, r3.eventId);
  const sA = A.ch.status();
  const sB = B.ch.status();
  assert.equal(sA.open, 3);
  assert.equal(sA.total, 3);
  for (const r of sA.relays) {
    assert.equal(r.state, 'open');
    assert.equal(r.sent, 2);
    assert.equal(r.ok, 2);
    assert.equal(r.rejected, 0);
    assert.equal(r.received, 1);
    assert.equal(typeof r.lastAckMs, 'number');
    assert.ok(r.lastAckMs >= 0 && r.lastAckMs < 1000);
    assert.equal(r.lastError, null);
    assert.deepEqual(Object.keys(r).sort(), ['lastAckMs', 'lastError', 'ok', 'received', 'rejected', 'sent', 'state', 'url']);
  }
  for (const r of sB.relays) {
    assert.equal(r.sent, 1);
    assert.equal(r.ok, 1);
    assert.equal(r.received, 2);
  }
  // onStatus wurde mit dem Endzustand gemeldet
  const letzter = A.stati.at(-1);
  assert.equal(letzter.open, 3);
  assert.equal(letzter.total, 3);
  A.ch.close();
  B.ch.close();
});

await fall('Tag-/Topic- und ID-Prüfung: fremdes Topic und gefälschte ID werden verworfen', async () => {
  const u = new FakeRelay('wss://t1').url;
  const topic = zufallsTopic();
  const B = neu([u], topic);
  B.ch.start();
  await warteBis(() => relays.get(u).reqs.length === 1, 2000, 'Abo');
  const fremd = JSON.parse(await createEvent('anderes-topic', 'fremd'))[1];
  const echt = JSON.parse(await createEvent(topic, 'echt'))[1];
  const gefaelscht = { ...echt, content: 'manipuliert' }; // gleiche ID, anderer Inhalt
  const ohneTag = { ...echt, tags: [] };
  const falscherKind = { ...echt, kind: echt.kind + 1 };
  const relay = relays.get(u);
  relay.ungefiltert(fremd);
  relay.ungefiltert(gefaelscht);
  relay.ungefiltert(ohneTag);
  relay.ungefiltert(falscherKind);
  relay.senden(['EVENT', 'falsche-sub', echt]);
  relay.senden(['EVENT']);
  await schlaf(80);
  assert.equal(B.msgs.length, 0, 'nichts gemeldet');
  assert.equal(B.rel(u).received, 0);
  relay.ungefiltert(echt); // das echte Event mit derselben ID kommt trotzdem durch
  await warteBis(() => B.msgs.length === 1, 1000, 'echtes Event');
  assert.equal(B.msgs[0].content, 'echt');
  B.ch.close();
});

await fall('Warteschlange: publish vor dem Öffnen → sentTo 0, max. 50, danach an alle Relays', async () => {
  const urls = ['wss://q1', 'wss://q2', 'wss://q3'].map((u) => new FakeRelay(u).url);
  const topic = zufallsTopic();
  const B = neu(urls, topic);
  B.ch.start();
  await warteBis(() => B.ch.status().open === 3, 2000, 'B offen');
  await warteBis(() => urls.every((u) => relays.get(u).reqs.length === 1), 1000, 'B abonniert');
  const A = neu(urls, topic);
  for (let i = 0; i < 55; i++) {
    const res = await A.ch.publish('q' + i);
    assert.equal(res.sentTo, 0);
  }
  A.ch.start();
  await warteBis(() => B.msgs.length === 50, 3000, '50 Nachrichten bei B');
  await schlaf(100);
  assert.equal(B.msgs.length, 50);
  assert.deepEqual(B.msgs.map((m) => m.content), Array.from({ length: 50 }, (_, i) => 'q' + (i + 5)), 'älteste 5 verworfen, Reihenfolge erhalten');
  for (const r of A.ch.status().relays) assert.equal(r.sent, 50, 'jedes Relay bekam die Warteschlange');
  const nachher = await A.ch.publish('direkt');
  assert.equal(nachher.sentTo, 3);
  await warteBis(() => B.msgs.length === 51, 1000, 'direkte Nachricht');
  A.ch.close();
  B.ch.close();
});

await fall('Warteschlange: Relay verweigert erst, nach Wiederverbindung wird nachgeliefert', async () => {
  const relay = new FakeRelay('wss://w1');
  const topic = zufallsTopic();
  const B = neu([relay.url], topic);
  B.ch.start();
  await warteBis(() => relay.reqs.length === 1, 2000, 'B abonniert');
  relay.modus = 'verweigern';
  const A = neu([relay.url], topic);
  A.ch.start();
  await warteBis(() => A.rel(relay.url).state === 'backoff', 1000, 'A im Backoff');
  assert.match(A.rel(relay.url).lastError, /Verbindung fehlgeschlagen \(1006\)/);
  const res = await A.ch.publish('verspätet');
  assert.equal(res.sentTo, 0);
  relay.modus = 'ok';
  await warteBis(() => B.msgs.length === 1, 3000, 'nachgeliefert');
  assert.equal(B.msgs[0].content, 'verspätet');
  assert.equal(A.rel(relay.url).state, 'open');
  A.ch.close();
  B.ch.close();
});

await fall('3 Relays: eines verbindet nie, eines bricht ab → Wiederaufbau + erneutes Abo', async () => {
  const gut = new FakeRelay('wss://m-gut');
  const wackel = new FakeRelay('wss://m-wackel');
  const tot = new FakeRelay('wss://m-tot', 'verweigern');
  const urls = [gut.url, wackel.url, tot.url];
  const topic = zufallsTopic();
  const A = neu(urls, topic);
  const B = neu(urls, topic);
  A.ch.start();
  B.ch.start();
  await warteBis(() => A.ch.status().open === 2 && B.ch.status().open === 2, 2000, '2 von 3 offen');
  await warteBis(() => wackel.reqs.length === 2, 1000, 'Abos');
  assert.equal(B.rel(tot.url).state, 'backoff');
  assert.match(B.rel(tot.url).lastError, /fehlgeschlagen/);
  assert.equal((await A.ch.publish('vorher')).sentTo, 2);
  await warteBis(() => B.msgs.length === 1, 1000, 'vorher');
  // wackeliges Relay bricht ab
  wackel.abbrechen();
  await warteBis(() => B.rel(wackel.url).state === 'backoff', 1000, 'Backoff nach Abbruch');
  assert.match(B.rel(wackel.url).lastError, /getrennt \(1006\)/);
  assert.equal(B.ch.status().open, 1);
  assert.equal((await A.ch.publish('waehrenddessen')).sentTo, 1);
  await warteBis(() => B.msgs.length === 2, 1000, 'über das gute Relay');
  // nach ~1 s Backoff: neu verbunden und neu abonniert
  await warteBis(() => wackel.reqs.length === 4 && B.rel(wackel.url).state === 'open', 3000, 'Wiederaufbau');
  assert.equal(B.ch.status().open, 2);
  const nachherReqs = wackel.reqs.slice(2);
  assert.ok(nachherReqs.every((r) => r.filter['#x'][0] === topic), 'neues Abo mit gleichem Topic');
  const vorWackel = B.rel(wackel.url).received;
  assert.equal((await A.ch.publish('nachher')).sentTo, 2);
  await warteBis(() => B.msgs.length === 3 && B.rel(wackel.url).received === vorWackel + 1, 1000, 'nachher über beide');
  assert.deepEqual(B.msgs.map((m) => m.content), ['vorher', 'waehrenddessen', 'nachher']);
  assert.equal(tot.sockets.size, 0);
  assert.ok(tot.verbindungen >= 2, 'totes Relay wird weiter versucht');
  A.ch.close();
  B.ch.close();
});

await fall('unbestätigtes Event wird nach Wiederaufbau erneut gesendet (nur solange jung)', async () => {
  const relay = new FakeRelay('wss://n1');
  const topic = zufallsTopic();
  const B = neu([relay.url], topic);
  const A = neu([relay.url], topic);
  const A2 = neu([relay.url], topic, { timing: { nachsenden: 200 } }); // zu alt → nicht nachsenden
  B.ch.start();
  A.ch.start();
  A2.ch.start();
  await warteBis(() => relay.reqs.length === 3, 2000, 'alle abonniert');
  // A: Event verschwindet ohne OK, dann bricht A's Verbindung ab
  relay.schlucken = 1;
  const res = await A.ch.publish('verschluckt');
  assert.equal(res.sentTo, 1);
  await warteBis(() => relay.geschluckt !== null, 1000, 'verschluckt');
  const wsA = relay.geschluckt;
  // A2: ebenso, aber mit kurzer Nachsende-Frist
  relay.schlucken = 1;
  relay.geschluckt = null;
  await A2.ch.publish('zu alt');
  await warteBis(() => relay.geschluckt !== null, 1000, 'verschluckt 2');
  const wsA2 = relay.geschluckt;
  await schlaf(30);
  assert.equal(B.msgs.length, 0);
  relay.abbrechen((ws) => ws === wsA || ws === wsA2);
  await warteBis(() => B.msgs.length === 1, 3000, 'nach Wiederaufbau zugestellt');
  await warteBis(() => A2.rel(relay.url).state === 'open', 3000, 'A2 wieder offen');
  await schlaf(100);
  assert.deepEqual(B.msgs.map((m) => m.content), ['verschluckt']);
  assert.equal(B.msgs[0].meta.eventId, res.eventId, 'gleiches Event, keine Neusignatur');
  const sA = A.rel(relay.url);
  assert.equal(sA.sent, 2, 'einmal gesendet, einmal nachgesendet');
  assert.equal(sA.ok, 1);
  assert.equal(A2.rel(relay.url).sent, 1, 'A2 sendet nicht nach');
  assert.equal(B.rel(relay.url).received, 1);
  A.ch.close();
  A2.ch.close();
  B.ch.close();
});

await fall('Backoff verdoppelt sich bis zum Maximum (verkürzte Zeiten)', async () => {
  const tot = new FakeRelay('wss://b-tot', 'verweigern');
  const zeiten = [];
  const orig = tot.annehmen.bind(tot);
  tot.annehmen = (ws) => {
    zeiten.push(Date.now());
    orig(ws);
  };
  const A = neu([tot.url], zufallsTopic(), { timing: { backoffMin: 40, backoffMax: 160 } });
  A.ch.start();
  await warteBis(() => zeiten.length >= 6, 3000, '6 Versuche');
  A.ch.close();
  const abst = zeiten.slice(1).map((t, i) => t - zeiten[i]);
  // erwartet ≈ 40, 80, 160, 160, 160 (+5 ms Verbindungsaufbau im Fake)
  const soll = [40, 80, 160, 160, 160];
  abst.slice(0, 5).forEach((a, i) => assert.ok(a >= soll[i] && a < soll[i] + 60, `Abstand ${i}: ${a} ms, erwartet ≈ ${soll[i]}`));
});

await fall('auth-required (CLOSED) → Relay ausgemustert, keine Wiederverbindung', async () => {
  const gut = new FakeRelay('wss://a-gut');
  const auth = new FakeRelay('wss://a-auth', 'auth');
  const topic = zufallsTopic();
  const A = neu([gut.url, auth.url], topic);
  A.ch.start();
  await warteBis(() => A.rel(auth.url).state === 'closed' && A.rel(gut.url).state === 'open', 2000, 'ausgemustert');
  assert.match(A.rel(auth.url).lastError, /auth-required/);
  assert.equal(A.ch.status().open, 1);
  assert.equal((await A.ch.publish('x')).sentTo, 1);
  await schlaf(1300); // länger als der erste Backoff
  assert.equal(auth.verbindungen, 1, 'kein neuer Versuch');
  assert.equal(A.rel(auth.url).state, 'closed');
  assert.equal(auth.sockets.size, 0);
  A.ch.close();
});

await fall('restricted (OK false) und pow: (NOTICE) → ausgemustert; rate-limited nur abgelehnt', async () => {
  const bezahl = new FakeRelay('wss://r-bezahl', 'restricted');
  const pow = new FakeRelay('wss://r-pow');
  const limit = new FakeRelay('wss://r-limit');
  const topic = zufallsTopic();
  const A = neu([bezahl.url, pow.url, limit.url], topic);
  A.ch.start();
  await warteBis(() => A.ch.status().open === 3, 2000, 'offen');
  await warteBis(() => pow.reqs.length === 1 && limit.reqs.length === 1, 1000, 'Abos');
  limit.verarbeiten = (ws, text) => {
    const msg = JSON.parse(text);
    if (msg[0] === 'EVENT') ws._liefern(['OK', msg[1].id, false, 'rate-limited: langsamer bitte']);
  };
  const res = await A.ch.publish('bezahlt?');
  assert.equal(res.sentTo, 3);
  pow.senden(['NOTICE', 'pow: difficulty 28 required']);
  await warteBis(() => A.rel(bezahl.url).state === 'closed' && A.rel(pow.url).state === 'closed', 1000, 'ausgemustert');
  await warteBis(() => A.rel(limit.url).rejected === 1, 1000, 'rate-limited');
  const s = A.ch.status();
  const rb = s.relays.find((r) => r.url === bezahl.url);
  assert.equal(rb.rejected, 1);
  assert.equal(rb.ok, 0);
  assert.match(rb.lastError, /restricted/);
  assert.match(s.relays.find((r) => r.url === pow.url).lastError, /pow:/);
  const rl = s.relays.find((r) => r.url === limit.url);
  assert.equal(rl.state, 'open', 'rate-limited ist nicht tödlich');
  assert.match(rl.lastError, /rate-limited/);
  assert.equal(s.open, 1);
  A.ch.close();
});

await fall('Wächter: stumme Verbindung (halb offen) wird erkannt und neu aufgebaut', async () => {
  const stumm = new FakeRelay('wss://stumm', 'stumm');
  const A = neu([stumm.url], zufallsTopic(), { timing: { leerlauf: 100, antwort: 100, backoffMin: 50 } });
  A.ch.start();
  await warteBis(() => A.rel(stumm.url).state === 'open', 1000, 'offen');
  await warteBis(() => stumm.verbindungen >= 2, 2000, 'neu verbunden');
  assert.match(A.rel(stumm.url).lastError, /keine Antwort/);
  A.ch.close();
});

await fall('Wächter: gesunde Verbindung bleibt trotz Leerlauf offen (Lebenszeichen per EOSE)', async () => {
  const relay = new FakeRelay('wss://gesund');
  const A = neu([relay.url], zufallsTopic(), { timing: { leerlauf: 60, antwort: 100 } });
  A.ch.start();
  await warteBis(() => A.rel(relay.url).state === 'open', 1000, 'offen');
  await schlaf(500);
  assert.equal(relay.verbindungen, 1);
  assert.ok(relay.reqs.length >= 4, 'mehrere Lebenszeichen-REQs');
  assert.ok(relay.reqs.slice(1).every((r) => r.filter.ids?.[0] === '0'.repeat(64)));
  assert.equal(A.rel(relay.url).state, 'open');
  assert.equal(A.rel(relay.url).lastError, null);
  // Lebenszeichen-Abos werden wieder geschlossen
  const ws = [...relay.sockets][0];
  assert.ok(ws.subs.size <= 2, 'höchstens Haupt-Abo + laufendes Lebenszeichen');
  A.ch.close();
});

await fall('close() stoppt alles: Sockets zu, keine Wiederverbindung, keine Meldungen', async () => {
  const u1 = new FakeRelay('wss://c1');
  const u2 = new FakeRelay('wss://c2', 'verweigern');
  const topic = zufallsTopic();
  const B = neu([u1.url, u2.url], topic);
  B.ch.start();
  await warteBis(() => B.rel(u1.url).state === 'open' && B.rel(u2.url).state === 'backoff', 2000, 'gestartet');
  await warteBis(() => u1.reqs.length === 1, 1000, 'Abo');
  B.ch.close();
  B.ch.close(); // doppelt schadet nicht
  await schlaf(20);
  const s = B.ch.status();
  assert.equal(s.open, 0);
  assert.ok(s.relays.every((r) => r.state === 'closed'));
  assert.equal(u1.sockets.size, 0);
  assert.equal(B.stati.at(-1).open, 0, 'letzte Statusmeldung: alles zu');
  const ev = JSON.parse(await createEvent(topic, 'nach close'))[1];
  u1.verteilen(ev);
  const verb = [u1.verbindungen, u2.verbindungen];
  const res = await B.ch.publish('nach close');
  assert.deepEqual(res, { eventId: null, sentTo: 0 });
  await schlaf(1300);
  assert.equal(B.msgs.length, 0);
  assert.deepEqual([u1.verbindungen, u2.verbindungen], verb, 'keine neuen Verbindungen');
  B.ch.start(); // nach close wirkungslos
  await schlaf(30);
  assert.equal(u1.verbindungen, verb[0]);
});

await fall('Eingabeprüfung: urls/topic Pflicht, content muss String sein', async () => {
  assert.throws(() => new RelayChannel({ urls: [], topic: 'x' }), TypeError);
  assert.throws(() => new RelayChannel({ urls: ['wss://x'] }), TypeError);
  const k = new RelayChannel({ urls: ['wss://x', 'wss://x'], topic: 't' });
  assert.equal(k.status().total, 1, 'doppelte URLs zusammengefasst');
  assert.equal(k.status().relays[0].state, 'closed', 'vor start()');
  await assert.rejects(k.publish({ kein: 'string' }), TypeError);
  k.close();
});

for (const ch of offene) ch.close();
console.log(fehler ? `\n${fehler} Fehler` : '\nalle RelayChannel-Tests grün');
process.exit(fehler ? 1 : 0);
