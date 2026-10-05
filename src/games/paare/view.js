// Paare finden als SVG: verdeckte Karten im Raster (4 × 4, 4 × 6 oder 6 × 6), Tierbilder als Emoji auf heller Karte.
// Ein Tipp dreht eine Karte um (sie kippt sichtbar). Gefundene Paare bleiben blass liegen, mit der Farbe dessen,
// der sie gefunden hat; ein falsches Paar ist rot umrandet und bleibt offen, bis der Nächste dreht.
import { MOTIFS, MOTIF_NAMES, SIZES } from './engine.js';
import { s, ensureDefs, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { backFill } from '../../ui/cards.js';
import { OWN } from '../../tempo.js';
import { SEAT_COLORS } from '../../ui/seatcolors.js';
import { DEKO, boardLayers } from '../../ui/deko.js';
import { woodFrame, inset } from '../../ui/material.js';
import * as FXS from '../../ui/fxsvg.js';

const SIZE = 1000, M = 24;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-paare', role: 'img', 'aria-label': 'Paare finden' });
  const gBack = s('g'), gCards = s('g', { class: 'pieces' });
  const gFx = s('g', { class: 'fx' });
  svg.append(gBack, gCards, gFx);
  host.appendChild(svg);
  const L = boardLayers(svg, host);
  if (L) { const b = L.under.appendChild(s('g')); woodFrame(b, 0, 0, SIZE, SIZE, 26); inset(b, 14, 14, SIZE - 28, SIZE - 28, 18, 'url(#sb-wood-light)'); }
  else gBack.append(s('rect', { width: SIZE, height: SIZE, rx: 26, fill: 'url(#sb-wood-frame)' }), s('rect', { x: 14, y: 14, width: SIZE - 28, height: SIZE - 28, rx: 18, fill: 'url(#sb-wood-light)' }));

  let gs = null, legal = null, hint = '', cols = 4, rows = 6, cw = 100, ch = 100;
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };
  function geom() {
    [cols, rows] = SIZES[gs.opts.paare] || [4, 6];
    const cell = Math.min((SIZE - 2 * M) / cols, (SIZE - 2 * M) / rows);
    cw = cell; ch = cell;
  }
  const center = (i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x0 = (SIZE - cols * cw) / 2, y0 = (SIZE - rows * ch) / 2;
    return [x0 + c * cw + cw / 2, y0 + r * ch + ch / 2];
  };

  function card(i) {
    const [x, y] = center(i);
    const w = cw * 0.88, h = ch * 0.88;
    const v = gs.cards[i];
    const found = gs.found[i];
    const g = s('g', { class: 'pa-card' + (v === null ? ' back' : ' face') + (found !== null ? ' found' : ''), 'data-i': i, transform: `translate(${x} ${y})` });
    const art = DEKO.on && v === null ? backFill(1, 'blue') : null;
    if (art) {
      // Deko: Rücken als vorgezeichnetes Bild (blau mit Pfote), weicher Schatten
      g.append(s('rect', { x: -w / 2 + 2, y: -h / 2 + 5, width: w, height: h, rx: w * 0.1, fill: 'rgba(0,0,0,.25)' }),
        s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.07, fill: art }));
    } else if (v === null) {
      g.append(s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.12, class: 'pa-back' }),
        s('rect', { x: -w / 2 + w * 0.09, y: -h / 2 + h * 0.09, width: w * 0.82, height: h * 0.82, rx: w * 0.08, class: 'pa-back-in' }),
        s('text', { y: h * 0.13, class: 'pa-q', 'font-size': h * 0.38, text: '?' }));
    } else {
      if (DEKO.on) g.append(s('rect', { x: -w / 2 + 2, y: -h / 2 + 5, width: w, height: h, rx: w * 0.12, fill: 'rgba(0,0,0,.22)' }));
      const wrong = gs.shown && gs.shown.includes(i);
      g.append(s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.12, class: 'pa-face' + (wrong ? ' wrong' : '') + (gs.open.includes(i) ? ' open' : '') }));
      if (DEKO.on) g.append(s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.12, fill: 'url(#dk-cardgloss)' }));
      g.append(s('text', { y: h * 0.17, class: 'pa-emoji', 'font-size': h * 0.52, text: MOTIFS[v] }));
      if (found !== null) g.append(s('circle', { cx: w / 2 - w * 0.13, cy: -h / 2 + h * 0.13, r: w * 0.08, fill: SEAT_COLORS[found % 6], stroke: '#fff', 'stroke-width': 3 }));
    }
    return g;
  }

  function render() {
    gCards.textContent = '';
    for (let i = 0; i < gs.cards.length; i++) gCards.append(card(i));
    if (!legal) { setHint(''); return; }
    setHint(gs.open.length ? 'Und die zweite Karte?' : gs.shown ? 'Gut gemerkt? Erste Karte umdrehen.' : 'Dreh eine Karte um.');
  }

  // Karte kippt: erst schmal (Rücken), dann breit (Bild)
  function flipFx(i, a) {
    const el = gCards.querySelector(`[data-i="${i}"]`);
    if (!el || !el.animate || reduced() || !a || a.slide <= 0) return;
    const [x, y] = center(i);
    const d = Math.max(160, a.slide * 0.6);
    const w = cw * 0.88, h = ch * 0.88;
    const art = DEKO.on ? backFill(1, 'blue') : null;
    if (art) {
      // Deko: echte Drehung – erst wird der Rücken schmal, dann kommt das Bild (gleiche Dauer); dazu leichtes Anheben
      const back = s('g', { transform: `translate(${x} ${y})` }, s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.07, fill: art }));
      gCards.append(back);
      const tf = (k, up = 1) => `translate(${x}px, ${y}px) scale(${k * up}, ${up})`;
      const b = back.animate([{ transform: tf(1) }, { transform: tf(0.02, 1.06) }], { duration: d / 2, easing: 'ease-in', fill: 'forwards' });
      b.onfinish = () => back.remove();
      el.animate([{ transform: tf(0.02, 1.06) }, { transform: tf(1.04, 1.04), offset: 0.6 }, { transform: tf(1) }], { duration: d / 2, delay: d / 2, easing: 'ease-out', fill: 'backwards' });
      // gefundenes Paar funkelt
      if (gs.last && gs.last.match && gs.found[i] !== null) {
        const other = gs.found.findIndex((f, j) => j !== i && f !== null && gs.cards[j] === gs.cards[i]);
        FXS.sparks(gFx, x, y, { delay: d, dist: cw * 0.6, size: cw * 0.09 });
        if (other >= 0) FXS.sparks(gFx, ...center(other), { delay: d, dist: cw * 0.6, size: cw * 0.09 });
      }
      return;
    }
    el.animate([{ transform: `translate(${x}px, ${y}px) scale(0.05, 1)` }, { transform: `translate(${x}px, ${y}px) scale(1.06, 1.06)`, offset: 0.7 }, { transform: `translate(${x}px, ${y}px)` }], { duration: d, easing: 'ease-out' });
  }

  function tapAt(px, py) {
    if (!legal) return;
    let best = null, bd = Infinity;
    for (const m of legal) {
      const [x, y] = center(m.flip);
      const d = Math.max(Math.abs(x - px) / cw, Math.abs(y - py) / ch);
      if (d < bd) { bd = d; best = m; }
    }
    if (best && bd <= 0.5) { legal = null; onMove(best); }
  }

  onTap(svg, (cx, cy) => { const p = toBoard(svg, cx, cy); if (p) tapAt(p[0], p[1]); });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      gs = t.gs;
      geom();
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      render();
      if (info.kind === 'move' && info.move && Number.isInteger(info.move.flip)) flipFx(info.move.flip, ctx.anim || OWN);
    },
    target(i) { return toScreen(svg, ...center(i)); },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: Math.min(cw, ch) * scale, boardPx: SIZE * scale };
    },
    tap: tapAt,
    names: MOTIF_NAMES,
    celebrate() {
      [...gCards.children].forEach((el, k) => {
        const [x, y] = center(Number(el.dataset.i));
        const t = `translate(${x}px, ${y}px)`;
        if (el.animate) el.animate([{ transform: `${t} scale(1)` }, { transform: `${t} scale(1.1) rotate(-3deg)`, offset: 0.4 }, { transform: `${t} scale(1)` }], { duration: 480, delay: ((k % cols) + Math.floor(k / cols)) * 70, easing: 'ease-out' });
      });
    },
    destroy() { svg.remove(); }
  };
}
