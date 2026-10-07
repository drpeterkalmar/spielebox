// Schnapsen: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import { cardImgAttrs, hiDpi } from '../../ui/cardsprite.js';
import * as SN from './engine.js';
import { cardIcon } from '../../ui/gameicons.js';
import { rulesSchnapsen } from '../../ui/texts.js';

function bummerlTafel(t) {
  const gs = t.gs;
  const names = t.seats.map((x, i) => (x ? x.name : `Spieler ${i + 1}`));
  const rows = [];
  let cur = null, pts = [0, 0];
  for (const g of gs.games || []) {
    if (g.bummerl !== cur) { cur = g.bummerl; pts = [0, 0]; rows.push(h('tr', { class: 'bt-head' }, h('td', { colspan: 3, text: `Bummerl ${cur}` }))); }
    pts[g.winner] += g.points;
    rows.push(h('tr', {}, h('td', { text: `${g.spiel}. Spiel: ${names[g.winner]} +${g.points}` }), h('td', { class: 'bt-num', text: String(pts[0]) }), h('td', { class: 'bt-num', text: String(pts[1]) })));
  }
  return h('div', { class: 'rules' },
    h('p', {}, h('strong', { text: `Bummerl: ${names[0]} ${gs.bummerl[0]} · ${names[1]} ${gs.bummerl[1]}` }), ` (Partie auf ${gs.opts.bummerl})`),
    h('p', { text: `Laufendes Bummerl: ${gs.points[0]} : ${gs.points[1]} Punkte (7 gewinnt)` }),
    rows.length ? h('table', { class: 'bummerl' }, h('tr', {}, h('th', { text: 'Spiel' }), h('th', { text: names[0] }), h('th', { text: names[1] })), ...rows) : h('p', { class: 'muted', text: 'Noch kein Spiel fertig.' }));
}

export const ui = {
  icon: () => cardIcon(),
  rules: rulesSchnapsen,
  hidden: true,
  sub(t, seat, viewer) {
    const gs = t.gs;
    const parts = [`${gs.points[seat]} Pkt · ${gs.bummerl[seat]} Bummerl`];
    if (gs.phase === 'play') {
      const a = SN.cardPoints(gs, seat);
      // eigene Augen nur mit „Augen-Hilfe“ (sonst zählt man selbst mit, wie am Wirtshaustisch)
      if (seat === viewer && a !== null && gs.opts && gs.opts.augenHilfe) {
        const pend = SN.pendingPoints(gs, seat);
        parts.push(`${a} Augen${pend ? ` (+${pend} schwebend)` : ''}`);
      } else parts.push(gs.tricks[seat] ? `${gs.tricks[seat]} ${gs.tricks[seat] === 1 ? 'Stich' : 'Stiche'}` : 'stichlos');
    }
    return parts.join(' · ');
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'spielende') return 'Spiel vorbei – weiter zum nächsten Spiel';
    if (gs.openAnsage) return `Angesagt – König oder Ober ausspielen`;
    return null;
  },
  // Knöpfe je nach erlaubten Zügen
  actions(t, legal, submit) {
    const gs = t.gs;
    const out = [];
    for (const m of legal) {
      if (m.type === 'ansagen') out.push([`${m.suit === gs.atout ? 40 : 20} ansagen (${SN.SUIT_NAMES[m.suit]})`, 'ansagen-' + m.suit, m]);
      if (m.type === 'tauschen') out.push(['Atout-Unter tauschen', 'tauschen', m]);
      if (m.type === 'zudrehen') out.push(['Zudrehen', 'zudrehen', m]);
      if (m.type === 'ausmelden' && SN.canDeclare(gs)) out.push(['Ausmelden (66)', 'ausmelden', m, true]);
      if (m.type === 'weiter') out.push(['Nächstes Spiel', 'weiter', m, true]);
    }
    return out.map(([label, act, m, primary]) => h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: () => submit(m) } }, label));
  },
  menu(t, { item, sheet }) {
    return [item('Bummerl-Tafel', () => sheet('Bummerl-Tafel', bummerlTafel(t)), 'tafel')];
  },
  // Stich-Blatt: own = SN.ownTricks(Sicht, Sitz) – enthält nur die eigenen gewonnenen Karten
  // (Bilder wie auf dem Tisch: am Handy @2x aus dem Atlas, der ist offline vorgeladen)
  stichBlatt(own, { seat, augenHilfe, opp }) {
    const card = (c, lead) => h('span', { class: 'sb-card' + (lead ? ' lead' : '') },
      h('img', { ...cardImgAttrs('de', c, hiDpi()), alt: SN.cardName(c), title: SN.cardName(c), width: 60, height: 96, data: { card: c } }),
      lead ? h('span', { class: 'sb-lead', text: 'ausgespielt' }) : null);
    const rows = own.tricks.map((tr) => h('li', { class: 'sb-trick', data: { trick: String(tr.nr) } },
      h('span', { class: 'sb-nr', text: `${tr.nr}.` }),
      h('span', { class: 'sb-cards' }, card(tr.cards[0], true), card(tr.cards[1], false)),
      h('span', { class: 'sb-who' },
        tr.lead === null ? '' : tr.lead === seat ? 'Du hast ausgespielt' : `${opp} hat ausgespielt`,
        augenHilfe ? h('span', { class: 'sb-augen', text: `${tr.augen} Augen` }) : null)));
    const ans = own.ansagen.map((a) => `${a.points} (${SN.SUIT_NAMES[a.suit]})`);
    return h('div', { class: 'stichblatt' },
      own.tricks.length ? h('ol', { class: 'sb-list' }, ...rows) : h('p', { class: 'muted', text: 'Noch kein Stich gewonnen.' }),
      h('p', { class: 'sb-ansagen' }, h('strong', { text: 'Deine Ansagen: ' }), ans.length ? ans.join(', ') : 'keine'),
      augenHilfe
        ? h('p', { class: 'sb-sum' }, h('strong', { text: `Summe: ${own.total} Augen` }),
          own.pending ? ` (+${own.pending} schwebend, zählen ab deinem ersten Stich)` : own.ansagen.length ? ` (Stiche ${own.augen} + Ansagen ${own.total - own.augen})` : '', own.total >= 66 ? ' – du kannst dich ausmelden!' : '')
        : h('p', { class: 'muted small', text: 'Zähl selbst mit – wer 66 Augen hat, meldet sich aus. (Die Summe zeigt die „Augen-Hilfe“ in den Schnapsen-Optionen.)' }),
      h('p', { class: 'muted small', text: 'Nur deine eigenen Stiche. Die Stiche des Gegners bleiben verdeckt.' }));
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    const game = 'schnapsen';
    const de = game !== 'blackjack';
    const cards = game === 'maumau' ? ['H7', 'LU', 'S9'] : de ? ['HA', 'LK', 'EO'] : ['AS', 'KH', 'TD'];
    const dir = de ? 'de' : 'fr';
    return '<rect width="100" height="100" rx="12" fill="#1d5a3f"/>' + cards.map((c, i) =>
      `<g transform="translate(${30 + i * 20} ${56}) rotate(${(i - 1) * 14})"><image href="assets/cards/${dir}/${c}.webp" x="-17" y="-27" width="34" height="${de ? 54 : 49}"/></g>`).join('');
  }
};
