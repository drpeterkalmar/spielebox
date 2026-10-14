// Klänge und Vibration je Zug (n10 E1) – welcher Ton wann (ms ab Zugbeginn), ohne DOM → läuft in Node-Tests.
// Abgestimmt auf die Zug-Animation aus tempo.js: Steine klacken, wenn sie landen; Karten wischen, wenn sie losfliegen;
// Schlagen klingt tiefer mit zweitem Klick; Würfel rattern. Höchstens ein Ton je MIN_GAP ms (Rest fällt weg).
// Hold'em: Chips klicken in der Ansicht selbst (holdem/view.js); hier nur Checken (Klopfen) und Aussteigen (Karte).
import { inCheck } from './games/schach/engine.js';
import { applySteps } from './games/backgammon/engine.js';
import { bankReveal, vierFall, ludoStep, reversiTimes } from './tempo.js';

export const MIN_GAP = 120;
export const KINDS = ['klack', 'schlag', 'karte', 'wuerfel', 'platsch', 'kipp', 'tock', 'sieg'];

// Kettenzug (Dame, Halma): Landung des k-ten Sprungs (k ab 0)
const hopAt = (a, k, n) => (n > 1 ? (k + 1) * a.hop + k * a.pause : a.slide);

// ctx: { game, move, prevGs, gs, a (tempo.params), d (Zugtext) } → [{ at, k }] nach Zeit sortiert, Abstand ≥ MIN_GAP
export function moveCues({ game, move, prevGs = null, gs = null, a, d = '' }) {
  if (!move || !a) return [];
  const out = [];
  const cue = (at, k) => out.push({ at: Math.max(0, Math.round(at)), k });
  try {
    switch (game) {
      case 'muehle':
        if (move.remove !== undefined) { cue(a.slide * 0.9, 'klack'); cue(a.slide + a.pause, 'schlag'); }
        else cue(a.slide * 0.9, 'klack');
        break;
      case 'dame': {
        if (move.puste !== undefined) { cue(0, 'schlag'); break; }
        const n = move.path ? move.path.length : 1, cap = move.cap ? move.cap.length : 0;
        for (let k = 0; k < n; k++) cue(hopAt(a, k, n) * 0.95, cap ? 'schlag' : 'klack');
        break;
      }
      case 'halma': {
        const n = move.path ? move.path.length : 0;
        for (let k = 0; k < n; k++) cue(hopAt(a, k, n) * 0.95, 'klack');
        break;
      }
      case 'schach':
        cue(a.slide * 0.9, /x/.test(d) ? 'schlag' : 'klack');
        break;
      case 'schnapsen':
        if (move.type === 'play' || move.type === 'tauschen' || move.type === 'zudrehen') cue(0, 'karte');
        break;
      case 'backgammon': {
        if (move.type === 'roll') { cue(0, 'wuerfel'); break; }
        // eigene Teilzüge klacken schon beim Tippen (backgammon/view.js)
        if (move.type !== 'play' || !move.steps || !move.steps.length || a.own) break;
        let at = 0;
        let s = prevGs && prevGs.phase === 'move' ? prevGs : null;
        move.steps.forEach((st, k) => {
          at = k * (a.slide + a.pause) + a.slide;
          let hit = false;
          if (s) { try { const r = applySteps(s, [st]); hit = (r.hits || 0) > 0; s = r; } catch { s = null; } }
          cue(at * 0.95, hit ? 'schlag' : 'klack');
        });
        break;
      }
      case 'wuerfel':
        if (move.type === 'roll') cue(0, 'wuerfel');
        else if (move.type === 'score') cue(a.slide * 0.9, 'klack');
        break;
      case 'maumau':
        if (move.type === 'play') cue(0, 'karte');
        else if (move.type === 'draw') {
          const n = gs && gs.last && gs.last.n ? Math.min(4, gs.last.n) : 1;
          for (let k = 0; k < n; k++) cue(k * Math.max(MIN_GAP, Math.min(160, a.slide / 2)), 'karte');
        }
        break;
      case 'schiffe': {
        if (move.type !== 'shot') break;
        const l = gs && gs.last;
        cue(a.slide, l && l.hit ? 'schlag' : 'platsch');
        break;
      }
      case 'paare':
        if (Number.isInteger(move.flip)) cue(0, 'karte');
        break;
      case 'reversi': {
        if (!Number.isInteger(move.i)) break;
        const t = reversiTimes(a);
        cue(t.place * 0.9, 'klack');
        if (gs && gs.last && gs.last.flipped && gs.last.flipped.length) cue(t.place + t.flip * 0.5, 'kipp');
        break;
      }
      case 'vier': {
        const col = gs && gs.cols && Number.isInteger(move.col) ? gs.cols[move.col] : null;
        cue(vierFall(a, col ? 6 - (col.length - 1) : 6) * 0.92, 'klack');
        break;
      }
      case 'ludo': {
        if (move.type === 'roll') { cue(0, 'wuerfel'); break; }
        if (move.type !== 'move') break;
        const l = gs && gs.last;
        const n = l && l.piece === move.piece ? (l.from < 0 ? 1 : l.to - l.from) : 6;
        cue(n * ludoStep(a, n) * 0.95, l && l.capture ? 'schlag' : 'klack');
        break;
      }
      case 'blackjack': {
        if (move.type === 'bet') cue(0, 'klack');
        else cue(0, 'karte');
        const n = bankReveal(prevGs, gs, move);
        for (let k = 0; k < n; k++) cue(a.slide + k * a.bankGap, 'karte');
        break;
      }
      case 'holdem':
        if (move.type === 'check') cue(0, 'tock');
        else if (move.type === 'fold') cue(0, 'karte');
        break;
    }
  } catch { /* Klang ist Zugabe – nie das Spiel stören */ }
  return spaced(out);
}

// nach Zeit sortieren, Töne näher als MIN_GAP am vorigen fallen weg
export function spaced(list) {
  const out = [];
  for (const c of list.slice().sort((x, y) => x.at - y.at)) {
    if (out.length && c.at - out[out.length - 1].at < MIN_GAP) continue;
    out.push(c);
  }
  return out;
}

// Vibration (ms, 0 = keine): nur große Momente gegen mich. me = Sitz dieses Geräts (null: Zuschauer/zu zweit am Gerät)
export const HAPTIK = { sieg: 35, gross: 30, abstand: 1500 };
export function hapticCue({ game, move, by, gs, me }) {
  if (!move || !gs || me === null || me === undefined || by === me) return 0;
  try {
    switch (game) {
      case 'schach': return gs.turn === me && inCheck(gs) ? HAPTIK.gross : 0;
      case 'muehle': return move.remove !== undefined ? HAPTIK.gross : 0;
      case 'ludo': return gs.last && gs.last.capture && gs.last.capture.seat === me ? HAPTIK.gross : 0;
      case 'schiffe': return move.type === 'shot' && gs.last && gs.last.sunk !== null && gs.last.sunk !== undefined ? HAPTIK.gross : 0;
    }
  } catch { /* egal */ }
  return 0;
}

