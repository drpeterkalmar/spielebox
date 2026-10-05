// Ludo: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as LD from './engine.js';
import { RULES as LUDO_RULES } from './rules.js';
import { halmaIcon } from '../../ui/gameicons.js';
import { rulesFromData } from '../../ui/texts.js';

// Ludo: Farbe je Sitz kommt aus dem Zustand (zu zweit Rot gegen Grün)
function ludoIcon(seat, t) {
  const c = t && t.gs && t.gs.colors ? t.gs.colors[seat] : seat;
  return halmaIcon(c ?? seat);
}

export const ui = {
  icon: ludoIcon,
  rules: (o) => rulesFromData(LUDO_RULES, o),
  sub(t, seat) {
    const ps = t.gs.pieces[seat] || [];
    const goal = ps.filter((p) => p >= 40).length, out = ps.filter((p) => p >= 0 && p < 40).length;
    return `${LD.PLAYERS[LD.colorOf(t.gs, seat)]} · ${goal}/4 im Ziel`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'roll') return gs.tries > 0 && LD.mayRollThrice(gs) ? `Nochmal würfeln (Versuch ${gs.tries + 1} von 3)` : gs.lastRoll && gs.lastRoll.seat === seat && gs.lastRoll.value === 6 && gs.lastRoll.moved ? 'Eine 6 – nochmal würfeln!' : 'Du bist dran: würfeln';
    if (gs.phase === 'move') return `Du hast eine ${gs.die} – welche Figur?`;
    return null;
  },
  actions(t, legal, submit) {
    const roll = legal.find((m) => m.type === 'roll');
    return roll ? [h('button', { class: 'btn primary', data: { act: 'roll' }, on: { click: () => submit(roll) } }, 'Würfeln')] : [];
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    const col = ['#d8453b', '#2f6fd6', '#2e9e57', '#e0b12c'];
    let d = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>';
    const corners = [[8, 62], [8, 8], [62, 8], [62, 62]];
    corners.forEach(([x, y], k) => { d += `<rect x="${x}" y="${y}" width="30" height="30" rx="7" fill="${col[k]}" opacity=".35"/>`; });
    d += '<path d="M42 8H58V42H92V58H58V92H42V58H8V42H42Z" fill="#f4e9d2" stroke="#5a3a1a" stroke-width="2"/>';
    corners.forEach(([x, y], k) => { d += `<circle cx="${x + 15}" cy="${y + 15}" r="8" fill="${col[k]}" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/>`; });
    return d + '<rect x="40" y="40" width="20" height="20" rx="4" fill="#fff" stroke="#333"/><circle cx="45" cy="45" r="2" fill="#222"/><circle cx="55" cy="55" r="2" fill="#222"/>';
  }
};
