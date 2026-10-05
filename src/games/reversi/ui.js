// Reversi: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as RV from './engine.js';
import { RULES as REVERSI_RULES } from './rules.js';
import { stoneIcon } from '../../ui/gameicons.js';
import { rulesFromData } from '../../ui/texts.js';

export const ui = {
  icon: (seat) => stoneIcon(1 - seat),   // Sitz 0 = Schwarz
  rules: (o) => rulesFromData(REVERSI_RULES, o),
  sub(t, seat) {
    const c = RV.counts(t.gs);
    return `${seat ? 'Weiß' : 'Schwarz'} · ${c[seat]} Steine`;
  },
  status(t, seat) {
    if (t.gs.turn !== seat) return null;
    const l = RV.legalMoves(t.gs);
    return l.length === 1 && l[0].pass ? 'Kein Feld frei – du musst passen' : 'Du bist dran: Feld wählen';
  },
  actions(t, legal, submit) {
    const p = legal.length === 1 && legal[0].pass ? legal[0] : null;
    return p ? [h('button', { class: 'btn primary', data: { act: 'pass' }, on: { click: () => submit(p) } }, 'Passen')] : [];
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    let d = '<rect width="100" height="100" rx="12" fill="#2f7a4a"/>';
    for (let k = 1; k < 4; k++) d += `<path d="M${k * 25} 4V96M4 ${k * 25}H96" stroke="rgba(10,40,20,.7)" stroke-width="1.6"/>`;
    const disc = (x, y, b) => `<circle cx="${x}" cy="${y}" r="9.5" fill="url(#sb-st-${b ? 'b' : 'w'})" stroke="${b ? '#000' : '#7a6548'}"/>`;
    return d + disc(37.5, 37.5, 0) + disc(62.5, 62.5, 0) + disc(62.5, 37.5, 1) + disc(37.5, 62.5, 1) + disc(62.5, 12.5, 1);
  }
};
