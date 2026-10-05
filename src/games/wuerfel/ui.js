// Würfelglück: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as WG from './engine.js';
import { RULES as WUERFEL_RULES } from './rules.js';
import { seatIcon } from '../../ui/gameicons.js';
import { rulesFromData } from '../../ui/texts.js';

// ganzer Spielblock aller Spieler (Menü)
function wgBlock(t) {
  const gs = t.gs;
  const names = t.seats.map((x, i) => (x ? x.name : `Spieler ${i + 1}`));
  const row = (label, vals, cls = '') => h('tr', { class: cls }, h('td', { text: label }), ...vals.map((v) => h('td', { class: 'bt-num', text: v === null || v === undefined ? '' : String(v) })));
  const tot = gs.sheets.map(WG.totals);
  return h('div', { class: 'rules' }, h('table', { class: 'bummerl wg-block' },
    h('tr', {}, h('th', { text: '' }), ...names.map((n) => h('th', { class: 'bt-num', text: n }))),
    ...WG.CATS.filter((c) => c.section === 'oben').map((c) => row(c.name, gs.sheets.map((sh) => sh[c.key]))),
    row('Bonus', tot.map((x) => x.bonus || `${x.oben}/63`), 'bt-head'),
    ...WG.CATS.filter((c) => c.section === 'unten').map((c) => row(c.name, gs.sheets.map((sh) => sh[c.key]))),
    tot.some((x) => x.extra) ? row('Extra', tot.map((x) => x.extra)) : null,
    row('Summe', tot.map((x) => x.gesamt), 'bt-head')));
}

export const ui = {
  icon: (seat) => seatIcon(seat),
  rules: (o) => rulesFromData(WUERFEL_RULES, o),
  sub(t, seat) {
    const sh = t.gs.sheets[seat];
    if (!sh) return '';
    const filled = WG.CAT_KEYS.filter((k) => sh[k] !== null).length;
    return `${WG.totals(sh).gesamt} Punkte · ${filled}/13 Felder`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.turn !== seat) return null;
    if (gs.phase === 'roll') return `Runde ${gs.round}: würfeln`;
    if (gs.phase === 'choose') return gs.rolls < 3 ? `Wurf ${gs.rolls} von 3 – halten oder eintragen` : 'Letzter Wurf – eintragen';
    return null;
  },
  menu(t, { item, sheet }) {
    return [item('Spielblock (alle Spieler)', () => sheet('Spielblock', wgBlock(t)), 'block')];
  },
  actions(t, legal, submit, view) {
    if (!view) return [];
    const gs = t.gs;
    const b = (label, act, fn, primary, disabled) => Object.assign(h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: fn } }, label), { disabled: !!disabled });
    const out = [];
    const sel = view.selected();
    if (gs.phase === 'roll') out.push(b('Würfeln', 'roll', () => view.roll(), true));
    else if (gs.phase === 'choose') {
      if (gs.rolls < 3) out.push(b(`Würfeln (noch ${3 - gs.rolls})`, 'roll', () => view.roll(), !sel, view.allHeld()));
      if (sel) {
        const pts = WG.scoreFor(gs.dice, sel, gs.sheets[gs.turn], gs.opts);
        out.push(b(`Eintragen: ${WG.CAT_NAME[sel]} ${pts ? '+' + pts : '(0)'}`, 'score', () => view.scoreSelected(), true));
      }
    }
    return out;
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    const die = (x, y, r, v) => { const o = 7; const P = { 1: [[0, 0]], 3: [[-o, -o], [0, 0], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] }[v];
      return `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fffdf6" stroke="#3a2515" stroke-width="1.5"/>${P.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="2.6" fill="#1f140c"/>`).join('')}</g>`; };
    return '<rect width="100" height="100" rx="12" fill="#1d5a3f"/>' + die(26, 30, -12, 5) + die(66, 26, 10, 5) + die(30, 70, 8, 5) + die(70, 68, -6, 6) + die(50, 48, 3, 5);
  }
};
