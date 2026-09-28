// Relay-Fallback: Transport-Kanal über mehrere Nostr-Relays parallel.
// Nachrichten laufen als ephemere, signierte Nostr-Events (createEvent aus Trystero).
// Keine Verschlüsselung hier – das macht der Aufrufer mit seal/open aus crypto.js.
// Läuft im Browser und in Node (globales WebSocket), ohne DOM.
import { createEvent, subscribe } from '../../lib/trystero.js';
import { sha256Hex } from './crypto.js';

// Zeiten in ms (Option timing überschreibt sie, nur für Tests gedacht)
const ZEITEN = {
  backoffMin: 1000, // Wiederaufbau nach 1 s, 2 s, 4 s …
  backoffMax: 30000, // … höchstens 30 s
  stabil: 10000, // so lange offen gewesen → Backoff beginnt wieder bei 1 s
  verbinden: 10000, // hängender Verbindungsaufbau wird abgebrochen
  leerlauf: 30000, // so lange nichts empfangen → Lebenszeichen anfordern
  antwort: 10000, // so lange auf irgendeine Antwort warten (nach Senden/Lebenszeichen)
  nachlauf: 3000, // Warteschlange geht auch an Relays, die kurz nach dem ersten öffnen
  nachsenden: 30000, // unbestätigte Events nach Wiederaufbau erneut senden, wenn jünger
  ackVergessen: 60000 // unbeantwortete Sendungen danach vergessen
};
const QUEUE_MAX = 50;
const MERK_MAX = 4096;
const SINCE_TOLERANZ_S = 60;
// Relay verlangt Anmeldung, Proof-of-Work, Bezahlung oder sperrt uns → unbrauchbar
const UNBRAUCHBAR = /auth-required|pow:|restricted|blocked:/i;
const NULL_ID = '0'.repeat(64);

function zufallsId() {
  let s = '';
  for (const b of globalThis.crypto.getRandomValues(new Uint8Array(8))) s += b.toString(16).padStart(2, '0');
  return s;
}

// Set mit Obergrenze (älteste Einträge fliegen raus)
function merke(set, wert) {
  set.add(wert);
  if (set.size > MERK_MAX) set.delete(set.values().next().value);
}

const fehlertext = (e) => (e && e.message) || String(e);

export class RelayChannel {
  // urls: Relay-Adressen; topic: z. B. relayTopicFor(roomId)
  // onMessage(content, { relay, eventId, createdAt }): jedes fremde Event genau einmal
  // onStatus(status): bei Änderung von Zustand oder lastError (pro Tick gebündelt)
  // log(text): optionale Diagnose
  // sinceSlackSec: Abo reicht so weit zurück (Uhrenversatz, kurze Ausfälle); 0 = exakt wie Trystero
  constructor({ urls, topic, onMessage, onStatus, log, sinceSlackSec = SINCE_TOLERANZ_S, timing } = {}) {
    if (!Array.isArray(urls) || urls.length === 0) throw new TypeError('RelayChannel: urls fehlen');
    if (typeof topic !== 'string' || topic === '') throw new TypeError('RelayChannel: topic fehlt');
    this.topic = topic;
    this._onMessage = typeof onMessage === 'function' ? onMessage : () => {};
    this._onStatus = typeof onStatus === 'function' ? onStatus : null;
    this._log = typeof log === 'function' ? log : () => {};
    this._slack = Math.max(0, Number(sinceSlackSec) || 0);
    this._t = { ...ZEITEN, ...timing };
    this._relays = [...new Set(urls)].map((url) => ({
      url,
      state: 'closed',
      sent: 0,
      ok: 0,
      rejected: 0,
      received: 0,
      lastError: null,
      lastAckMs: null,
      ws: null,
      subId: null,
      probeId: null,
      versuch: 0,
      offenSeit: 0,
      unbrauchbar: false,
      timer: null,
      leerlaufTimer: null,
      antwortTimer: null,
      offen: new Map(), // eventId → { t: Sendezeit, erst: erste Sendung, text } bis zum OK
      kette: Promise.resolve() // ID-Prüfung je Relay in Eingangsreihenfolge
    }));
    this._gesehen = new Set(); // gemeldete Event-IDs (Dubletten über alle Relays)
    this._eigene = new Set(); // selbst veröffentlichte Event-IDs
    this._queue = [];
    this._kind = null;
    this._gestartet = false;
    this._geschlossen = false;
    this._statusGeplant = false;
  }

  start() {
    if (this._gestartet || this._geschlossen) return;
    this._gestartet = true;
    for (const r of this._relays) this._verbinden(r);
  }

  // content: String (z. B. seal(...)); liefert { eventId, sentTo }
  async publish(content) {
    if (typeof content !== 'string') throw new TypeError('publish: content muss ein String sein');
    if (this._geschlossen) return { eventId: null, sentTo: 0 };
    const text = await createEvent(this.topic, content);
    const eventId = JSON.parse(text)[1].id;
    merke(this._eigene, eventId);
    if (this._geschlossen) return { eventId, sentTo: 0 };
    let sentTo = 0;
    for (const r of this._relays) if (this._sendeEvent(r, text, eventId)) sentTo++;
    if (sentTo === 0) {
      // kein Relay offen → Warteschlange, geht beim nächsten Öffnen raus
      this._aufraeumenQueue();
      this._queue.push({ text, eventId, an: new Set(), zuerst: 0 });
      while (this._queue.length > QUEUE_MAX) this._queue.shift();
      this._log(`Warteschlange: ${this._queue.length} Nachricht(en)`);
    }
    return { eventId, sentTo };
  }

  status() {
    const relays = this._relays.map((r) => ({
      url: r.url,
      state: r.state,
      sent: r.sent,
      ok: r.ok,
      rejected: r.rejected,
      received: r.received,
      lastError: r.lastError,
      lastAckMs: r.lastAckMs
    }));
    return { open: relays.filter((r) => r.state === 'open').length, total: relays.length, relays };
  }

  close() {
    if (this._geschlossen) return;
    this._geschlossen = true;
    for (const r of this._relays) {
      if (r.subId) this._sende(r, JSON.stringify(['CLOSE', r.subId]));
      this._trennen(r);
      this._setzeZustand(r, 'closed');
    }
    this._queue = [];
  }

  // ---- intern: Verbindung ----

  _verbinden(r) {
    if (this._geschlossen || r.unbrauchbar) return;
    this._trennen(r);
    let ws;
    try {
      ws = new globalThis.WebSocket(r.url);
    } catch (e) {
      this._verloren(r, 'WebSocket: ' + fehlertext(e));
      return;
    }
    r.ws = ws;
    this._setzeZustand(r, 'connecting');
    r.timer = setTimeout(() => this._verloren(r, 'Verbindungs-Timeout'), this._t.verbinden);
    ws.onopen = () => {
      if (r.ws === ws) this._offen(r);
    };
    ws.onmessage = (e) => {
      if (r.ws === ws) this._eingang(r, e.data);
    };
    ws.onclose = (e) => {
      if (r.ws !== ws) return;
      const wie = r.state === 'open' ? 'getrennt' : 'Verbindung fehlgeschlagen';
      this._verloren(r, `${wie} (${e?.code ?? '?'}${e?.reason ? ': ' + e.reason : ''})`);
    };
    ws.onerror = () => {}; // Details gibt es nicht; close folgt
  }

  _offen(r) {
    clearTimeout(r.timer);
    r.timer = null;
    r.offenSeit = Date.now();
    this._setzeZustand(r, 'open');
    this._abonnieren(r);
    this._nachsenden(r);
    this._sendeQueue(r);
    this._leerlauf(r);
  }

  // Verbindung brach vor dem OK ab → Event könnte fehlen, also erneut senden (Empfänger dedupliziert)
  _nachsenden(r) {
    const jetzt = Date.now();
    const unbestaetigt = [...r.offen];
    r.offen.clear();
    let n = 0;
    for (const [id, e] of unbestaetigt) {
      if (jetzt - e.erst < this._t.nachsenden && this._sendeEvent(r, e.text, id, e.erst)) n++;
    }
    if (n) this._log(`${r.url}: ${n} unbestätigte Nachricht(en) erneut gesendet`);
  }

  // Abo über Trysteros subscribe(); since wird um die Toleranz vorverlegt
  _abonnieren(r) {
    r.subId = 'sb-' + zufallsId();
    const req = JSON.parse(subscribe(r.subId, this.topic));
    const filter = req[2];
    this._kind = filter.kinds?.[0] ?? null;
    if (this._slack && typeof filter.since === 'number') filter.since -= this._slack;
    this._sende(r, JSON.stringify(req));
  }

  // Verbindung weg → Wiederaufbau mit Backoff (außer geschlossen/unbrauchbar)
  _verloren(r, grund) {
    if (grund) this._fehler(r, grund);
    const stabil = r.offenSeit && Date.now() - r.offenSeit >= this._t.stabil;
    this._trennen(r);
    if (stabil) r.versuch = 0;
    if (this._geschlossen || r.unbrauchbar) {
      this._setzeZustand(r, 'closed');
      return;
    }
    const warte = Math.min(this._t.backoffMin * 2 ** r.versuch, this._t.backoffMax);
    r.versuch++;
    this._setzeZustand(r, 'backoff');
    this._log(`${r.url}: neuer Versuch in ${warte} ms`);
    r.timer = setTimeout(() => {
      r.timer = null;
      this._verbinden(r);
    }, warte);
  }

  // Socket schließen und Timer stoppen, ohne neuen Versuch
  _trennen(r) {
    clearTimeout(r.timer);
    clearTimeout(r.leerlaufTimer);
    clearTimeout(r.antwortTimer);
    r.timer = r.leerlaufTimer = r.antwortTimer = null;
    r.offenSeit = 0;
    r.subId = null;
    r.probeId = null;
    const ws = r.ws;
    r.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try {
      ws.close();
    } catch {
      // egal, Socket ist ohnehin weg
    }
  }

  _sende(r, text) {
    const ws = r.ws;
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(text);
      return true;
    } catch (e) {
      this._fehler(r, 'Senden: ' + fehlertext(e));
      return false;
    }
  }

  _sendeEvent(r, text, eventId, erst = Date.now()) {
    if (r.state !== 'open' || !this._sende(r, text)) return false;
    r.sent++;
    const jetzt = Date.now();
    for (const [id, e] of r.offen) {
      if (jetzt - e.t < this._t.ackVergessen) break;
      r.offen.delete(id);
    }
    r.offen.delete(eventId); // neu einreihen (Reihenfolge = Sendezeit)
    r.offen.set(eventId, { t: jetzt, erst, text });
    this._wache(r);
    return true;
  }

  _sendeQueue(r) {
    this._aufraeumenQueue();
    let n = 0;
    for (const q of this._queue) {
      if (q.an.has(r.url) || !this._sendeEvent(r, q.text, q.eventId)) continue;
      q.an.add(r.url);
      q.zuerst = q.zuerst || Date.now();
      n++;
    }
    if (n) this._log(`${r.url}: ${n} Nachricht(en) aus der Warteschlange gesendet`);
  }

  // gesendete Einträge bleiben nur kurz (Nachlauf für weitere Relays)
  _aufraeumenQueue() {
    const jetzt = Date.now();
    this._queue = this._queue.filter((q) =>
      (!q.zuerst || jetzt - q.zuerst < this._t.nachlauf) && q.an.size < this._relays.length);
  }

  // ---- intern: Lebenszeichen ----

  // nach Leerlauf REQ auf eine nicht existierende ID senden → Relay antwortet mit EOSE
  _leerlauf(r) {
    clearTimeout(r.leerlaufTimer);
    r.leerlaufTimer = null;
    if (this._geschlossen || r.state !== 'open') return;
    r.leerlaufTimer = setTimeout(() => {
      r.leerlaufTimer = null;
      if (r.probeId) this._sende(r, JSON.stringify(['CLOSE', r.probeId]));
      r.probeId = 'sp-' + zufallsId();
      if (this._sende(r, JSON.stringify(['REQ', r.probeId, { ids: [NULL_ID], limit: 1 }]))) this._wache(r);
    }, this._t.leerlauf);
  }

  // kommt nach dem Senden gar nichts zurück, gilt die Verbindung als tot (halb offene Sockets)
  _wache(r) {
    if (r.antwortTimer) return;
    r.antwortTimer = setTimeout(() => {
      r.antwortTimer = null;
      this._verloren(r, 'keine Antwort vom Relay');
    }, this._t.antwort);
  }

  // ---- intern: Relay-Nachrichten ----

  _eingang(r, data) {
    clearTimeout(r.antwortTimer); // jede Nachricht ist ein Lebenszeichen
    r.antwortTimer = null;
    this._leerlauf(r);
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!Array.isArray(msg)) return;
    const [typ, a, b, c] = msg;
    if (typ === 'EVENT') this._event(r, a, b);
    else if (typ === 'OK') this._ok(r, a, b, c);
    else if (typ === 'EOSE') {
      if (a === r.probeId) {
        this._sende(r, JSON.stringify(['CLOSE', r.probeId]));
        r.probeId = null;
      }
    } else if (typ === 'CLOSED') this._closed(r, a, b);
    else if (typ === 'NOTICE') this._hinweis(r, 'NOTICE: ' + a);
    else if (typ === 'AUTH') this._log(`${r.url}: AUTH-Aufforderung ignoriert`);
  }

  _event(r, subId, ev) {
    if (subId !== r.subId || !ev || typeof ev !== 'object') return;
    if (typeof ev.id !== 'string' || typeof ev.content !== 'string') return;
    if (this._eigene.has(ev.id)) return; // eigenes Echo
    const passt = Array.isArray(ev.tags) &&
      ev.tags.some((t) => Array.isArray(t) && t[0] === 'x' && t[1] === this.topic);
    if (!passt || (this._kind !== null && ev.kind !== this._kind)) return;
    if (this._gesehen.has(ev.id)) {
      r.received++; // schon über ein anderes Relay gemeldet
      return;
    }
    // Event-ID nachrechnen: gefälschte IDs dürfen die Dublettenprüfung nicht aushebeln
    r.kette = r.kette.then(() => this._pruefen(r, ev)).catch((e) => this._log(`${r.url}: ${fehlertext(e)}`));
  }

  async _pruefen(r, ev) {
    const id = await sha256Hex(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]));
    if (id !== ev.id) {
      this._log(`${r.url}: Event mit falscher ID verworfen`);
      return;
    }
    if (this._geschlossen) return;
    r.received++;
    if (this._gesehen.has(id)) return;
    merke(this._gesehen, id);
    try {
      this._onMessage(ev.content, { relay: r.url, eventId: id, createdAt: ev.created_at });
    } catch (e) {
      this._log('onMessage-Fehler: ' + fehlertext(e));
    }
  }

  _ok(r, id, angenommen, text) {
    if (typeof id !== 'string' || !r.offen.has(id)) return;
    r.lastAckMs = Date.now() - r.offen.get(id).t;
    r.offen.delete(id);
    const msg = typeof text === 'string' ? text : '';
    if (angenommen === true || /^duplicate:/i.test(msg)) {
      r.ok++;
    } else {
      r.rejected++;
      this._hinweis(r, 'abgelehnt: ' + (msg || '?'));
    }
  }

  _closed(r, subId, text) {
    if (subId === r.probeId) {
      r.probeId = null;
      return;
    }
    if (subId !== r.subId) return;
    this._hinweis(r, 'CLOSED: ' + (typeof text === 'string' && text ? text : '?'));
    if (!r.unbrauchbar) this._verloren(r, null); // Abo beendet → neu verbinden und abonnieren
  }

  // Meldung des Relays merken; Auth/PoW/Bezahlung/Sperre → Relay ausmustern
  _hinweis(r, text) {
    this._fehler(r, text);
    if (!UNBRAUCHBAR.test(r.lastError) || r.unbrauchbar) return;
    r.unbrauchbar = true;
    this._trennen(r);
    this._setzeZustand(r, 'closed');
    this._log(`${r.url}: unbrauchbar, keine Wiederverbindung`);
  }

  _fehler(r, text) {
    r.lastError = String(text).slice(0, 300);
    this._log(`${r.url}: ${r.lastError}`);
    this._statusGeaendert();
  }

  _setzeZustand(r, state) {
    if (r.state === state) return;
    r.state = state;
    this._statusGeaendert();
  }

  _statusGeaendert() {
    if (!this._onStatus || this._statusGeplant) return;
    this._statusGeplant = true;
    queueMicrotask(() => {
      this._statusGeplant = false;
      try {
        this._onStatus(this.status());
      } catch (e) {
        this._log('onStatus-Fehler: ' + fehlertext(e));
      }
    });
  }
}
