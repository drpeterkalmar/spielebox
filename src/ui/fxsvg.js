// Kleine Effekte direkt im Brett (Deko-Stufe 2): Staub, Funken, Sterne, Explosion, Spritzer – als wenige SVG-Elemente
// mit transform/opacity-Animation in der Effekt-Gruppe des Bretts. Sie liegen dort, wo ohnehin gerade ein Stein
// gezeichnet wird; das ist sparsamer als eine eigene Leinwand (gemessen: Dame +4 % statt +10 % CPU).
// Alle Maße in Brett-Einheiten, delay/Zeiten in ms. Während Effekte laufen, misst deko.js die Frame-Zeiten
// (Auto-Drosselung: erst weniger Teilchen, dann keine).
import { s } from './svg.js';
import { DEKO, watchFrames } from './deko.js';

const on = () => DEKO.fx && typeof document !== 'undefined' && !document.hidden;
const cnt = (k) => Math.max(1, Math.round(k * DEKO.quality));
const rnd = (a, b) => a + Math.random() * (b - a);
const f1 = (v) => v.toFixed(1);

// ein Teilchen: Element el wandert über pts, Größe s0 → s1, blendet ein und aus, wird danach entfernt
function fly(g, el, pts, { life = 600, delay = 0, s0 = 0.5, s1 = 1, rot = 0, ease = 'cubic-bezier(.15,.65,.35,1)' } = {}) {
  el.setAttribute('opacity', 0);
  g.append(el);
  const k = pts.length - 1, at = new Map();
  pts.forEach(([x, y], i) => at.set(i / k, { transform: `translate(${f1(x)}px, ${f1(y)}px) scale(${(s0 + (s1 - s0) * (i / k)).toFixed(3)}) rotate(${f1(rot * i / k)}deg)` }));
  for (const [o, v] of [[0, 0], [0.12, 1], [0.55, 1], [1, 0]]) at.set(o, { ...(at.get(o) || {}), opacity: v });
  const frames = [...at.entries()].sort((a, b) => a[0] - b[0]).map(([offset, f]) => ({ ...f, offset }));
  const a = el.animate(frames, { duration: life, delay, easing: ease, fill: 'backwards' });
  a.onfinish = a.oncancel = () => el.remove();
  return life + delay;
}

const glow = (r, id = 'dk-spark') => s('circle', { r, fill: `url(#${id})` });
const star = (r) => s('g', {}, s('circle', { r: r * 0.9, fill: 'url(#dk-spark)' }),
  s('path', { d: `M0 ${-r}L${r * 0.2} ${-r * 0.2} ${r} 0 ${r * 0.2} ${r * 0.2} 0 ${r} ${-r * 0.2} ${r * 0.2} ${-r} 0 ${-r * 0.2} ${-r * 0.2}Z`, fill: '#fff6c8' }));

// Staubwolke (Stein geschlagen); r ≈ Steinradius
export function puff(g, x, y, r, delay = 0) {
  if (!on() || !g) return;
  let t = 0;
  for (let k = cnt(5); k > 0; k--) {
    const a = rnd(0, 6.28), d = r * rnd(0.7, 1.2);
    t = Math.max(t, fly(g, s('circle', { r: r * rnd(0.42, 0.62), fill: 'url(#dk-dust)' }), [[x, y], [x + Math.cos(a) * d, y + Math.sin(a) * d - r * 0.25]], { life: rnd(440, 560), delay, s0: 0.5, s1: 1.35 }));
  }
  watchFrames(t);
}

// Funken (Erfolg); color 'gold' | 'white'
export function sparks(g, x, y, { n = 10, dist = 60, size = 10, delay = 0, color = 'gold', life = 620 } = {}) {
  if (!on() || !g) return;
  let t = 0;
  for (let k = cnt(n); k > 0; k--) {
    const a = rnd(0, 6.28), d = dist * rnd(0.45, 1);
    const x1 = x + Math.cos(a) * d, y1 = y + Math.sin(a) * d;
    t = Math.max(t, fly(g, glow(size * rnd(0.7, 1.2), color === 'white' ? 'dk-sparkw' : 'dk-spark'), [[x, y], [x1, y1 - size * 0.5], [x1, y1 + size * 0.4]], { life: rnd(life * 0.6, life), delay, s0: 1, s1: 0.35 }));
  }
  watchFrames(t);
}

// Funken entlang einer Linie (geschlossene Mühle, Gewinnreihe)
export function sweep(g, x0, y0, x1, y1, { n = 12, size = 12, delay = 0 } = {}) {
  if (!on() || !g) return;
  let t = 0;
  const m = cnt(n);
  for (let k = 0; k < m; k++) {
    const u = k / Math.max(1, m - 1);
    const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
    t = Math.max(t, fly(g, glow(size * rnd(0.8, 1.3)), [[x, y], [x + rnd(-4, 4), y - size * rnd(1, 2.2)]], { life: rnd(520, 720), delay: delay + u * 260, s0: 0.7, s1: 0.3 }));
  }
  watchFrames(t);
}

// Sterne (Dame-Umwandlung, Ludo-Ziel, Schach-Umwandlung)
export function stars(g, x, y, { n = 6, dist = 70, size = 16, delay = 0 } = {}) {
  if (!on() || !g) return;
  let t = 0;
  for (let k = cnt(n); k > 0; k--) {
    const a = rnd(0, 6.28), d = dist * rnd(0.5, 1);
    const x1 = x + Math.cos(a) * d, y1 = y + Math.sin(a) * d - size * 0.6;
    t = Math.max(t, fly(g, star(size * rnd(0.8, 1.2)), [[x, y], [x1, y1], [x1, y1 + size * 0.6]], { life: rnd(760, 980), delay, s0: 0.4, s1: 0.75, rot: rnd(-140, 140) }));
  }
  watchFrames(t);
}

// Explosion (Schiffe: Treffer): Feuerball, Funken, Rauch
export function boom(g, x, y, r, { big = false, delay = 0 } = {}) {
  if (!on() || !g) return;
  let t = fly(g, s('circle', { r: r * 1.6, fill: 'url(#dk-fire)' }), [[x, y], [x, y - r * 0.3]], { life: 520, delay, s0: 0.35, s1: big ? 1.6 : 1.2 });
  for (let k = cnt(big ? 12 : 8); k > 0; k--) {
    const a = rnd(0, 6.28), d = r * rnd(1.5, big ? 3.6 : 2.6);
    t = Math.max(t, fly(g, glow(r * rnd(0.25, 0.4)), [[x, y], [x + Math.cos(a) * d, y + Math.sin(a) * d - r * 0.4], [x + Math.cos(a) * d * 1.1, y + Math.sin(a) * d + r * 0.2]], { life: rnd(380, 560), delay, s0: 1, s1: 0.3 }));
  }
  for (let k = cnt(big ? 5 : 3); k > 0; k--) {
    t = Math.max(t, fly(g, s('circle', { r: r * rnd(0.6, 0.9), fill: 'url(#dk-smoke)' }), [[x + rnd(-r, r) * 0.4, y], [x + rnd(-r, r) * 0.6, y - r * rnd(1.4, 2.4)]], { life: rnd(820, 1100), delay: delay + rnd(80, 200), s0: 0.6, s1: 1.8, ease: 'ease-out' }));
  }
  watchFrames(t);
}

// Wasser-Spritzer (Schiffe: daneben)
export function splash(g, x, y, r, { delay = 0 } = {}) {
  if (!on() || !g) return;
  let t = fly(g, s('circle', { r, fill: 'none', stroke: '#fff', 'stroke-width': r * 0.12 }), [[x, y], [x, y]], { life: 620, delay, s0: 0.3, s1: 1.7, ease: 'ease-out' });
  for (let k = cnt(8); k > 0; k--) {
    const dx = rnd(-1, 1) * r * 1.5, up = r * rnd(1.2, 2.4);
    t = Math.max(t, fly(g, s('circle', { r: r * rnd(0.12, 0.2), fill: 'url(#dk-drop)' }), [[x, y], [x + dx * 0.6, y - up], [x + dx, y + r * 0.35]], { life: rnd(480, 640), delay, s0: 1, s1: 0.75, ease: 'linear' }));
  }
  watchFrames(t);
}
