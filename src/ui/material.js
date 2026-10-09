// Material für die statische Brett-Ebene (nur mit Deko): Holzrahmen mit Schliff, Lack-Glanz, Innenschatten,
// Filz mit Licht von oben, gebackener weicher Schatten. Alles wird einmal gezeichnet und liegt in der Ebene unter dem
// Brett (deko.js boardLayers) – Zug-Animationen rastern es nicht neu. Licht kommt immer von links oben.
import { s } from './svg.js';
import { useMaterial, MATERIAL_DEFAULT } from './flags.js';

// n9 (Audit #5): eine vorgebackene Licht-Ebene (Licht links oben + leichte Vignette + Mikro-Normalen,
// tools/bake_material.py) liegt über der Randabdunklung von Spielfläche und Filz, dazu eine feine Fase an der
// Rahmenkante. ?material=0 schaltet beides ab (Standard an, flags.js).
export { useMaterial, MATERIAL_DEFAULT };
export const MAT_LIGHT = { fill: 'url(#dk-matlight)', style: 'mix-blend-mode: soft-light', class: 'dk-matlight' };
const LIGHT = MAT_LIGHT;

// Licht-Ebene (nur mit Material) über der Randabdunklung: Licht links oben + feine Struktur, eine Fläche
export const matLight = (x, y, w, h, rx) => (useMaterial() ? [rr(x, y, w, h, rx, LIGHT)] : []);

// gebackener Schatten unter einer Form (Kopie, schwarz, nach unten versetzt, weichgezeichnet)
export function shadowUnder(g, shape, { dy = 12, op = 0.5, soft = 'dk-soft' } = {}) {
  const c = shape.cloneNode(false);
  for (const a of ['class', 'stroke', 'stroke-width', 'style']) c.removeAttribute(a);
  c.setAttribute('fill', '#000');
  c.setAttribute('opacity', op);
  c.setAttribute('filter', `url(#${soft})`);
  const w = s('g', { transform: `translate(0 ${dy})` });
  w.append(c);
  g.append(w);
  return w;
}

const rr = (x, y, w, h, rx, attrs = {}) => s('rect', { x, y, width: w, height: h, rx, ...attrs });

// Holzrahmen + Schliff (Kante oben hell, unten dunkel)
export function woodFrame(g, x, y, w, h, rx, { shadow = true, fill = 'url(#sb-wood-frame)' } = {}) {
  const frame = rr(x, y, w, h, rx, { fill });
  if (shadow) shadowUnder(g, frame);
  g.append(frame,
    rr(x + 2, y + 2, w - 4, h - 4, Math.max(0, rx - 2), { fill: 'none', stroke: 'url(#dk-bevel)', 'stroke-width': 4 }),
    rr(x, y, w, h, rx, { fill: 'url(#dk-sheen)' }));
  // Fase: schmale, scharfe Lichtkante außen (TODO Heavy-Job: Breite/Stärke am Bild)
  if (useMaterial()) g.append(rr(x + 0.75, y + 0.75, w - 1.5, h - 1.5, Math.max(0, rx - 0.75), { fill: 'none', stroke: 'url(#dk-chamfer)', 'stroke-width': 1.5, class: 'dk-chamfer' }));
  return frame;
}

// Spielfläche im Rahmen: leicht eingelassen (dunkle Kante oben/links, helle unten/rechts), Innenschatten, Glanz
export function inset(g, x, y, w, h, rx, fill) {
  if (fill) g.append(rr(x, y, w, h, rx, { fill }));
  g.append(
    rr(x, y, w, h, rx, { fill: 'url(#dk-vig)' }),
    ...matLight(x, y, w, h, rx),
    rr(x, y, w, h, rx, { fill: 'url(#dk-sheen)' }),
    rr(x - 1.5, y - 1.5, w + 3, h + 3, rx + 1, { fill: 'none', stroke: 'rgba(30,14,4,.55)', 'stroke-width': 3 }),
    s('path', { d: `M ${x + rx} ${y + h + 2.5} H ${x + w - rx}`, stroke: 'rgba(255,236,205,.35)', 'stroke-width': 2, fill: 'none' }));
}

// nur Glanz + Innenschatten über einer schon gezeichneten Fläche (z. B. Schachbrett aus Feldern)
export function lacquer(g, x, y, w, h, rx = 0) {
  g.append(rr(x, y, w, h, rx, { fill: 'url(#dk-vig)' }), ...matLight(x, y, w, h, rx), rr(x, y, w, h, rx, { fill: 'url(#dk-sheen)' }));
}

// Filz (Rechteck): Grundfarbe, Rauschen, Licht von oben, Randabdunklung, Ziernaht
export function feltRect(g, x, y, w, h, rx, { cls = 'felt', stitch = true, color = null } = {}) {
  g.append(rr(x, y, w, h, rx, color ? { fill: color } : { class: cls }),
    rr(x, y, w, h, rx, { fill: 'url(#dk-noise)', opacity: 0.9 }),
    rr(x, y, w, h, rx, { fill: 'url(#dk-spot)' }),
    rr(x, y, w, h, rx, { fill: 'url(#dk-feltvig)' }), ...matLight(x, y, w, h, rx));
  if (stitch) g.append(rr(x + 16, y + 16, w - 32, h - 32, Math.max(4, rx - 8), { fill: 'none', stroke: 'rgba(255,236,190,.2)', 'stroke-width': 2.5, 'stroke-dasharray': '10 7' }));
}

// Filz (Ellipse, Hold'em)
export function feltEllipse(g, cx, cy, rx, ry, { cls = 'felt' } = {}) {
  const e = (a) => s('ellipse', { cx, cy, rx, ry, ...a });
  g.append(e({ class: cls }), e({ fill: 'url(#dk-noise)', opacity: 0.9 }), e({ fill: 'url(#dk-spot)' }), e({ fill: 'url(#dk-feltvig)' }), ...(useMaterial() ? [e(LIGHT)] : []));
}
