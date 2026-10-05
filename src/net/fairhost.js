// Fair Play am Tisch: Commits, Kettenglieder, Zufallsereignisse, öffentliches Log und seine Verteilung in Stücken.
// Methoden der TableSession (in table.js eingehängt, arbeiten auf this.table / this.table.fairPriv), dazu reine
// Hilfsfunktionen. Protokoll siehe Kopf von table.js und src/net/fair.js.
import { chainLink, verifyLink, mixLinks, valueFor, sha256, verifyFair } from './fair.js';
import { seatOf } from './tablebase.js';

// Fair-Log je Nachricht höchstens so viele Zeichen JSON: verschlüsselt (Base64) ~ 4/3 davon, das kleinste der sechs
// Relays (basspistol.org) nimmt 18 KB, nicht 20 KB (Messung 05.10. mit tests/relay_live.mjs --groessen)
export const FAIR_CHUNK = 12000;

// Fair-Log ab Position from in Stücken ≤ FAIR_CHUNK Zeichen: [{ round, gen, from, log }]
export function fairChunks(fair, from = 0) {
  const out = [];
  const log = (fair && fair.log) || [];
  const head = { round: fair && fair.round, gen: (fair && fair.gen) || 0 };
  let cur = [], size = 0, start = from;
  for (let i = Math.max(0, from); i < log.length; i++) {
    const n = JSON.stringify(log[i]).length + 1;
    if (cur.length && size + n > FAIR_CHUNK) { out.push({ ...head, from: start, log: cur }); start = i; cur = []; size = 0; }
    cur.push(log[i]);
    size += n;
  }
  if (cur.length) out.push({ ...head, from: start, log: cur });
  return out;
}

// Stück in ein lokal gesammeltes Log einfügen (positionsgleich mit dem Log des Hosts). Lücke → unverändert.
export function mergeFairLog(prev, chunk) {
  if (!chunk || !Array.isArray(chunk.log) || !Number.isInteger(chunk.from) || chunk.from < 0) return prev;
  if (chunk.from > prev.length) return prev;
  return prev.slice(0, chunk.from).concat(chunk.log, prev.slice(chunk.from + chunk.log.length));
}

export const sameFair = (a, b) => !!(a && b && a.round === b.round && (a.gen || 0) === (b.gen || 0));

// Wann frühere Mischungen veröffentlicht werden: Engine-Feld publishShuffleWhen(state), sonst wie bisher sobald eine
// neue Mischung in Phase 'deal' bzw. 'bet' fällt (ohne phase(): immer) – dann spielen die alten Karten keine Rolle mehr
export function publishShuffleNow(eng, gs) {
  if (eng.publishShuffleWhen) return !!eng.publishShuffleWhen(gs);
  const ph = eng.phase ? eng.phase(gs) : 'deal';
  return ph === 'deal' || ph === 'bet';
}

export const fairHostMethods = {
  _needsFair() {
    return this.mode === 'online' && !!this.engine.chance;
  },

  _seed(seat) {
    const t = this.table;
    const p = t.seats[seat];
    const who = p && p.bot ? `bot${seat}|${this.me.pid}` : this.me.pid;
    const gen = t.fair && t.fair.round === t.round ? t.fair.gen || 0 : 0;
    return sha256(`${this.secret}|${t.id || t.created}|${t.round}|${who}${gen ? '|g' + gen : ''}`);
  },

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
  },

  // private Host-Daten des Zufalls-Protokolls (nie verschickt); fehlen z. B. nach einer Übernahme → neu anlegen
  _priv() {
    const t = this.table;
    if (!t.fairPriv) t.fairPriv = { last: t.seats.map(() => null), pending: {}, secret: [] };
    return t.fairPriv;
  },

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
  },

  // Kettenglied k eines Sitzes, wenn bekannt (eigene/Computer sofort, Mitspieler aus ihren Nachrichten)
  _linkOf(seat, k) {
    const t = this.table;
    const p = t.seats[seat];
    if (!p) return null;
    if (p.bot || p.pid === this.me.pid) return k <= this.chain ? chainLink(this._seed(seat), k, this.chain) : null;
    const pend = this._priv().pending[seat];
    return pend && pend[k] ? pend[k] : null;
  },

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
          if (publishShuffleNow(eng, t.gs)) this._publishFair(false);
          priv.secret.push(entry);
        } else {
          t.fair.log.push(entry);
        }
      }
      t.gs = eng.applyChance(t.gs, v);
    }
    return true;
  },

  _publishFair(all) {
    const t = this.table;
    if (!t.fair || !t.fairPriv) return;
    const priv = this._priv();
    const sec = priv.secret;
    if (!sec.length) return;
    t.fair.log.push(...sec);
    t.fair.log.sort((a, b) => a.k - b.k);
    priv.secret = [];
  },

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
  },

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
  },

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
  },

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
  },

  // Host: wer hat wie viele Einträge des aktuellen Fair-Logs (neue Runde/Generation → von vorn)
  _fairAtMap() {
    const f = this.table && this.table.fair;
    const key = f ? `${f.round}|${f.gen || 0}` : '';
    if (key !== this._fairAtKey) { this._fairAtKey = key; this._fairAt.clear(); }
    return this._fairAt;
  },

  // Host: Client fordert Fair-Einträge ab from nach
  _hostOnFairLog(from, msg) {
    const t = this.table;
    if (!t.fair || !Number.isInteger(msg.from) || msg.from < 0 || !sameFair(t.fair, msg)) return;
    for (const c of fairChunks(t.fair, msg.from)) this.link.send({ t: 'fairlog', ...c }, from.pid);
    this._fairAtMap().set(from.pid, t.fair.log.length);
  },

  // Client: Fair-Einträge vom Host (Stück zum gesammelten Log)
  _clientOnFairLog(from, msg) {
    const t = this.table;
    if (!t || from.pid !== t.hostPid || !t.fair || !Array.isArray(t.fair.log) || !sameFair(t.fair, msg)) return;
    const merged = mergeFairLog(t.fair.log, msg);
    if (merged === t.fair.log) { this._askFairLog(); return; }
    t.fair.log = merged;
    if (this._confirmed && this._confirmed !== t && sameFair(this._confirmed.fair, t.fair)) this._confirmed.fair.log = merged;
    this._save(this._isOptimistic && this._confirmed ? this._confirmed : t);
    this._askFairLog();
    const before = this.fairCheck;
    this._clientFair();
    if (before !== this.fairCheck) this._changed({ kind: 'fair' });
  },

  // Client: fehlen Einträge (n vom Host > lokal gesammelt)? → nachfordern (höchstens alle 3 s je Stelle)
  _askFairLog() {
    const t = this.table;
    const f = t && t.fair;
    if (!f || typeof f.n !== 'number' || !Array.isArray(f.log) || f.log.length >= f.n) return;
    const key = `${f.round}|${f.gen || 0}|${f.log.length}`;
    const now = this.now();
    if (this._askedFair && this._askedFair.key === key && now - this._askedFair.at < 3000) return;
    this._askedFair = { key, at: now };
    const msg = { t: 'fairlog', round: f.round, from: f.log.length };
    if (f.gen) msg.gen = f.gen;
    this._sendHost(msg);
  },

  // Client: Fair-Log des neuen Stands = lokal gesammeltes Log (gleiche Runde/Generation) + mitgeschickte Einträge.
  // Ältere Hosts schicken das ganze Log im Stand (kein n) → so übernehmen.
  _takeFair(incoming, base, delta) {
    const f = incoming.fair;
    if (!f || typeof f.n !== 'number') return;
    const prev = base && sameFair(base.fair, f) && Array.isArray(base.fair.log) ? base.fair.log : [];
    f.log = sameFair(delta, f) ? mergeFairLog(prev, delta) : prev;
    if (f.log.length > f.n) f.log = f.log.slice(0, f.n);
  }
};
