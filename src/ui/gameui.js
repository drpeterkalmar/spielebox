// Spielspezifische Teile der Tisch-Ansicht: Brett, Symbol je Sitz, Unterzeile der Spielerleiste, Regeln,
// Brett drehen, Zusatz-Einträge im Menü. So bleibt tablescreen.js für alle Spiele gleich.
import { h } from './dom.js';
import { gameOf } from '../games/registry.js';
import { createBoard as muehleBoard } from '../games/muehle/view.js';
import { createBoard as dameBoard } from '../games/dame/view.js';
import { createBoard as schachBoard } from '../games/schach/view.js';
import { material, inCheck, pgn } from '../games/schach/engine.js';
import { rulesMuehle, rulesDame, rulesSchach, rulesSchnapsen } from './texts.js';
import { createBoard as schnapsenBoard } from '../games/schnapsen/view.js';
import * as SN from '../games/schnapsen/engine.js';

// Farben je Sitz (auch farbenblind unterscheidbar: zusätzlich Symbol/Buchstabe)
export const SEAT_COLORS = ['#d8453b', '#2f6fd6', '#2e9e57', '#e0b12c', '#8a4fc9', '#e07b27'];
export const SEAT_SYMBOLS = ['●', '▲', '■', '◆', '★', '✚'];

const NS = 'http://www.w3.org/2000/svg';

function stoneIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="8.5" fill="url(#sb-st-${seat === 0 ? 'w' : 'b'})" stroke="${seat === 0 ? '#7a6548' : '#000'}" stroke-width="1"/>`;
  return svg;
}

function kingIcon(seat) {
  const img = h('img', { class: 'stone-ico', src: `assets/pieces/${seat === 0 ? 'w' : 'b'}K.svg`, alt: '' });
  return img;
}

function seatIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="9" fill="${SEAT_COLORS[seat % 6]}" stroke="rgba(0,0,0,.5)"/><text x="10" y="14.2" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">${seat + 1}</text>`;
  return svg;
}

function cardIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = '<rect x="4" y="1.5" width="12" height="17" rx="2" fill="#a3282a" stroke="#f3e3c0" stroke-width="1.5"/>';
  return svg;
}

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

const UI = {
  muehle: {
    board: muehleBoard,
    icon: stoneIcon,
    rules: rulesMuehle,
    sub(t, seat) {
      const e = gameOf('muehle').engine;
      const c = e.countStones(t.gs);
      return c.hand[seat] ? `${c.hand[seat]} in der Hand · ${c.board[seat]} auf dem Brett` : `${c.board[seat]} Steine${e.phase(t.gs, seat) === 'springen' ? ' · springt' : ''}`;
    }
  },
  dame: {
    board: dameBoard,
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
    }
  },
  schach: {
    board: schachBoard,
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
    }
  }
};

UI.schnapsen = {
  board: schnapsenBoard,
  icon: () => cardIcon(),
  rules: rulesSchnapsen,
  hidden: true,
  sub(t, seat, viewer) {
    const gs = t.gs;
    const parts = [`${gs.points[seat]} Pkt · ${gs.bummerl[seat]} Bummerl`];
    if (gs.phase === 'play') {
      const a = SN.cardPoints(gs, seat);
      if (seat === viewer && a !== null) {
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
  }
};

export function gameUi(id) {
  return UI[id];
}
