// Online-Paket (n10 E3, src/net/extras.js) ohne echtes Netz: Revanche als Angebot, Reaktionen (nur 6 feste, ≤ 1 je 3 s,
// der Schiedsrichter prüft), Vertretung durch den Computer bei Verbindungsabbruch (umkehrbar, Partie endet nie
// vorzeitig, 50 Läufe), Bedenkzeit (Fischer-Uhr, Zeit abgelaufen, Zuschlag, Zeit schenken).
// Aufruf: node tests/node/online.test.mjs
import assert from 'node:assert/strict';
import { TableSession, newTable, TIMING, seatOf } from '../../src/net/table.js';
import { EMOTES, parseClock, newClock, clockLeft, CLOCKS, GIFT_MS } from '../../src/net/extras.js';
import * as muehleBot from '../../src/games/muehle/bot.js';
import * as ludoBot from '../../src/games/ludo/bot.js';
import { mulberry32, pick } from '../../src/rng.js';

const BOTS = { muehle: muehleBot.chooseMove, ludo: ludoBot.chooseMove };
Object.assign(TIMING, { tick: 20, heartbeat: 40, hostGone: 100000, moveRetry: 150, botDelay: 0, relayAfter: 100000, awayStart: 0, awayMove: 100000, emoteGap: 300, rematchOffer: 400, vertretung: 150 });

let fails = 0;
async function ok(name, fn) {
  if (process.env.SB_ONLY && !name.includes(process.env.SB_ONLY)) return;
  try { const info = await fn(); console.log('✅ ' + name + (info ? ` (${info})` : '')); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 3000, what = 'Bedingung') {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zeitüberschreitung: ' + what);
    await sleep(3);
  }
}

// Netz-Attrappe (wie table.test.mjs): verbundene Links sehen sich direkt, Nachrichten als JSON kopiert
class Hub { constructor() { this.links = new Set(); } }
class FakeLink {
  constructor(hub, pid, name) { this.hub = hub; this.pid = pid; this.name = name; this.up = false; this.onMessage = null; this.onPeers = null; this.onStatus = null; this.sent = []; }
  connect() {
    this.up = true;
    const others = [...this.hub.links].filter((l) => l.up && l !== this);
    this.hub.links.add(this);
    setTimeout(() => {
      this.onPeers && this.onPeers(this.status().peers, others.map((l) => l.pid));
      for (const l of others) l.onPeers && l.onPeers(l.status().peers, [this.pid]);
    }, 1);
    return this;
  }
  disconnect() { this.up = false; this.hub.links.delete(this); }
  send(msg, to) {
    if (!this.up) return;
    this.sent.push(msg);
    const text = JSON.stringify(msg);
    for (const l of this.hub.links) {
      if (l === this || !l.up || (to && l.pid !== to)) continue;
      setTimeout(() => { if (l.up && this.up) l.onMessage && l.onMessage(JSON.parse(text), { pid: this.pid, name: this.name, via: 'direkt' }); }, 1);
    }
  }
  status() { return { peers: [...this.hub.links].filter((l) => l !== this && l.up).map((l) => ({ pid: l.pid, name: l.name, via: 'direkt' })), relay: null }; }
}

function player(hub, pid, name, { table = null, want = 'play', rng = Math.random } = {}) {
  const link = new FakeLink(hub, pid, name);
  const s = new TableSession({ mode: 'online', me: { pid, name }, want, table, link, save: () => {}, bot: { choose: (g, gs, level) => BOTS[g](gs, { level, timeMs: 5, rng }) } });
  s.start();
  link.connect();
  return s;
}

// Host H (Sitz 0) + Gast G (Sitz 1) an einem Mühle-Tisch, Partie läuft
async function duo(opts = {}, extra = {}) {
  const hub = new Hub();
  const h = player(hub, 'H', 'Hanna', { table: newTable({ game: 'muehle', opts, host: { pid: 'H', name: 'Hanna' } }), ...extra });
  const g = player(hub, 'G', 'Gustav', extra);
  await until(() => h.table.status === 'play' && g.table && g.table.status === 'play', 2000, 'Partie läuft');
  return { hub, h, g };
}
const legal = (s) => s.engine.legalMoves(s.table.gs);

await ok('Messgröße 4: Revanche online nur nach Annahme; „Nein danke“ und Ablauf nach 60 s löschen das Angebot', async () => {
  const { hub, h, g } = await duo();
  g.act('resign');
  await until(() => h.table.status === 'over' && g.table.status === 'over');
  g.act('rematch');
  await until(() => h.table.rematch && g.table.rematch, 2000, 'Angebot');
  assert.deepEqual(h.table.rematch.seats, [1]);
  await sleep(60);
  assert.equal(h.table.round, 1, 'ohne Annahme keine neue Partie');
  h.act('rematch-decline');
  await until(() => !g.table.rematch, 2000, 'abgelehnt');
  assert.equal(h.table.round, 1);
  // Angebot verfällt (Test: 400 ms statt 60 s)
  h.act('rematch');
  await until(() => g.table.rematch);
  await until(() => !g.table.rematch && !h.table.rematch, 2000, 'verfallen');
  assert.equal(h.table.round, 1);
  // Angebot + Annahme → neue Partie mit getauschten Farben
  h.act('rematch');
  await until(() => g.table.rematch);
  g.act('rematch');
  await until(() => h.table.round === 2 && g.table.round === 2 && g.table.status === 'play', 2000, 'Revanche');
  assert.equal(seatOf(h.table, 'H'), 1);
  assert.equal(h.table.rematch, null);
  // Zuschauer kann kein Angebot machen
  const w = player(hub, 'W', 'Willi', { want: 'watch' });
  await until(() => w.table && w.table.round === 2);
  h.act('resign');
  await until(() => w.table.status === 'over');
  w.act('rematch');
  await sleep(40);
  assert.equal(h.table.rematch, null);
  h.close(); g.close(); w.close();
});

await ok('n11: Tipps online nur, wenn der Gastgeber sie erlaubt; genutzte Tipps sehen alle, neue Partie setzt zurück', async () => {
  const a = await duo();
  assert.equal(a.h.table.tipps, false);
  a.g.act('tipp');
  await sleep(40);
  assert.ok(!a.h.table.tips && !a.g.table.tips, 'ohne Erlaubnis kein Tipp');
  a.h.close(); a.g.close();
  const b = await duo({ tipps: true });
  assert.equal(b.g.table.tipps, true);
  b.g.act('tipp'); b.g.act('tipp'); b.h.act('tipp');
  await until(() => b.g.table.tips && b.g.table.tips[1] === 2 && b.g.table.tips[0] === 1, 2000, 'Zähler beim Gast');
  assert.deepEqual(b.h.table.tips, { 0: 1, 1: 2 });
  b.g.act('resign');
  await until(() => b.h.table.status === 'over');
  b.h.act('rematch'); await until(() => b.g.table.rematch); b.g.act('rematch');
  await until(() => b.h.table.round === 2 && b.g.table.round === 2, 2000, 'Revanche');
  assert.equal(b.h.table.tips, null);
  assert.equal(b.h.table.tipps, true, 'Erlaubnis bleibt am Tisch');
  b.h.close(); b.g.close();
  // gegen den Computer immer erlaubt
  const table = newTable({ game: 'muehle', host: { pid: 'me', name: 'Ich' } });
  table.seats[1] = { pid: 'bot', name: 'Computer', bot: 2 };
  const s = new TableSession({ mode: 'bot', me: { pid: 'me', name: 'Ich' }, table, save: () => {}, bot: { choose: (g, gs, level) => muehleBot.chooseMove(gs, { level, timeMs: 5 }) } });
  s.start();
  assert.ok(s.act('tipp').ok);
  assert.deepEqual(s.table.tips, { 0: 1 });
  s.close();
});

await ok('Revanche gegen den Computer und an einem Gerät: sofort (1 Tipp)', async () => {
  for (const mode of ['bot', 'hotseat']) {
    const table = newTable({ game: 'muehle', host: { pid: 'me', name: 'Ich' } });
    table.seats[1] = mode === 'bot' ? { pid: 'bot', name: 'Computer', bot: 2 } : { pid: 'me2', name: 'Zwei' };
    const s = new TableSession({ mode, me: { pid: 'me', name: 'Ich' }, table, save: () => {}, bot: { choose: (g, gs, level) => muehleBot.chooseMove(gs, { level, timeMs: 5 }) } });
    s.start();
    s.table.status = 'over';
    s.table.result = { winner: 0, reason: 'Test' };
    const r = s.act('rematch');
    assert.ok(r.ok && s.table.round === 2 && s.table.status === 'play', mode);
    s.close();
  }
});

await ok('Messgröße 6: Reaktionen – nur die 6 festen, höchstens 1 je 3 s je Spieler, Schiedsrichter prüft', async () => {
  assert.deepEqual(EMOTES, ['👋', '👍', '😮', '😅', '🙏', '🎉']);
  const { hub, h, g } = await duo();
  const w = player(hub, 'W', 'Willi', { want: 'watch' });
  await until(() => w.table);
  const got = { h: [], g: [], w: [] };
  h.on('emote', (x) => got.h.push(x)); g.on('emote', (x) => got.g.push(x)); w.on('emote', (x) => got.w.push(x));
  assert.ok(g.emote(1).ok);
  await until(() => got.h.length === 1 && got.w.length === 1 && got.g.length === 1, 1000, 'verteilt');
  assert.deepEqual(got.h[0], { e: 1, seat: 1 });
  assert.equal(g.emote(2).ok, false, 'zu schnell (Gerät)');
  // gefälschte Nachrichten direkt an den Host: unbekannter Wert, Text, Flut
  g.link.send({ t: 'emote', e: 9 }, 'H');
  g.link.send({ t: 'emote', e: 'Hallo du' }, 'H');
  for (let k = 0; k < 5; k++) g.link.send({ t: 'emote', e: 3 }, 'H');
  await sleep(60);
  assert.equal(got.h.length, 1, 'Host nimmt innerhalb von 3 s nichts mehr an');
  // Zuschauer darf nicht, falsche Absender (nicht der Host) zählen nicht
  w.link.send({ t: 'emote', e: 0 }, 'H');
  w.link.send({ t: 'emote', e: 0, seat: 0 }, 'G');
  await sleep(40);
  assert.equal(got.h.length, 1);
  assert.equal(got.g.length, 1);
  await sleep(TIMING.emoteGap + 20);
  assert.ok(h.emote(5).ok, 'Host selbst');
  await until(() => got.g.length === 2 && got.g[1].e === 5 && got.g[1].seat === 0, 1000);
  // nichts davon landet im Tisch-Stand
  assert.equal(JSON.stringify(h.table).includes('emote'), false);
  h.close(); g.close(); w.close();
});

await ok('Messgröße 5: Vertretung – Gast weg → Computer zieht für ihn nach der Frist; Rückkehr übernimmt sofort', async () => {
  const { hub, h, g } = await duo();
  // H setzt, dann ist G dran – G verliert die Verbindung
  h.submitMove(legal(h)[0]);
  await until(() => g.table.nmoves === 1);
  const t0 = Date.now();
  g.link.disconnect();
  await until(() => h.table.subs && h.table.subs[1], 2000, 'Vertretung');
  const took = Date.now() - t0;
  await until(() => h.table.nmoves === 2, 2000, 'Computer zieht für G');
  assert.ok(took >= TIMING.vertretung - 5 && took <= TIMING.vertretung + 3 * TIMING.tick + 30, `Frist ${took} ms (soll ${TIMING.vertretung})`);
  // ein paar Züge laufen mit Vertretung weiter
  for (let k = 0; k < 3; k++) {
    await until(() => h.mySeat === h.engine.currentPlayer(h.table.gs) && legal(h).length, 2000);
    h.submitMove(legal(h)[0]);
    await until(() => h.engine.currentPlayer(h.table.gs) === 0 || h.table.status !== 'play', 2000, 'Vertretung zieht');
  }
  // G kommt zurück: Vertretung endet sofort, G zieht selbst
  g.link.connect();
  await until(() => !h.table.subs && g.table && !g.table.subs, 2000, 'Rückkehr');
  const n = h.table.nmoves;
  if (h.table.status === 'play' && h.engine.currentPlayer(h.table.gs) === 0) { h.submitMove(legal(h)[0]); await until(() => h.table.nmoves === n + 1); }
  await sleep(4 * TIMING.tick);
  assert.equal(h.engine.currentPlayer(h.table.gs), 1, 'Computer zieht nach der Rückkehr nicht mehr für G');
  await until(() => g.mySeat === 1 && legal(g).length, 2000);
  assert.ok(g.submitMove(legal(g)[0]).ok);
  await until(() => h.table.nmoves === (h.table.nmoves > n + 1 ? h.table.nmoves : n + 2) && h.engine.currentPlayer(h.table.gs) === 0, 2000, 'G zieht selbst');
  h.close(); g.close();
  return `Vertretung nach ${took} ms`;
});

await ok('Messgröße 5: 50 Läufe mit Abbruch (zufällig, teils mit Rückkehr) – jede Partie endet regulär', async () => {
  const rng = mulberry32(50);
  let ended = 0, subbed = 0, back = 0;
  for (let run = 0; run < 50; run++) {
    const { h, g } = await duo();
    const cut = 2 + Math.floor(rng() * 20), ret = rng() < 0.5 ? cut + 4 + Math.floor(rng() * 10) : -1;
    let cutDone = false, retDone = false;
    const t0 = Date.now();
    while (h.table.status === 'play' && Date.now() - t0 < 15000) {
      const n = h.table.nmoves;
      if (!cutDone && n >= cut) { g.link.disconnect(); cutDone = true; }
      if (cutDone && !retDone && ret > 0 && n >= ret) { g.link.connect(); retDone = true; }
      const turn = h.engine.currentPlayer(h.table.gs);
      if (turn === 0) { const l = legal(h); if (l.length) h.submitMove(pick(rng, l)); }
      else if (turn === 1 && g.link.up && !h.table.subs && g.table && g.table.nmoves === n && g.mySeat === 1 && !g.pendingMove) { const l = legal(g); if (l.length) g.submitMove(pick(rng, l)); }
      if (h.table.subs) subbed++;
      await sleep(4);
    }
    assert.equal(h.table.status, 'over', `Lauf ${run}: Partie endet regulär (Züge ${h.table.nmoves})`);
    assert.ok(h.table.result && !/aufgegeben|abgebrochen/i.test(h.table.result.reason), h.table.result && h.table.result.reason);
    ended++;
    if (retDone) back++;
    h.close(); g.close();
  }
  assert.ok(subbed > 0);
  return `${ended}/50 regulär beendet, ${back} mit Rückkehr`;
});

await ok('Bedenkzeit: Stufen, Uhr startet ab dem 2. Zug, Zuschlag je Zug, „+15 s“ schenken, Zeit abgelaufen = verloren', async () => {
  assert.deepEqual(CLOCKS, ['3+2', '5+3', '10+5', '15+10']);
  assert.deepEqual(parseClock('5+3'), { base: 300000, inc: 3000 });
  assert.equal(parseClock('aus'), null);
  assert.equal(newClock('aus', 2), null);
  assert.equal(newTable({ game: 'muehle', opts: {}, host: { pid: 'x', name: 'x' } }).clock, null, 'Standard aus');
  assert.equal(newTable({ game: 'ludo', opts: { uhr: '3+2' }, host: { pid: 'x', name: 'x' } }).clock, null, 'nur Brettspiele mit Uhr');
  assert.equal(clockLeft({ left: [1000, 2000], since: 5 }, 0, 0, 300), 700);
  assert.equal(clockLeft({ left: [1000, 2000], since: 5 }, 1, 0, 300), 2000);
  const { h, g } = await duo({ uhr: '3+2' });
  assert.ok(h.table.clock && g.table.clock);
  assert.equal(h.table.clock.left[0], 180000);
  h.submitMove(legal(h)[0]);
  await until(() => g.table.nmoves === 1);
  assert.equal(h.table.clock.since, null, 'nach dem 1. Zug läuft noch keine Uhr');
  g.submitMove(legal(g)[0]);
  await until(() => h.table.nmoves === 2);
  assert.ok(h.table.clock.since !== null, 'ab dem 2. Zug läuft die Uhr');
  await sleep(50);
  h.submitMove(legal(h)[0]);
  await until(() => g.table.nmoves === 3);
  const l0 = h.table.clock.left[0];
  assert.ok(l0 > 180000 && l0 <= 182000 - 40, `Zuschlag 2 s minus Bedenkzeit (${l0})`);
  // G schenkt H 15 s
  g.act('moretime');
  await until(() => h.table.clock.left[0] === l0 + GIFT_MS, 1000, 'Zeit geschenkt');
  // G lässt seine Zeit ablaufen (Uhr am Host verkürzt)
  h.table.clock.left[1] = 100;
  TIMING.timerGrace = 30;
  await until(() => h.table.status === 'over' && g.table.status === 'over', 2000, 'Zeit abgelaufen');
  assert.equal(h.table.result.winner, 0);
  assert.match(h.table.result.reason, /keine Zeit mehr/);
  // Revanche: Uhr wieder voll
  h.act('rematch'); g.act('rematch');
  await until(() => h.table.round === 2);
  assert.deepEqual(h.table.clock.left, [180000, 180000]);
  assert.equal(h.table.clock.since, null);
  h.close(); g.close();
  TIMING.timerGrace = 1500;
});

await ok('Bedenkzeit gegen den Computer: Uhr läuft auch lokal ab', async () => {
  const table = newTable({ game: 'muehle', opts: { uhr: '3+2' }, host: { pid: 'me', name: 'Ich' } });
  table.seats[1] = { pid: 'bot', name: 'Computer', bot: 1 };
  const s = new TableSession({ mode: 'bot', me: { pid: 'me', name: 'Ich' }, table, save: () => {}, timers: globalThis, bot: { choose: (gg, gs, level) => muehleBot.chooseMove(gs, { level, timeMs: 5 }) } });
  TIMING.timerGrace = 20;
  s.start();
  s.submitMove(legal(s)[0]);
  await until(() => s.engine.currentPlayer(s.table.gs) === 0 && s.table.nmoves === 2, 2000, 'Computer zieht');
  s.table.clock.left[0] = 50;
  await until(() => s.table.status === 'over', 3000, 'Zeit um');
  assert.equal(s.table.result.winner, 1);
  s.close();
  TIMING.timerGrace = 1500;
});

console.log(fails ? `\n${fails} Fall/Fälle rot` : '\nOnline-Paket grün');
process.exit(fails ? 1 : 0);
