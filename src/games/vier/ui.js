// Vier gewinnt: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { RULES as VIER_RULES } from './rules.js';
import { NS } from '../../ui/gameicons.js';
import { rulesFromData } from '../../ui/texts.js';

function discIcon(color) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="8.5" fill="${color}" stroke="rgba(0,0,0,.5)"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/>`;
  return svg;
}

export const ui = {
  icon: (seat) => discIcon(seat ? '#f2c230' : '#d8453b'),
  rules: (o) => rulesFromData(VIER_RULES, o),
  sub(t, seat) {
    const n = t.gs.cols.reduce((a, c) => a + c.filter((x) => x === seat).length, 0);
    return `${seat ? 'Gelb' : 'Rot'} · ${n} ${n === 1 ? 'Stein' : 'Steine'}`;
  },
  status(t, seat) { return t.gs.turn === seat ? 'Du bist dran: Spalte wählen' : null; },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    let d = '<rect width="100" height="100" rx="12" fill="#2459b8"/>';
    const b = ['....', '..r.', '.yr.', 'yrry'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const v = b[r][c]; d += `<circle cx="${17 + c * 22}" cy="${17 + r * 22}" r="8.5" fill="${v === 'r' ? '#d8453b' : v === 'y' ? '#f2c230' : '#163a7c'}"/>`; }
    return d;
  }
};
