// Host-Übernahme: Ist der Host lange weg, übernimmt ein sitzender Mitspieler (gestaffelt nach Sitzfolge); zwei Hosts
// mit gleichem Stand einigen sich (größere pid gibt nach). Methoden der TableSession (in table.js eingehängt).
import { TIMING, clone, newer, seatOf } from './tablebase.js';

export const takeoverMethods = {
  // Client: Host lange weg? Sitzender Spieler mit Stand übernimmt die Schiedsrichter-Rolle
  _maybeTakeOver(now) {
    const t = this.table;
    const since = Math.max(this.hostSeen, this.startedAt);
    if (t && !this.engine.HIDDEN && seatOf(t, this.me.pid) !== null && !this.pendingMove && now - since > this._takeoverWait() && this._othersPresent()) {
      this._takeOver();
    }
  },

  // Host bekommt einen Stand: zweiter Host mit neuerem Stand → abgeben;
  // gleicher Stand zweier Hosts (gleichzeitige Übernahme): die lexikographisch größere pid gibt nach
  _hostOnState(from, msg) {
    const t = this.table;
    const d = msg.table && msg.table.hostPid === from.pid && from.pid !== this.me.pid ? newer(msg.table, t) : -1;
    if ((d > 0 || (d === 0 && this.me.pid > from.pid)) && this._knownGame(msg.table.game)) {
      this.table = null;
      this._clientOnState(from, msg);
    }
  },

  // Host hört den Herzschlag eines anderen Hosts: neuerer Stand oder Gleichstand mit kleinerer pid → dessen Stand holen
  // (dann gibt einer nach)
  _hostOnHb(from, msg) {
    const d = newer(msg, this.table);
    if (from.pid !== this.me.pid && (d > 0 || (d === 0 && from.pid < this.me.pid))) this.link.send({ t: 'sync' }, from.pid);
  },

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
  },

  // jemand anderes als der Host ist erreichbar (sonst lohnt die Übernahme nicht)
  _othersPresent() {
    const now = this.now();
    const hostPid = this.table.hostPid;
    for (const [pid, p] of this.present) if (pid !== hostPid && now - p.lastSeen < 30000) return true;
    return false;
  },

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
  },

  _demote(from) {
    this._note(`Host-Rolle an ${from.pid} abgegeben`);
    this.link.send({ t: 'sync' }, from.pid);
  }
};
