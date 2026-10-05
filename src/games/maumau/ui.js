// Mau-Mau: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as MM from './engine.js';
import { RULES as MAUMAU_RULES } from './rules.js';
import { seatIcon } from '../../ui/gameicons.js';
import { rulesFromData } from '../../ui/texts.js';

export const ui = {
  icon: (seat) => seatIcon(seat),
  rules: (o) => rulesFromData(MAUMAU_RULES, o),
  hidden: true,
  sub(t, seat) {
    const gs = t.gs, n = gs.hands[seat].length;
    return `${n} ${n === 1 ? 'Karte' : 'Karten'}${gs.mau && gs.mau[seat] && n === 1 ? ' · Mau!' : ''}`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.turn !== seat || gs.phase !== 'play') return null;
    if (gs.penalty > 0) return `Eine 7! Kontern oder ${gs.penalty} ziehen`;
    if (gs.drawn) return 'Gezogen – legen oder weiter';
    if (gs.wish) return `Du bist dran – gewünscht: ${MM.SUIT_NAMES[gs.wish]}`;
    return null;
  },
  actions(t, legal, submit, view) {
    const b = (label, act, fn, cls = '') => h('button', { class: 'btn' + cls, data: { act }, on: { click: fn } }, label);
    const out = [];
    if (view && view.needsWish()) {
      for (const s2 of MM.SUITS) out.push(b(MM.SUIT_NAMES[s2], 'wish-' + s2, () => view.wish(s2), ' primary'));
      return [h('div', { class: 'bet-row' }, h('span', { class: 'bet-t', text: 'Welche Farbe wünschst du dir?' }), ...out)];
    }
    if (view && view.canMau()) out.push(b(view.mauOn() ? 'Mau! ✓' : 'Mau sagen', 'mau', () => view.toggleMau(), view.mauOn() ? ' primary' : ''));
    const d = legal.find((m) => m.type === 'draw'), p = legal.find((m) => m.type === 'pass');
    if (d) out.push(b(t.gs.penalty > 0 ? `${t.gs.penalty} Karten ziehen` : 'Karte ziehen', 'draw', () => submit(d)));
    if (p) out.push(b('Weiter', 'pass', () => submit(p), ' primary'));
    return out;
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    const game = 'maumau';
    const de = game !== 'blackjack';
    const cards = game === 'maumau' ? ['H7', 'LU', 'S9'] : de ? ['HA', 'LK', 'EO'] : ['AS', 'KH', 'TD'];
    const dir = de ? 'de' : 'fr';
    return '<rect width="100" height="100" rx="12" fill="#1d5a3f"/>' + cards.map((c, i) =>
      `<g transform="translate(${30 + i * 20} ${56}) rotate(${(i - 1) * 14})"><image href="assets/cards/${dir}/${c}.webp" x="-17" y="-27" width="34" height="${de ? 54 : 49}"/></g>`).join('');
  }
};
