// Symbole je Sitz (Spielerleiste, Zugliste), von mehreren Spielen genutzt (src/games/<id>/ui.js).
import { h } from './dom.js';
import { SEAT_COLORS, SEAT_SYMBOLS } from './seatcolors.js';

export const NS = 'http://www.w3.org/2000/svg';

export function stoneIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="8.5" fill="url(#sb-st-${seat === 0 ? 'w' : 'b'})" stroke="${seat === 0 ? '#7a6548' : '#000'}" stroke-width="1"/>`;
  return svg;
}

export function kingIcon(seat) {
  const img = h('img', { class: 'stone-ico', src: `assets/pieces/${seat === 0 ? 'w' : 'b'}K.svg`, alt: '' });
  return img;
}

export function seatIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="9" fill="${SEAT_COLORS[seat % 6]}" stroke="rgba(0,0,0,.5)"/><text x="10" y="14.2" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">${seat + 1}</text>`;
  return svg;
}

export function cardIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = '<rect x="4" y="1.5" width="12" height="17" rx="2" fill="#a3282a" stroke="#f3e3c0" stroke-width="1.5"/>';
  return svg;
}

// Halma/Ludo: Sitzfarbe mit Symbol
export function halmaIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="9" fill="${SEAT_COLORS[seat % 6]}" stroke="rgba(0,0,0,.5)"/><text x="10" y="14" text-anchor="middle" font-size="11" fill="#fff">${SEAT_SYMBOLS[seat % 6]}</text>`;
  return svg;
}
