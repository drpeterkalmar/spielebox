// Tisch-Protokoll ohne echtes Netz: Host als Schiedsrichter, Sitzplätze, Zuschauer, Ablehnen illegaler Züge,
// ganze Partie, Wiederaufnahme (Client und Host), Host-Übernahme, Revanche, Remis/Aufgeben, Bot-Modus.
// Aufruf: node tests/node/table.test.mjs
import assert from 'node:assert/strict';
import { TableSession, newTable, TIMING, seatOf } from '../../src/net/table.js';
import { gameOf } from '../../src/games/registry.js';
import { mulberry32, pick } from '../../src/rng.js';
import * as muehleBot from '../../src/games/muehle/bot.js';
import * as bjBot from '../../src/games/blackjack/bot.js';
const BOTS = { blackjack: bjBot.chooseMove, muehle: muehleBot.chooseMove };

Object.assign(TIMING, { heartbeat: 40, hostGone: 400, moveRetry: 150, botDelay: 0, relayAfter: 120 });

let fails = 0;
async function ok(name, fn) {
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

function player(hub, pid, name, { table = null, want = 'play', store = {} } = {}) {
  const link = new FakeLink(hub, pid, name);
  const s = new TableSession({ mode: 'online', me: { pid, name }, want, table, link, save: (t) => { store.t = JSON.parse(JSON.stringify(t)); }, bot: { choose: (g, gs, level) => BOTS[g](gs, { level, timeMs: 30 }) } });
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

console.log(fails ? `\n${fails} Fall/Fälle rot` : '\nTisch-Protokoll grün');
process.exit(fails ? 1 : 0);
