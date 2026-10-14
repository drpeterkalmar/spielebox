// Ziehen von Karten und Figuren (n10 E2) – zusätzlich zu Tippen–Tippen. Ziehen ist „Stück antippen“ + „Ziel antippen“:
// Die Ansicht entscheidet wie bisher über ihre Tipp-Funktion, ob ein Zug daraus wird. Hier nur Erkennung und Bild:
//   - Ziehen beginnt erst ab ZIEH_PX (Finger 6 px, Maus/Stift 3 px) – darunter bleibt es ein Tipp
//   - am Start bleibt ein blasses Geisterbild stehen, das gezogene Stück folgt dem Finger und neigt sich nach dem Tempo
//     (höchstens ±8°); beim Loslassen landet es mit einem kleinen „Plopp“ (Maßstab 1,06 → 1 in 120 ms)
//   - geht der Zug nicht, fliegt das Stück zurück
// Eingabe-Puffer: Ein Tipp, während ein fremder Zug noch ausgespielt wird, geht nicht verloren, sondern wird danach
// ausgeführt (höchstens einer, der neueste). Regler ?ziehen=0 (nur Tippen wie bisher).
// Reine Rechenteile (Schwelle, Neigung, Glättung) ohne DOM → tests/node/drag.test.mjs.
import { urlFlag } from './flags.js';

export const ZIEH = { touch: 6, maus: 3, neigung: 8, landung: 120, plopp: 1.06, zurueck: 160, tapPx: 24 };
export const dragOn = () => urlFlag('ziehen', true);

// ab wie vielen Pixeln ist es Ziehen?
export const dragThreshold = (pointerType) => (pointerType === 'mouse' || pointerType === 'pen' ? ZIEH.maus : ZIEH.touch);
export const isDrag = (dx, dy, pointerType) => Math.hypot(dx, dy) >= dragThreshold(pointerType);

// Neigung (Grad) aus der waagrechten Geschwindigkeit (px/ms), geglättet: prev = bisherige Neigung
export function tiltDeg(vx, prev = 0) {
  const target = Math.max(-ZIEH.neigung, Math.min(ZIEH.neigung, vx * 6));
  const t = prev * 0.7 + target * 0.3;
  return Math.max(-ZIEH.neigung, Math.min(ZIEH.neigung, Math.round(t * 100) / 100));
}

// ---------- Zusammenspiel mit dem Tisch ----------
// Hat die Ansicht beim Loslassen einen Zug abgeschickt? (tablescreen zählt jeden eigenen Zug)
let commits = 0, dropAt = 0;
export const noteCommit = () => { commits++; };
export const commitCount = () => commits;
// eigener Zug kam gerade per Ziehen → nicht noch einmal vom Start ans Ziel gleiten lassen
export const markDrop = () => { dropAt = Date.now(); };
export function recentDrop(ms = 900) {
  const r = dropAt && Date.now() - dropAt < ms;
  dropAt = 0;
  return !!r;
}

// Eingabe-Puffer: solange gate.busy, merkt sich onTap den neuesten Tipp; flush() spielt ihn ab (höchstens 1,5 s alt)
export const gate = {
  busy: false, held: null,
  hold(fn, args) { this.held = { fn, args, at: Date.now() }; },
  flush() {
    const h = this.held;
    this.held = null;
    if (h && Date.now() - h.at < 1500) { try { h.fn(...h.args); } catch { /* egal */ } return true; }
    return false;
  },
  drop() { this.held = null; }
};
