// SVG-Helfer für die Bretter: Holzmuster (Poly Haven, CC0), Stein-Verläufe, Schatten, Krone, Animation.
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
}

// Spielstein (Mühle und Dame): Schatten, gedrechselter Stein mit Rille, optional Krone
export function piece(color, r, { king = false } = {}) {
  const white = color === 0;
  const g = s('g', { class: 'pc ' + (white ? 'pc-w' : 'pc-b') });
  g.appendChild(s('circle', { class: 'pc-sh', cx: r * 0.1, cy: r * 0.18, r: r * 1.08, fill: 'url(#sb-shadow)' }));
  g.appendChild(s('circle', { r, fill: white ? 'url(#sb-st-w)' : 'url(#sb-st-b)', stroke: white ? '#7a6548' : '#050302', 'stroke-width': r * 0.05 }));
  g.appendChild(s('circle', { r: r * 0.7, fill: 'none', stroke: white ? 'rgba(110,85,50,.38)' : 'rgba(255,235,210,.16)', 'stroke-width': r * 0.07 }));
  g.appendChild(s('circle', { r: r * 0.36, fill: 'none', stroke: white ? 'rgba(110,85,50,.22)' : 'rgba(255,235,210,.10)', 'stroke-width': r * 0.05 }));
  if (king) g.appendChild(crown(r * 0.62));
  return g;
}

export function crown(size) {
  const k = size;
  const d = `M ${-0.82 * k} ${0.42 * k} L ${-0.95 * k} ${-0.38 * k} L ${-0.45 * k} ${0.02 * k} L 0 ${-0.62 * k} L ${0.45 * k} ${0.02 * k} L ${0.95 * k} ${-0.38 * k} L ${0.82 * k} ${0.42 * k} Z`;
  return s('g', { class: 'crown' },
    s('path', { d, fill: '#f0c24b', stroke: '#8a6412', 'stroke-width': k * 0.09, 'stroke-linejoin': 'round' }),
    s('rect', { x: -0.82 * k, y: 0.5 * k, width: 1.64 * k, height: 0.2 * k, rx: 0.06 * k, fill: '#f0c24b', stroke: '#8a6412', 'stroke-width': k * 0.07 }),
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
  let t = 0;
  for (let i = 1; i <= n; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (lift) frames.push({ transform: tf([(ax + bx) / 2, (ay + by) / 2], 1.16), offset: (t + hop / 2) / total, easing: 'ease-in' });
    t += hop;
    frames.push({ transform: tf(pts[i]), offset: t / total, easing: 'ease-in-out', ...(fromOpacity !== null ? { opacity: 1 } : {}) });
    if (i < n && pause > 0) { t += pause; frames.push({ transform: tf(pts[i]), offset: t / total, easing: 'ease-in-out' }); }
  }
  frames[frames.length - 1].offset = 1;
  return el.animate(frames, { duration: total, delay, fill: delay > 0 ? 'backwards' : 'none', easing: 'linear' });
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
