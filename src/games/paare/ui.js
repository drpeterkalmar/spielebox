// Paare finden: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { RULES as PAARE_RULES } from './rules.js';
import { seatIcon } from '../../ui/gameicons.js';
import { rulesFromData } from '../../ui/texts.js';

export const ui = {
  icon: (seat) => seatIcon(seat),
  rules: (o) => rulesFromData(PAARE_RULES, o),
  hidden: true,
  shared: true,   // verdeckt für alle gleich → zu zweit am Gerät kein Sichtschutz nötig
  sub(t, seat) {
    const n = t.gs.scores[seat];
    return t.gs.n === 1 ? `${n} ${n === 1 ? 'Paar' : 'Paare'} · ${t.gs.flips} Züge` : `${n} ${n === 1 ? 'Paar' : 'Paare'}`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.turn !== seat || gs.phase !== 'play') return null;
    return gs.open.length ? 'Zweite Karte umdrehen' : gs.last && gs.last.match && gs.last.seat === seat ? 'Paar! Du darfst nochmal' : 'Du bist dran: Karte umdrehen';
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    let d = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>';
    const face = { 0: '🐱', 3: '🐱', 5: '🐶' };
    for (let k = 0; k < 9; k++) { const x = 8 + (k % 3) * 29, y = 8 + Math.floor(k / 3) * 29; d += face[k] ? `<rect x="${x}" y="${y}" width="26" height="26" rx="5" fill="#fffaf0" stroke="#b8862c" stroke-width="1.5"/><text x="${x + 13}" y="${y + 19}" font-size="16" text-anchor="middle">${face[k]}</text>` : `<rect x="${x}" y="${y}" width="26" height="26" rx="5" fill="#2f6f8f" stroke="#1d4357" stroke-width="1.5"/>`; }
    return d;
  }
};
