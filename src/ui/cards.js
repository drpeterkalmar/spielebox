// Spielkarten als SVG-Gruppen (Maße in Brett-Einheiten, Ursprung = Kartenmitte).
// Doppeldeutsch (Schnapsen): Fotos (Zákupák, Public Domain) wenn vorhanden, sonst eigene klare Karten mit
// Farbsymbol (Herz, Schellen, Laub, Eichel) und großem Wertzeichen. Französisch (Blackjack): Byron Knoll (PD)
// bzw. eigene Karten. Rücken: eigenes Muster.
import { s } from './svg.js';

export const CARD_W = 180, CARD_H = 290;
// Fotos/Grafiken werden erst benutzt, wenn sie im Repo liegen (Liste von tools/cards → assets/cards/*.json)
export const ASSETS = { de: true, fr: true };
const FR_RATIO = 697 / 480;   // Seitenverhältnis der Byron-Knoll-Karten

// Handy-Bildschirme (≥ 2 dppx): doppelt aufgelöste Karten
const hiDpi = () => typeof devicePixelRatio === 'number' && devicePixelRatio >= 1.5;

export function frHeight(w = CARD_W) {
  return w * (ASSETS.fr ? FR_RATIO : CARD_H / CARD_W);
}

const DE_RANK = { A: 'A', Z: 'X', K: 'K', O: 'O', U: 'U' };
const DE_RANK_NAME = { A: 'Daus', Z: 'Zehner', K: 'König', O: 'Ober', U: 'Unter' };
const DE_COLOR = { H: '#c8242b', S: '#d98a12', L: '#2f7d32', E: '#7a4a1c' };

// Farbsymbole (Maßstab: 1 = etwa 60 Einheiten)
function deSymbol(suit, size) {
  const k = size / 60;
  const g = s('g', { transform: `scale(${k})` });
  const c = DE_COLOR[suit];
  if (suit === 'H') {
    g.append(s('path', { d: 'M0 22 C-34 -2 -30 -30 -12 -30 C-4 -30 0 -22 0 -18 C0 -22 4 -30 12 -30 C30 -30 34 -2 0 22 Z', fill: c, stroke: '#7a1015', 'stroke-width': 2 }));
  } else if (suit === 'S') {
    // Schelle: goldene Kugel mit Schlitz und Band
    g.append(s('circle', { r: 24, fill: '#f0b43a', stroke: '#8a5a08', 'stroke-width': 2.5 }),
      s('path', { d: 'M-24 -2 H24', stroke: '#8a5a08', 'stroke-width': 5 }),
      s('circle', { cy: 10, r: 5, fill: '#5a3a06' }),
      s('path', { d: 'M0 10 V22', stroke: '#5a3a06', 'stroke-width': 3 }),
      s('circle', { cx: -8, cy: -12, r: 5, fill: '#fff3c4', opacity: 0.8 }));
  } else if (suit === 'L') {
    // Laubblatt mit Stiel und Adern
    g.append(s('path', { d: 'M0 -30 C22 -18 26 8 0 26 C-26 8 -22 -18 0 -30 Z', fill: c, stroke: '#1d4d1f', 'stroke-width': 2 }),
      s('path', { d: 'M0 -24 V32 M0 -6 L12 -14 M0 4 L14 -4 M0 -6 L-12 -14 M0 4 L-14 -4', stroke: '#bfe3a8', 'stroke-width': 2, fill: 'none' }));
  } else {
    // Eichel: Nuss mit Hütchen
    g.append(s('ellipse', { cy: 8, rx: 15, ry: 20, fill: '#c98a3c', stroke: '#6a3f12', 'stroke-width': 2 }),
      s('path', { d: 'M-19 -4 C-19 -24 19 -24 19 -4 Z', fill: '#6b4a20', stroke: '#3d2808', 'stroke-width': 2 }),
      s('path', { d: 'M-12 -12 H12 M-15 -6 H15', stroke: '#a8834c', 'stroke-width': 2 }),
      s('path', { d: 'M0 -20 V-30', stroke: '#3d2808', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  }
  return g;
}

function frame(g, w, h, fill = '#fbf6ea') {
  g.append(
    s('rect', { x: -w / 2 + 3, y: -h / 2 + 6, width: w, height: h, rx: w * 0.08, fill: 'rgba(0,0,0,.28)' }),
    s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.08, fill, stroke: '#9c8a6a', 'stroke-width': 2 }));
}

// Doppeldeutsche Karte, z. B. 'HA', 'SZ', 'EU'
export function deCard(card, w = CARD_W) {
  const h = w * (CARD_H / CARD_W);
  const g = s('g', { class: 'card', 'data-card': card });
  if (ASSETS.de) {
    g.append(s('rect', { x: -w / 2 + 3, y: -h / 2 + 6, width: w, height: h, rx: w * 0.07, fill: 'rgba(0,0,0,.28)' }));
    g.append(s('image', { href: `assets/cards/de/${card}${hiDpi() ? '@2x' : ''}.webp`, x: -w / 2, y: -h / 2, width: w, height: h, preserveAspectRatio: 'none' }));
    return g;
  }
  const suit = card[0], rank = card[1];
  const col = DE_COLOR[suit];
  frame(g, w, h);
  g.append(s('rect', { x: -w / 2 + w * 0.06, y: -h / 2 + w * 0.06, width: w * 0.88, height: h - w * 0.12, rx: w * 0.05, fill: 'none', stroke: col, 'stroke-width': 2, opacity: 0.5 }));
  // Ecken: großes Wertzeichen + kleines Symbol (lesbar auch überlappend in der Hand)
  const corner = (flip) => {
    const c = s('g', { transform: flip ? 'rotate(180)' : '' });
    c.append(s('text', { x: -w / 2 + w * 0.2, y: -h / 2 + w * 0.36, class: 'card-rank', fill: col, 'font-size': w * 0.3, text: DE_RANK[rank] }));
    const sym = deSymbol(suit, w * 0.2);
    sym.setAttribute('transform', `translate(${-w / 2 + w * 0.2} ${-h / 2 + w * 0.56}) ${sym.getAttribute('transform')}`);
    c.append(sym);
    return c;
  };
  g.append(corner(false), corner(true));
  // Mitte: Symbol(e) und Name
  const mid = s('g');
  if (rank === 'Z') {
    for (const [x, y] of [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.06], [0.18, 0.06]]) {
      const sy = deSymbol(suit, w * 0.24);
      sy.setAttribute('transform', `translate(${x * w} ${y * h}) ${sy.getAttribute('transform')}`);
      mid.append(sy);
    }
  } else if (rank === 'A') {
    const sy = deSymbol(suit, w * 0.56);
    sy.setAttribute('transform', `translate(0 ${-0.06 * h}) ${sy.getAttribute('transform')}`);
    mid.append(sy);
  } else {
    // Figur: Symbol oben (Ober/König) bzw. unten (Unter) und Monogramm
    const sy = deSymbol(suit, w * 0.28);
    sy.setAttribute('transform', `translate(0 ${(rank === 'U' ? 0.12 : -0.2) * h}) ${sy.getAttribute('transform')}`);
    mid.append(sy);
    mid.append(s('text', { x: 0, y: (rank === 'U' ? -0.06 : 0.1) * h, class: 'card-fig', fill: col, 'font-size': w * 0.36, text: rank === 'K' ? '♔' : DE_RANK[rank] }));
  }
  mid.append(s('text', { x: 0, y: 0.34 * h, class: 'card-name', 'font-size': w * 0.12, text: DE_RANK_NAME[rank] }));
  g.append(mid);
  return g;
}

const FR_SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const FR_RED = { H: true, D: true };
const FR_RANK = { A: 'A', T: '10', J: 'B', Q: 'D', K: 'K' };

// Französische Karte, z. B. 'AS', 'TH', 'QD'
export function frCard(card, w = CARD_W) {
  const h = w * (ASSETS.fr ? FR_RATIO : CARD_H / CARD_W);
  const g = s('g', { class: 'card', 'data-card': card });
  if (ASSETS.fr) {
    g.append(s('rect', { x: -w / 2 + 3, y: -h / 2 + 6, width: w, height: h, rx: w * 0.06, fill: 'rgba(0,0,0,.28)' }));
    g.append(s('image', { href: `assets/cards/fr/${card}${hiDpi() ? '@2x' : ''}.webp`, x: -w / 2, y: -h / 2, width: w, height: h, preserveAspectRatio: 'none' }));
    return g;
  }
  frame(g, w, h, '#fff');
  const r = card[0], su = card[1];
  const col = FR_RED[su] ? '#c8242b' : '#1b1b1b';
  const label = FR_RANK[r] || r;
  const corner = (flip) => {
    const c = s('g', { transform: flip ? 'rotate(180)' : '' });
    c.append(s('text', { x: -w / 2 + w * 0.2, y: -h / 2 + w * 0.34, class: 'card-rank', fill: col, 'font-size': w * (label.length > 1 ? 0.25 : 0.3), text: label }));
    c.append(s('text', { x: -w / 2 + w * 0.2, y: -h / 2 + w * 0.62, class: 'card-rank', fill: col, 'font-size': w * 0.26, text: FR_SUIT[su] }));
    return c;
  };
  g.append(corner(false), corner(true));
  g.append(s('text', { x: 0, y: h * 0.12, class: 'card-fig', fill: col, 'font-size': w * (r === 'A' ? 0.7 : 0.5), text: 'JQK'.includes(r) ? label : FR_SUIT[su] }));
  if ('JQK'.includes(r)) g.append(s('text', { x: 0, y: h * 0.33, class: 'card-rank', fill: col, 'font-size': w * 0.26, text: FR_SUIT[su] }));
  return g;
}

// Kartenrücken (eigenes Muster)
export function backCard(w = CARD_W, h = w * (CARD_H / CARD_W)) {
  const g = s('g', { class: 'card back' });
  frame(g, w, h, '#fbf6ea');
  g.append(s('rect', { x: -w / 2 + w * 0.07, y: -h / 2 + w * 0.07, width: w * 0.86, height: h - w * 0.14, rx: w * 0.05, fill: 'url(#sb-card-back)', stroke: '#6d1a1a', 'stroke-width': 2 }));
  g.append(s('circle', { r: w * 0.16, fill: '#f3e3c0', stroke: '#6d1a1a', 'stroke-width': 3 }));
  g.append(s('text', { y: w * 0.07, class: 'card-rank', fill: '#8e2424', 'font-size': w * 0.2, text: 'S' }));
  return g;
}

// Muster für den Rücken einmal ins Dokument
export function ensureCardDefs() {
  const defs = document.querySelector('#sb-defs defs');
  if (!defs || document.getElementById('sb-card-back')) return;
  const p = s('pattern', { id: 'sb-card-back', patternUnits: 'userSpaceOnUse', width: 24, height: 24, patternTransform: 'rotate(45)' },
    s('rect', { width: 24, height: 24, fill: '#a3282a' }),
    s('path', { d: 'M0 12 H24 M12 0 V24', stroke: '#c9544c', 'stroke-width': 3 }),
    s('circle', { cx: 12, cy: 12, r: 3.4, fill: '#f0cf8a' }));
  defs.append(p);
}
