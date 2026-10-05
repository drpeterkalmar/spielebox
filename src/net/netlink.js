// Netz-Verbindung eines Tisches: direkt per Trystero (WebRTC, Signalisierung über Nostr-Relays)
// und – falls keine Direktverbindung zustande kommt oder ?relay=1 – als Relay-Fallback:
// AES-GCM-verschlüsselte Kurznachrichten über dieselben öffentlichen Nostr-Relays.
// Die Relays sehen nur Hashes (Raum-ID, Relay-Topic) und verschlüsselte Nutzlast.
// Umschlag jeder Nachricht: { v: 1, f: pid, n: name, s: Sitzung, i: laufende Nr., ts, to?, m: Nachricht }
import { joinRoom } from '../../lib/trystero.js';
import { RelayChannel } from './relaychannel.js';
import { RELAYS } from './relays.js';
import { deriveKey, seal, open, relayTopicFor } from './crypto.js';

export const APP_ID = 'spielebox-v1';
export const LINK_TIMING = {
  relayAfter: 12000,   // so lange ohne Direktverbindung → Relay zuschalten
  presence: 15000,     // Lebenszeichen über Relay
  relayFresh: 40000,   // Relay-Gegenstelle gilt so lange als erreichbar
  relayHeartbeat: 12000, // Herzschlag des Hosts über Relay seltener (öffentliche Relays nicht fluten)
  maxAge: 30 * 60000   // ältere Nachrichten verwerfen – gemessen mit der Uhr der Gegenstelle (Versatz aus ihrem _hi)
};

const MAX_SEEN = 4000;
const rand = () => Math.random().toString(36).slice(2, 10);

export class NetLink {
  constructor({ words, roomId, pid, name, relayOnly = false, log = () => {} }) {
    this.words = words;
    this.roomId = roomId;
    this.pid = pid;
    this.name = name;
    this.relayOnly = relayOnly;
    this.log = log;
    this.session = rand();
    this.counter = 0;
    this.peers = new Map();        // pid → { pid, name, direct: trysteroPeerId|null, relaySeen, session }
    this.directPeers = new Set();  // verbundene Trystero-Peers (auch noch ohne bekannte pid)
    this.peerIdToPid = new Map();
    this.seen = new Set();
    this.onMessage = null;
    this.onPeers = null;
    this.onStatus = null;
    this.room = null;
    this.relay = null;
    this.relayReason = null;
    this.joinError = null;
    this.lastDirect = 0;
    this.startedAt = 0;
    this.stats = { directSent: 0, relaySent: 0, directRecv: 0, relayRecv: 0, firstPeerMs: null, firstRelayPeerMs: null, tooOld: 0 };
    this.skew = new Map();         // pid → geschätzter Uhrenversatz (deren Uhr − unsere) aus dem letzten _hi
  }

  async start() {
    this.startedAt = Date.now();
    this.key = await deriveKey(this.words);
    this.topic = await relayTopicFor(this.roomId);
    if (this.relayOnly) this._startRelay('erzwungen (?relay=1)');
    else this._startDirect();
    this._timer = setInterval(() => this._tick(), 2000);
    this._onVisible = () => { if (document.visibilityState === 'visible') this._tick(true); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisible);
  }

  _startDirect() {
    try {
      this.room = joinRoom({ appId: APP_ID, password: this.words.join(' '), relayConfig: { urls: RELAYS } }, this.roomId, {
        onJoinError: (e) => {
          this.joinError = e && e.error;
          this.log('Trystero: ' + this.joinError);
          if (/could not connect/i.test(this.joinError || '')) this._startRelay('Direktverbindung gescheitert');
          this._status();
        }
      });
    } catch (e) {
      this.joinError = String(e && e.message || e);
      this._startRelay('Trystero nicht verfügbar');
      return;
    }
    this.action = this.room.makeAction('sb');
    this.action.onMessage = (data, ctx) => this._accept(data, 'direct', ctx && ctx.peerId);
    this.room.onPeerJoin = (peerId) => {
      this.directPeers.add(peerId);
      this.lastDirect = Date.now();
      this.log('direkt verbunden: ' + peerId);
      // pid bekannt machen (die Gegenseite lernt uns darüber kennen)
      this._sendDirect(this._env({ t: '_hi' }), [peerId]);
      this._status();
    };
    this.room.onPeerLeave = (peerId) => {
      this.directPeers.delete(peerId);
      const pid = this.peerIdToPid.get(peerId);
      this.peerIdToPid.delete(peerId);
      const p = pid && this.peers.get(pid);
      if (p && p.direct === peerId) p.direct = null;
      this.lastDirect = Date.now();
      this.log('direkt getrennt: ' + peerId);
      this._emitPeers([]);
    };
  }

  _startRelay(reason) {
    if (this.relay) return;
    this.relayReason = reason;
    this.log('Relay-Fallback an: ' + reason);
    this.relay = new RelayChannel({
      urls: RELAYS,
      topic: this.topic,
      onMessage: (content) => this._fromRelay(content),
      onStatus: () => this._status()
    });
    this.relay.start();
    this._lastPresence = Date.now();
    this._sendRelay(this._env({ t: '_hi', ask: true }));
    this._status();
  }

  // vom Tisch angefordert: wichtige Gegenstelle (Host bzw. Mitspieler) ist nicht direkt erreichbar
  ensureRelay(reason) {
    if (!this.relay && this.key) this._startRelay(reason);
  }

  async _fromRelay(content) {
    let env;
    try { env = await open(this.key, content); } catch { return; } // fremder Raum/kaputt
    this._accept(env, 'relay');
  }

  _env(m, to) {
    const env = { v: 1, f: this.pid, n: this.name, s: this.session, i: ++this.counter, ts: Date.now(), m };
    if (to) env.to = to;
    return env;
  }

  _sendDirect(env, peerIds) {
    if (!this.action || !peerIds.length) return;
    this.stats.directSent++;
    this.action.send(env, { target: peerIds }).catch((e) => this.log('Senden direkt: ' + e));
  }

  _sendRelay(env) {
    if (!this.relay) return;
    this.stats.relaySent++;
    seal(this.key, env).then((c) => this.relay.publish(c)).catch((e) => this.log('Senden Relay: ' + e));
  }

  // Nachricht an eine pid oder an alle; direkt, wo möglich, sonst über Relay
  send(msg, to) {
    const env = this._env(msg, to);
    const direct = [];
    let viaRelay = false;
    if (to) {
      const p = this.peers.get(to);
      if (p && p.direct) direct.push(p.direct);
      else viaRelay = true;
    } else {
      for (const p of this.peers.values()) {
        if (p.direct) direct.push(p.direct);
        else viaRelay = true;
      }
      // verbundene Peers, deren pid wir noch nicht kennen
      for (const peerId of this.directPeers) if (!this.peerIdToPid.has(peerId)) direct.push(peerId);
      if (!this.peers.size) viaRelay = true;
    }
    if (direct.length) this._sendDirect(env, [...new Set(direct)]);
    if (viaRelay && msg.t === 'hb') {
      // Herzschlag ist verlustfrei verzichtbar: über Relay nur alle relayHeartbeat ms
      const now = Date.now();
      if (now - (this._lastRelayHb || 0) < LINK_TIMING.relayHeartbeat) return;
      this._lastRelayHb = now;
    }
    if (viaRelay) this._sendRelay(env);
  }

  _accept(env, via, peerId) {
    if (!env || env.v !== 1 || typeof env.f !== 'string' || !env.m || typeof env.m !== 'object') return;
    if (env.f === this.pid) return; // eigene Nachricht (auch aus einer früheren Sitzung)
    if (env.to && env.to !== this.pid) return;
    // uralt (Relay-Rückblick)? Relativ zur Uhr der Gegenstelle: falsch gestellte Uhren trennen sonst still
    const now = Date.now();
    if (env.m.t === '_hi' && typeof env.ts === 'number') this.skew.set(env.f, env.ts - now);
    if (now + (this.skew.get(env.f) || 0) - (env.ts || 0) > LINK_TIMING.maxAge) {
      this.stats.tooOld++;
      this._status();
      return;
    }
    const key = env.s + ':' + env.i;
    let p = this.peers.get(env.f);
    const fresh = [];
    if (!p) {
      p = { pid: env.f, name: env.n, direct: null, relaySeen: 0, session: env.s };
      this.peers.set(env.f, p);
      fresh.push(env.f);
    } else if (p.session !== env.s && (env.ts || 0) >= (p.sessionTs || 0)) {
      p.session = env.s; // Gegenseite hat neu geladen
      fresh.push(env.f);
    }
    if (env.s === p.session) p.sessionTs = Math.max(p.sessionTs || 0, env.ts || 0);
    if (env.n) p.name = env.n;
    if (via === 'direct') {
      this.stats.directRecv++;
      if (peerId && p.direct !== peerId) {
        p.direct = peerId;
        this.peerIdToPid.set(peerId, env.f);
        if (!fresh.length) fresh.push(env.f);
      }
      if (this.stats.firstPeerMs === null) this.stats.firstPeerMs = Date.now() - this.startedAt;
    } else {
      this.stats.relayRecv++;
      p.relaySeen = Date.now();
      if (this.stats.firstRelayPeerMs === null) this.stats.firstRelayPeerMs = Date.now() - this.startedAt;
    }
    if (fresh.length) this._emitPeers(fresh);
    if (this.seen.has(key)) return; // schon über den anderen Weg bekommen
    this.seen.add(key);
    if (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.values().next().value);
    if (env.m.t === '_hi') {
      if (env.m.ask && via === 'relay') this._sendRelay(this._env({ t: '_hi' }, env.f));
      return;
    }
    this.onMessage && this.onMessage(env.m, { pid: env.f, name: p.name, via });
  }

  _emitPeers(fresh) {
    this.onPeers && this.onPeers(this.status().peers, fresh);
    this._status();
  }

  _status() {
    this.onStatus && this.onStatus(this.status());
  }

  _tick(force) {
    const now = Date.now();
    // keine Direktverbindung seit relayAfter → Relay zuschalten
    if (!this.relay && !this.directPeers.size && now - Math.max(this.lastDirect, this.startedAt) > LINK_TIMING.relayAfter) {
      this._startRelay('keine Direktverbindung');
    }
    if (this.relay && (force || now - this._lastPresence > LINK_TIMING.presence)) {
      // Lebenszeichen nur, wenn jemand nicht direkt erreichbar ist (oder noch niemand da ist)
      const someoneIndirect = !this.peers.size || [...this.peers.values()].some((p) => !p.direct);
      if (someoneIndirect) {
        this._lastPresence = now;
        this._sendRelay(this._env({ t: '_hi', ask: !!force }));
      }
    }
    this._status();
  }

  status() {
    const now = Date.now();
    const peers = [...this.peers.values()].map((p) => ({
      pid: p.pid,
      name: p.name,
      via: p.direct ? 'direkt' : now - p.relaySeen < LINK_TIMING.relayFresh ? 'relay' : 'weg'
    }));
    const rs = this.relay ? this.relay.status() : null;
    return {
      peers,
      direct: !!this.room,
      directPeers: this.directPeers.size,
      relay: rs ? { open: rs.open, total: rs.total } : null,
      relayReason: this.relayReason,
      joinError: this.joinError,
      stats: this.stats
    };
  }

  // Verbindung neu aufbauen (Knopf „Wiederverbinden“)
  async reconnect() {
    this.log('Wiederverbinden');
    if (this.room) {
      const r = this.room;
      this.room = null;
      this.action = null;
      this.directPeers.clear();
      this.peerIdToPid.clear();
      for (const p of this.peers.values()) p.direct = null;
      try { await r.leave(); } catch { /* egal */ }
    }
    if (this.relay) {
      this.relay.close();
      this.relay = null;
      const reason = this.relayReason;
      this._startRelay(reason || 'Wiederverbinden');
    }
    if (!this.relayOnly) this._startDirect();
    this.lastDirect = Date.now();
    this._status();
  }

  async close() {
    clearInterval(this._timer);
    if (typeof document !== 'undefined' && this._onVisible) document.removeEventListener('visibilitychange', this._onVisible);
    try { this.send({ t: 'bye' }); } catch { /* egal */ }
    if (this.relay) this.relay.close();
    if (this.room) {
      try { await this.room.leave(); } catch { /* egal */ }
    }
  }
}
