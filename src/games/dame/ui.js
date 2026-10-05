// Dame: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { stoneIcon } from '../../ui/gameicons.js';
import { rulesDame } from '../../ui/texts.js';

export const ui = {
  icon: stoneIcon,
  rules: rulesDame,
  flip: true,
  sub(t, seat) {
    const b = t.gs.board;
    const men = b.filter((v) => (seat === 0 ? v === 1 : v === -1)).length;
    const kings = b.filter((v) => (seat === 0 ? v === 2 : v === -2)).length;
    return `${men} Steine${kings ? ` · ${kings} ${kings === 1 ? 'Dame' : 'Damen'}` : ''}`;
  },
  status(t, seat) {
    return seat === t.gs.turn && t.gs.pusted ? 'Gepustet – jetzt normal ziehen' : null;
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    let sq = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if ((r + c) % 2) sq += `<rect x="${c * 20}" y="${r * 20}" width="20" height="20"/>`;
    return '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' +
      `<g fill="url(#sb-wood-dark)">${sq}</g>` +
      '<circle cx="30" cy="10" r="7.5" fill="url(#sb-st-b)"/><circle cx="70" cy="10" r="7.5" fill="url(#sb-st-b)"/><circle cx="50" cy="50" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="10" cy="90" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="90" cy="70" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/>';
  }
};
