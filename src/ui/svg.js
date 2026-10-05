// SVG-Helfer für die Bretter: Holzmuster (Poly Haven, CC0), Stein-Verläufe, Schatten, Krone, Animation.
// Mit Deko (src/ui/deko.js): Steine mit Glanzlicht und weichem Schatten, Krone mit Goldverlauf, Züge mit leichtem Anheben.
import { DEKO, whenNoise } from './deko.js';
import { spriteImage } from './sprites.js';
export const NS = 'http://www.w3.org/2000/svg';

export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c) el.appendChild(c);
  return el;
}

// gemeinsame Definitionen einmal ins Dokument (url(#…) gilt dokumentweit)
export function ensureDefs() {
  if (document.getElementById('sb-defs')) return;
  const tex = (id, file, size, fallback) => s('pattern', { id, patternUnits: 'userSpaceOnUse', width: size, height: size },
    s('rect', { width: size, height: size, fill: fallback }),
    s('image', { href: `assets/wood/${file}.webp`, width: size, height: size, preserveAspectRatio: 'none' }));
  const radial = (id, stops, cx = '36%', cy = '30%', r = '75%') => s('radialGradient', { id, cx, cy, r },
    ...stops.map(([o, c, a = 1]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })));
  const svg = s('svg', { id: 'sb-defs', width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' },
    s('defs', {},
      tex('sb-wood-light', 'light', 520, '#dcbf9e'),
      tex('sb-wood-dark', 'dark', 520, '#7c5a42'),
      tex('sb-wood-frame', 'frame', 420, '#5d2a18'),
      radial('sb-st-w', [['0%', '#fffdf6'], ['55%', '#f0e4cc'], ['100%', '#c9b28c']]),
      radial('sb-st-b', [['0%', '#7a6252'], ['50%', '#33251c'], ['100%', '#0f0a07']]),
      radial('sb-shadow', [['0%', '#000', 0.5], ['60%', '#000', 0.28], ['100%', '#000', 0]], '50%', '50%', '50%'),
      radial('sb-glow', [['0%', '#ffe08a', 0.9], ['100%', '#ffe08a', 0]], '50%', '50%', '50%')
    ));
  document.body.prepend(svg);
  ensureDekoDefs();
}

// Deko-Verläufe (einmal ins Dokument): Licht kommt immer von links oben
export function ensureDekoDefs() {
  if (!DEKO.on || document.getElementById('dk-st-w')) return;
  const defs = document.querySelector('#sb-defs defs');
  if (!defs) return;
  const stops = (list) => list.map(([o, c, a = 1]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }));
  const radial = (id, list, a = {}) => s('radialGradient', { id, cx: '50%', cy: '50%', r: '50%', ...a }, ...stops(list));
  const linear = (id, list, a = {}) => s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1, ...a }, ...stops(list));
  defs.append(
    // Steine: Körper mit Brennpunkt links oben, Glanzlicht, Kontaktschatten
    radial('dk-st-w', [['0%', '#fffef8'], ['40%', '#f2e6ce'], ['78%', '#d3bc93'], ['100%', '#9c8259']], { cx: '42%', cy: '38%', r: '66%', fx: '34%', fy: '28%' }),
    radial('dk-st-b', [['0%', '#7d6858'], ['30%', '#3d2d22'], ['78%', '#160d08'], ['100%', '#050302']], { cx: '42%', cy: '38%', r: '66%', fx: '34%', fy: '28%' }),
    radial('dk-spec', [['0%', '#fff', 0.95], ['55%', '#fff', 0.35], ['100%', '#fff', 0]]),
    radial('dk-shadow', [['0%', '#000', 0.55], ['55%', '#000', 0.3], ['100%', '#000', 0]]),
    radial('dk-dust', [['0%', '#e2cfa8', 0.85], ['60%', '#c8ad84', 0.4], ['100%', '#c8ad84', 0]]),
    radial('dk-spark', [['0%', '#fffbe8', 1], ['30%', '#ffd166', 0.75], ['100%', '#ffaa2a', 0]]),
    radial('dk-sparkw', [['0%', '#ffffff', 1], ['30%', '#bfe6ff', 0.7], ['100%', '#96d2ff', 0]]),
    radial('dk-fire', [['0%', '#fff4c0', 0.95], ['35%', '#ffb347', 0.8], ['70%', '#ff5a1f', 0.35], ['100%', '#ff3a10', 0]]),
    radial('dk-smoke', [['0%', '#4a4644', 0.6], ['60%', '#3c3836', 0.3], ['100%', '#3c3836', 0]]),
    radial('dk-drop', [['0%', '#ffffff', 1], ['45%', '#d2ebff', 0.9], ['100%', '#78b4f0', 0]], { cx: '40%', cy: '35%' }),
    // Farbige Steine (Halma-Murmeln, Ludo, Vier): heller Fleck + dunkler Rand über der Grundfarbe
    radial('dk-ball', [['0%', '#fff', 0.55], ['35%', '#fff', 0.08], ['70%', '#000', 0], ['100%', '#000', 0.42]], { cx: '44%', cy: '40%', r: '62%', fx: '32%', fy: '26%' }),
    linear('dk-gold', [['0%', '#fff4c4'], ['38%', '#f2c64e'], ['100%', '#a8741a']]),
    linear('dk-edge', [['0%', '#fff', 0.75], ['35%', '#fff', 0.05], ['65%', '#000', 0.05], ['100%', '#000', 0.6]], { x1: 0.2, y1: 0, x2: 0.8, y2: 1 }),
    // Würfel: gewölbte Elfenbein-Fläche, Glanz oben, eingelassene Augen
    radial('dk-die', [['0%', '#ffffff'], ['55%', '#f8f1e3'], ['100%', '#d9ccb2']], { cx: '40%', cy: '35%', r: '80%' }),
    linear('dk-die-gloss', [['0%', '#fff', 0.85], ['100%', '#fff', 0]]),
    radial('dk-pip', [['0%', '#000'], ['70%', '#24170e'], ['100%', '#5a4636']], { cx: '40%', cy: '38%', r: '60%' }),
    // Backgammon-Zungen: zur Spitze hin heller
    linear('dk-pt-up', [['0%', '#fff', 0.14], ['100%', '#000', 0.2]]),
    linear('dk-pt-down', [['0%', '#000', 0.2], ['100%', '#fff', 0.14]]),
    linear('dk-steel', [['0%', '#fff', 0.45], ['40%', '#fff', 0.05], ['100%', '#000', 0.25]]),
    linear('dk-water', [['0%', '#7fd0ff', 0.18], ['45%', '#000', 0], ['100%', '#001a33', 0.35]]),
    radial('dk-glow', [['0%', '#ffd27a', 0.8], ['45%', '#ff7a2a', 0.35], ['100%', '#ff5a1a', 0]]),
    linear('dk-chipedge', [['0%', '#000', 0.1], ['50%', '#fff', 0.12], ['100%', '#000', 0.45]], { x2: 1, y2: 0 }),
    radial('dk-leather', [['0%', '#fff', 0.16], ['50%', '#fff', 0.02], ['80%', '#000', 0.1], ['100%', '#000', 0.4]], { cx: '50%', cy: '30%', r: '75%' }),
    linear('dk-cardgloss', [['0%', '#fff', 0.22], ['35%', '#fff', 0.02], ['100%', '#fff', 0]], { x2: 0.6, y2: 1 }),
    linear('dk-plastic', [['0%', '#fff', 0.2], ['30%', '#fff', 0.04], ['70%', '#000', 0.04], ['100%', '#000', 0.22]], { x2: 0.35, y2: 1 }),
    linear('dk-rim', [['0%', '#000', 0.45], ['45%', '#000', 0.1], ['60%', '#fff', 0.05], ['100%', '#fff', 0.4]]),
    linear('dk-hole', [['0%', '#000', 0.32], ['50%', '#000', 0.04], ['100%', '#fff', 0.35]]),
    linear('dk-bar', [['0%', '#000', 0.45], ['22%', '#000', 0.05], ['78%', '#000', 0.05], ['100%', '#000', 0.45]], { x2: 1, y2: 0 }),
    radial('dk-brass', [['0%', '#fbe7a6'], ['45%', '#c99a3e'], ['100%', '#6e4b14']], { cx: '40%', cy: '35%', r: '70%' }),
    // Holz: Schliff am Rahmen (oben hell, unten dunkel), Lack-Glanz schräg, Innenschatten
    linear('dk-bevel', [['0%', '#fff2d8', 0.6], ['18%', '#fff2d8', 0.08], ['82%', '#000', 0.05], ['100%', '#000', 0.55]]),
    linear('dk-sheen', [['0%', '#fff', 0.2], ['38%', '#fff', 0.03], ['62%', '#000', 0], ['100%', '#000', 0.16]], { x2: 1, y2: 1 }),
    radial('dk-vig', [['0%', '#000', 0], ['68%', '#000', 0], ['100%', '#000', 0.3]], { r: '72%' }),
    // Filz: warmes Licht von oben (Spot) und Rand-Abdunklung
    radial('dk-spot', [['0%', '#fff1c8', 0.2], ['55%', '#fff1c8', 0.05], ['100%', '#fff1c8', 0]], { cx: '50%', cy: '38%', r: '62%' }),
    radial('dk-feltvig', [['0%', '#000', 0], ['62%', '#000', 0.04], ['100%', '#000', 0.38]], { r: '71%' }),
    // weicher Schatten für Bretter (nur in der statischen Ebene: wird einmal gerastert)
    s('filter', { id: 'dk-soft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, s('feGaussianBlur', { stdDeviation: 14 })),
    s('filter', { id: 'dk-soft-s', x: '-30%', y: '-30%', width: '160%', height: '160%' }, s('feGaussianBlur', { stdDeviation: 5 })));
  defs.append(s('pattern', { id: 'dk-waves', patternUnits: 'userSpaceOnUse', width: 60, height: 34 },
    s('path', { d: 'M0 10 q 7.5 -7 15 0 t 15 0 M30 27 q 7.5 -7 15 0 t 15 0 M-30 27 q 7.5 -7 15 0 t 15 0', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.13, 'stroke-width': 2, 'stroke-linecap': 'round' })));
  // Bohne (Blackjack-Einsätze): als Symbol, jede Bohne ist dann nur ein <use>
  defs.append(radial('dk-beanfill', [['0%', '#b8642e'], ['55%', '#8a3f1a'], ['100%', '#5a2510']], { cx: '38%', cy: '35%', r: '70%' }),
    s('symbol', { id: 'dk-bean', viewBox: '-15 -11 30 22', overflow: 'visible' },
      s('ellipse', { cx: 1.2, cy: 2, rx: 13.5, ry: 9, fill: '#000', opacity: 0.3 }),
      s('ellipse', { rx: 13.5, ry: 9, fill: 'url(#dk-beanfill)', stroke: '#3d1708', 'stroke-width': 1 }),
      s('path', { d: 'M-8 1.5 C-3 -4 3 4.5 8 -1', fill: 'none', stroke: 'rgba(45,15,4,.75)', 'stroke-width': 1.8, 'stroke-linecap': 'round' }),
      s('ellipse', { cx: -4.5, cy: -4, rx: 4.5, ry: 2, transform: 'rotate(-18 -4.5 -4)', fill: '#ffe2c4', opacity: 0.45 })));
  // Filz-Rauschen als Muster (Kachel kommt asynchron aus deko.js)
  const noise = s('pattern', { id: 'dk-noise', patternUnits: 'userSpaceOnUse', width: 256, height: 256 });
  const img = s('image', { width: 256, height: 256 });
  noise.append(img);
  defs.append(noise);
  whenNoise((url) => img.setAttribute('href', url));
}

// Spielstein (Mühle und Dame): Schatten, gedrechselter Stein mit Rille, optional Krone
export function piece(color, r, { king = false } = {}) {
  if (DEKO.on) return dekoPiece(color, r, king);
  const white = color === 0;
  const g = s('g', { class: 'pc ' + (white ? 'pc-w' : 'pc-b') });
  g.appendChild(s('circle', { class: 'pc-sh', cx: r * 0.1, cy: r * 0.18, r: r * 1.08, fill: 'url(#sb-shadow)' }));
  g.appendChild(s('circle', { r, fill: white ? 'url(#sb-st-w)' : 'url(#sb-st-b)', stroke: white ? '#7a6548' : '#050302', 'stroke-width': r * 0.05 }));
  g.appendChild(s('circle', { r: r * 0.7, fill: 'none', stroke: white ? 'rgba(110,85,50,.38)' : 'rgba(255,235,210,.16)', 'stroke-width': r * 0.07 }));
  g.appendChild(s('circle', { r: r * 0.36, fill: 'none', stroke: white ? 'rgba(110,85,50,.22)' : 'rgba(255,235,210,.10)', 'stroke-width': r * 0.05 }));
  if (king) g.appendChild(crown(r * 0.62));
  return g;
}

// Deko-Stein: weicher Kontaktschatten (rechts unten), Körper mit Lichtverlauf, gedrechselte Rillen, Glanzlicht
function dekoPiece(color, r, king) {
  const white = color === 0;
  const g = s('g', { class: 'pc ' + (white ? 'pc-w' : 'pc-b') });
  // vorgezeichnetes Bild (ein Element statt sieben); bis es fertig ist, dieselbe Form als Vektor
  const img = spriteImage(s, `st:${white ? 'w' : 'b'}:${king ? 'k' : ''}`, r);
  if (img) { g.append(img); return g; }
  g.append(
    s('ellipse', { class: 'pc-sh', cx: r * 0.14, cy: r * 0.24, rx: r * 1.12, ry: r * 1.04, fill: 'url(#dk-shadow)' }),
    s('circle', { r, fill: white ? 'url(#dk-st-w)' : 'url(#dk-st-b)', stroke: white ? '#8d7651' : '#020101', 'stroke-width': r * 0.05 }),
    // gedrechselte Kante: oben Licht, unten Schatten
    s('circle', { r: r * 0.93, fill: 'none', stroke: 'url(#dk-edge)', 'stroke-width': r * 0.1, opacity: white ? 0.75 : 0.6 }),
    s('circle', { r: r * 0.7, fill: 'none', stroke: white ? 'rgba(120,90,50,.36)' : 'rgba(255,232,200,.17)', 'stroke-width': r * 0.07 }),
    s('circle', { r: r * 0.36, fill: 'none', stroke: white ? 'rgba(120,90,50,.2)' : 'rgba(255,232,200,.1)', 'stroke-width': r * 0.05 }),
    // Glanz: breit und weich, dazu ein kleiner scharfer Lichtpunkt
    s('ellipse', { cx: -r * 0.28, cy: -r * 0.34, rx: r * 0.5, ry: r * 0.3, transform: `rotate(-30 ${-r * 0.28} ${-r * 0.34})`, fill: 'url(#dk-spec)', opacity: white ? 0.7 : 0.3 }),
    s('ellipse', { cx: -r * 0.4, cy: -r * 0.46, rx: r * 0.17, ry: r * 0.1, transform: `rotate(-32 ${-r * 0.4} ${-r * 0.46})`, fill: '#fff', opacity: white ? 0.95 : 0.55 }));
  if (king) g.appendChild(crown(r * 0.62));
  return g;
}

// Würfel mit Tiefe (Deko): Schatten, gewölbte Fläche, Glanz oben, eingelassene Augen. Mitte = (0, 0).
const PIPS = (o) => ({ 1: [[0, 0]], 2: [[-o, -o], [o, o]], 3: [[-o, -o], [0, 0], [o, o]], 4: [[-o, -o], [o, -o], [-o, o], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] });
export function die3d(v, size, { used = false, blank = false, cls = '' } = {}) {
  const g = s('g', { class: 'die dk-die' + (used ? ' used' : '') + (blank ? ' blank' : '') + (cls ? ' ' + cls : '') });
  const img = spriteImage(s, `die:${blank ? 0 : v}`, size / 1.62);
  if (img) { g.append(img); if (used) g.setAttribute('opacity', 0.55); return g; }
  const h = size / 2, rx = size * 0.2;
  g.append(
    s('rect', { x: -h + size * 0.05, y: -h + size * 0.09, width: size, height: size, rx, fill: '#000', opacity: blank ? 0.12 : 0.3 }),
    s('rect', { x: -h, y: -h, width: size, height: size, rx, class: 'dk-die-face', fill: blank ? 'rgba(255,253,246,.55)' : 'url(#dk-die)', stroke: '#6b5238', 'stroke-width': size * 0.03 }),
    s('rect', { x: -h + size * 0.08, y: -h + size * 0.06, width: size * 0.84, height: size * 0.42, rx: rx * 0.75, fill: 'url(#dk-die-gloss)' }));
  const o = size * 0.26;
  for (const [px, py] of PIPS(o)[v] || []) {
    g.append(s('circle', { cx: px, cy: py, r: size * 0.092, fill: 'url(#dk-pip)', class: 'dk-pip' }),
      s('circle', { cx: px + size * 0.022, cy: py + size * 0.026, r: size * 0.05, fill: '#fff', opacity: 0.18 }));
  }
  if (used) g.setAttribute('opacity', 0.55);
  return g;
}

// farbige Kugel/Scheibe (Halma-Murmel, Ludo-Figur von oben, Vier-Stein): Grundfarbe + Licht + Glanzpunkt + Schatten
export function ball(col, r, { shadow = true, ring = false } = {}) {
  const g = s('g', { class: 'pc dk-ball' });
  const img = shadow ? spriteImage(s, `ball:${col}:${ring ? 'r' : ''}`, r) : null;
  if (img) { g.append(img); return g; }
  if (shadow) g.append(s('ellipse', { class: 'pc-sh', cx: r * 0.16, cy: r * 0.26, rx: r * 1.1, ry: r * 1.02, fill: 'url(#dk-shadow)' }));
  g.append(s('circle', { r, fill: col, stroke: 'rgba(0,0,0,.55)', 'stroke-width': r * 0.07 }),
    s('circle', { r: r * 0.965, fill: 'url(#dk-ball)' }));
  if (ring) g.append(s('circle', { r: r * 0.66, fill: 'none', stroke: 'rgba(255,255,255,.3)', 'stroke-width': r * 0.08 }));
  g.append(s('ellipse', { cx: -r * 0.32, cy: -r * 0.4, rx: r * 0.36, ry: r * 0.22, transform: `rotate(-30 ${-r * 0.32} ${-r * 0.4})`, fill: 'url(#dk-spec)', opacity: 0.9 }));
  return g;
}

export function crown(size) {
  const k = size;
  const d = `M ${-0.82 * k} ${0.42 * k} L ${-0.95 * k} ${-0.38 * k} L ${-0.45 * k} ${0.02 * k} L 0 ${-0.62 * k} L ${0.45 * k} ${0.02 * k} L ${0.95 * k} ${-0.38 * k} L ${0.82 * k} ${0.42 * k} Z`;
  const gold = DEKO.on ? 'url(#dk-gold)' : '#f0c24b';
  return s('g', { class: 'crown' },
    s('path', { d, fill: gold, stroke: '#8a6412', 'stroke-width': k * 0.09, 'stroke-linejoin': 'round' }),
    s('rect', { x: -0.82 * k, y: 0.5 * k, width: 1.64 * k, height: 0.2 * k, rx: 0.06 * k, fill: gold, stroke: '#8a6412', 'stroke-width': k * 0.07 }),
    s('circle', { cx: 0, cy: -0.62 * k, r: 0.13 * k, fill: '#fff3c4' }),
    s('circle', { cx: -0.95 * k, cy: -0.38 * k, r: 0.11 * k, fill: '#fff3c4' }),
    s('circle', { cx: 0.95 * k, cy: -0.38 * k, r: 0.11 * k, fill: '#fff3c4' }));
}

export function place(el, x, y) {
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.dataset.x = x;
  el.dataset.y = y;
  return el;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Stein entlang einer Punktfolge bewegen (Punkte in Brett-Einheiten), letzte = Endlage
export function animatePath(el, pts, msPerStep = 230) {
  if (!el.animate || pts.length < 2 || reduced()) return null;
  const frames = pts.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` }));
  frames[0].offset = 0;
  // kurzes Anheben in der Mitte jedes Sprungs
  return el.animate(frames, { duration: msPerStep * (pts.length - 1) + 80, easing: 'cubic-bezier(.3,.7,.3,1)' });
}

// Station für Station: hop ms je Teilstrecke, an jeder Zwischenstation pause ms Halt, vorher delay ms warten
// (bis dahin steht der Stein am Start). lift: Stein hebt sich bei jedem Sprung leicht an. Dauer 0 → keine Animation.
export function animateSteps(el, pts, { hop = 230, pause = 0, delay = 0, lift = false, fromOpacity = null } = {}) {
  if (!el || !el.animate || pts.length < 2 || reduced() || hop <= 0) return null;
  const n = pts.length - 1;
  const total = n * hop + (n - 1) * pause;
  const tf = ([x, y], k = 1) => `translate(${x}px, ${y}px)${k !== 1 ? ` scale(${k})` : ''}`;
  const frames = [{ transform: tf(pts[0]), offset: 0, ...(fromOpacity !== null ? { opacity: fromOpacity } : {}) }];
  // Deko: auch beim Gleiten hebt sich der Stein ein wenig (wirkt weicher, gleiche Dauer)
  const up = lift ? 1.16 : DEKO.on ? 1.07 : 0;
  let t = 0;
  for (let i = 1; i <= n; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (up) frames.push({ transform: tf([(ax + bx) / 2, (ay + by) / 2], up), offset: (t + hop / 2) / total, easing: lift ? 'ease-in' : 'ease-in-out' });
    t += hop;
    frames.push({ transform: tf(pts[i]), offset: t / total, easing: 'ease-in-out', ...(fromOpacity !== null ? { opacity: 1 } : {}) });
    if (i < n && pause > 0) { t += pause; frames.push({ transform: tf(pts[i]), offset: t / total, easing: 'ease-in-out' }); }
  }
  frames[frames.length - 1].offset = 1;
  return el.animate(frames, { duration: total, delay, fill: delay > 0 ? 'backwards' : 'none', easing: 'linear' });
}

// Deko: Karte fliegt im flachen Bogen, dreht sich dabei leicht und hebt sich (gleiche Dauer wie bisher)
export function flyCard(el, from, to, dur, { spin = -9, delay = 0 } = {}) {
  if (!el || !el.animate || reduced() || dur <= 0) return null;
  const lift = Math.min(90, Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.2);
  const cx = (from[0] + to[0]) / 2, cy = (from[1] + to[1]) / 2 - lift * 2;   // Kontrollpunkt (quadratischer Bogen)
  const frames = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const u = 1 - t;
    const x = u * u * from[0] + 2 * u * t * cx + t * t * to[0], y = u * u * from[1] + 2 * u * t * cy + t * t * to[1];
    const k = 1 + 0.1 * Math.sin(Math.PI * t), r = spin * (1 - t) * (1 - t);
    return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${k.toFixed(3)})`, offset: t };
  });
  return el.animate(frames, { duration: dur, delay, easing: 'cubic-bezier(.3,.55,.35,1)', fill: delay > 0 ? 'backwards' : 'none' });
}

// Karte/Stein kommt von from herein (erst unsichtbar, dann eingeblendet), z. B. Karte vom Schuh
export function flyIn(el, from, dur, delay = 0) {
  if (!el || !el.animate || reduced() || dur <= 0) return null;
  const [x, y] = [el.dataset.x, el.dataset.y];
  return el.animate([
    { transform: `translate(${from[0]}px, ${from[1]}px)`, opacity: 0 },
    { transform: `translate(${from[0]}px, ${from[1]}px)`, opacity: 1, offset: 0.08 },
    { transform: `translate(${x}px, ${y}px)`, opacity: 1 }
  ], { duration: dur, delay, fill: 'backwards', easing: 'cubic-bezier(.3,.7,.3,1)' });
}

// Element (Text, Abzeichen) erst nach delay einblenden
export function fadeIn(el, delay = 0, dur = 300) {
  if (!el || !el.animate || reduced() || delay + dur <= 0) return null;
  return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, delay, fill: 'backwards' });
}

export function animateDrop(el, dur = 260) {
  if (!el.animate || reduced() || dur <= 0) return null;
  const [x, y] = [el.dataset.x, el.dataset.y];
  return el.animate([
    { transform: `translate(${x}px, ${y - 26}px) scale(1.18)`, opacity: 0 },
    { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 }
  ], { duration: dur, easing: 'cubic-bezier(.2,.8,.3,1.2)' });
}

// geschlagenen Stein ausblenden (Geist wird danach entfernt)
export function fadeOut(el, delay = 0, dur = 320) {
  if (!el.animate || reduced() || dur <= 0) { el.remove(); return; }
  const [x, y] = [el.dataset.x, el.dataset.y];
  const a = el.animate([
    { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 },
    { transform: `translate(${x}px, ${y}px) scale(0.6)`, opacity: 0 }
  ], { duration: dur, delay, easing: 'ease-in', fill: 'forwards' });
  a.onfinish = () => el.remove();
}

// Bildschirmpunkt → Brett-Koordinaten
export function toBoard(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = pt.matrixTransform(m.inverse());
  return [p.x, p.y];
}

// Brett-Koordinaten → Bildschirm (für Tests und Messungen)
export function toScreen(svg, x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const p = pt.matrixTransform(svg.getScreenCTM());
  return [p.x, p.y];
}

// Tipp-Erkennung ohne Doppelauslösung: pointerup nahe am pointerdown
export function onTap(svg, fn) {
  let down = null;
  svg.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  svg.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 24) return;
    e.preventDefault();
    fn(e.clientX, e.clientY);
  });
  svg.addEventListener('pointercancel', () => { down = null; });
}
