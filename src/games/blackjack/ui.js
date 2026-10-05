// Blackjack: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as BJ from './engine.js';
import { seatIcon } from '../../ui/gameicons.js';
import { rulesBlackjack } from '../../ui/texts.js';

export const ui = {
  icon: seatIcon,
  rules: rulesBlackjack,
  hidden: true,
  shared: true,   // alle sehen dasselbe (Spielerkarten liegen offen) → kein Sichtschutz nötig
  sub(t, seat) {
    const gs = t.gs;
    const parts = [`${BJ.fmtBeans(gs.beans[seat])} Bohnen`];
    if (seat === gs.bank) parts.push(`Bank (noch ${Math.max(1, BJ.ROUNDS_PER_BANK - gs.bankRounds)} ${BJ.ROUNDS_PER_BANK - gs.bankRounds === 1 ? 'Runde' : 'Runden'})`);
    else if (gs.bets[seat]) parts.push(`setzt ${BJ.fmtBeans(gs.bets[seat])}`);
    return parts.join(' · ');
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'bet') return 'Setz deinen Einsatz';
    return null;
  },
  actions(t, legal, submit) {
    const gs = t.gs;
    const b = (label, act, m, primary) => h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: () => submit(m) } }, label);
    const out = [];
    const bets = legal.filter((m) => m.type === 'bet');
    if (bets.length) {
      const max = Math.max(...bets.map((m) => m.amount));
      const picks = [...new Set([1, 2, 5, 10, 20, 50].filter((x) => x <= max).concat([max]))].slice(-6);
      for (const a of picks) out.push(b(a === max && max !== 50 && ![1, 2, 5, 10, 20].includes(a) ? `${a} (alles)` : String(a), 'bet-' + a, { type: 'bet', amount: a }, a === 5));
      return [h('div', { class: 'bet-row' }, h('span', { class: 'bet-t', text: 'Einsatz:' }), ...out)];
    }
    const has = (type) => legal.find((m) => m.type === type);
    if (has('hit')) out.push(b('Ziehen', 'hit', has('hit'), true));
    if (has('stand')) out.push(b('Stehen', 'stand', has('stand')));
    if (has('double')) out.push(b('Verdoppeln', 'double', has('double')));
    if (has('split')) out.push(b('Teilen', 'split', has('split')));
    return out;
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    const game = 'blackjack';
    const de = game !== 'blackjack';
    const cards = game === 'maumau' ? ['H7', 'LU', 'S9'] : de ? ['HA', 'LK', 'EO'] : ['AS', 'KH', 'TD'];
    const dir = de ? 'de' : 'fr';
    return '<rect width="100" height="100" rx="12" fill="#1d5a3f"/>' + cards.map((c, i) =>
      `<g transform="translate(${30 + i * 20} ${56}) rotate(${(i - 1) * 14})"><image href="assets/cards/${dir}/${c}.webp" x="-17" y="-27" width="34" height="${de ? 54 : 49}"/></g>`).join('');
  }
};
