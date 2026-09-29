// Tisch: Sitzplätze, Schiedsrichter (Host), Zustandsverteilung, Wiederaufnahme.
// Transport-unabhängig (link: send/onMessage/onPeers, siehe netlink.js) und ohne DOM → läuft in Node-Tests.
// Der Host prüft jeden Zug mit derselben Engine und verteilt danach den ganzen Tisch-Zustand.
// Tisch-Zustand (reines JSON, liegt bei allen in localStorage):
//   { v, game, opts, hostPid, epoch, seq, round, seats: [{pid,name,bot?}|null, …], gs (Engine-Zustand),
//     status: 'wait'|'play'|'over', result: null|{winner,reason}, drawOffer: null|Sitz,
//     last: null|{m, by, d}, hist: [{m, by, d}] (letzte Züge), nmoves, score: {pid: Punkte}, created, updated }
import { gameOf } from '../games/registry.js';

export const TIMING = {
  heartbeat: 4000,   // Host meldet sich regelmäßig (Stand seq/epoch, Anwesenheit)
  hostGone: 45000,   // so lange kein Host → sitzender Spieler mit Zustand übernimmt (> 3 Relay-Herzschläge)
  moveRetry: 5000,   // unbestätigten Zug erneut senden
  botDelay: 450,     // Mindest-Denkzeit des Computers (fühlt sich natürlicher an)
  relayAfter: 12000  // wie NetLink: so lange ohne Direktweg zur wichtigen Gegenstelle → Relay zuschalten
};
const HIST = 40;

const clone = (x) => JSON.parse(JSON.stringify(x));

// neuer Tisch (vom Host bzw. lokal angelegt)
export function newTable({ game, opts, host, hostSeat = 0, now = Date.now() }) {
  const g = gameOf(game);
  const o = g.engine.normalizeOptions(opts);
  const seats = [null, null];
  seats[hostSeat] = { pid: host.pid, name: host.name };
  return {
    v: 1, game, opts: o, hostPid: host.pid, epoch: 1, seq: 0, round: 1, seats,
    gs: g.engine.initialState(o), status: 'wait', result: null, drawOffer: null,
    last: null, hist: [], nmoves: 0, score: {}, created: now, updated: now
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

export class TableSession {
  // mode: 'online' | 'bot' | 'hotseat'
  // me: { pid, name }; want: 'play' | 'watch'
  // table: gespeicherter oder neuer Tisch (online beim Beitreten ohne Speicherstand: null)
  // link: Netz (nur online); save(table): Speicher-Rückruf; bot: { choose(game, gs, seat) → Promise<Move> }
  constructor({ mode = 'online', me, want = 'play', table = null, link = null, save = () => {}, bot = null, now = () => Date.now(), timers = globalThis }) {
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
      this._changed({ kind: 'start' });
      this._maybeBot();
      return;
    }
    this.link.onMessage = (msg, from) => this._onMessage(msg, from);
    this.link.onPeers = (peers, fresh) => this._onPeers(peers, fresh);
    this.link.onStatus = () => this._emit('net', this.netStatus());
    this._timer = this.timers.setInterval(() => this._tick(), 1000);
    this._hello();
    if (this.table) this._changed({ kind: 'start' });
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
    this.pendingMove = { id: this._id(), move, seq: t.seq, sent: this.now() };
    this.stats.movesSent++;
    this._sendHost({ t: 'move', id: this.pendingMove.id, move, seq: t.seq });
    // Vorschau: Zug lokal schon zeigen, bis der Host bestätigt (bei Ablehnung kommt der alte Stand zurück)
    this._optimistic(seat, move);
    return { ok: true, pending: true };
  }

  // 'resign' | 'draw-offer' | 'draw-accept' | 'draw-decline' | 'rematch'
  act(a) {
    const t = this.table;
    if (!t) return { ok: false };
    if (this.role === 'host') {
      const seat = this.mode === 'hotseat' ? turnOf(t) : this.mySeat;
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
    this._reset(false);
    return { ok: true };
  }

  // ---------- Host ----------

  _applyMove(seat, move) {
    const t = this.table;
    const eng = this.engine;
    if (t.status !== 'play') return { ok: false, reason: 'Partie läuft nicht' };
    if (turnOf(t) !== seat) return { ok: false, reason: 'Nicht am Zug' };
    if (!eng.isLegal(t.gs, move)) return { ok: false, reason: 'Zug nicht erlaubt' };
    const d = eng.describeMove(t.gs, move);
    t.gs = eng.applyMove(t.gs, move);
    t.last = { m: move, by: seat, d };
    t.hist.push(t.last);
    if (t.hist.length > HIST) t.hist.shift();
    t.nmoves++;
    t.drawOffer = null;
    const r = eng.result(t.gs);
    if (r) this._finish(r.winner, r.reason);
    this._commit({ kind: 'move', move, by: seat });
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
    if (seat === null || seat === undefined || t.status !== 'play') return { ok: false, reason: 'Partie läuft nicht' };
    if (a === 'resign') {
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

  _finish(winner, reason) {
    const t = this.table;
    t.status = 'over';
    t.result = { winner, reason };
    t.drawOffer = null;
    for (let s = 0; s < t.seats.length; s++) {
      const p = t.seats[s];
      if (!p) continue;
      const pts = winner === null ? 0.5 : winner === s ? 1 : 0;
      t.score[p.pid] = (t.score[p.pid] || 0) + pts;
    }
  }

  // neue Partie: bei Revanche Farben tauschen
  _reset(swap) {
    const t = this.table;
    const eng = this.engine;
    if (swap) t.seats.reverse();
    t.gs = eng.initialState(t.opts);
    t.round++;
    t.result = null;
    t.drawOffer = null;
    t.last = null;
    t.hist = [];
    t.nmoves = 0;
    t.status = t.seats.every(Boolean) ? 'play' : 'wait';
    this._commit({ kind: 'reset' });
    this._maybeBot();
  }

  _commit(info) {
    const t = this.table;
    t.seq++;
    t.updated = this.now();
    this._save(t);
    if (this.mode === 'online') this._broadcastState();
    this._changed(info);
  }

  _changed(info) {
    this._emit('change', this.table, info);
  }

  _broadcastState(to) {
    this.link.send({ t: 'state', table: this.table }, to);
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
    Promise.resolve(this.bot.choose(t.game, t.gs, t.seats[seat].bot)).then((move) => {
      const wait = Math.max(0, TIMING.botDelay - (this.now() - t0));
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
        if (t.seats.every(Boolean)) t.status = 'play';
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
      // veraltet oder doppelt (z. B. über Relay wiederholt) → nur Stand schicken
      this._broadcastState(from.pid);
      return;
    }
    const r = this._applyMove(seat, msg.move);
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
    this.hostSeen = this.now();
    // Vergleich immer gegen den letzten BESTÄTIGTEN Stand (nicht gegen die Vorschau des eigenen Zugs)
    const base = this._isOptimistic ? this._confirmed : this.table;
    if (newer(incoming, base) <= 0) return;
    const shown = this.table;
    const wasOptimistic = this._isOptimistic;
    if (this.pendingMove && incoming.seq > this.pendingMove.seq) this.pendingMove = null;
    this._isOptimistic = false;
    this._confirmed = null;
    this.table = incoming;
    this._save(incoming);
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

  _clientOnNack(from, msg) {
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
          if (msg.table && msg.table.hostPid === from.pid && newer(msg.table, t) > 0) {
            this.table = null;
            this._clientOnState(from, msg);
          }
          return;
        }
        this._clientOnState(from, msg);
        break;
      case 'hb':
        if (isHost) {
          if (msg.epoch > t.epoch || (msg.epoch === t.epoch && msg.seq > t.seq)) this.link.send({ t: 'sync' }, from.pid);
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
    this.link.send({
      t: 'hello', name: this.me.name, want: this.want,
      have: t ? { epoch: t.epoch, seq: t.seq, host: t.hostPid === this.me.pid, game: t.game } : null
    }, to);
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

  _tick() {
    if (this.closed) return;
    const t = this.table;
    const now = this.now();
    this._checkDirect(now);
    if (this.role === 'host' && t) {
      if (!this._lastHb || now - this._lastHb >= TIMING.heartbeat) {
        this._lastHb = now;
        const here = [...this.present.entries()].filter(([, p]) => now - p.lastSeen < 30000).map(([pid]) => pid);
        this.link.send({ t: 'hb', epoch: t.epoch, seq: t.seq, round: t.round, here });
      }
      return;
    }
    // Client: unbestätigten Zug wiederholen
    if (this.pendingMove && now - this.pendingMove.sent > TIMING.moveRetry) {
      this.pendingMove.sent = now;
      this.stats.moveRetries++;
      this._sendHost({ t: 'move', id: this.pendingMove.id, move: this.pendingMove.move, seq: this.pendingMove.seq });
    }
    // Host lange weg? Sitzender Spieler mit Stand übernimmt die Schiedsrichter-Rolle
    const since = Math.max(this.hostSeen, this.startedAt);
    if (t && seatOf(t, this.me.pid) !== null && !this.pendingMove && now - since > TIMING.hostGone && this._othersPresent()) {
      this._takeOver();
    }
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
    this._note('Schiedsrichter-Rolle übernommen (Host fehlt)');
    this._emit('toast', 'Gastgeber ist weg – du leitest jetzt den Tisch');
    this._commit({ kind: 'takeover' });
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
