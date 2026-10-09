// Spielkarten als SVG-Gruppen (Maße in Brett-Einheiten, Ursprung = Kartenmitte).
// Doppeldeutsch (Schnapsen): Fotos (Zákupák, Public Domain) wenn vorhanden, sonst eigene klare Karten mit
// Farbsymbol (Herz, Schellen, Laub, Eichel) und großem Wertzeichen. Französisch (Blackjack): Byron Knoll (PD)
// bzw. eigene Karten. Rücken: eigenes Muster.
import { s } from './svg.js';
import { DEKO } from './deko.js';
import { useAtlas, atlasCell, svgSprite, singleUrl, hiDpi } from './cardsprite.js';

export const CARD_W = 180, CARD_H = 290;
// Fotos/Grafiken werden erst benutzt, wenn sie im Repo liegen (Liste von tools/cards → assets/cards/*.json)
export const ASSETS = { de: true, fr: true };
const FR_RATIO = 697 / 480;   // Seitenverhältnis der Byron-Knoll-Karten


// Kartenbild (Mitte = 0,0): aus dem Atlas (n9: wenige große Bilder statt einer Datei je Karte) als <svg> mit viewBox
// auf den Ausschnitt, sonst (?atlas=0, unbekannte Karte) die Einzeldatei wie bisher. Gleiche Lage und Größe.
function face(deck, card, w, h) {
  const hi = hiDpi();
  const c = useAtlas() ? atlasCell(deck, card, hi) : null;
  if (!c) return s('image', { href: singleUrl(deck, card, hi), x: -w / 2, y: -h / 2, width: w, height: h, preserveAspectRatio: 'none' });
  const sp = svgSprite(c, -w / 2, -h / 2, w, h);
  return s('svg', sp.outer, s('image', sp.inner));
}

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
    if (DEKO.on) softShadow(g, w, h, w * 0.07);
    else g.append(s('rect', { x: -w / 2 + 3, y: -h / 2 + 6, width: w, height: h, rx: w * 0.07, fill: 'rgba(0,0,0,.28)' }));
    g.append(face('de', card, w, h));
    if (DEKO.on) gloss(g, w, h, w * 0.07);
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
    if (DEKO.on) softShadow(g, w, h, w * 0.06);
    else g.append(s('rect', { x: -w / 2 + 3, y: -h / 2 + 6, width: w, height: h, rx: w * 0.06, fill: 'rgba(0,0,0,.28)' }));
    g.append(face('fr', card, w, h));
    if (DEKO.on) gloss(g, w, h, w * 0.06);
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

// Deko: weicher zweistufiger Schatten (statt einer harten Kante) und feiner Glanz wie bei laminierten Karten
function softShadow(g, w, h, rx) {
  g.append(s('rect', { x: -w / 2 + 4, y: -h / 2 + 9, width: w + 2, height: h + 1, rx: rx + 2, fill: 'rgba(0,0,0,.13)' }),
    s('rect', { x: -w / 2 + 1.5, y: -h / 2 + 4, width: w, height: h, rx, fill: 'rgba(0,0,0,.22)' }));
}
function gloss(g, w, h, rx) {
  g.append(s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx, fill: 'url(#dk-cardgloss)', class: 'dk-gloss' }));
}

// Deko-Kartenrücken: einmal je Seitenverhältnis als Bild vorgezeichnet (Canvas → Blob-URL) – billig zu rastern.
// Weinrot mit feinem Rautenmuster, doppelter Goldrahmen, Eckzier, Medaillon mit „S“.
const backArt = {};
const THEMES = {
  red: { hi: '#b3313b', mid: '#8c1d29', lo: '#5e0f19', ink: '#7a1622' },
  blue: { hi: '#3f8fb8', mid: '#2a6a8f', lo: '#173f5a', ink: '#1d4f6b' }
};
const waiting = new Map();   // Schlüssel → <image>-Elemente, die auf das Bild warten
export function backImage(ratio, theme = 'red') {
  const key = ratio.toFixed(2) + theme;
  const T = THEMES[theme];
  if (backArt[key] !== undefined) return backArt[key];
  backArt[key] = null;
  try {
    const W = 300, H = Math.round(W * ratio), c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const rr = (a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
    // Karton (cremeweißer Rand)
    rr(0, 0, W, H, W * 0.07); x.fillStyle = '#f7f0df'; x.fill();
    x.strokeStyle = '#a8916b'; x.lineWidth = 3; x.stroke();
    // Mittelfeld: Weinrot mit Licht von links oben
    const m = W * 0.075;
    rr(m, m, W - 2 * m, H - 2 * m, W * 0.045);
    const bg = x.createRadialGradient(W * 0.35, H * 0.3, 10, W * 0.5, H * 0.5, H * 0.75);
    bg.addColorStop(0, T.hi); bg.addColorStop(0.55, T.mid); bg.addColorStop(1, T.lo);
    x.fillStyle = bg; x.fill();
    x.save(); x.clip();
    // feines Rautenmuster (Guilloche-artig)
    x.strokeStyle = 'rgba(255,214,150,.18)'; x.lineWidth = 1.4;
    for (let k = -H; k < W + H; k += 14) {
      x.beginPath(); x.moveTo(k, 0); x.lineTo(k + H, H); x.stroke();
      x.beginPath(); x.moveTo(k, H); x.lineTo(k + H, 0); x.stroke();
    }
    x.fillStyle = 'rgba(255,220,160,.22)';
    for (let yy = m + 7; yy < H; yy += 14) for (let xx = m + ((yy / 14) % 2 ? 7 : 0); xx < W; xx += 14) { x.beginPath(); x.arc(xx, yy, 1.6, 0, 7); x.fill(); }
    x.restore();
    // doppelter Goldrahmen
    const gold = x.createLinearGradient(0, 0, W, H);
    gold.addColorStop(0, '#fff0b8'); gold.addColorStop(0.45, '#d9a63e'); gold.addColorStop(1, '#8a5d17');
    x.strokeStyle = gold; x.lineWidth = 3.2; rr(m + 7, m + 7, W - 2 * m - 14, H - 2 * m - 14, W * 0.035); x.stroke();
    x.lineWidth = 1.2; rr(m + 13, m + 13, W - 2 * m - 26, H - 2 * m - 26, W * 0.03); x.stroke();
    // Eckzier: kleine Goldbögen
    x.lineWidth = 2.2;
    for (const [cx, cy, a] of [[m + 13, m + 13, 0], [W - m - 13, m + 13, Math.PI / 2], [W - m - 13, H - m - 13, Math.PI], [m + 13, H - m - 13, -Math.PI / 2]]) {
      x.beginPath(); x.arc(cx, cy, 16, a, a + Math.PI / 2); x.stroke();
      x.beginPath(); x.arc(cx, cy, 9, a, a + Math.PI / 2); x.stroke();
    }
    // Medaillon: Strahlenkranz, Goldring, cremefarbene Mitte mit „S“
    const cx = W / 2, cy = H / 2, R = W * 0.2;
    x.save(); x.translate(cx, cy);
    x.fillStyle = 'rgba(255,214,140,.5)';
    for (let k = 0; k < 16; k++) { x.rotate(Math.PI / 8); x.beginPath(); x.moveTo(-4, R * 0.9); x.lineTo(0, R * 1.45); x.lineTo(4, R * 0.9); x.fill(); }
    x.restore();
    x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = gold; x.fill();
    const inner = x.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 2, cx, cy, R);
    inner.addColorStop(0, '#fffaf0'); inner.addColorStop(1, '#ead9b4');
    x.beginPath(); x.arc(cx, cy, R * 0.8, 0, 7); x.fillStyle = inner; x.fill();
    x.fillStyle = T.ink;
    if (theme === 'blue') {
      // Pfote (Tierbilder-Spiel): Ballen + 4 Zehen
      x.beginPath(); x.ellipse(cx, cy + R * 0.2, R * 0.3, R * 0.24, 0, 0, 7); x.fill();
      for (const [dx, dy, rr] of [[-0.34, -0.12, 0.13], [-0.12, -0.32, 0.14], [0.12, -0.32, 0.14], [0.34, -0.12, 0.13]]) { x.beginPath(); x.ellipse(cx + dx * R, cy + dy * R, rr * R, rr * R * 1.15, dx * 0.6, 0, 7); x.fill(); }
    } else {
      x.font = `italic 700 ${Math.round(R * 1.15)}px Georgia, 'Times New Roman', serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('S', cx, cy + R * 0.06);
    }
    // Lack-Glanz schräg
    rr(0, 0, W, H, W * 0.07);
    const sh = x.createLinearGradient(0, 0, W, H);
    sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.08)');
    x.fillStyle = sh; x.fill();
    c.toBlob((b) => {
      if (!b) return;
      const url = backArt[key] = URL.createObjectURL(b);
      for (const img of waiting.get(key) || []) img.setAttribute('href', url);
      waiting.delete(key);
    }, 'image/png');
  } catch { backArt[key] = false; }
  return null;
}
// Rücken als Füllmuster (Muster in #sb-defs, Bild füllt jede Form ganz aus) – so steckt im Brett kein <image>
// für verdeckte Karten; ist das Bild noch nicht fertig, wird es im Muster nachgetragen
export function backFill(ratio, theme = 'red') {
  const url = backImage(ratio, theme);
  if (url === false) return null;
  const key = ratio.toFixed(2) + theme, id = 'dk-back-' + key.replace('.', '-');
  if (!document.getElementById(id)) {
    const defs = document.querySelector('#sb-defs defs');
    if (!defs) return null;
    const img = s('image', { x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none', ...(url ? { href: url } : {}) });
    defs.append(s('pattern', { id, patternContentUnits: 'objectBoundingBox', width: 1, height: 1 }, img));
    if (!url) {
      if (!waiting.has(key)) waiting.set(key, new Set());
      waiting.get(key).add(img);
    }
  }
  return `url(#${id})`;
}
// früh vorzeichnen (in der Lobby), damit der erste Kartentisch gleich die neuen Rücken hat
export function prepareCardArt() {
  if (!DEKO.on) return;
  backImage(CARD_H / CARD_W);
  backImage(FR_RATIO);
  backImage(1, 'blue');
}

// Kartenrücken (eigenes Muster)
export function backCard(w = CARD_W, h = w * (CARD_H / CARD_W)) {
  const g = s('g', { class: 'card back' });
  const fill = DEKO.on ? backFill(h / w, 'red') : null;
  if (fill) {
    softShadow(g, w, h, w * 0.07);
    g.append(s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.07, fill }));
    return g;
  }
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
