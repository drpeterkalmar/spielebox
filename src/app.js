// Spielebox: Start, Navigation (Lobby ↔ Tisch über den #-Teil der URL), Debug-API window.__box.
import { renderLobby, openGameSheet } from './ui/lobby.js';
import { showTableScreen } from './ui/tablescreen.js';
import { TableSession, newTable, turnOf } from './net/table.js';
import { NetLink } from './net/netlink.js';
import { roomIdFor } from './net/crypto.js';
import { parseWords, randomWords, formatWords, findWord } from './words.js';
import * as store from './store.js';
import { chooseBotMove, quickMove, warmUp } from './botclient.js';
import { gameOf, GAME_LIST, LIVE, seatCount } from './games/registry.js';
import { h, sheet } from './ui/dom.js';
import { ensureDefs } from './ui/svg.js';
import { DEKO, readDeko, applyDeko } from './ui/deko.js';
import { fxState, freeze } from './ui/fx.js';
import { prepareCardArt } from './ui/cards.js';
import { prepare as prepareSprites } from './ui/sprites.js';
import { BUILD } from './build.js';
import { botDelay, levelFrom } from './tempo.js';

const params = new URLSearchParams(location.search);
const RELAY_ONLY = params.get('relay') === '1';
const root = document.getElementById('app');
const netlog = [];
let cur = null;        // { session, screen, link, words, roomId, mode }
let lobby = null;
let routed = null;
let trainer = null;     // Schach-Trainer (erst beim Öffnen geladen)

// Wörter vereinheitlichen: Reihenfolge egal (sortiert → gleicher Raum)
const canon = (ws) => ws.map((w) => findWord(w)).sort();

function me() {
  const p = store.profile();
  return { pid: p.pid, name: p.name || 'Gast' };
}

function hostSeatFor(color) {
  if (color === 'schwarz') return 1;
  if (color === 'zufall') return crypto.getRandomValues(new Uint8Array(1))[0] & 1;
  return 0;
}

function setHash(h, push = true) {
  const url = location.pathname + location.search + (h ? '#' + h : '');
  if (push && location.hash.slice(1) !== h) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
  routed = location.hash;
}

async function leaveTable() {
  if (!cur) return;
  const c = cur;
  cur = null;
  c.screen.destroy();
  c.session.close();
  if (c.link) await c.link.close();
}

function leaveTrainer() {
  if (trainer) { trainer.destroy(); trainer = null; }
}

async function showLobby(prefill) {
  await leaveTable();
  leaveTrainer();
  // neue App-Version ist schon aktiv (Service-Worker): jetzt, zwischen zwei Partien, neu laden
  if (window.__updateReady) { location.reload(); return; }
  document.body.dataset.screen = 'lobby';
  lobby = renderLobby(root, { onCreate, onLocal, onJoin, onResume, onTrainer: () => { setHash('trainer'); openTrainer('trainer'); } });
  if (prefill) lobby.prefill(prefill);
}

function goLobby() {
  setHash('', true);
  showLobby();
}

async function onCreate(game, opts, color) {
  const words = canon(randomWords(3));
  await openOnline({ words, want: 'play', create: { game, opts, color } });
}

async function onJoin(words, want) {
  await openOnline({ words: canon(words), want });
}

async function openOnline({ words, want, create, resume = false }) {
  await leaveTable();
  const roomId = await roomIdFor(words);
  const saved = store.loadTable(roomId);
  const m = me();
  let table = saved && saved.table ? saved.table : null;
  if (create) table = newTable({ game: create.game, opts: create.opts, host: m, hostSeat: hostSeatFor(create.color) });
  if (resume && saved && saved.want) want = saved.want;
  const save = (t) => store.saveTable({ roomId, words, want, table: t });
  store.saveTable({ roomId, words, want, table });
  const link = new NetLink({
    words, roomId, pid: m.pid, name: m.name, relayOnly: RELAY_ONLY,
    log: (x) => { netlog.push(`${new Date().toISOString().slice(11, 19)} ${x}`); if (netlog.length > 300) netlog.shift(); }
  });
  const session = new TableSession({ mode: 'online', me: m, want, table, link, save, secret: store.deviceSecret(), bot: { choose: chooseBotMove }, build: BUILD });
  setHash(formatWords(words));
  mount(session, { words, roomId, link });
  session.start();
  await link.start();
}

function onLocal(mode, game, opts, color, level = 2) {
  const m = me();
  const two = seatCount(game, opts) === 2;
  // Blackjack solo: Mensch auf den letzten Platz (Bank beginnt bei Platz 1, so spielt man gleich mit)
  const hostSeat = mode === 'bot' && two ? hostSeatFor(color) : mode === 'bot' && gameOf(game).soloLast ? seatCount(game, opts) - 1 : 0;
  const table = newTable({ game, opts, host: m, hostSeat });
  const n = table.seats.length;
  const lv = ['', 'leicht', 'mittel', 'stark'][level] || 'mittel';
  let k = 0;   // Computer fortlaufend ab 1 nummerieren, auch wenn der Mensch auf dem letzten Platz sitzt
  for (let i = 0; i < n; i++) {
    if (i === hostSeat && mode === 'bot') continue;
    if (mode === 'bot') table.seats[i] = { pid: 'bot' + i, name: two ? `Computer (${lv})` : `Computer ${++k}`, bot: level };
    else table.seats[i] = { pid: i ? `${m.pid}#${i + 1}` : m.pid, name: i === 0 && m.name !== 'Gast' ? m.name : `Spieler ${i + 1}` };
  }
  table.status = 'play';
  store.saveLocal(mode, table);
  openLocal(mode, table);
}

async function openLocal(mode, table) {
  await leaveTable();
  leaveTrainer();
  const session = new TableSession({ mode, me: me(), table, bot: { choose: chooseBotMove }, save: (t) => store.saveLocal(mode, t) });
  setHash(mode === 'bot' ? 'solo' : 'zuzweit');
  mount(session, {});
  session.start();
}

// Denkzeit des Computers aus der Einstellung „Computer-Tempo“ (am Gastgeber-Gerät), plus Zeit zum Ausspielen des
// vorigen Zugs; ein fertiger Stich bleibt liegen (tempo.js)
function useTempo(session) {
  session.botDelayFor = (t) => botDelay(t, levelFrom(store.settings().tempo), {
    isLocal: (by) => session.mode === 'hotseat' || !!(t.seats[by] && !t.seats[by].bot && t.seats[by].pid === session.me.pid)
  });
}

function mount(session, { words = null, roomId = null, link = null }) {
  useTempo(session);
  document.body.dataset.screen = 'table';
  const screen = showTableScreen(root, {
    session, words,
    onLeave: goLobby,
    onAnotherGame: () => anotherGame(),
    onNewLocal: () => newLocal()
  });
  cur = { session, screen, link, words, roomId, mode: session.mode };
}

// Spiel-Auswahl (nach Partieende): online am selben Tisch, lokal neu
function anotherGame() {
  const s = cur && cur.session;
  if (!s) return;
  const pick = (game) => {
    if (s.mode === 'online') {
      openGameSheet(game, {
        onlyOnline: true, onlineLabel: 'Am selben Tisch starten', title: gameOf(game).title,
        onOnline: (g, o) => { const r = s.newGame(g, o); if (!r.ok) alert(r.reason); }
      });
    } else openGameSheet(game, { onOnline: onCreate, onLocal });
  };
  const list = GAME_LIST.filter((g) => g.id !== s.table.game && (LIVE.has(g.id) || /[?&]alle/.test(location.search)));
  const sh = sheet('Anderes Spiel', ...list.map((g) => h('button', { class: 'menu-item', data: { game: g.id }, on: { click: () => { sh.close(); pick(g.id); } } }, g.title)));
}

function newLocal() {
  const s = cur && cur.session;
  if (!s || s.mode === 'online') return;
  const t = s.table;
  const botSeat = t.seats.findIndex((x) => x && x.bot);
  const color = t.seats.length === 2 && botSeat === 0 ? 'schwarz' : 'weiss';
  onLocal(s.mode, t.game, t.opts, color, botSeat >= 0 ? t.seats[botSeat].bot : 2);
}

// Schach-Trainer: eigener Bereich unter #trainer…, Modul wird erst hier geladen
async function openTrainer(path) {
  await leaveTable();
  const mod = await import('./trainer/ui.js');
  if (!trainer) {
    trainer = mod.showTrainer(root, {
      go: (p) => { setHash(p); trainer.show(p); },
      lobby: () => { leaveTrainer(); goLobby(); },
      // nach einer Eröffnungslinie gegen den Computer weiterspielen (normale Partie, Züge der Linie in der Zugliste)
      playFrom: ({ moves, color, level }) => {
        const m = me();
        const hostSeat = color === 'b' ? 1 : 0;
        const table = newTable({ game: 'schach', opts: {}, host: m, hostSeat });
        const lv = ['', 'leicht', 'mittel', 'stark'][level] || 'mittel';
        table.seats[1 - hostSeat] = { pid: 'bot' + (1 - hostSeat), name: `Computer (${lv})`, bot: level };
        const E = gameOf('schach').engine;
        table.gs = moves.reduce((gs, mv) => E.applyMove(gs, mv), E.initialState());
        table.status = 'play';
        leaveTrainer();
        store.saveLocal('bot', table);
        openLocal('bot', table);
      }
    });
  }
  trainer.show(path);
}

async function onResume(item) {
  if (item.kind === 'online') return openOnline({ words: item.e.words, want: 'play', resume: true });
  const t = store.loadLocal(item.kind);
  if (t) openLocal(item.kind, t);
}

async function route() {
  if (routed === location.hash) return;
  routed = location.hash;
  const hash = decodeURIComponent(location.hash.slice(1));
  if (!hash) return showLobby();
  if (hash === 'trainer' || hash.startsWith('trainer/')) return openTrainer(hash);
  if (hash === 'solo' || hash === 'zuzweit') {
    const mode = hash === 'solo' ? 'bot' : 'hotseat';
    const t = store.loadLocal(mode);
    return t ? openLocal(mode, t) : goLobby();
  }
  const ws = parseWords(hash);
  if (ws.length === 3 && ws.every(Boolean) && new Set(ws).size === 3) {
    const words = canon(ws);
    const roomId = await roomIdFor(words);
    if (cur && cur.roomId === roomId) return;
    const saved = store.loadTable(roomId);
    if (saved) return openOnline({ words, want: saved.want || 'play', resume: true });
    // fremder Link: Wörter vorbelegen, Name eintragen, „Mitspielen“ tippen
    history.replaceState(null, '', location.pathname + location.search + '#' + formatWords(words));
    routed = location.hash;
    return showLobby(words);
  }
  goLobby();
}

addEventListener('popstate', () => route());
addEventListener('hashchange', () => route());

// ---------- Debug-API für Tests ----------
function legalForMe() {
  const s = cur && cur.session;
  const t = s && s.table;
  if (!t || t.status !== 'play' || s.pendingMove) return [];
  const seat = s.mySeat;
  if (seat === null || turnOf(t) !== seat) return [];
  return gameOf(t.game).engine.legalMoves(t.gs);
}

window.__box = {
  ready: false,
  build: BUILD,
  relayOnly: RELAY_ONLY,
  screen: () => document.body.dataset.screen,
  state() {
    const s = cur && cur.session;
    const t = s && s.table;
    return {
      screen: document.body.dataset.screen,
      mode: s ? s.mode : null,
      role: s ? s.role : null,
      mySeat: s ? s.mySeat : null,
      words: cur ? cur.words : null,
      roomId: cur ? cur.roomId : null,
      pending: !!(s && s.pendingMove),
      stats: s ? s.stats : null,
      fair: s ? s.fairCheck : null,
      table: t ? {
        game: t.game, opts: t.opts, status: t.status, seq: t.seq, epoch: t.epoch, round: t.round, nmoves: t.nmoves,
        turn: turnOf(t), result: t.result, seats: t.seats.map((x) => x && { name: x.name, pid: x.pid, bot: x.bot || 0 }),
        hostPid: t.hostPid, score: t.score, drawOffer: t.drawOffer
      } : null,
      net: s ? s.netStatus() : null,
      link: cur && cur.link ? cur.link.status() : null
    };
  },
  table: () => cur && cur.session.table,
  legal: legalForMe,
  move: (m) => cur.session.submitMove(m),
  botMove(level = 1) {
    const s = cur.session;
    const t = s.table;
    if (!legalForMe().length) return { ok: false, reason: 'nicht am Zug' };
    return s.submitMove(quickMove(t.game, t.gs, level));
  },
  act: (a) => cur.session.act(a),
  create: (game, opts = {}, color = 'weiss') => onCreate(game, opts, color),
  join: (words, want = 'play') => onJoin(words, want),
  local: (mode, game, opts = {}, color = 'weiss', level = 1) => onLocal(mode, game, opts, color, level),
  lobby: () => goLobby(),
  setName(name) { const p = store.profile(); p.name = name; store.saveProfile(p); },
  me: () => store.profile(),
  target: (i) => cur.screen.view.target(i),
  view: () => cur.screen.view,
  busy: () => !!(cur && cur.screen.busy()),
  events: () => (cur ? cur.screen.events() : []),
  banner: () => (cur ? cur.screen.banner() : null),
  tempo(level) { const st = store.settings(); st.tempo = level; store.saveSettings(st); },
  // Tests: nach Eingriff in den Stand (Stellung setzen) neu zeigen und ggf. den Computer anstoßen
  poke() { const s = cur.session; s._changed({ kind: 'state' }); s._maybeBot(); },
  metrics: () => cur.screen.view.metrics(),
  reconnect: () => cur && cur.link && cur.link.reconnect(),
  relayStats: () => (cur && cur.link && cur.link.relay ? cur.link.relay.status() : null),
  netlog: () => netlog.slice(-80),
  sessionLog: () => (cur ? cur.session.log.slice(-80) : []),
  errors: () => window.__errors || [],
  trainer: () => trainer,
  openTrainer: (p = 'trainer') => { setHash(p); return openTrainer(p); },
  // Verzierungen (Deko-Stufe, Effekte)
  deko: () => ({ level: DEKO.level, on: DEKO.on, fx: DEKO.fx, quality: DEKO.quality }),
  fx: () => fxState(),
  freeze: (on = true) => freeze(on)
};

readDeko();
applyDeko();
ensureDefs();
warmUp();   // Computer-Worker gleich mit der Seite laden (gleiche Version wie die Seite)
setTimeout(prepareCardArt, 300);   // Deko-Kartenrücken vorzeichnen, solange man noch in der Lobby ist
// häufige Steine und Würfel vorzeichnen (je ein paar ms, in Ruhe nach dem Start)
setTimeout(() => prepareSprites(['st:w:', 'st:b:', 'st:w:k', 'st:b:k', 'die:0', 'die:1', 'die:2', 'die:3', 'die:4', 'die:5', 'die:6']), 600);
route().then(() => { window.__box.ready = true; document.body.dataset.ready = '1'; });
