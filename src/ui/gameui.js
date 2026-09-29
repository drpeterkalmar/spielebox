// Spielspezifische Teile der Tisch-Ansicht: Brett, Symbol je Sitz, Unterzeile der Spielerleiste, Regeln,
// Brett drehen, Zusatz-Einträge im Menü. So bleibt tablescreen.js für alle Spiele gleich.
import { h } from './dom.js';
import { gameOf } from '../games/registry.js';
import { createBoard as muehleBoard } from '../games/muehle/view.js';
import { createBoard as dameBoard } from '../games/dame/view.js';
import { createBoard as schachBoard } from '../games/schach/view.js';
import { material, inCheck, pgn } from '../games/schach/engine.js';
import { rulesMuehle, rulesDame, rulesSchach } from './texts.js';

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

export function gameUi(id) {
  return UI[id];
}
