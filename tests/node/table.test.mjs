// Tisch-Protokoll ohne echtes Netz: Host als Schiedsrichter, Sitzplätze, Zuschauer, Ablehnen illegaler Züge,
// ganze Partie, Wiederaufnahme (Client und Host), Host-Übernahme, Revanche, Remis/Aufgeben, Bot-Modus.
// Aufruf: node tests/node/table.test.mjs
import assert from 'node:assert/strict';
import { TableSession, newTable, TIMING, seatOf } from '../../src/net/table.js';
import { gameOf } from '../../src/games/registry.js';
import { mulberry32, pick } from '../../src/rng.js';
import * as muehleBot from '../../src/games/muehle/bot.js';
import * as bjBot from '../../src/games/blackjack/bot.js';
import * as ludoBot from '../../src/games/ludo/bot.js';
import * as mmBot from '../../src/games/maumau/bot.js';
import * as heBot from '../../src/games/holdem/bot.js';
const BOTS = { blackjack: bjBot.chooseMove, muehle: muehleBot.chooseMove, ludo: ludoBot.chooseMove, maumau: mmBot.chooseMove, holdem: (gs, o) => heBot.chooseMove(gs, { ...o, iters: 60 }) };

Object.assign(TIMING, { heartbeat: 40, hostGone: 400, moveRetry: 150, botDelay: 0, relayAfter: 120 });

let fails = 0;
async function ok(name, fn) {
  if (process.env.SB_ONLY && !name.includes(process.env.SB_ONLY)) return;   // einzelnen Fall laufen lassen
  try { await fn(); console.log('✅ ' + name); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 3000, what = 'Bedingung') {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zeitüberschreitung: ' + what);
    await sleep(5);
  }
}

// Netz-Attrappe: alle verbundenen Links sehen sich direkt; Nachrichten werden als JSON kopiert (wie echt)
class Hub {
  constructor() { this.links = new Set(); this.dropped = 0; }
}
class FakeLink {
  constructor(hub, pid, name) {
    this.hub = hub; this.pid = pid; this.name = name; this.up = false;
    this.onMessage = null; this.onPeers = null; this.onStatus = null;
    this.sent = [];
    this.via = 'direkt';       // so meldet status() die anderen (Test für Relay-Zuschaltung)
    this.relayWanted = null;   // Grund, falls ensureRelay aufgerufen wurde
  }
  ensureRelay(reason) { if (!this.relayWanted) this.relayWanted = reason; }
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
    // wie öffentliche Relays: zu große Nachrichten kommen nie an
    if (this.hub.limit && text.length > this.hub.limit) { this.hub.dropped++; this.hub.biggest = Math.max(this.hub.biggest || 0, text.length); return; }
    for (const l of this.hub.links) {
      if (l === this || !l.up) continue;
      if (to && l.pid !== to) continue;
      setTimeout(() => { if (l.up && this.up) l.onMessage && l.onMessage(JSON.parse(text), { pid: this.pid, name: this.name, via: 'direkt' }); }, 1);
    }
  }
  status() {
    return { peers: [...this.hub.links].filter((l) => l !== this && l.up).map((l) => ({ pid: l.pid, name: l.name, via: l.via === 'direkt' && this.via === 'direkt' ? 'direkt' : 'relay' })), relay: null };
  }
}

function player(hub, pid, name, { table = null, want = 'play', store = {}, secret = null } = {}) {
  const link = new FakeLink(hub, pid, name);
  const s = new TableSession({ mode: 'online', me: { pid, name }, want, table, link, secret, save: (t) => { store.t = JSON.parse(JSON.stringify(t)); }, bot: { choose: (g, gs, level) => BOTS[g](gs, { level, timeMs: 30 }) } });
  s.store = store;
  s.start();
  link.connect();
  return s;
}

const muehle = gameOf('muehle').engine;
const same = (a, b) => JSON.stringify(a.table.gs) === JSON.stringify(b.table.gs) && a.table.seq === b.table.seq;

await ok('Host macht Tisch auf, Gast nimmt Platz, Partie beginnt', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }) });
  assert.equal(h.role, 'host');
  assert.equal(h.table.status, 'wait');
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play', 2000, 'Gast sieht laufende Partie');
  assert.equal(g.role, 'client');
  assert.equal(seatOf(h.table, 'G'), 1);
  assert.equal(g.mySeat, 1);
  assert.ok(same(h, g));
  h.close(); g.close();
});

await ok('Züge: falscher Spieler lokal abgelehnt, legale Züge beider Seiten, Vorschau + Bestätigung', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play');
  assert.equal(g.submitMove({ to: 0 }).ok, false, 'Gast ist nicht am Zug');
  const kinds = [];
  g.on('change', (t, info) => kinds.push(info.kind));
  assert.equal(h.submitMove({ to: 0 }).ok, true);
  await until(() => g.table.nmoves === 1, 2000, 'Gast sieht Zug');
  assert.ok(kinds.includes('move'), 'Gast bekommt Zug zum Animieren');
  const r = g.submitMove({ to: 23 });
  assert.equal(r.ok, true);
  assert.equal(g.table.nmoves, 2, 'Vorschau sofort');
  await until(() => h.table.nmoves === 2 && g.pendingMove === null, 2000, 'Host übernimmt Gastzug');
  assert.ok(kinds.includes('confirm'));
  assert.ok(same(h, g));
  h.close(); g.close();
});

await ok('Host lehnt illegale/gefälschte Züge ab, Zustand bleibt gleich', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play');
  h.submitMove({ to: 0 });
  await until(() => g.table.nmoves === 1);
  const seq = h.table.seq;
  let nacks = 0;
  const orig = g.link.onMessage;
  g.link.onMessage = (m, f) => { if (m.t === 'nack') nacks++; orig(m, f); };
  g.link.send({ t: 'move', id: 'x1', move: { to: 0 }, seq }, 'H');          // besetzt
  g.link.send({ t: 'move', id: 'x2', move: { from: 3, to: 4 }, seq }, 'H'); // Setzphase
  g.link.send({ t: 'move', id: 'x3', move: 'Müll', seq }, 'H');
  g.link.send({ t: 'act', a: 'draw-accept', round: 1 }, 'H');              // kein Angebot da
  await until(() => nacks >= 3, 2000, '3 Ablehnungen');
  assert.equal(h.table.seq, seq);
  assert.equal(h.table.nmoves, 1);
  // Zuschauer darf nicht ziehen
  const w = player(hub, 'W', 'Oma', { want: 'watch' });
  await until(() => w.table && w.table.seq === seq, 2000, 'Zuschauer bekommt Stand');
  assert.equal(w.mySeat, null);
  assert.equal(w.submitMove({ to: 5 }).ok, false);
  w.link.send({ t: 'move', id: 'x4', move: { to: 5 }, seq }, 'H');
  await sleep(50);
  assert.equal(h.table.seq, seq, 'Zug des Zuschauers wirkungslos');
  // veralteter (wiederholter) Zug mit alter seq wird ignoriert
  g.submitMove({ to: 5 });
  await until(() => h.table.nmoves === 2);
  g.link.send({ t: 'move', id: 'dup', move: { to: 5 }, seq: seq }, 'H');
  await sleep(50);
  assert.equal(h.table.nmoves, 2);
  h.close(); g.close(); w.close();
});

await ok('Dritter Mitspieler bei vollem Tisch wird Zuschauer', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'dame', opts: { rules: 'international' }, host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play');
  const x = player(hub, 'X', 'Max');
  await until(() => x.table && x.table.status === 'play');
  assert.equal(x.mySeat, null);
  assert.equal(h.table.seats.filter(Boolean).length, 2);
  assert.equal(x.table.gs.n, 10);
  h.close(); g.close(); x.close();
});

async function playOut(sessions, rng, maxMoves = 2000) {
  for (let k = 0; k < maxMoves; k++) {
    const t = sessions[0].table;
    if (t.status === 'over') return;
    const eng = gameOf(t.game).engine;
    const turn = eng.currentPlayer(t.gs);
    const s = sessions.find((x) => x.mySeat === turn);
    await until(() => s.table.seq === sessions[0].table.seq && !s.pendingMove, 3000, 'Gleichstand vor Zug');
    const moves = eng.legalMoves(s.table.gs);
    const m = turn === 0 ? muehleBot.chooseMove(s.table.gs, { level: 1, rng }) : pick(rng, moves);
    const before = sessions[0].table.nmoves;
    const r = s.submitMove(m);
    assert.equal(r.ok, true, 'Zug angenommen: ' + JSON.stringify(r));
    await until(() => sessions.every((x) => x.table.nmoves === before + 1 && !x.pendingMove), 3000, 'alle sehen den Zug');
  }
  throw new Error('Partie endet nicht');
}

await ok('Ganze Partie Mühle bis zum Ende, alle Stände gleich, Punkte gezählt', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  const w = player(hub, 'W', 'Oma', { want: 'watch' });
  await until(() => g.table && g.table.status === 'play' && w.table);
  await playOut([h, g], mulberry32(7));
  await until(() => g.table.status === 'over' && w.table.status === 'over', 2000, 'Ende bei allen');
  assert.ok(same(h, g) && same(h, w));
  const r = h.table.result;
  assert.ok(r && typeof r.reason === 'string');
  const pts = Object.values(h.table.score).reduce((a, b) => a + b, 0);
  assert.equal(pts, 1);
  console.log(`   Ergebnis: ${r.winner === null ? 'Remis' : ['Weiß', 'Schwarz'][r.winner] + ' gewinnt'} (${r.reason}) nach ${h.table.nmoves} Zügen`);
  // Revanche: Farben getauscht
  g.act('rematch');
  await until(() => h.table.round === 2 && g.table.round === 2, 2000, 'Revanche');
  assert.equal(seatOf(h.table, 'H'), 1);
  assert.equal(h.table.status, 'play');
  h.close(); g.close(); w.close();
});

await ok('Wiederaufnahme: Gast lädt neu (gespeicherter Stand), Host lädt neu, Partie geht weiter', async () => {
  const hub = new Hub();
  const hs = {}, gs = {};
  let h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }), store: hs });
  let g = player(hub, 'G', 'Anna', { store: gs });
  await until(() => g.table && g.table.status === 'play');
  h.submitMove({ to: 0 });
  await until(() => g.table.nmoves === 1);
  g.submitMove({ to: 23 });
  await until(() => h.table.nmoves === 2 && !g.pendingMove);
  // Gast: Tab zu, neu geladen mit Speicherstand
  g.close(); g.link.disconnect();
  h.submitMove({ to: 1 });
  g = player(hub, 'G', 'Anna', { table: gs.t, store: gs });
  await until(() => g.table.nmoves === 3, 2000, 'Gast holt verpassten Zug nach');
  assert.equal(g.mySeat, 1);
  // Host: neu geladen
  h.close(); h.link.disconnect();
  h = player(hub, 'H', 'Peter', { table: hs.t, store: hs });
  assert.equal(h.role, 'host');
  await sleep(30);
  assert.equal(g.submitMove({ to: 22 }).ok, true);
  await until(() => h.table.nmoves === 4 && g.table.nmoves === 4 && !g.pendingMove, 2000, 'Zug nach Host-Reload');
  assert.ok(same(h, g));
  h.close(); g.close();
});

await ok('Host verschwindet: sitzender Gast übernimmt, alter Host kehrt zurück und ordnet sich unter', async () => {
  const hub = new Hub();
  const hs = {};
  let h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }), store: hs });
  const g = player(hub, 'G', 'Anna');
  const w = player(hub, 'W', 'Oma', { want: 'watch' });
  await until(() => g.table && g.table.status === 'play' && w.table);
  h.submitMove({ to: 0 });
  await until(() => g.table.nmoves === 1 && w.table.nmoves === 1);
  h.close(); h.link.disconnect();
  await until(() => g.role === 'host', 3000, 'Gast übernimmt');
  assert.equal(g.table.epoch, 2);
  await until(() => w.table.epoch === 2, 2000, 'Zuschauer folgt neuem Host');
  g.submitMove({ to: 23 });
  await until(() => w.table.nmoves === 2);
  // alter Host kommt zurück (Stand epoch 1) → übernimmt Stand epoch 2 als Client
  h = player(hub, 'H', 'Peter', { table: hs.t, store: hs });
  await until(() => h.table.epoch === 2 && h.role === 'client', 3000, 'alter Host ordnet sich unter');
  assert.equal(h.mySeat, 0);
  assert.equal(h.submitMove({ to: 1 }).ok, true);
  await until(() => g.table.nmoves === 3 && w.table.nmoves === 3 && !h.pendingMove, 2000, 'weiterspielen');
  h.close(); g.close(); w.close();
});

await ok('Remis anbieten/ablehnen/annehmen und Aufgeben', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'dame', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play');
  g.act('draw-offer');
  await until(() => h.table.drawOffer === 1);
  h.act('draw-decline');
  await until(() => g.table.drawOffer === null);
  h.act('draw-offer');
  await until(() => g.table.drawOffer === 0);
  g.act('draw-accept');
  await until(() => g.table.status === 'over');
  assert.equal(h.table.result.winner, null);
  assert.equal(h.table.score.H, 0.5);
  g.act('rematch');
  await until(() => g.table.round === 2 && g.table.status === 'play');
  g.act('resign');
  await until(() => h.table.status === 'over');
  assert.equal(h.table.result.winner, seatOf(h.table, 'H'));
  assert.match(h.table.result.reason, /Anna gibt auf/);
  // alte Aufgabe (Runde 2) wirkt nach neuer Revanche nicht mehr
  h.act('rematch');
  await until(() => g.table.round === 3);
  g.link.send({ t: 'act', a: 'resign', round: 2 }, 'H');
  await sleep(50);
  assert.equal(h.table.status, 'play');
  h.close(); g.close();
});

await ok('Solo gegen Computer: Bot antwortet, Partie endet', async () => {
  const rng = mulberry32(3);
  const table = newTable({ game: 'muehle', host: { pid: 'me', name: 'Ich' } });
  table.seats[1] = { pid: 'bot', name: 'Computer', bot: 2 };
  const bot = { choose: async (game, gs, level) => muehleBot.chooseMove(gs, { level, rng, timeMs: 30 }) };
  const s = new TableSession({ mode: 'bot', me: { pid: 'me', name: 'Ich' }, table, bot, save: () => {} });
  s.start();
  for (let k = 0; k < 1000 && s.table.status !== 'over'; k++) {
    await until(() => s.table.status === 'over' || muehle.currentPlayer(s.table.gs) === 0, 3000, 'Bot zieht');
    if (s.table.status === 'over') break;
    assert.equal(s.submitMove(pick(rng, muehle.legalMoves(s.table.gs))).ok, true);
  }
  assert.equal(s.table.status, 'over');
  console.log(`   Computer (Stufe 2) gegen Zufall: ${s.table.result.winner === 1 ? 'Computer gewinnt' : 'Mensch/Remis'} (${s.table.result.reason})`);
  s.close();
});

await ok('Zu zweit an einem Gerät: Sitz folgt dem Zug', async () => {
  const table = newTable({ game: 'dame', opts: { rules: 'deutsch' }, host: { pid: 'me', name: 'Weiß' } });
  table.seats[1] = { pid: 'me#2', name: 'Schwarz' };
  const s = new TableSession({ mode: 'hotseat', me: { pid: 'me', name: 'Weiß' }, table });
  s.start();
  const dame = gameOf('dame').engine;
  assert.equal(s.mySeat, 0);
  assert.equal(s.submitMove(dame.legalMoves(s.table.gs)[0]).ok, true);
  assert.equal(s.mySeat, 1);
  assert.equal(s.submitMove(dame.legalMoves(s.table.gs)[0]).ok, true);
  s.act('draw-offer');
  assert.equal(s.table.status, 'over');
  s.close();
});

await ok('Relay wird zugeschaltet, wenn der Mitspieler nicht direkt erreichbar ist (auch mit direktem Zuschauer)', async () => {
  const keep = TIMING.hostGone;
  TIMING.hostGone = 10000; // Herzschlag kommt im Test nur im 1-s-Takt → keine Übernahme in Ruhephasen
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }) });
  const w = player(hub, 'W', 'Oma', { want: 'watch' });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play' && w.table);
  await sleep(300);
  assert.equal(h.link.relayWanted, null, 'alle direkt → kein Relay');
  g.link.via = 'relay'; // Gast nur noch über Relay erreichbar, Zuschauer weiter direkt
  await until(() => h.link.relayWanted && g.link.relayWanted, 2000, 'Host und Gast schalten Relay zu');
  assert.match(h.link.relayWanted, /Mitspieler/);
  assert.match(g.link.relayWanted, /Gastgeber/);
  assert.equal(w.link.relayWanted, null, 'Zuschauer mit direktem Host braucht kein Relay');
  assert.equal(h.role, 'host');
  h.close(); g.close(); w.close();
  TIMING.hostGone = keep;
});


// ---------- Tagesspurt: Karten (verdeckt), Würfel (fair), mehrere Sitze ----------
const schnapsen = gameOf('schnapsen').engine;
const backgammon = gameOf('backgammon').engine;
const handsOf = (gs) => gs.hands;

await ok('Schnapsen online: Gast sieht die Hand des Hosts nie, fair gemischt, ganze Partie', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'schnapsen', opts: { bummerl: 2 }, host: { pid: 'H', name: 'Peter' } }) });
  const w = player(hub, 'W', 'Zaungast', { want: 'watch' });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play' && g.table.gs.phase === 'play', 3000, 'Karten ausgeteilt');
  const rng = mulberry32(5);
  let steps = 0, sawHost = 0, spiele = 0;
  while (h.table.status === 'play' && steps < 3000) {
    // Sicherheit: kein Gast-/Zuschauer-Stand enthält eine Karte aus der Hand des anderen
    const hostHand = h.table.gs.hands[0].filter(Boolean);
    const gj = JSON.stringify(g.table.gs.hands[0]) + JSON.stringify(g.table.gs.talon);
    const wj = JSON.stringify(w.table ? w.table.gs.hands : []);
    if (h.table.gs.phase === 'play' && (hostHand.some((c) => gj.includes(`"${c}"`)) || wj.includes('"'))) sawHost++;
    const turn = schnapsen.currentPlayer(h.table.gs);
    const who = turn === 0 ? h : g;
    if (turn === null || who.pendingMove) { await sleep(3); continue; }
    const legal = schnapsen.legalMoves(who.table.gs);
    if (!legal.length) { await sleep(3); continue; }
    const pick1 = legal.find((m) => m.type === 'ausmelden' && schnapsen.canDeclare(who.table.gs)) || legal.find((m) => m.type === 'weiter') || pick(rng, legal.filter((m) => m.type !== 'ausmelden'));
    if (pick1.type === 'weiter') spiele++;
    const n = h.table.nmoves;
    const r = who.submitMove(pick1);
    assert.ok(r.ok, 'Zug angenommen: ' + JSON.stringify(pick1) + ' ' + r.reason);
    await until(() => h.table.nmoves === n + 1 && !who.pendingMove && g.table.seq === h.table.seq, 3000, 'Zug verteilt');
    steps++;
  }
  assert.equal(sawHost, 0, 'Gast/Zuschauer hat Karten des Hosts gesehen');
  assert.equal(h.table.status, 'over', 'Partie zu Ende');
  await until(() => g.table.seq === h.table.seq && g.fairCheck && g.fairCheck.n === h.table.fair.log.length, 2000, 'Protokoll beim Gast');
  assert.ok(h.table.fair.log.length >= spiele, 'jede Mischung veröffentlicht');
  assert.ok(g.fairCheck.ok && g.fairCheck.checked === h.table.fair.log.length && g.fairCheck.fallback === 0, JSON.stringify(g.fairCheck));
  assert.ok(!('fairPriv' in g.table), 'private Host-Daten nicht verschickt');
  console.log(`   ${steps} Züge, ${spiele + 1} Spiele, ${g.fairCheck.checked} Mischungen vom Gast geprüft`);
  h.close(); g.close(); w.close();
});

await ok('Fair Play: gefälschtes Kettenglied wird abgelehnt, manipulierte Mischung erkannt', async () => {
  const { verifyFair, chainLink, mixLinks, permFrom } = await import('../../src/net/fair.js');
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'backgammon', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play' && g.table.fair && g.table.fair.commits.every(Boolean), 3000, 'Commits');
  // Eröffnungswurf braucht beide Glieder: Gast liefert, Host würfelt
  await until(() => h.table.fair.k >= 1 && !h.table.fairNeed, 3000, 'Eröffnungswurf');
  const k = h.table.fair.k + 1;
  assert.equal(h._takeReveal(1, { k, link: 'ab'.repeat(32) }), false, 'falsches Glied abgelehnt');
  // Protokoll-Fälschung: Wert ändern → Prüfung schlägt fehl
  const fair = JSON.parse(JSON.stringify(h.table.fair));
  assert.ok(verifyFair(fair).ok, 'echtes Protokoll ok');
  fair.log[0].value = [6, 6];
  const bad = verifyFair(fair);
  assert.ok(!bad.ok || JSON.stringify(h.table.fair.log[0].value) === '[6,6]', 'gefälschter Wurf erkannt');
  const f2 = JSON.parse(JSON.stringify(h.table.fair));
  f2.log[0].links[1] = chainLink('anderer-seed', 1);
  assert.ok(!verifyFair(f2).ok, 'fremdes Kettenglied erkannt');
  // Mischung: Host behauptet andere Permutation
  const links = [chainLink('a', 1), chainLink('b', 1)];
  const good = { commits: [chainLink('a', 0), chainLink('b', 0)], log: [{ k: 1, kind: 'shuffle', n: 20, links, value: permFrom(mixLinks(links, 1, 'shuffle'), 20) }] };
  assert.ok(verifyFair(good).ok);
  good.log[0].value = [...good.log[0].value].reverse();
  assert.ok(!verifyFair(good).ok, 'andere Mischung erkannt');
  h.close(); g.close();
});

await ok('Backgammon online: Würfel aus beiden Ketten, Gast prüft jeden Wurf, einige Züge', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'backgammon', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play' && backgammon.currentPlayer(h.table.gs) !== null, 3000, 'Eröffnung');
  const rng = mulberry32(9);
  for (let i = 0; i < 40 && h.table.status === 'play'; i++) {
    const turn = backgammon.currentPlayer(h.table.gs);
    const who = turn === 0 ? h : g;
    if (turn === null || who.pendingMove || who.table.seq !== h.table.seq) { await sleep(3); i--; continue; }
    const legal = backgammon.legalMoves(who.table.gs).filter((m) => m.type !== 'double');
    const m = pick(rng, legal);
    const n = h.table.nmoves;
    assert.ok(who.submitMove(m).ok);
    await until(() => h.table.nmoves === n + 1 && !h.table.fairNeed && g.table.seq === h.table.seq, 3000, 'Zug/Wurf verteilt');
  }
  assert.ok(h.table.fair.log.length >= 5, 'Würfe im Protokoll');
  assert.ok(h.table.fair.log.every((e) => !e.fallback));
  await until(() => g.fairCheck && g.fairCheck.n === h.table.fair.log.length, 2000);
  assert.ok(g.fairCheck.ok, JSON.stringify(g.fairCheck));
  console.log(`   ${h.table.fair.log.length} Würfe vom Gast geprüft`);
  h.close(); g.close();
});

await ok('Mehr-Sitz-Tisch: Blackjack 4 Sitze, 2 Gäste + Computer, alle sehen denselben Tisch', async () => {
  const hub = new Hub();
  const t0 = newTable({ game: 'blackjack', opts: { players: 4 }, host: { pid: 'H', name: 'Peter' } });
  assert.equal(t0.seats.length, 4);
  const h = player(hub, 'H', 'Peter', { table: t0 });
  const a = player(hub, 'A', 'Anna');
  const b = player(hub, 'B', 'Berni');
  await until(() => h.table.seats.filter(Boolean).length === 3, 3000, 'drei sitzen');
  assert.equal(h.table.status, 'wait');
  assert.ok(h.act('fill-bots').ok);
  await until(() => a.table.status === 'play' && b.table.status === 'play' && h.table.fair.k >= 1, 3000, 'Start mit Computer auf Platz 4');
  assert.ok(h.table.seats[3].bot);
  const bj = gameOf('blackjack').engine;
  const rng = mulberry32(3);
  const byPid = { H: h, A: a, B: b };
  let moves = 0;
  for (let i = 0; i < 3000 && moves < 40 && h.table.status === 'play'; i++) {
    const turn = bj.currentPlayer(h.table.gs);
    const p = turn === null ? null : h.table.seats[turn];
    if (!p || p.bot || byPid[p.pid].pendingMove) { await sleep(5); continue; }
    const who = byPid[p.pid];
    if (who.table.seq !== h.table.seq) { await sleep(3); continue; }
    const legal = bj.legalMoves(who.table.gs);
    const m = pick(rng, legal);
    const n = h.table.nmoves;
    assert.ok(who.submitMove(m).ok, JSON.stringify(m));
    await until(() => h.table.nmoves > n, 3000, 'Zug');
    moves++;
  }
  const sum = (gs) => gs.beans.reduce((x, y) => x + y, 0);
  assert.equal(sum(h.table.gs), 400);
  await until(() => a.table.seq === h.table.seq && b.table.seq === h.table.seq, 3000);
  assert.equal(JSON.stringify(a.table.gs.beans), JSON.stringify(h.table.gs.beans));
  assert.ok(!JSON.stringify(a.table.gs.shoe).match(/[AKQJT2-9][SHDC]/), 'Schuh beim Gast verdeckt');
  console.log(`   ${moves} Züge von Menschen, Runde ${h.table.gs.round}, Phase ${h.table.gs.phase}, am Zug ${bj.currentPlayer(h.table.gs)}, need ${JSON.stringify(h.table.fairNeed)}, status ${h.table.status}, seqs ${h.table.seq}/${a.table.seq}/${b.table.seq}`);
  h.close(); a.close(); b.close();
});

await ok('Ludo online: 4 Sitze, 2 Gäste + Computer, ein fairer Würfel je Wurf, Gast prüft jeden Wurf', async () => {
  const hub = new Hub();
  const t0 = newTable({ game: 'ludo', opts: { players: 4 }, host: { pid: 'H', name: 'Peter' } });
  const h = player(hub, 'H', 'Peter', { table: t0 });
  const a = player(hub, 'A', 'Anna');
  const b = player(hub, 'B', 'Berni');
  await until(() => h.table.seats.filter(Boolean).length === 3, 3000, 'drei sitzen');
  assert.ok(h.act('fill-bots').ok);
  await until(() => a.table.status === 'play' && b.table.status === 'play', 3000, 'Start');
  const ld = gameOf('ludo').engine;
  const rng = mulberry32(5);
  const byPid = { H: h, A: a, B: b };
  let moves = 0;
  for (let i = 0; i < 4000 && moves < 60 && h.table.status === 'play'; i++) {
    const turn = ld.currentPlayer(h.table.gs);
    const p = turn === null ? null : h.table.seats[turn];
    if (!p || p.bot || byPid[p.pid].pendingMove || h.table.fairNeed) { await sleep(3); continue; }
    const who = byPid[p.pid];
    if (who.table.seq !== h.table.seq) { await sleep(3); continue; }
    const m = pick(rng, ld.legalMoves(who.table.gs));
    const n = h.table.nmoves;
    assert.ok(who.submitMove(m).ok);
    await until(() => h.table.nmoves > n && !h.table.fairNeed, 3000, 'Zug verteilt');
    moves++;
  }
  const log = h.table.fair.log;
  assert.ok(log.length >= 10 && log.every((e) => !e.fallback && e.n === 1 && e.value.length === 1), `${log.length} Würfe mit einem Würfel`);
  await until(() => a.fairCheck && a.fairCheck.n === h.table.fair.log.length, 3000);
  assert.ok(a.fairCheck.ok, JSON.stringify(a.fairCheck));
  console.log(`   ${moves} Züge der Gäste, ${log.length} Würfe von Anna geprüft`);
  h.close(); a.close(); b.close();
});

await ok('Schiffe versenken online: Gast sieht die Flotte des Hosts nie (Zustand, letzter Zug, Verlauf), bis sie versenkt ist', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'schiffe', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play', 3000, 'Start');
  const sv = gameOf('schiffe').engine;
  const rng = mulberry32(11);
  const hostFleet = sv.randomFleet(h.table.opts, rng);
  assert.ok(h.submitMove({ type: 'place', ships: hostFleet }).ok);
  await until(() => g.table.nmoves === 1, 3000, 'Host hat gesetzt');
  const hostCells = new Set(hostFleet.flatMap((x) => sv.cells(x)));
  const leak = () => {
    const t = g.table;
    if (t.gs.fleets[0] !== null && t.gs.phase !== 'over') return 'Flotte im Zustand';
    for (const e of [t.last, ...t.hist]) if (e && e.m && e.m.ships && e.by === 0) return 'Flotte im Verlauf';
    // offen dürfen nur versenkte Schiffe sein
    const shown = new Set((t.gs.revealed ? t.gs.revealed[0] : []).flatMap((x) => sv.cells(x)));
    const hits = new Set(t.gs.shots[1].filter((x) => x.hit).map((x) => x.i));
    for (const i of shown) if (!hits.has(i)) return 'versenktes Schiff ohne Treffer';
    return null;
  };
  assert.equal(leak(), null);
  assert.ok(g.submitMove({ type: 'place', ships: sv.randomFleet(g.table.opts, rng) }).ok);
  await until(() => h.table.gs.phase === 'shoot', 3000, 'beide gesetzt');
  let shots = 0;
  for (let i = 0; i < 400 && h.table.status === 'play'; i++) {
    const turn = sv.currentPlayer(h.table.gs);
    const who = turn === 0 ? h : g;
    if (who.pendingMove || who.table.seq !== h.table.seq) { await sleep(3); i--; continue; }
    const m = pick(rng, sv.legalMoves(who.table.gs));
    const n = h.table.nmoves;
    assert.ok(who.submitMove(m).ok);
    await until(() => h.table.nmoves === n + 1 && g.table.seq === h.table.seq, 3000, 'Schuss verteilt');
    if (h.table.status === 'play') assert.equal(leak(), null, 'nach Schuss ' + shots);
    shots++;
  }
  assert.equal(h.table.status, 'over');
  assert.ok(g.table.gs.fleets[0], 'nach dem Ende sind beide Flotten offen');
  console.log(`   ${shots} Schüsse, ${h.table.result.reason}; Gast sah bis zum Ende nur versenkte Schiffe (${hostCells.size} Felder verdeckt)`);
  h.close(); g.close();
});

await ok('Mau-Mau online: 3 Sitze (2 Gäste + Computer), keiner sieht fremde Karten, Mischungen erst nach dem Spiel offen und geprüft', async () => {
  const hub = new Hub();
  const t0 = newTable({ game: 'maumau', opts: { players: 3 }, host: { pid: 'H', name: 'Peter' } });
  const h = player(hub, 'H', 'Peter', { table: t0 });
  const a = player(hub, 'A', 'Anna');
  await until(() => h.table.seats.filter(Boolean).length === 2, 3000, 'zwei sitzen');
  assert.ok(h.act('fill-bots').ok);
  await until(() => a.table.status === 'play' && a.table.gs.phase === 'play', 3000, 'ausgeteilt');
  const mm = gameOf('maumau').engine;
  const rng = mulberry32(21);
  const byPid = { H: h, A: a };
  let moves = 0, reshuffles = 0;
  for (let i = 0; i < 20000 && h.table.status === 'play'; i++) {
    const turn = mm.currentPlayer(h.table.gs);
    const p = turn === null ? null : h.table.seats[turn];
    if (!p || p.bot || byPid[p.pid].pendingMove || h.table.fairNeed) { await sleep(2); continue; }
    const who = byPid[p.pid];
    if (who.table.seq !== h.table.seq) { await sleep(2); continue; }
    // Gast sieht nur die eigene Hand, nie den Stapel
    const ag = a.table.gs, aSeat = seatOf(a.table, 'A');
    ag.hands.forEach((hd, q) => { if (q !== aSeat) assert.ok(hd.every((c) => c === null), 'fremde Hand sichtbar'); });
    assert.ok(ag.stock.every((c) => c === null), 'Stapel sichtbar');
    // während des Spiels keine Mischung im öffentlichen Protokoll (sonst wären die Starthände berechenbar)
    assert.ok(!(h.table.fair.log || []).some((e) => e.kind === 'shuffle'), 'Mischung vor Spielende veröffentlicht');
    const legal = mm.legalMoves(who.table.gs);
    const plays = legal.filter((m) => m.type === 'play');
    const m = plays.length && rng() < 0.3 ? pick(rng, plays) : pick(rng, legal);   // oft ziehen → Nachmischen kommt vor
    const n = h.table.nmoves, k = h.table.fair.k;
    assert.ok(who.submitMove(m).ok, JSON.stringify(m));
    await until(() => h.table.nmoves > n && !h.table.fairNeed, 3000, 'Zug verteilt');
    if (h.table.fair.k > k) reshuffles++;
    moves++;
  }
  assert.equal(h.table.status, 'over');
  const log = h.table.fair.log;
  assert.ok(log.length >= 1 && log.every((e) => e.kind === 'shuffle' && !e.fallback));
  await until(() => a.fairCheck && a.fairCheck.n === log.length, 3000);
  assert.ok(a.fairCheck.ok, JSON.stringify(a.fairCheck));
  console.log(`   ${moves} Züge der Menschen, ${log.length} Mischung(en) (davon ${reshuffles} Nachmischen) nach dem Spiel von Anna geprüft, ${h.table.result.reason}`);
  h.close(); a.close();
});

await ok('Würfelglück online: gehaltene Würfel bleiben, nur die übrigen werden fair gewürfelt (n = 5 − gehalten), Gast prüft jeden Wurf', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'wuerfel', opts: { players: 2 }, host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play', 3000, 'Start');
  const wg = gameOf('wuerfel').engine;
  const rng = mulberry32(17);
  let rolls = 0;
  for (let i = 0; i < 60 && h.table.status === 'play'; i++) {
    const turn = wg.currentPlayer(h.table.gs);
    const who = turn === 0 ? h : g;
    if (turn === null || who.pendingMove || who.table.seq !== h.table.seq || h.table.fairNeed) { await sleep(3); i--; continue; }
    const legal = wg.legalMoves(who.table.gs);
    const m = pick(rng, legal);
    const before = who.table.gs.dice;
    const n = h.table.nmoves;
    assert.ok(who.submitMove(m).ok);
    await until(() => h.table.nmoves === n + 1 && !h.table.fairNeed && g.table.seq === h.table.seq, 3000, 'verteilt');
    if (m.type === 'roll') {
      rolls++;
      const e = h.table.fair.log[h.table.fair.log.length - 1];
      assert.equal(e.n, m.hold.filter((x) => !x).length, 'Würfelzahl = nicht gehaltene');
      if (before) m.hold.forEach((x, k) => { if (x) assert.equal(h.table.gs.dice[k], before[k], 'gehaltener Würfel bleibt'); });
    }
  }
  await until(() => g.fairCheck && g.fairCheck.n === h.table.fair.log.length, 3000);
  assert.ok(g.fairCheck.ok && h.table.fair.log.every((e) => !e.fallback), JSON.stringify(g.fairCheck));
  console.log(`   ${rolls} Würfe, alle vom Gast geprüft`);
  h.close(); g.close();
});

await ok('Paare finden online: verdeckte Karten kennt nur der Host-Speicher, Gast sieht genau die offenen, fair gemischt', async () => {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'paare', opts: { paare: 8, players: 2 }, host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play' && g.table.gs.phase === 'play', 3000, 'Start');
  const pa = gameOf('paare').engine;
  const rng = mulberry32(31);
  let moves = 0;
  for (let i = 0; i < 500 && h.table.status === 'play'; i++) {
    const turn = pa.currentPlayer(h.table.gs);
    const who = turn === 0 ? h : g;
    if (turn === null || who.pendingMove || who.table.seq !== h.table.seq) { await sleep(2); i--; continue; }
    const H = h.table.gs, G = g.table.gs;
    G.cards.forEach((c, k) => {
      const open = H.found[k] !== null || H.open.includes(k) || (H.shown && H.shown.includes(k));
      assert.equal(c, open ? H.cards[k] : null, 'Gast sieht genau die offenen Karten');
    });
    const n = h.table.nmoves;
    assert.ok(who.submitMove(pick(rng, pa.legalMoves(who.table.gs))).ok);
    await until(() => h.table.nmoves === n + 1 && g.table.seq === h.table.seq, 3000, 'verteilt');
    moves++;
  }
  assert.equal(h.table.status, 'over');
  await until(() => g.fairCheck && g.fairCheck.n === h.table.fair.log.length && g.fairCheck.checked >= 1, 3000);
  assert.ok(g.fairCheck.ok);
  console.log(`   ${moves} Züge, ${h.table.result.reason}, Mischung nach dem Spiel geprüft`);
  h.close(); g.close();
});

await ok("Hold'em online: 3 Geräte + Computer + Zuschauer – jede Nachricht nur mit eigenen Hole Cards, fair gemischt je Hand", async () => {
  const hub = new Hub();
  const he = gameOf('holdem').engine;
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'holdem', opts: { players: 4, start: 500, blinds: 'schnell', timer: 0 }, host: { pid: 'H', name: 'Peter' } }) });
  // gezielte Nachrichten des Hosts mitschreiben (Empfänger + Inhalt)
  const out = [];
  const send0 = h.link.send.bind(h.link);
  h.link.send = (msg, to) => { if (msg.t === 'state') out.push({ to: to || '*', gs: msg.table.gs }); return send0(msg, to); };
  const a = player(hub, 'A', 'Anna');
  const b = player(hub, 'B', 'Ben');
  await until(() => a.table && b.table && h.table.seats.filter(Boolean).length === 3, 3000, 'Plätze');
  const z = player(hub, 'Z', 'Zoe', { want: 'watch' });
  assert.ok(h.act('fill-bots').ok);
  await until(() => h.table.status === 'play' && h.table.gs.phase === 'bet', 3000, 'erste Hand');
  const seatOfPid = (pid) => seatOf(h.table, pid);
  const ppl = [h, a, b];
  let moves = 0, hands0 = h.table.gs.hand;
  for (let i = 0; i < 3000 && h.table.status === 'play' && h.table.gs.hand < hands0 + 12; i++) {
    const turn = he.currentPlayer(h.table.gs);
    const who = ppl.find((x) => x.mySeat === turn);
    // Sichten aller Geräte prüfen: fremde Hole Cards nie sichtbar (außer All-in aufgedeckt)
    for (const x of [a, b, z]) {
      if (!x.table || x.table.seq !== h.table.seq) continue;
      const me = x.mySeat;
      x.table.gs.holes.forEach((hc, q) => { if (q !== me && !h.table.gs.shown[q]) assert.ok(hc.every((c) => c === null), `${x.me.name} sieht Karten von Sitz ${q}`); });
      assert.ok(x.table.gs.deck.every((c) => c === null), 'Stapel verdeckt');
    }
    if (!who || who.pendingMove || who.table.seq !== h.table.seq) { await sleep(2); continue; }
    const m = heBot.chooseMove(who.table.gs, { level: 2, iters: 60 });
    assert.ok(who.submitMove(m).ok, JSON.stringify(m));
    moves++;
    await sleep(1);
  }
  // alle verschickten Stände: Empfänger sieht nur die eigenen Hole Cards
  for (const e of out) {
    const seat = e.to === '*' ? null : seatOfPid(e.to);
    e.gs.holes.forEach((hc, q) => { if (q !== seat && !e.gs.shown[q]) assert.ok(hc.every((c) => c === null), `Nachricht an ${e.to} enthält Karten von Sitz ${q}`); });
    assert.ok(e.gs.deck.every((c) => c === null), 'Stapel in Nachricht');
    for (const k of Object.keys(e.gs.lastHoles || {})) assert.equal(Number(k), seat, 'weggelegte Karten nur an den Besitzer');
  }
  assert.ok(out.some((e) => e.to === 'Z'), 'Zuschauer bekam Stände');
  assert.ok(h.table.gs.hand >= hands0 + 5, 'mehrere Hände gespielt');
  // Mischungen früherer Hände sind veröffentlicht und von allen (auch dem Zuschauer) geprüft
  await until(() => [a, b, z].every((x) => x.fairCheck && x.fairCheck.n === h.table.fair.log.length && x.fairCheck.checked >= 3), 4000, 'Prüfung');
  for (const x of [a, b, z]) assert.ok(x.fairCheck.ok && !x.fairCheck.fallback, JSON.stringify(x.fairCheck));
  console.log(`   ${moves} Züge, ${h.table.gs.hand - hands0} Hände, ${out.length} Stände geprüft, ${a.fairCheck.checked} Mischungen von jedem Gerät geprüft`);
  h.close(); a.close(); b.close(); z.close();
});

await ok("Hold'em: Zeitlimit checkt/foldet automatisch, abwesender Spieler ebenso, „show“ zeigt weggelegte Karten", async () => {
  const save = { ...TIMING };
  Object.assign(TIMING, { timerUnit: 10, timerGrace: 20, awayMove: 60, awayStart: 0 });
  try {
    const hub = new Hub();
    const he = gameOf('holdem').engine;
    const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'holdem', opts: { players: 3, timer: 15 }, host: { pid: 'H', name: 'Peter' } }) });
    const a = player(hub, 'A', 'Anna');
    await until(() => a.table && h.table.seats.filter(Boolean).length === 2, 3000);
    assert.ok(h.act('fill-bots').ok);
    // niemand handelt: nach 15 × 10 ms + Zuschlag kommt der automatische Zug
    await until(() => h.table.hist.some((e) => /Zeit um/.test(e.d)), 3000, 'Zeitlimit');
    const auto = h.table.hist.find((e) => /Zeit um/.test(e.d));
    assert.ok(/steigt aus|checkt/.test(auto.d), auto.d);
    // Anna trennt sich: ihr Platz handelt sofort automatisch (nicht da)
    Object.assign(TIMING, { timerUnit: 100000 });
    a.link.disconnect();
    await until(() => h.table.hist.some((e) => /nicht da/.test(e.d)), 4000, 'abwesend');
    // „show“: Host gewinnt eine Hand ohne Showdown bzw. legt weg → darf zeigen
    await until(() => {
      const gs = h.table.gs;
      return gs.lastHoles && gs.lastHoles[h.mySeat];
    }, 8000, 'Host hat weggelegte/ungezeigte Karten').catch(() => null);
    const gs = h.table.gs;
    if (gs.lastHoles && gs.lastHoles[h.mySeat]) {
      assert.ok(h.act('show').ok);
      assert.deepEqual(h.table.gs.lastHand.shown[h.mySeat], gs.lastHoles[h.mySeat]);
      assert.equal(h.act('show').ok, false, 'nur einmal');
    }
    h.close(); a.close();
  } finally { Object.assign(TIMING, save); }
});

// ---------- Netz-Szenarien aus dem Gutachten 2026-10-05 (P1-1, P1-2, P2-1, P2-2, P2-16) ----------
// Ausnahmen in Nachrichten-Rückrufen (im Browser: unbehandelt, Tisch hängt) werden gesammelt statt den Lauf zu beenden.
const uncaught = [];
process.on('uncaughtException', (e) => { uncaught.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); });
const noErrors = (what) => assert.equal(uncaught.length, 0, `${what}: ${uncaught.join(' ‖ ')}`);
const bgBot = await import('../../src/games/backgammon/bot.js');
const halmaE = gameOf('halma').engine;
const ludoE = gameOf('ludo').engine;

// Zug für den, der dran ist (Backgammon/Ludo: Würfeln bevorzugt), über dessen eigene Sitzung
async function stepAny(all, eng, rng) {
  const ref = all.find((s) => s.role === 'host');
  const t = ref.table;
  const turn = eng.currentPlayer(t.gs);
  const p = turn === null ? null : t.seats[turn];
  if (!p || p.bot) { await sleep(5); return false; }
  const s = all.find((x) => x.me.pid === p.pid);
  if (!s || s.pendingMove || s.table.seq !== t.seq) { await sleep(5); return false; }
  const legal = eng.legalMoves(s.table.gs).filter((m) => m.type !== 'double');
  if (!legal.length) { await sleep(5); return false; }
  const m = legal.find((x) => x.type === 'roll') || pick(rng, legal);
  const r = s.submitMove(m);
  assert.ok(r.ok, 'Zug angenommen: ' + JSON.stringify(m) + ' ' + r.reason);
  return true;
}

await ok('Gutachten P1-1: Backgammon, Host trennt → Gast übernimmt → beide ziehen, zwei Würfe, alle prüfen fair', async () => {
  uncaught.length = 0;
  const keep = { ...TIMING };
  Object.assign(TIMING, { fairWait: 600 });
  try {
    const hub = new Hub(), hs = {};
    let h = player(hub, 'H', 'Peter', { table: newTable({ game: 'backgammon', opts: { cube: false }, host: { pid: 'H', name: 'Peter' } }), store: hs });
    const g = player(hub, 'G', 'Anna');
    const w = player(hub, 'W', 'Oma', { want: 'watch' });
    await until(() => g.table && g.table.status === 'play' && w.table && backgammon.currentPlayer(h.table.gs) !== null, 3000, 'Eröffnungswurf');
    await sleep(60);
    h.close(); h.link.disconnect();
    await until(() => g.role === 'host', 3000, 'Gast übernimmt');
    h = player(hub, 'H', 'Peter', { table: hs.t, store: hs });
    await until(() => h.role === 'client' && h.table.epoch === g.table.epoch, 3000, 'alter Host ordnet sich unter');
    const k0 = g.table.fair ? g.table.fair.log.filter((e) => e.kind === 'dice').length : 0;
    const rng = mulberry32(13);
    const all = [g, h];
    for (let i = 0; i < 400; i++) {
      noErrors('Fehler im Netz-Ablauf');
      const rolls = g.table.fair ? g.table.fair.log.filter((e) => e.kind === 'dice' && !e.fallback).length - k0 : 0;
      if (rolls >= 2 || g.table.status !== 'play') break;
      await stepAny(all, backgammon, rng);
      await sleep(10);
    }
    noErrors('Fehler im Netz-Ablauf');
    await until(() => g.table.fair.log.filter((e) => !e.fallback).length >= k0 + 2, 3000, 'zwei geprüfte Würfe nach der Übernahme');
    await until(() => h.table.seq === g.table.seq && w.table.seq === g.table.seq && !h.pendingMove, 3000, 'alle gleich');
    assert.ok(same(g, h) && same(g, w), 'Stände gleich');
    for (const x of [g, h, w]) {
      await until(() => x.fairCheck && x.fairCheck.n === g.table.fair.log.length, 3000, 'Prüfung bei ' + x.me.name);
      assert.equal(x.fairCheck.ok, true, x.me.name + ' ' + JSON.stringify(x.fairCheck));
    }
    h.close(); g.close(); w.close();
  } finally { Object.assign(TIMING, keep); }
});

await ok('Gutachten P1-2: Halma zu dritt, Host trennt → nach 2 s genau ein Host, beide Tische gleich', async () => {
  uncaught.length = 0;
  // Herzschlag kommt im Test nur im 1-s-Takt → hostGone darüber, sonst hielte G2 den neuen Host G1 kurz für weg
  const keep = { ...TIMING };
  TIMING.hostGone = 1500;
  try {
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'halma', opts: { players: 3 }, host: { pid: 'H', name: 'Peter' } }) });
  const g1 = player(hub, 'G1', 'Anna');
  const g2 = player(hub, 'G2', 'Bert');
  await until(() => g1.table && g1.table.status === 'play' && g2.table && g2.table.status === 'play', 3000, 'Partie läuft');
  await sleep(60);
  h.close(); h.link.disconnect();
  await until(() => g1.role === 'host' || g2.role === 'host', 5000, 'jemand übernimmt');
  await sleep(2000);
  assert.equal([g1, g2].filter((s) => s.role === 'host').length, 1, `Hosts: G1 ${g1.role}, G2 ${g2.role}`);
  assert.equal(g1.table.hostPid, g2.table.hostPid);
  assert.ok(same(g1, g2), 'Tische gleich');
  // Zug geht beim einen Host an
  const turn = halmaE.currentPlayer(g1.table.gs);
  const who = [g1, g2].find((s) => s.mySeat === turn);
  if (who) {
    const n = g1.table.nmoves;
    assert.ok(who.submitMove(halmaE.legalMoves(who.table.gs)[0]).ok);
    await until(() => g1.table.nmoves === n + 1 && g2.table.nmoves === n + 1 && !who.pendingMove, 3000, 'Zug nach Übernahme');
  }
  noErrors('Fehler');
  g1.close(); g2.close();
  } finally { Object.assign(TIMING, keep); }
});

await ok('Gutachten P1-2: gleichzeitige Übernahme (ohne Staffelung) → Gleichstand, größere pid gibt nach', async () => {
  uncaught.length = 0;
  const keep = { ...TIMING };
  // Übernahme hier von Hand; Herzschlag im Test nur im 1-s-Takt → sonst übernähme der Unterlegene später erneut
  Object.assign(TIMING, { takeoverStep: 0, hostGone: 10000 });
  try {
    const hub = new Hub();
    const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'halma', opts: { players: 3 }, host: { pid: 'H', name: 'Peter' } }) });
    const g1 = player(hub, 'G1', 'Anna');
    const g2 = player(hub, 'G2', 'Bert');
    await until(() => g1.table && g1.table.status === 'play' && g2.table && g2.table.status === 'play', 3000, 'Partie läuft');
    await sleep(60);
    h.close(); h.link.disconnect();
    g1._takeOver(); g2._takeOver();   // beide im selben Augenblick → gleicher (epoch, seq)
    assert.equal(g1.table.epoch, g2.table.epoch);
    assert.equal(g1.table.seq, g2.table.seq);
    await sleep(1500);
    assert.equal(g1.role, 'host', 'kleinere pid bleibt Host');
    assert.equal(g2.role, 'client');
    assert.ok(same(g1, g2), 'Tische gleich');
    noErrors('Fehler');
    g1.close(); g2.close();
  } finally { Object.assign(TIMING, keep); }
});

await ok('Gutachten P2-1: Ludo zu dritt, Gast gibt auf → Computer übernimmt → nach 6 Würfen fair bei Host und G2', async () => {
  uncaught.length = 0;
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'ludo', opts: { players: 3 }, host: { pid: 'H', name: 'Peter' } }) });
  const g1 = player(hub, 'G1', 'Anna');
  const g2 = player(hub, 'G2', 'Bert');
  await until(() => g1.table && g1.table.status === 'play' && g2.table && g2.table.status === 'play', 3000, 'Partie läuft');
  const all = [h, g1, g2];
  const rng = mulberry32(17);
  for (let i = 0; i < 400 && h.table.fair.k < 4; i++) await stepAny(all, ludoE, rng);
  await until(() => g2.fairCheck && g2.fairCheck.checked > 0, 3000, 'erste Würfe geprüft');
  assert.ok(g2.fairCheck.ok);
  await until(() => !g1.pendingMove && g1.table.seq === h.table.seq, 3000, 'G1 ruhig');
  g1.act('resign');
  await until(() => h.table.seats.some((x) => x && x.bot), 3000, 'Computer übernimmt');
  const done = () => h.table.fair.log.filter((e) => !e.fallback).length;
  const before = done();
  for (let i = 0; i < 2000 && done() < before + 6 && h.table.status === 'play'; i++) await stepAny([h, g2], ludoE, rng);
  assert.ok(done() >= before + 6 || h.table.status !== 'play', 'sechs Würfe nach der Aufgabe');
  await until(() => g2.table.seq === h.table.seq && g2.fairCheck && g2.fairCheck.n === g2.table.fair.log.length, 3000, 'G2 aktuell');
  assert.equal(h.fairCheck.ok, true, 'Host ' + JSON.stringify(h.fairCheck));
  assert.equal(g2.fairCheck.ok, true, 'G2 ' + JSON.stringify(g2.fairCheck));
  noErrors('Fehler');
  h.close(); g1.close(); g2.close();
});

await ok('Gutachten P2-2: Host committet, während ein Gastzug unterwegs ist → Zug kommt an (oder Meldung), nie still weg', async () => {
  uncaught.length = 0;
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play');
  h.submitMove({ to: 0 });
  await until(() => g.table.nmoves === 1 && g.table.seq === h.table.seq);
  const toasts = [];
  g.on('toast', (x) => toasts.push(x));
  assert.ok(g.submitMove({ to: 23 }).ok);
  h._commit({ kind: 'fair' });   // Host ändert gleichzeitig etwas anderes (wie _hostOnFair eines dritten Spielers)
  await until(() => (h.table.nmoves === 2 && !g.pendingMove && g.table.seq === h.table.seq) || toasts.length > 0, 3000, 'Zug angekommen oder gemeldet');
  // der Zug passt auch auf den neuen Stand → automatisch einmal neu gesendet, kein Toast nötig
  assert.equal(toasts.length, 0, toasts.join(' | '));
  assert.deepEqual(h.table.last.m, { to: 23 });
  assert.ok(same(h, g));
  assert.equal(g.stats.moveRetries, 1);
  noErrors('Fehler');
  h.close(); g.close();
});

await ok('Gutachten P2-16: Übernahme, während ein Wurf aussteht → spätestens nach fairWait geht es weiter', async () => {
  uncaught.length = 0;
  const keep = { ...TIMING };
  Object.assign(TIMING, { fairWait: 300 });
  try {
    const hub = new Hub();
    const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'backgammon', opts: { cube: false }, host: { pid: 'H', name: 'Peter' } }) });
    // Host bekommt die Glieder des Gastes nicht → Eröffnungswurf bleibt offen (Host-fairWait ist hier egal: Host geht gleich)
    const orig = h.link.onMessage;
    h.link.onMessage = (m, f) => { if (m.t !== 'fair') orig(m, f); };
    TIMING.fairWait = 60000;
    const g = player(hub, 'G', 'Anna');
    const w = player(hub, 'W', 'Oma', { want: 'watch' });
    await until(() => g.table && g.table.status === 'play' && g.table.fairNeed && w.table, 3000, 'Wurf steht aus');
    await sleep(100);
    assert.equal(backgammon.currentPlayer(g.table.gs), null, 'Eröffnung offen');
    TIMING.fairWait = 300;
    h.close(); h.link.disconnect();
    await until(() => g.role === 'host', 3000, 'Gast übernimmt');
    await until(() => backgammon.currentPlayer(g.table.gs) !== null, TIMING.fairWait + 2000, 'Wurf nach fairWait');
    await until(() => w.table.seq === g.table.seq, 2000, 'Zuschauer folgt');
    noErrors('Fehler');
    g.close(); w.close();
  } finally { Object.assign(TIMING, keep); }
});

await ok('Gutachten P2-3: andere App-Version → einmal Toast; Stand mit unbekanntem Spiel → abgelehnt, kein Absturz', async () => {
  uncaught.length = 0;
  const hub = new Hub();
  const mk = (pid, name, build, table = null) => {
    const link = new FakeLink(hub, pid, name);
    const s = new TableSession({ mode: 'online', me: { pid, name }, table, link, build });
    s.toasts = [];
    s.on('toast', (x) => s.toasts.push(x));
    s.start(); link.connect();
    return s;
  };
  const h = mk('H', 'Peter', 'neu1', newTable({ game: 'muehle', host: { pid: 'H', name: 'Peter' } }));
  const g = mk('G', 'Anna', 'alt0');
  await until(() => g.table && g.table.status === 'play', 2000, 'Partie läuft');
  h.submitMove({ to: 0 });
  await until(() => g.table.nmoves === 1);
  assert.equal(g.toasts.filter((x) => /andere Version/.test(x)).length, 1, 'Gast: genau einmal');
  assert.equal(h.toasts.filter((x) => /andere Version/.test(x)).length, 1, 'Host: genau einmal');
  // Host schickt ein Spiel, das der Gast nicht kennt
  const seq = g.table.seq;
  h.link.send({ t: 'state', table: { ...h.table, game: 'gibtsnicht', seq: h.table.seq + 5 } }, 'G');
  await sleep(30);
  assert.equal(g.table.game, 'muehle');
  assert.equal(g.table.seq, seq);
  assert.ok(g.toasts.some((x) => /kennt deine Version/.test(x)), g.toasts.join(' | '));
  assert.doesNotThrow(() => g.netStatus());
  noErrors('Fehler');
  h.close(); g.close();
  // gleiche Version: kein Hinweis
  const hub2 = new Hub();
  const mk2 = (pid, table = null) => {
    const link = new FakeLink(hub2, pid, pid);
    const s = new TableSession({ mode: 'online', me: { pid, name: pid }, table, link, build: 'neu1' });
    s.toasts = [];
    s.on('toast', (x) => s.toasts.push(x));
    s.start(); link.connect();
    return s;
  };
  const h2 = mk2('H', newTable({ game: 'muehle', host: { pid: 'H', name: 'H' } }));
  const g2 = mk2('G');
  await until(() => g2.table && g2.table.status === 'play', 2000);
  await sleep(30);
  assert.equal([...h2.toasts, ...g2.toasts].filter((x) => /andere Version/.test(x)).length, 0);
  h2.close(); g2.close();
});

await ok("Gutachten P2-10: Hold'em – Direktweg weg, aber Spieler meldet sich noch → kein automatischer Zug; erst wenn er stumm ist", async () => {
  uncaught.length = 0;
  const keep = { ...TIMING };
  Object.assign(TIMING, { timerUnit: 100000, awayMove: 400, awayStart: 0, hostGone: 100000 });
  try {
    const hub = new Hub();
    const he = gameOf('holdem').engine;
    const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'holdem', opts: { players: 3, timer: 0 }, host: { pid: 'H', name: 'Peter' } }) });
    const a = player(hub, 'A', 'Anna');
    await until(() => a.table && h.table.seats.filter(Boolean).length === 2, 3000);
    assert.ok(h.act('fill-bots').ok);
    const aSeat = () => seatOf(h.table, 'A');
    // bis Anna dran ist (Host zieht selbst, Computer automatisch)
    await until(() => {
      if (h.table.status !== 'play') return false;
      const turn = he.currentPlayer(h.table.gs);
      if (turn === h.mySeat && !h.botBusy) h.submitMove(heBot.chooseMove(h.table.gs, { level: 1, iters: 30 }));
      return turn === aSeat();
    }, 5000, 'Anna am Zug');
    const n = h.table.nmoves;
    h._reachable = (pid) => pid !== 'A';               // Direktweg zu Anna gilt als weg …
    const talk = setInterval(() => a.link.send({ t: 'sync' }, 'H'), 100);   // … aber sie meldet sich
    await sleep(2500);   // Host prüft im 1-s-Takt: mindestens zwei Durchläufe nach Ablauf von awayMove
    assert.equal(h.table.nmoves, n, 'kein automatischer Zug, solange sie sich meldet');
    clearInterval(talk);                               // jetzt stumm
    await until(() => h.table.nmoves > n, 3000, 'automatischer Zug, wenn stumm');
    // (danach zieht ggf. sofort der Computer → im Verlauf suchen)
    assert.ok(h.table.hist.slice(-(h.table.nmoves - n)).some((e) => e.by === aSeat() && /nicht da/.test(e.d)), JSON.stringify(h.table.hist.slice(-3)));
    noErrors('Fehler');
    h.close(); a.close();
  } finally { Object.assign(TIMING, keep); }
});

await ok('Gutachten P1-4: Fair-Log nicht im Stand; Gast lädt neu → behält sein gesammeltes Log, Host schickt nur den Rest', async () => {
  uncaught.length = 0;
  const hub = new Hub(), gst = {};
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'backgammon', opts: { cube: false }, host: { pid: 'H', name: 'Peter' } }) });
  const sent = [];
  const send0 = h.link.send.bind(h.link);
  h.link.send = (msg, to) => { sent.push({ msg: JSON.parse(JSON.stringify(msg)), to }); return send0(msg, to); };
  let g = player(hub, 'G', 'Anna', { store: gst });
  await until(() => g.table && g.table.status === 'play' && backgammon.currentPlayer(h.table.gs) !== null, 3000, 'Eröffnung');
  const rng = mulberry32(29);
  for (let i = 0; i < 400 && h.table.fair.log.length < 8; i++) await stepAny([h, g], backgammon, rng);
  await until(() => g.table.seq === h.table.seq && g.table.fair.log.length === h.table.fair.log.length, 3000, 'Gast hat das Log');
  // kein Stand trägt das Log, n stimmt
  const states = sent.filter((x) => x.msg.t === 'state');
  assert.ok(states.length > 5 && states.every((x) => !x.msg.table.fair || x.msg.table.fair.log.length === 0), 'Log nie im Stand');
  assert.equal(states[states.length - 1].msg.table.fair.n, h.table.fair.log.length);
  assert.ok(gst.t.fair.log.length === h.table.fair.log.length, 'Gast speichert sein Log');
  // Gast lädt neu (Speicherstand), Host würfelt weiter
  const nHave = gst.t.fair.log.length;
  g.close(); g.link.disconnect();
  sent.length = 0;
  g = player(hub, 'G', 'Anna', { table: gst.t, store: gst });
  assert.equal(g.table.fair.log.length, nHave, 'Log sofort aus dem Speicher');
  await until(() => g.fairCheck && g.fairCheck.ok && g.fairCheck.n === nHave, 3000, 'Prüfung nach Neuladen');
  await sleep(50);
  const fromG = sent.filter((x) => x.to === 'G' && (x.msg.fairDelta || x.msg.t === 'fairlog')).map((x) => (x.msg.fairDelta || x.msg).from);
  assert.ok(fromG.every((f) => f >= nHave), `Host schickt nur den Rest (from ${fromG.join(',')}, Gast hat ${nHave})`);
  for (let i = 0; i < 400 && h.table.fair.log.length < nHave + 3; i++) await stepAny([h, g], backgammon, rng);
  await until(() => g.table.fair.log.length === h.table.fair.log.length && g.fairCheck.n === h.table.fair.log.length, 3000, 'weitere Würfe beim Gast');
  assert.ok(g.fairCheck.ok, JSON.stringify(g.fairCheck));
  noErrors('Fehler');
  h.close(); g.close();
});

await ok('Gutachten P1-4: Lücke im Fair-Log (Stand verloren) → Gast fordert nach, Prüfung vollständig', async () => {
  uncaught.length = 0;
  const hub = new Hub();
  const h = player(hub, 'H', 'Peter', { table: newTable({ game: 'backgammon', opts: { cube: false }, host: { pid: 'H', name: 'Peter' } }) });
  const g = player(hub, 'G', 'Anna');
  await until(() => g.table && g.table.status === 'play' && backgammon.currentPlayer(h.table.gs) !== null, 3000, 'Eröffnung');
  // Gast „verliert“ die nächsten Fair-Einträge: Stände kommen an, aber ohne fairDelta
  const orig = g.link.onMessage;
  let drop = true, asked = 0;
  g.link.onMessage = (m, f) => { if (drop && m.t === 'state') delete m.fairDelta; orig(m, f); };
  const sendG = g.link.send.bind(g.link);
  g.link.send = (m, to) => { if (m.t === 'fairlog') asked++; return sendG(m, to); };
  const rng = mulberry32(31);
  const n0 = h.table.fair.log.length;
  for (let i = 0; i < 400 && h.table.fair.log.length < n0 + 3; i++) await stepAny([h, g], backgammon, rng);
  drop = false;
  await until(() => g.table.fair.log.length === h.table.fair.log.length && g.fairCheck && g.fairCheck.n === h.table.fair.log.length, 4000, 'Lücke geschlossen');
  assert.ok(asked > 0, 'nachgefordert');
  assert.ok(g.fairCheck.ok, JSON.stringify(g.fairCheck));
  noErrors('Fehler');
  h.close(); g.close();
});

// Langläufer (≈ 20 s): in der Smoke-Stufe (SB_SMOKE=1) übersprungen
if (!process.env.SB_SMOKE) await ok('Gutachten P1-4: Ludo zu viert, Nachrichten > 64 KB gehen verloren → 600 Würfe, alle synchron, fair geprüft', async () => {
  uncaught.length = 0;
  const hub = new Hub();
  hub.limit = 64 * 1024;
  // vier Menschen mit festen Geräte-Geheimnissen und festem Zugzufall → reproduzierbar lange Partie
  const t0 = newTable({ game: 'ludo', opts: { players: 4 }, host: { pid: 'H', name: 'Peter' } });
  t0.id = 'ludo600';
  const h = player(hub, 'H', 'Peter', { table: t0, secret: 'geheim-H' });
  const a = player(hub, 'A', 'Anna', { secret: 'geheim-A' });
  const b = player(hub, 'B', 'Berni', { secret: 'geheim-B' });
  const c = player(hub, 'C', 'Cleo', { secret: 'geheim-C' });
  await until(() => [a, b, c].every((x) => x.table && x.table.status === 'play'), 3000, 'Start');
  const rng = mulberry32(Number(process.env.LUDO_SEED) || 23);
  const byPid = { H: h, A: a, B: b, C: c };
  const rolls = () => h.table.fair.log.length;
  let maxState = 0;
  for (let i = 0; i < 200000 && rolls() < 600 && h.table.status === 'play'; i++) {
    const turn = ludoE.currentPlayer(h.table.gs);
    const p = turn === null ? null : h.table.seats[turn];
    if (!p || p.bot || h.table.fairNeed) { await sleep(1); continue; }
    const who = byPid[p.pid];
    if (who.pendingMove || who.table.seq !== h.table.seq) { await sleep(1); continue; }
    // langsam spielen (Figur, die am weitesten hinten steht; ab und zu zufällig) → lange Partie, großes Protokoll
    const legal = ludoE.legalMoves(who.table.gs);
    const pcs = who.table.gs.pieces[turn];
    const slow = legal.reduce((m, x) => (x.type === 'move' && (!m || pcs[x.piece] < pcs[m.piece]) ? x : m), null);
    const n = h.table.nmoves;
    const r = who.submitMove(slow && rng() < 0.8 ? slow : pick(rng, legal));
    assert.ok(r.ok, `${r.reason} (Wurf ${rolls()}, verworfen ${hub.dropped}, größte Nachricht ${hub.biggest})`);
    await until(() => h.table.nmoves > n && [a, b, c].every((x) => x.table.seq === h.table.seq), 3000, `Zug verteilt (Wurf ${rolls()}, verworfen ${hub.dropped})`);
    if (i % 50 === 0) maxState = Math.max(maxState, JSON.stringify(h.table).length);
  }
  const kb = JSON.stringify(h.table.fair.log).length / 1024;
  assert.ok(rolls() >= 600 && kb > 96, `600 Würfe, Protokoll weit über der Grenze (${rolls()} Würfe, ${kb.toFixed(0)} KB)`);
  await until(() => [a, b, c].every((x) => x.table.seq === h.table.seq && x.fairCheck && x.fairCheck.n === rolls()), 5000, 'Gäste haben das ganze Protokoll');
  for (const x of [a, b, c]) {
    assert.ok(same(h, x), x.me.name + ' synchron');
    assert.ok(x.fairCheck.ok && x.fairCheck.checked === rolls(), x.me.name + ' ' + JSON.stringify({ ok: x.fairCheck.ok, checked: x.fairCheck.checked, bad: x.fairCheck.bad.slice(0, 2) }));
  }
  assert.equal(hub.dropped, 0, `keine Nachricht über 64 KB (größte ${hub.biggest})`);
  console.log(`   ${rolls()} Würfe, Protokoll ${kb.toFixed(0)} KB, Host-Stand bis ${(maxState / 1024).toFixed(0)} KB, Gäste prüften alle Würfe, 0 Nachrichten verworfen`);
  noErrors('Fehler');
  h.close(); a.close(); b.close(); c.close();
});

console.log(fails ? `\n${fails} Fall/Fälle rot` : '\nTisch-Protokoll grün');
process.exit(fails ? 1 : 0);
