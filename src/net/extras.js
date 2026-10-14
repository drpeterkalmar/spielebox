// Online-Paket (n10 E3), als Methoden in TableSession eingehängt (wie fairhost.js/takeover.js). Ohne DOM → Node-Tests.
//   Revanche als Angebot: online mit anderen Menschen am Tisch wird „Revanche“ zum Angebot (t.rematch); erst wenn alle
//     Sitzenden zugestimmt haben, startet die neue Partie. Gegen den Computer und an einem Gerät: sofort wie bisher.
//     Das Angebot verfällt nach TIMING.rematchOffer (60 s) oder mit „Nein danke“.
//   Reaktionen: 6 feste Emoji, kein freier Text. Der Schiedsrichter (Host) nimmt nur diese 6 an, höchstens eine je
//     TIMING.emoteGap (3 s) und Spieler, und verteilt sie (nicht im Tisch-Stand, nichts wird gespeichert).
//   Vertretung: Ist ein Mitspieler TIMING.vertretung (60 s, Link ?vertretung=0 = aus) nicht erreichbar, spielt der
//     Computer (Stufe 2) seinen Platz (t.subs); meldet er sich wieder, übernimmt er sofort. Die Partie endet dadurch nie.
//   Bedenkzeit (Fischer-Uhr, Tisch-Option „Bedenkzeit“, Standard aus): Grundzeit + Zuschlag je Zug, Uhr läuft ab dem
//     zweiten Zug; wer keine Zeit mehr hat, verliert. „+15 s“ schenkt dem Gegner Zeit.
import { TIMING, seatOf } from './tablebase.js';

export const EMOTES = ['👋', '👍', '😮', '😅', '🙏', '🎉'];
export const EMOTE_NAMES = ['Hallo', 'Guter Zug', 'Oha', 'Hoppla', 'Danke', 'Glückwunsch'];
export const CLOCKS = ['3+2', '5+3', '10+5', '15+10'];
export const GIFT_MS = 15000;

// '5+3' → { base: 300000, inc: 3000 }; sonst null
export function parseClock(cfg) {
  if (!CLOCKS.includes(cfg)) return null;
  const [m, s] = cfg.split('+').map(Number);
  return { base: m * 60000, inc: s * 1000 };
}

export function newClock(cfg, seats) {
  const p = parseClock(cfg);
  return p ? { cfg, base: p.base, inc: p.inc, left: Array(seats).fill(p.base), since: null } : null;
}

// Restzeit eines Sitzes (ms) zum Zeitpunkt now; elapsed = so lange läuft der aktuelle Zug schon (Host: now − since)
export function clockLeft(clock, seat, turn, elapsed) {
  if (!clock) return null;
  const base = clock.left[seat];
  return clock.since !== null && seat === turn ? base - Math.max(0, elapsed) : base;
}

export const extrasMethods = {
  // Computer-Stufe eines Sitzes: echter Computer oder Vertretung (Stufe 2); 0 = Mensch spielt selbst
  _botLevel(seat) {
    const t = this.table;
    const p = t && t.seats[seat];
    if (!p) return 0;
    if (p.bot) return p.bot;
    return t.subs && t.subs[seat] ? 2 : 0;
  },

  // hält der Host die Zufalls-Kette dieses Sitzes? (Computer, eigener Platz, vertretener Platz)
  _hostHolds(seat) {
    const t = this.table;
    const p = t.seats[seat];
    return !!p && (!!p.bot || p.pid === this.me.pid || !!(t.subs && t.subs[seat]));
  },

  // ---------- Revanche ----------
  _humanSeats() {
    return this.table.seats.map((p, i) => (p && !p.bot ? i : -1)).filter((i) => i >= 0);
  },

  _rematchAct(seat, a) {
    const t = this.table;
    if (t.status !== 'over') return { ok: false, reason: 'Partie läuft noch' };
    const humans = this._humanSeats();
    const offer = this.mode === 'online' && humans.length >= 2;
    if (a === 'rematch-decline') {
      if (!t.rematch || seat === null || seat === undefined) return { ok: false };
      t.rematch = null;
      this._commit({ kind: 'act', a, by: seat });
      return { ok: true };
    }
    if (!offer) { this._reset(true); return { ok: true }; }
    if (seat === null || seat === undefined) return { ok: false, reason: 'Du schaust zu' };
    const r = t.rematch && this.now() - t.rematch.at < TIMING.rematchOffer ? t.rematch : { seats: [], at: this.now() };
    if (!r.seats.includes(seat)) r.seats = [...r.seats, seat];
    if (humans.every((i) => r.seats.includes(i))) { t.rematch = null; this._reset(true); return { ok: true }; }
    t.rematch = r;
    this._commit({ kind: 'act', a: 'rematch', by: seat });
    return { ok: true, offered: true };
  },

  // ---------- Reaktionen ----------
  emote(e) {
    const t = this.table;
    if (!t || this.mode !== 'online') return { ok: false };
    if (this.role === 'host') return this._hostEmote(this.me.pid, e);
    if (seatOf(t, this.me.pid) === null) return { ok: false, reason: 'Du schaust zu' };
    const now = this.now();
    if (this._emoteAt && now - this._emoteAt < TIMING.emoteGap) return { ok: false, reason: 'zu schnell' };
    this._emoteAt = now;
    this._sendHost({ t: 'emote', e });
    return { ok: true, pending: true };
  },

  _hostEmote(pid, e) {
    const t = this.table;
    const seat = seatOf(t, pid);
    if (seat === null || !Number.isInteger(e) || e < 0 || e >= EMOTES.length) return { ok: false, reason: 'unbekannt' };
    const now = this.now();
    this._emoteLast ||= new Map();
    if (now - (this._emoteLast.get(pid) || -Infinity) < TIMING.emoteGap) return { ok: false, reason: 'zu schnell' };
    this._emoteLast.set(pid, now);
    const msg = { t: 'emote', e, seat, round: t.round };
    this.link.send(msg);
    this._emit('emote', { e, seat });
    return { ok: true };
  },

  _onEmoteMsg(from, msg) {
    const t = this.table;
    if (!t) return;
    if (this.role === 'host') { this._hostEmote(from.pid, msg.e); return; }
    if (from.pid !== t.hostPid || !Number.isInteger(msg.e) || msg.e < 0 || msg.e >= EMOTES.length || !Number.isInteger(msg.seat)) return;
    this._emit('emote', { e: msg.e, seat: msg.seat });
  },

  // ---------- Vertretung ----------
  // Frist ab dem Moment, in dem die Verbindung zum Spieler weg ist (nicht ab seiner letzten Nachricht – wer gerade
  // nachdenkt, schickt minutenlang nichts)
  _subTick(now) {
    const t = this.table;
    if (!t || this.mode !== 'online' || this.role !== 'host') return;
    const limit = TIMING.vertretung;
    this._awaySince ||= new Map();
    let changed = false;
    t.seats.forEach((p, seat) => {
      if (!p || p.bot || p.pid === this.me.pid) return;
      const seen = this.present.get(p.pid);
      const last = seen ? seen.lastSeen : this.startedAt;
      const gone = !this._reachable(p.pid);
      if (!gone) this._awaySince.delete(p.pid);
      else if (!this._awaySince.has(p.pid)) this._awaySince.set(p.pid, Math.max(now - TIMING.tick, last));
      const since = this._awaySince.get(p.pid);
      // zurück: wieder erreichbar oder seit dem Abbruch eine Nachricht geschickt
      const back = !gone || (since !== undefined && last > since);
      if (t.subs && t.subs[seat]) {
        if (back) { delete t.subs[seat]; if (!Object.keys(t.subs).length) t.subs = null; this._awaySince.delete(p.pid); changed = true; this._note(`Sitz ${seat} wieder selbst am Zug`); }
        return;
      }
      if (!limit || t.status !== 'play' || back || now - since < limit || now - this.startedAt < Math.min(limit, TIMING.awayStart)) return;
      t.subs = { ...(t.subs || {}), [seat]: now };
      changed = true;
      this._note(`Computer vertritt Sitz ${seat}`);
    });
    if (!changed) return;
    this._restartFair();
    this._commit({ kind: 'sub' });
    this._maybeBot();
  },

  // ---------- Bedenkzeit ----------
  // vor einem Zug: Zeit abziehen, Zuschlag gutschreiben. false = Zeit war schon abgelaufen (Zug zählt nicht mehr)
  _clockMove(seat) {
    const t = this.table;
    const c = t.clock;
    if (!c || t.status !== 'play') return true;
    const now = this.now();
    if (c.since !== null) {
      const left = c.left[seat] - (now - c.since);
      if (left < -TIMING.timerGrace) { this._flag(seat); return false; }
      c.left[seat] = Math.max(0, left) + c.inc;
    }
    c.since = t.nmoves + 1 >= t.seats.length ? now : null;   // Uhr läuft ab dem zweiten Zug
    return true;
  },

  _flag(seat) {
    const t = this.table;
    t.clock.left[seat] = 0;
    t.clock.since = null;
    this._finish(t.seats.length === 2 ? 1 - seat : null, `${this._seatName(seat)} hat keine Zeit mehr`);
    this._commit({ kind: 'act', a: 'flag', by: seat });
  },

  _clockTick(now) {
    const t = this.table;
    const c = t && t.clock;
    if (!c || t.status !== 'play' || this.role !== 'host' || c.since === null) return;
    const seat = this.engine.currentPlayer(t.gs);
    if (seat === null || seat === undefined) return;
    if (c.left[seat] - (now - c.since) < -TIMING.timerGrace) this._flag(seat);
  },

  _giftTime(seat) {
    const t = this.table;
    const c = t.clock;
    if (!c || t.status !== 'play' || seat === null || seat === undefined || t.seats.length !== 2) return { ok: false, reason: 'keine Uhr' };
    c.left[1 - seat] += GIFT_MS;
    this._commit({ kind: 'act', a: 'moretime', by: seat });
    return { ok: true };
  }
};
