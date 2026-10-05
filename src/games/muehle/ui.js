// Mühle: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import * as E from './engine.js';
import { stoneIcon } from '../../ui/gameicons.js';
import { rulesMuehle } from '../../ui/texts.js';

export const ui = {
  icon: stoneIcon,
  rules: rulesMuehle,
  sub(t, seat) {
    const e = E;
    const c = e.countStones(t.gs);
    return c.hand[seat] ? `${c.hand[seat]} in der Hand · ${c.board[seat]} auf dem Brett` : `${c.board[seat]} Steine${e.phase(t.gs, seat) === 'springen' ? ' · springt' : ''}`;
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    return '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' +
      '<g fill="none" stroke="#3a2515" stroke-width="3.2"><rect x="12" y="12" width="76" height="76"/><rect x="25" y="25" width="50" height="50"/><rect x="38" y="38" width="24" height="24"/>' +
      '<path d="M50 12V38M50 62V88M12 50H38M62 50H88"/></g>' +
      '<circle cx="12" cy="12" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="50" cy="25" r="7.5" fill="url(#sb-st-b)"/><circle cx="88" cy="88" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="62" cy="62" r="7.5" fill="url(#sb-st-b)"/>';
  }
};
