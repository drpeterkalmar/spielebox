// Tisch: Sitzplätze, Schiedsrichter (Host), Zustandsverteilung, Wiederaufnahme.
// Transport-unabhängig (link: send/onMessage/onPeers, siehe netlink.js) und ohne DOM → läuft in Node-Tests.
// Der Host prüft jeden Zug mit derselben Engine und verteilt danach den ganzen Tisch-Zustand.
// Tisch-Zustand (reines JSON, liegt bei allen in localStorage):
//   { v, game, opts, hostPid, epoch, seq, round, seats: [{pid,name,bot?}|null, …], gs (Engine-Zustand),
//     status: 'wait'|'play'|'over', result: null|{winner,reason}, drawOffer: null|Sitz,
//     last: null|{m, by, d, id}, hist: [{m, by, d, id}] (letzte Züge; id = Zug-Kennung des Absenders), nmoves, score: {pid: Punkte}, created, updated,
//     id (Tisch-Kennung), fair: null|{ round, gen?, commits: [je Sitz], log: [öffentliche Zufallsereignisse], k },
//     fairNeed: null|{ k, kind, missing: [Sitze] }, fairPriv (nur beim Host, wird nie verschickt) }
// Kartenspiele (Engine mit HIDDEN): Jeder Empfänger bekommt nur viewFor(gs, sein Sitz); Zuschauer sehen keine Hand.
// Zufall (Engine mit chance): lokal crypto-Zufall, online Hash-Ketten aller Sitze (src/net/fair.js).
//   Wechselt mitten in der Partie, wer eine Kette hält (Host-Übernahme, Computer übernimmt einen Sitz), beginnt eine
//   neue Zufallsrunde derselben Partie (fair.gen + 1, neue Commits aller Sitze, eigene Kettenglieder).
// Zeitlimit (Engine mit timeoutMove, nur online): Wer opts.timer Sekunden nicht handelt oder nicht erreichbar ist,
// macht automatisch den Zug der Engine (Hold'em: checken bzw. aussteigen), bis er wieder da ist.
// Tisch-Kommandos außerhalb der Reihe (Engine mit ACTS/applyAct, z. B. Hold'em „show“) laufen über act().
import { gameOf, seatCount } from '../games/registry.js';
import { chainLink, verifyLink, mixLinks, valueFor, randomHex, sha256, verifyFair, CHAIN } from './fair.js';

export const TIMING = {
  heartbeat: 4000,   // Host meldet sich regelmäßig (Stand seq/epoch, Anwesenheit)
  hostGone: 45000,   // so lange kein Host → sitzender Spieler mit Zustand übernimmt (> 3 Relay-Herzschläge)
  takeoverStep: 5000, // … gestaffelt: je Mensch, der in Sitzfolge nach dem Host vor einem sitzt, so viel später
  moveRetry: 5000,   // unbestätigten Zug erneut senden
  // Mindest-Denkzeit des Computers, wenn kein botDelayFor gesetzt ist (Node-Tests: 0). Peter 29.09. abends:
  // „Computer langsamere Zuggeschwindigkeit“ → 1500 ms (bis 29.09.: 450). A/B: ?botms=450.
  // In der App setzt app.js session.botDelayFor aus der Einstellung „Computer-Tempo“ (src/tempo.js).
  botDelay: (() => { try { const v = parseInt(new URLSearchParams(globalThis.location?.search || '').get('botms'), 10); return v >= 0 ? v : 1500; } catch { return 1500; } })(),
  relayAfter: 12000, // wie NetLink: so lange ohne Direktweg zur wichtigen Gegenstelle → Relay zuschalten
  fairWait: 12000,   // so lange auf Kettenglieder/Commits der Mitspieler warten, dann Host-Zufall (als ungeprüft markiert)
  timerGrace: 1500,  // Zeitlimit: Zuschlag für Netz-Verzögerung (die Uhr beim Spieler startet etwas später)
  awayMove: 3000,    // Spieler nicht erreichbar: so lange warten, dann automatischer Zug
  awayStart: 15000,  // … aber erst, wenn der Host selbst so lange läuft (sonst kennt er die Verbindungen noch nicht)
  timerUnit: 1000    // ms je Sekunde der Option opts.timer (Tests: kleiner)
};
const HIST = 40;

const clone = (x) => JSON.parse(JSON.stringify(x));

// neuer Tisch (vom Host bzw. lokal angelegt)
export function newTable({ game, opts, host, hostSeat = 0, now = Date.now() }) {
  const g = gameOf(game);
  const o = g.engine.normalizeOptions(opts);
  const seats = Array(seatCount(g, o)).fill(null);
  seats[Math.min(hostSeat, seats.length - 1)] = { pid: host.pid, name: host.name };
  return {
    v: 1, game, opts: o, hostPid: host.pid, epoch: 1, seq: 0, round: 1, seats,
    gs: g.engine.initialState(o), status: 'wait', result: null, drawOffer: null,
    last: null, hist: [], nmoves: 0, score: {}, created: now, updated: now,
    id: Math.random().toString(36).slice(2, 12), fair: null, fairNeed: null
  };
}

// (epoch, seq) vergleichen: > 0, wenn a neuer ist
export function newer(a, b) {
  if (!b) return 1;
  if (!a) return -1;
  return (a.epoch - b.epoch) || (a.seq - b.seq);
}

export function seatOf(table, pid) {
  if (!table) return null;
  const i = table.seats.findIndex((s) => s && s.pid === pid);
  return i < 0 ? null : i;
}

export function turnOf(table) {
  return gameOf(table.game).engine.currentPlayer(table.gs);
}

// Tisch für einen Empfänger: Kartenspiele nur mit dessen Sicht, private Host-Daten nie
export function tableFor(table, seat) {
  const eng = gameOf(table.game).engine;
  const { fairPriv, ...pub } = table;
  if (eng.HIDDEN) pub.gs = eng.viewFor(table.gs, seat === undefined ? null : seat);
  // Züge mit geheimem Inhalt (Schiffe versenken: Flotte setzen) nur ohne Geheimnis in Verlauf und letztem Zug
  if (eng.publicMove) {
    const pm = (e) => (e && e.by !== seat ? { ...e, m: eng.publicMove(e.m) } : e);
    pub.last = pm(table.last);
    pub.hist = table.hist.map(pm);
  }
  return pub;
}

export class TableSession {
  // mode: 'online' | 'bot' | 'hotseat'
  // me: { pid, name }; want: 'play' | 'watch'
  // table: gespeicherter oder neuer Tisch (online beim Beitreten ohne Speicherstand: null)
  // link: Netz (nur online); save(table): Speicher-Rückruf; bot: { choose(game, gs, seat) → Promise<Move> }
  constructor({ mode = 'online', me, want = 'play', table = null, link = null, save = () => {}, bot = null, now = () => Date.now(), timers = globalThis, secret = null, random = randomHex, chain = CHAIN, build = null }) {
    this.mode = mode;
    this.me = me;
    this.want = want;
    this.table = table;
    this.link = link;
    this._save = save;
    this.bot = bot;
    this.now = now;
    this.timers = timers;
    this.listeners = {};
    this.present = new Map();     // pid → { name, via, lastSeen, want }
    this.pendingMove = null;      // eigener, noch unbestätigter Zug (Client)
    this.stats = { movesSent: 0, moveRetries: 0, rejected: 0 };
    this.hostSeen = 0;            // zuletzt Nachricht vom Host
    this.startedAt = now();
    this.closed = false;
    this.botBusy = false;
    this.log = [];
    this.secret = secret || randomHex();   // Geräte-Geheimnis für die eigenen Hash-Ketten
    this.random = random;                  // lokaler Zufall (Tests: fester Strom)
    this.chain = chain;                    // Länge der eigenen Hash-Ketten (Tests: klein)
    this.build = build;                    // App-Version (src/build.js), geht mit hello/state mit
    this.fairCheck = null;                 // Ergebnis der eigenen Prüfung des Zufalls-Protokolls
    this._sentFair = {};
  }

  get role() {
    if (this.mode !== 'online') return 'host';
    return this.table && this.table.hostPid === this.me.pid ? 'host' : 'client';
  }

  // Sitz des lokalen Spielers (hotseat: wer gerade dran ist)
  get mySeat() {
    if (!this.table) return null;
    if (this.mode === 'hotseat') return this.table.status === 'over' ? 0 : turnOf(this.table);
    return seatOf(this.table, this.me.pid);
  }

  get engine() {
    return this.table ? gameOf(this.table.game).engine : null;
  }

  on(type, fn) {
    (this.listeners[type] ||= []).push(fn);
    return () => { this.listeners[type] = this.listeners[type].filter((f) => f !== fn); };
  }

  _emit(type, ...args) {
    for (const fn of this.listeners[type] || []) {
      try { fn(...args); } catch (e) { console.error(e); }
    }
  }

  _note(text) {
    this.log.push(`${new Date(this.now()).toISOString().slice(11, 19)} ${text}`);
    if (this.log.length > 200) this.log.shift();
  }

  start() {
    if (this.mode !== 'online') {
      // lokal: beide Sitze sofort belegt, Partie läuft
      if (this.table.status === 'wait' && this.table.seats.every(Boolean)) this.table.status = 'play';
      if (this.table.status === 'play') this._resolveChance();
      this._changed({ kind: 'start' });
      this._maybeBot();
      return;
    }
    this.link.onMessage = (msg, from) => this._onMessage(msg, from);
    this.link.onPeers = (peers, fresh) => this._onPeers(peers, fresh);
    this.link.onStatus = () => this._emit('net', this.netStatus());
    this._timer = this.timers.setInterval(() => this._tick(), 1000);
    this._hello();
    if (this.table) {
      if (this.role === 'host' && this.table.status === 'play') { this._ensureFair(); if (this._resolveChance()) this._save(this.table); }
      this._changed({ kind: 'start' });
      if (this.role === 'host') this._maybeBot();
    }
  }

  close() {
    this.closed = true;
    if (this._timer) this.timers.clearInterval(this._timer);
    if (this._botTimer) this.timers.clearTimeout(this._botTimer);
  }

  // ---------- Eingaben der Oberfläche ----------

  // eigener Zug; liefert { ok, reason }
  submitMove(move) {
    const t = this.table;
    if (!t) return { ok: false, reason: 'Noch kein Tisch' };
    const seat = this.mySeat;
    if (seat === null) return { ok: false, reason: 'Du schaust zu' };
    if (t.status !== 'play') return { ok: false, reason: t.status === 'wait' ? 'Warte auf Mitspieler' : 'Partie ist vorbei' };
    if (turnOf(t) !== seat) return { ok: false, reason: 'Du bist nicht am Zug' };
    if (!this.engine.isLegal(t.gs, move)) return { ok: false, reason: 'Zug nicht erlaubt' };
    if (this.role === 'host') return this._applyMove(seat, move);
    if (this.pendingMove) return { ok: false, reason: 'Zug wird noch übertragen' };
    this.pendingMove = { id: this._id(), move, seq: t.seq, round: t.round, sent: this.now() };
    this.stats.movesSent++;
    const msg = { t: 'move', id: this.pendingMove.id, move, seq: t.seq };
    const reveal = this._revealFor(move);
    if (reveal) msg.reveal = reveal;
    this.pendingMove.reveal = reveal;
    this._sendHost(msg);
    // Vorschau: Zug lokal schon zeigen, bis der Host bestätigt (bei Ablehnung kommt der alte Stand zurück).
    // Nicht bei Kartenspielen (die Sicht reicht nicht zum Ausführen) und nicht, wenn Zufall folgt.
    if (!this.engine.HIDDEN && !reveal) this._optimistic(seat, move);
    this._changed({ kind: 'pending' });
    return { ok: true, pending: true };
  }

  // 'resign' | 'draw-offer' | 'draw-accept' | 'draw-decline' | 'rematch' | 'fill-bots' (Host: freie Plätze mit Computer)
  // oder ein Kommando der Engine (ACTS, z. B. 'show'); seat nur zu mehreren an einem Gerät (wer gerade schaut)
  act(a, seatArg = null) {
    const t = this.table;
    if (!t) return { ok: false };
    if (this.role === 'host') {
      const seat = this.mode === 'hotseat' ? (seatArg ?? turnOf(t)) : this.mySeat;
      return this._applyAct(seat, { a, round: t.round });
    }
    this._sendHost({ t: 'act', a, round: t.round, id: this._id() });
    return { ok: true, pending: true };
  }

  // Host wählt am selben Tisch ein anderes Spiel (nach Partieende)
  newGame(game, opts) {
    if (this.role !== 'host') return { ok: false, reason: 'Nur der Gastgeber' };
    const t = this.table;
    if (t.status === 'play') return { ok: false, reason: 'Partie läuft noch' };
    const g = gameOf(game);
    t.game = game;
    t.opts = g.engine.normalizeOptions(opts);
    // Sitzanzahl anpassen (Sitzende behalten, so weit Platz ist)
    const n = seatCount(g, t.opts);
    const people = t.seats.filter((x) => x && !x.bot);
    t.seats = Array(n).fill(null);
    people.slice(0, n).forEach((p, i) => { t.seats[i] = p; });
    this._reset(false);
    return { ok: true };
  }

  // ---------- Host ----------

  _applyMove(seat, move, note = '', id = null) {
    const t = this.table;
    const eng = this.engine;
    if (t.status !== 'play') return { ok: false, reason: 'Partie läuft nicht' };
    if (turnOf(t) !== seat) return { ok: false, reason: 'Nicht am Zug' };
    if (!eng.isLegal(t.gs, move)) return { ok: false, reason: 'Zug nicht erlaubt' };
    const d = eng.describeMove(t.gs, move) + note;
    const prevGs = t.gs;
    t.gs = eng.applyMove(t.gs, move);
    t.last = { m: move, by: seat, d, id: id || this._id() };
    t.hist.push(t.last);
    if (t.hist.length > HIST) t.hist.shift();
    t.nmoves++;
    t.drawOffer = null;
    this._resolveChance();
    const r = eng.result(t.gs);
    if (r) this._finish(r.winner, r.reason, r.points);
    this._commit({ kind: 'move', move, by: seat, prevGs });
    this._maybeBot();
    return { ok: true };
  }

  _applyAct(seat, { a, round }) {
    const t = this.table;
    if (round !== t.round) return { ok: false, reason: 'veraltet' };
    if (a === 'rematch') {
      if (t.status !== 'over') return { ok: false, reason: 'Partie läuft noch' };
      this._reset(true);
      return { ok: true };
    }
    if (a === 'fill-bots') {
      if (t.status !== 'wait') return { ok: false, reason: 'Partie läuft schon' };
      t.seats = t.seats.map((x, i) => x || { pid: 'bot' + i, name: `Computer ${i + 1}`, bot: 2 });
      t.status = 'play';
      this._startRound();
      this._commit({ kind: 'seat' });
      this._maybeBot();
      return { ok: true };
    }
    const eng = this.engine;
    if (eng.ACTS && eng.ACTS.includes(a)) {
      // Kommando der Engine außerhalb der Reihe (z. B. Hold'em: weggelegte Karten doch zeigen)
      if (seat === null || seat === undefined || t.status === 'wait' || !eng.isLegalAct(t.gs, seat, a)) return { ok: false, reason: 'nicht möglich' };
      t.gs = eng.applyAct(t.gs, seat, a);
      this._commit({ kind: 'act', a, by: seat });
      return { ok: true };
    }
    if (seat === null || seat === undefined || t.status !== 'play') return { ok: false, reason: 'Partie läuft nicht' };
    if (a === 'resign') {
      if (t.seats.length > 2) {
        // mehr als zwei: der Computer übernimmt den Platz, die Partie geht weiter
        const old = t.seats[seat];
        t.seats[seat] = { pid: 'bot' + seat, name: `Computer (für ${old ? old.name : 'Spieler'})`, bot: 2 };
        this._restartFair();
        this._commit({ kind: 'act', a, by: seat });
        this._maybeBot();
        return { ok: true };
      }
      this._finish(1 - seat, `${this._seatName(seat)} gibt auf`);
    } else if (a === 'draw-offer') {
      if (t.drawOffer !== null) return { ok: false };
      if (this.mode === 'hotseat') {
        this._finish(null, 'Remis vereinbart'); // beide sitzen am selben Gerät
      } else if (this._isBot(1 - seat)) {
        this._emit('toast', 'Der Computer spielt lieber weiter');
        return { ok: false, reason: 'abgelehnt' };
      } else {
        t.drawOffer = seat;
      }
    } else if (a === 'draw-accept') {
      if (t.drawOffer === null || t.drawOffer === seat) return { ok: false };
      this._finish(null, 'Remis vereinbart');
    } else if (a === 'draw-decline') {
      if (t.drawOffer === null || t.drawOffer === seat) return { ok: false };
      t.drawOffer = null;
    } else {
      return { ok: false, reason: 'unbekannt' };
    }
    this._commit({ kind: 'act', a, by: seat });
    return { ok: true };
  }

  _finish(winner, reason, points) {
    const t = this.table;
    t.status = 'over';
    t.result = { winner, reason };
    if (points) t.result.points = points;
    t.drawOffer = null;
    this._publishFair(true);
    const two = t.seats.length === 2;
    // Spiele, deren points nur Auskunft sind (Würfelglück: Endsumme, Mau-Mau: Restkarten), zählen 1 je Sieg
    const one = gameOf(t.game).winPoints === 1;
    for (let s = 0; s < t.seats.length; s++) {
      const p = t.seats[s];
      if (!p) continue;
      const pts = winner === null ? (two ? 0.5 : 0) : winner === s ? (one ? 1 : points || 1) : 0;
      t.score[p.pid] = (t.score[p.pid] || 0) + pts;
    }
  }

  // neue Partie: bei Revanche Farben tauschen
  _reset(swap) {
    const t = this.table;
    const eng = this.engine;
    if (swap) t.seats.push(t.seats.shift()); // bei zwei Sitzen = Farben tauschen, sonst reihum weiter
    t.gs = eng.initialState(t.opts);
    t.round++;
    t.result = null;
    t.drawOffer = null;
    t.last = null;
    t.hist = [];
    t.nmoves = 0;
    t.status = t.seats.every(Boolean) ? 'play' : 'wait';
    t.fair = null;
    t.fairNeed = null;
    t.fairPriv = null;
    if (t.status === 'play') this._startRound();
    this._commit({ kind: 'reset' });
    this._maybeBot();
  }

  // Partie beginnt (alle Plätze besetzt): Zufalls-Protokoll anlegen, ggf. gleich mischen/würfeln
  _startRound() {
    this._ensureFair();
    this._resolveChance();
  }

  // ---------- Zufall ----------

  _needsFair() {
    return this.mode === 'online' && !!this.engine.chance;
  }

  _seed(seat) {
    const t = this.table;
    const p = t.seats[seat];
    const who = p && p.bot ? `bot${seat}|${this.me.pid}` : this.me.pid;
    const gen = t.fair && t.fair.round === t.round ? t.fair.gen || 0 : 0;
    return sha256(`${this.secret}|${t.id || t.created}|${t.round}|${who}${gen ? '|g' + gen : ''}`);
  }

  // Host: Protokoll der Runde anlegen (eigene und Computer-Commits sofort)
  _ensureFair(gen = 0) {
    const t = this.table;
    if (!this._needsFair() || this.role !== 'host') return;
    if (t.fair && t.fair.round === t.round) return;
    t.fair = { round: t.round, commits: t.seats.map(() => null), log: [], k: 0 };
    if (gen) t.fair.gen = gen;
    t.fairPriv = null;
    this._priv();
    t.seats.forEach((p, i) => {
      if (p && (p.bot || p.pid === this.me.pid)) t.fair.commits[i] = chainLink(this._seed(i), 0, this.chain);
    });
  }

  // private Host-Daten des Zufalls-Protokolls (nie verschickt); fehlen z. B. nach einer Übernahme → neu anlegen
  _priv() {
    const t = this.table;
    if (!t.fairPriv) t.fairPriv = { last: t.seats.map(() => null), pending: {}, secret: [] };
    return t.fairPriv;
  }

  // Host: neue Zufallsrunde derselben Partie (Übernahme, Sitzwechsel durch Aufgeben). Die alten Ketten passen nicht mehr
  // (Computer-Ketten hängen an der Host-pid, der Commit eines Sitzes am Menschen, der ihn hielt). Unveröffentlichte
  // Mischungen der alten Runde bleiben ungeprüft; die Anzeige zählt die schon geprüften weiter (_clientFair).
  _restartFair() {
    const t = this.table;
    if (!this._needsFair() || this.role !== 'host' || t.status !== 'play') return;
    const gen = t.fair && t.fair.round === t.round ? (t.fair.gen || 0) + 1 : 0;
    t.fair = null;
    t.fairPriv = null;
    t.fairNeed = null;
    this._ensureFair(gen);
    this._resolveChance();
  }

  // Kettenglied k eines Sitzes, wenn bekannt (eigene/Computer sofort, Mitspieler aus ihren Nachrichten)
  _linkOf(seat, k) {
    const t = this.table;
    const p = t.seats[seat];
    if (!p) return null;
    if (p.bot || p.pid === this.me.pid) return k <= this.chain ? chainLink(this._seed(seat), k, this.chain) : null;
    const pend = this._priv().pending[seat];
    return pend && pend[k] ? pend[k] : null;
  }

  // Host: Zufallsereignisse auflösen, solange die Engine welche verlangt. false = wartet auf Mitspieler.
  _resolveChance(force = false) {
    const t = this.table;
    const eng = this.engine;
    if (!eng.chance) return true;
    let c;
    while ((c = eng.chance(t.gs))) {
      let v;
      if (!this._needsFair()) {
        v = valueFor(c, this.random());
      } else {
        this._ensureFair();
        const k = t.fair.k + 1;
        // Kette aufgebraucht (sehr lange Partie): nie werfen, sondern Host-Zufall, im Protokoll als ungeprüft markiert
        const spent = k > this.chain;
        const links = t.seats.map((_, s) => this._linkOf(s, k));
        const missing = links.map((l, s) => (l ? -1 : s)).filter((s) => s >= 0);
        const commitsMissing = t.fair.commits.map((x, s) => (x ? -1 : s)).filter((s) => s >= 0);
        const miss = [...new Set([...missing, ...commitsMissing])];
        if (miss.length && !force && !spent) {
          // Aufrufer verteilt den Stand (commit) – Mitspieler sehen fairNeed und schicken ihr Glied
          if (!t.fairNeed || t.fairNeed.k !== k) { t.fairNeed = { k, kind: c.kind, missing: miss }; this._needSince = this.now(); }
          else t.fairNeed.missing = miss;
          return false;
        }
        const entry = { k, kind: c.kind };
        if (c.n) entry.n = c.n;
        if (miss.length || spent) {
          entry.fallback = true;  // Mitspieler nicht erreichbar: Host-Zufall, im Protokoll als ungeprüft markiert
          v = valueFor(c, this.random());
        } else {
          entry.links = links;
          v = valueFor(c, mixLinks(links, k, c.kind));
          links.forEach((l, s) => { this._priv().last[s] = { k, link: l }; });
        }
        entry.value = v;
        const priv = this._priv();
        for (const s of Object.keys(priv.pending)) delete priv.pending[s][k];
        t.fair.k = k;
        t.fairNeed = null;
        if (c.kind === 'shuffle') {
          // alte Mischungen veröffentlichen, sobald ihre Karten keine Rolle mehr spielen (neues Spiel/Runde)
          const ph = eng.phase ? eng.phase(t.gs) : 'deal';
          if (ph === 'deal' || ph === 'bet') this._publishFair(false);
          priv.secret.push(entry);
        } else {
          t.fair.log.push(entry);
        }
      }
      t.gs = eng.applyChance(t.gs, v);
    }
    return true;
  }

  _publishFair(all) {
    const t = this.table;
    if (!t.fair || !t.fairPriv) return;
    const priv = this._priv();
    const sec = priv.secret;
    if (!sec.length) return;
    t.fair.log.push(...sec);
    t.fair.log.sort((a, b) => a.k - b.k);
    priv.secret = [];
  }

  // Host: Nachricht mit Commit bzw. Kettenglied eines Mitspielers
  _hostOnFair(from, msg) {
    const t = this.table;
    const seat = seatOf(t, from.pid);
    if (seat === null || !t.fair || msg.round !== t.round || (msg.gen || 0) !== (t.fair.gen || 0)) return;
    let changed = false;
    if (typeof msg.commit === 'string' && !t.fair.commits[seat] && /^[0-9a-f]{64}$/.test(msg.commit)) {
      t.fair.commits[seat] = msg.commit;
      changed = true;
    }
    if (msg.reveal) changed = this._takeReveal(seat, msg.reveal) || changed;
    if (!changed) return;
    if (t.status === 'play') this._resolveChance();
    this._commit({ kind: 'fair' });
    this._maybeBot();
  }

  // Kettenglied prüfen (gegen Commit bzw. letztes bekanntes Glied) und merken
  _takeReveal(seat, { k, link }) {
    const t = this.table;
    if (!t.fair || !t.fair.commits[seat] || !Number.isInteger(k) || k !== t.fair.k + 1) return false;
    const priv = this._priv();
    const last = priv.last[seat] || { k: 0, link: t.fair.commits[seat] };
    let x = link;
    for (let i = last.k; i < k - 1; i++) x = sha256(x);
    if (!verifyLink(last.link, x)) { this._note(`Falsches Kettenglied von Sitz ${seat}`); return false; }
    (priv.pending[seat] ||= {})[k] = link;
    return true;
  }

  // Client: eigenes Glied für einen Zug, der Zufall auslöst (spart eine Netz-Runde)
  _revealFor(move) {
    const t = this.table;
    const seat = this.mySeat;
    if (!t.fair || t.fair.round !== t.round || seat === null || this.engine.HIDDEN || !this.engine.chance) return null;
    try {
      const next = this.engine.applyMove(t.gs, move);
      if (!this.engine.chance(next)) return null;
    } catch { return null; }
    const k = t.fair.k + 1;
    if (k > this.chain) return null;
    return { k, link: chainLink(this._seed(seat), k, this.chain) };
  }

  // Client: Commit/Glied schicken, wenn der Host darauf wartet; öffentliches Protokoll prüfen
  _clientFair() {
    const t = this.table;
    if (!t || !t.fair || t.fair.round !== t.round) return;
    const seat = seatOf(t, this.me.pid);
    const gen = t.fair.gen || 0;
    if (seat !== null) {
      const msg = { t: 'fair', round: t.round };
      if (gen) msg.gen = gen;
      if (!t.fair.commits[seat]) msg.commit = chainLink(this._seed(seat), 0, this.chain);
      if (t.fairNeed && t.fairNeed.missing.includes(seat) && t.fair.commits[seat] && t.fairNeed.k <= this.chain) {
        msg.reveal = { k: t.fairNeed.k, link: chainLink(this._seed(seat), t.fairNeed.k, this.chain) };
      }
      const key = `${t.round}|${gen}|${msg.commit ? 'c' : ''}|${msg.reveal ? msg.reveal.k : ''}`;
      const now = this.now();
      if ((msg.commit || msg.reveal) && (!this._sentFair[key] || now - this._sentFair[key] > 3000)) {
        this._sentFair[key] = now;
        this._sendHost(msg);
      }
    }
    const n = (t.fair.log || []).length;
    // neue Zufallsrunde derselben Partie: bisher Geprüftes weiterzählen (Abzeichen springt nicht auf 0)
    const fc0 = this.fairCheck;
    if (fc0 && fc0.round === t.round && (fc0.gen || 0) !== gen) this._fairPrior = (fc0.gen || 0) < gen ? fc0 : null;
    else if (!fc0 || fc0.round !== t.round) this._fairPrior = null;
    if (!fc0 || fc0.n !== n || fc0.round !== t.round || (fc0.gen || 0) !== gen) {
      const r = verifyFair({ commits: t.fair.commits, log: t.fair.log.filter((e) => !e.fallback && e.links && e.links.every(Boolean)) });
      const pr = this._fairPrior;
      const fallback = t.fair.log.filter((e) => e.fallback).length;
      this.fairCheck = pr
        ? { ...r, ok: r.ok && pr.ok, checked: r.checked + pr.checked, bad: [...pr.bad, ...r.bad], n, round: t.round, gen, fallback: fallback + pr.fallback }
        : { ...r, n, round: t.round, gen, fallback };
    }
  }

  _commit(info) {
    const t = this.table;
    t.seq++;
    t.updated = this.now();
    this._save(t);
    if (this.mode === 'online') this._broadcastState();
    if (this.mode === 'online' && this.role === 'host') this._clientFair();
    this._changed(info);
  }

  _changed(info) {
    this._emit('change', this.table, info);
  }

  // Stand verteilen: bei Kartenspielen je Empfänger dessen Sicht (gezielt an einzelne Peers)
  _broadcastState(to) {
    const t = this.table;
    if (!t) return;
    const hidden = !!this.engine.HIDDEN;
    if (!hidden && !t.fairPriv) {
      this.link.send(this._stateMsg(t), to);
      return;
    }
    const targets = to ? [to] : this._audience();
    if (!hidden && !to) { this.link.send(this._stateMsg(tableFor(t, null))); return; }
    for (const pid of targets) this.link.send(this._stateMsg(tableFor(t, seatOf(t, pid))), pid);
  }

  _stateMsg(table) {
    const msg = { t: 'state', table };
    if (this.build) msg.build = this.build;
    return msg;
  }

  // alle bekannten Gegenstellen (Sitzende, Anwesende, verbundene Peers) außer mir
  _audience() {
    const out = new Set();
    for (const s of this.table.seats) if (s && !s.bot) out.add(s.pid);
    for (const pid of this.present.keys()) out.add(pid);
    try { for (const p of this.link.status().peers || []) out.add(p.pid); } catch { /* egal */ }
    out.delete(this.me.pid);
    return [...out];
  }

  _isBot(seat) {
    const s = this.table.seats[seat];
    return !!(s && s.bot);
  }

  _seatName(seat) {
    const s = this.table.seats[seat];
    return s ? s.name : gameOf(this.table.game).engine.PLAYERS[seat];
  }

  // Computer zieht, wenn er dran ist (nur lokal/Host)
  _maybeBot() {
    const t = this.table;
    if (!this.bot || !t || t.status !== 'play' || this.botBusy || this.closed) return;
    const seat = turnOf(t);
    if (!this._isBot(seat)) return;
    this.botBusy = true;
    const seq = t.seq;
    const t0 = this.now();
    const eng = this.engine;
    const gs = eng.HIDDEN ? eng.viewFor(t.gs, seat) : t.gs;   // Computer sieht nur, was ihm zusteht
    Promise.resolve(this.bot.choose(t.game, gs, t.seats[seat].bot, { note: (x) => this._note(x) })).then((move) => {
      const wait = Math.max(0, (this.botDelayFor ? this.botDelayFor(t, move) : TIMING.botDelay) - (this.now() - t0));
      this._botTimer = this.timers.setTimeout(() => {
        this.botBusy = false;
        if (this.closed || this.table.seq !== seq || !move) return;
        this._applyMove(seat, move);
      }, wait);
    }).catch((e) => {
      this.botBusy = false;
      this._note('Bot-Fehler ' + e);
      this._emit('toast', 'Computer-Fehler: ' + (e && e.message || e));
    });
  }

  _hostOnHello(from, msg) {
    const t = this.table;
    const seat = seatOf(t, from.pid);
    let changed = false;
    if (seat !== null) {
      if (msg.name && t.seats[seat].name !== msg.name) { t.seats[seat].name = msg.name; changed = true; }
    } else if (msg.want === 'play' && t.status === 'wait') {
      const free = t.seats.findIndex((s) => !s);
      if (free >= 0) {
        t.seats[free] = { pid: from.pid, name: msg.name || 'Gast' };
        if (t.seats.every(Boolean)) { t.status = 'play'; this._startRound(); }
        changed = true;
        this._emit('toast', `${msg.name || 'Gast'} hat Platz genommen`);
      }
    }
    if (changed) this._commit({ kind: 'seat' });
    else this._broadcastState(from.pid);
  }

  _hostOnMove(from, msg) {
    const t = this.table;
    const seat = seatOf(t, from.pid);
    const reject = (reason) => {
      this._note(`Zug von ${from.pid} abgelehnt: ${reason}`);
      this.link.send({ t: 'nack', id: msg.id, reason }, from.pid);
      this._broadcastState(from.pid);
    };
    if (seat === null) return reject('Kein Sitzplatz');
    if (msg.seq !== t.seq) {
      // veraltet oder doppelt (z. B. über Relay wiederholt): erst der Stand, dann nack – der Client sieht am Stand,
      // ob sein Zug schon drin ist (last.id), sonst prüft er ihn auf dem neuen Stand und sendet einmal neu
      this._broadcastState(from.pid);
      this.link.send({ t: 'nack', id: msg.id, reason: 'veraltet', seq: t.seq }, from.pid);
      return;
    }
    if (msg.reveal) this._takeReveal(seat, msg.reveal);
    const r = this._applyMove(seat, msg.move, '', typeof msg.id === 'string' ? msg.id.slice(0, 16) : null);
    if (!r.ok) reject(r.reason);
  }

  _hostOnAct(from, msg) {
    const seat = seatOf(this.table, from.pid);
    const r = this._applyAct(seat, msg);
    if (!r.ok) this._broadcastState(from.pid);
  }

  // ---------- Client ----------

  _clientOnState(from, msg) {
    const incoming = msg.table;
    if (!incoming || incoming.v !== 1 || !incoming.gs || !Array.isArray(incoming.seats)) return;
    if (incoming.hostPid !== from.pid) return; // nur der Host verteilt Zustände
    if (!this._knownGame(incoming.game)) {
      // Spiel aus einer neueren Version: ablehnen statt beim Zeichnen abzustürzen
      if (!this._unknownWarned) {
        this._unknownWarned = true;
        this._note(`Stand mit unbekanntem Spiel ${String(incoming.game).slice(0, 20)} abgelehnt`);
        this._emit('toast', 'Dieses Spiel kennt deine Version noch nicht – bitte neu laden');
      }
      return;
    }
    this.hostSeen = this.now();
    // Vergleich immer gegen den letzten BESTÄTIGTEN Stand (nicht gegen die Vorschau des eigenen Zugs)
    const base = this._isOptimistic ? this._confirmed : this.table;
    if (newer(incoming, base) <= 0) return;
    const shown = this.table;
    const wasOptimistic = this._isOptimistic;
    if (this.pendingMove && this._settles(incoming, this.pendingMove)) this.pendingMove = null;
    this._isOptimistic = false;
    this._confirmed = null;
    this.table = incoming;
    this._save(incoming);
    this._clientFair();
    const info = { kind: 'state' };
    const oneMore = base && incoming.round === base.round && incoming.nmoves === base.nmoves + 1 && incoming.last;
    if (oneMore && wasOptimistic && shown.last && JSON.stringify(shown.last.m) === JSON.stringify(incoming.last.m)) {
      info.kind = 'confirm'; // eigener Zug bestätigt (schon animiert)
    } else if (oneMore) {
      info.kind = 'move';
      info.move = incoming.last.m;
      info.by = incoming.last.by;
      info.prevGs = base.gs;
    }
    this._changed(info);
  }

  _knownGame(id) {
    try { return !!gameOf(id); } catch { return false; }
  }

  // eigenen Zug sofort anzeigen (bestätigt wird er vom Host)
  _optimistic(seat, move) {
    const t = this.table;
    const eng = this.engine;
    this._confirmed = t;
    const d = eng.describeMove(t.gs, move);
    const next = { ...t, gs: eng.applyMove(t.gs, move), last: { m: move, by: seat, d }, nmoves: t.nmoves + 1 };
    next.hist = [...t.hist, next.last].slice(-HIST);
    this._isOptimistic = true;
    this.table = next;
    this._changed({ kind: 'move', move, by: seat, prevGs: t.gs, optimistic: true });
  }

  // erledigt ein Stand den eigenen, unbestätigten Zug? Nur wenn der Zug drin ist (last/hist mit seiner id) oder die
  // Partie nicht mehr dieselbe ist. Ein anderer, neuerer Stand (Host hat zwischendurch etwas anderes committet) nicht.
  _settles(incoming, pm) {
    const mine = (e) => e && e.id === pm.id;
    if (mine(incoming.last) || (incoming.hist || []).some(mine)) return true;
    if (incoming.round !== pm.round || incoming.status !== 'play') return true;
    // Host einer älteren Version (Züge ohne id): wie früher – jeder neuere Stand erledigt den Zug
    return !!incoming.last && incoming.last.id === undefined && incoming.seq > pm.seq;
  }

  _clientOnNack(from, msg) {
    const pm = this.pendingMove;
    if (pm && msg.id === pm.id && msg.reason === 'veraltet') {
      const t = this._isOptimistic && this._confirmed ? this._confirmed : this.table;
      // neuerer Stand noch unterwegs → abwarten (die Wiederholung im Takt fragt erneut)
      if (!t || (typeof msg.seq === 'number' && t.seq < msg.seq)) return;
      const seat = this.mySeat;
      if (!pm.retriedStale && t.status === 'play' && t.round === pm.round && seat !== null && turnOf(t) === seat && this.engine.isLegal(t.gs, pm.move)) {
        // Zug passt auch auf den neuen Stand → einmal automatisch neu senden
        pm.retriedStale = true;
        pm.seq = t.seq;
        pm.sent = this.now();
        this.stats.moveRetries++;
        const out = { t: 'move', id: pm.id, move: pm.move, seq: t.seq };
        const reveal = this._revealFor(pm.move);
        if (reveal) out.reveal = reveal;
        pm.reveal = reveal;
        this._sendHost(out);
        if (!this.engine.HIDDEN && !reveal && !this._isOptimistic) this._optimistic(seat, pm.move);
        return;
      }
      msg = { ...msg, reason: 'der Tisch hat sich geändert, bitte noch einmal' };
    }
    if (this.pendingMove && msg.id === this.pendingMove.id) {
      this.stats.rejected++;
      this.pendingMove = null;
      if (this._isOptimistic && this._confirmed) {
        this.table = this._confirmed;
        this._isOptimistic = false;
        this._confirmed = null;
        this._changed({ kind: 'state' });
      }
      this._emit('toast', 'Zug abgelehnt: ' + msg.reason);
    }
  }

  // ---------- Nachrichten ----------

  _onMessage(msg, from) {
    if (!msg || typeof msg.t !== 'string' || this.closed) return;
    const p = this.present.get(from.pid) || {};
    this.present.set(from.pid, { ...p, name: from.name || p.name, via: from.via, lastSeen: this.now() });
    const t = this.table;
    const isHost = this.role === 'host';
    if (t && from.pid === t.hostPid) this.hostSeen = this.now();
    if (typeof msg.build === 'string' && this.build && msg.build !== this.build && !this._versionWarned) {
      // andere App-Version (Update nur bei einem angekommen): einmal erklären, statt still Unpassendes zu zeigen
      this._versionWarned = true;
      this._note(`Gegenstelle ${from.pid} hat Version ${msg.build.slice(0, 12)} (hier ${this.build})`);
      this._emit('toast', 'Mitspieler hat eine andere Version – bitte beide neu laden');
    }
    switch (msg.t) {
      case 'hello':
        this.present.get(from.pid).want = msg.want;
        if (isHost) {
          // hat der andere einen neueren Stand eines anderen Hosts (Übernahme)? → abgeben
          if (msg.have && msg.have.host && newer(msg.have, t) > 0) return this._demote(from);
          this._hostOnHello(from, msg);
        } else if (!t || from.pid === t.hostPid) {
          // Client: Host oder unbekannter Tisch → um Stand bitten
          if (msg.have && msg.have.host) this.link.send({ t: 'sync' }, from.pid);
        }
        break;
      case 'state':
        if (isHost) {
          // zweiter Host mit neuerem Stand → abgeben
          // gleicher Stand zweier Hosts (gleichzeitige Übernahme): die lexikographisch größere pid gibt nach
          const d = msg.table && msg.table.hostPid === from.pid && from.pid !== this.me.pid ? newer(msg.table, t) : -1;
          if ((d > 0 || (d === 0 && this.me.pid > from.pid)) && this._knownGame(msg.table.game)) {
            this.table = null;
            this._clientOnState(from, msg);
          }
          return;
        }
        this._clientOnState(from, msg);
        break;
      case 'hb':
        if (isHost) {
          // anderer Host: neuerer Stand oder Gleichstand mit kleinerer pid → dessen Stand holen (dann gibt einer nach)
          const d = newer(msg, t);
          if (from.pid !== this.me.pid && (d > 0 || (d === 0 && from.pid < this.me.pid))) this.link.send({ t: 'sync' }, from.pid);
          return;
        }
        if (!t || msg.epoch !== t.epoch || msg.seq !== t.seq || msg.round !== t.round) {
          if (!this.pendingMove) this.link.send({ t: 'sync' }, from.pid);
        }
        if (msg.here) this.here = msg.here;
        break;
      case 'sync':
        if (isHost) this._broadcastState(from.pid);
        break;
      case 'move':
        if (isHost) this._hostOnMove(from, msg);
        break;
      case 'act':
        if (isHost) this._hostOnAct(from, msg);
        break;
      case 'nack':
        if (!isHost) this._clientOnNack(from, msg);
        break;
      case 'fair':
        if (isHost) this._hostOnFair(from, msg);
        break;
    }
    this._emit('net', this.netStatus());
  }

  _demote(from) {
    this._note(`Host-Rolle an ${from.pid} abgegeben`);
    this.link.send({ t: 'sync' }, from.pid);
  }

  _onPeers(peers, fresh) {
    // neue Gegenstelle (oder neu geladen): vorstellen bzw. Stand schicken
    for (const pid of fresh || []) {
      if (this.role === 'host' && this.table) this._broadcastState(pid);
      else this._hello(pid);
    }
    this._emit('net', this.netStatus());
  }

  _hello(to) {
    const t = this.table;
    const msg = {
      t: 'hello', name: this.me.name, want: this.want,
      have: t ? { epoch: t.epoch, seq: t.seq, host: t.hostPid === this.me.pid, game: t.game } : null
    };
    if (this.build) msg.build = this.build;
    this.link.send(msg, to);
  }

  _sendHost(msg) {
    const host = this.table && this.table.hostPid;
    this.link.send(msg, host || undefined);
  }

  _id() {
    return Math.random().toString(36).slice(2, 10);
  }

  // Relay zuschalten, wenn die Gegenstelle, auf die es ankommt, länger nicht direkt erreichbar ist
  // (auch wenn z. B. ein Zuschauer direkt verbunden ist)
  _checkDirect(now) {
    const t = this.table;
    if (!this.link.ensureRelay) return;
    const peers = this.link.status().peers || [];
    const direct = (pid) => peers.some((p) => p.pid === pid && p.via === 'direkt');
    let missing;
    if (!t || this.role !== 'host') missing = !t || !direct(t.hostPid);
    else missing = t.seats.some((s) => !s || (!s.bot && s.pid !== this.me.pid && !direct(s.pid)));
    if (!missing) { this._indirectSince = 0; return; }
    if (!this._indirectSince) this._indirectSince = now;
    if (now - this._indirectSince > TIMING.relayAfter) this.link.ensureRelay(this.role === 'host' ? 'Mitspieler nicht direkt erreichbar' : 'Gastgeber nicht direkt erreichbar');
  }

  // Gegenstelle gerade erreichbar (direkt oder über Relay)?
  _reachable(pid) {
    try { return (this.link.status().peers || []).some((p) => p.pid === pid && p.via !== 'weg'); } catch { return true; }
  }

  // Host: Zeitlimit bzw. Spieler weg → automatischer Zug der Engine (nur online, nur Menschen)
  _autoMove(now) {
    const t = this.table;
    const eng = this.engine;
    if (!eng.timeoutMove || t.status !== 'play') { this._turn = null; return; }
    const seat = turnOf(t);
    if (seat === null || this._isBot(seat) || !t.seats[seat]) { this._turn = null; return; }
    const key = `${t.round}|${t.nmoves}|${seat}`;
    if (!this._turn || this._turn.key !== key) this._turn = { key, since: now };
    const elapsed = now - this._turn.since;
    const pid = t.seats[seat].pid;
    const limit = (Number(t.opts.timer) || 0) * TIMING.timerUnit;
    const away = pid !== this.me.pid && !this._reachable(pid) && now - this.startedAt > TIMING.awayStart;
    const late = limit > 0 && elapsed > limit + TIMING.timerGrace;
    if (!late && !(away && elapsed > TIMING.awayMove)) return;
    const m = eng.timeoutMove(t.gs);
    if (!m || !eng.isLegal(t.gs, m)) return;
    this._note(`Automatischer Zug für Sitz ${seat} (${away ? 'nicht erreichbar' : 'Zeit abgelaufen'})`);
    this._turn = null;
    this._applyMove(seat, m, away ? ' (nicht da)' : ' (Zeit um)');
  }

  _tick() {
    if (this.closed) return;
    const t = this.table;
    const now = this.now();
    this._checkDirect(now);
    if (this.role === 'host' && t) {
      this._autoMove(now);
      if (!this._lastHb || now - this._lastHb >= TIMING.heartbeat) {
        this._lastHb = now;
        const here = [...this.present.entries()].filter(([, p]) => now - p.lastSeen < 30000).map(([pid]) => pid);
        this.link.send({ t: 'hb', epoch: t.epoch, seq: t.seq, round: t.round, here });
      }
      // Mitspieler liefert kein Kettenglied (weg, alte Version) → nach fairWait Host-Zufall, als ungeprüft markiert
      // (_needSince fehlt nach Neuladen oder Übernahme mit gespeichertem fairNeed → ab jetzt zählen)
      if (t.fairNeed) this._needSince ||= now;
      if (t.fairNeed && t.status === 'play' && now - (this._needSince || now) > TIMING.fairWait) {
        this._note('Zufall ohne Mitspieler-Glied (Zeitüberschreitung)');
        this._resolveChance(true);
        const r = this.engine.result(t.gs);
        if (r && t.status === 'play') this._finish(r.winner, r.reason, r.points);
        this._commit({ kind: 'fair' });
        this._maybeBot();
      }
      return;
    }
    if (t) {
      // nach Neuladen (Stand aus dem Speicher, kein neuerer vom Host) entsteht die Prüfung erst hier → Anzeige auffrischen
      const before = this.fairCheck;
      this._clientFair();
      if (before !== this.fairCheck) this._changed({ kind: 'fair' });
    }
    // Client: unbestätigten Zug wiederholen
    if (this.pendingMove && now - this.pendingMove.sent > TIMING.moveRetry) {
      this.pendingMove.sent = now;
      this.stats.moveRetries++;
      this._sendHost({ t: 'move', id: this.pendingMove.id, move: this.pendingMove.move, seq: this.pendingMove.seq });
    }
    // Host lange weg? Sitzender Spieler mit Stand übernimmt die Schiedsrichter-Rolle
    const since = Math.max(this.hostSeen, this.startedAt);
    if (t && !this.engine.HIDDEN && seatOf(t, this.me.pid) !== null && !this.pendingMove && now - since > this._takeoverWait() && this._othersPresent()) {
      this._takeOver();
    }
  }

  // Wartezeit bis zur Übernahme: der erste Mensch in Sitzfolge nach dem Host springt zuerst, jeder weitere
  // takeoverStep später (sonst übernehmen alle im selben Takt → zwei Hosts)
  _takeoverWait() {
    const t = this.table;
    const n = t.seats.length;
    const hostSeat = seatOf(t, t.hostPid);
    const start = hostSeat === null ? 0 : hostSeat + 1;
    let rank = 0;
    for (let i = 0; i < n; i++) {
      const s = t.seats[(start + i) % n];
      if (!s || s.bot || s.pid === t.hostPid) continue;
      if (s.pid === this.me.pid) break;
      rank++;
    }
    return TIMING.hostGone + rank * TIMING.takeoverStep;
  }

  // jemand anderes als der Host ist erreichbar (sonst lohnt die Übernahme nicht)
  _othersPresent() {
    const now = this.now();
    const hostPid = this.table.hostPid;
    for (const [pid, p] of this.present) if (pid !== hostPid && now - p.lastSeen < 30000) return true;
    return false;
  }

  _takeOver() {
    const base = this._isOptimistic && this._confirmed ? this._confirmed : this.table;
    this._isOptimistic = false;
    this._confirmed = null;
    this.table = clone(base);
    this.table.hostPid = this.me.pid;
    this.table.epoch++;
    this._restartFair();
    this._note('Schiedsrichter-Rolle übernommen (Host fehlt)');
    this._emit('toast', 'Gastgeber ist weg – du leitest jetzt den Tisch');
    this._commit({ kind: 'takeover' });
    this._maybeBot();
  }

  // Verbindungsstatus aus Sicht dieses Spielers (für die Anzeige)
  netStatus() {
    if (this.mode !== 'online') return { mode: 'lokal', text: this.mode === 'bot' ? 'gegen Computer' : 'an diesem Gerät' };
    const ls = this.link.status();
    const t = this.table;
    const now = this.now();
    // wichtige Gegenstellen: Host (für Clients), die anderen Sitzenden (für alle)
    const want = new Set();
    if (t) {
      if (t.hostPid !== this.me.pid) want.add(t.hostPid);
      for (const s of t.seats) if (s && s.pid !== this.me.pid && !s.bot) want.add(s.pid);
    }
    const peers = ls.peers.filter((p) => want.size ? want.has(p.pid) : true);
    let mode = 'wartet';
    if (peers.some((p) => p.via === 'direkt')) mode = peers.every((p) => p.via === 'direkt') ? 'direkt' : 'relay';
    else if (peers.some((p) => p.via === 'relay')) mode = 'relay';
    else if (ls.peers.length || (t && t.status !== 'wait' && now - this.startedAt > 8000)) mode = 'getrennt';
    if (t && t.status === 'wait' && !peers.length) mode = 'wartet';
    const texts = { direkt: 'direkt verbunden', relay: 'über Relay', getrennt: 'getrennt', wartet: 'wartet' };
    return { mode, text: texts[mode], relay: ls.relay, relayReason: ls.relayReason, peers: ls.peers, joinError: ls.joinError };
  }
}
