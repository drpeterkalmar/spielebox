// Schach: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { material, inCheck, pgn } from './engine.js';
import { kingIcon } from '../../ui/gameicons.js';
import { rulesSchach } from '../../ui/texts.js';

export const ui = {
  icon: kingIcon,
  rules: rulesSchach,
  flip: true,
  sub(t, seat) {
    const m = material(t.gs);
    const d = m[seat] - m[1 - seat];
    const check = t.status === 'play' && t.gs.turn === seat && inCheck(t.gs);
    const mat = d > 0 ? `Material +${d}` : d < 0 ? `Material −${-d}` : 'Material gleich';
    return check ? `Schach! · ${mat}` : mat;
  },
  status(t, seat) {
    return t.status === 'play' && t.gs.turn === seat && inCheck(t.gs) ? 'Schach! Du bist am Zug' : null;
  },
  menu(t, { item, share }) {
    const names = t.seats.map((s, i) => (s ? s.name : ['Weiß', 'Schwarz'][i]));
    return [item('Partie als PGN teilen', () => share('Schachpartie (PGN)', pgn(t.gs, { white: names[0], black: names[1] })), 'pgn')];
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    let sq = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2) sq += `<rect x="${c * 25}" y="${r * 25}" width="25" height="25"/>`;
    return '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' +
      `<g fill="url(#sb-wood-dark)">${sq}</g>` +
      '<image href="assets/pieces/bK.svg" x="52" y="2" width="46" height="46"/><image href="assets/pieces/wN.svg" x="2" y="52" width="46" height="46"/>';
  }
};
