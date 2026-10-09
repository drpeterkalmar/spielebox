// Vorgezeichnete Bildchen („Sprites“) für die Deko: Steine, Kugeln, Chips, Bohnen, Würfel – je Sorte einmal per Canvas
// gezeichnet (Blob-URL, kein Netz) und dann als ein einziges <image> je Stein benutzt. Das spart gegenüber Vektor-Steinen
// (bis zu 7 Formen mit Verläufen) Arbeit im Hauptthread und beim Rastern. Erzeugt wird erst bei Bedarf (nur die Sorten
// des gerade gespielten Spiels); bis ein Bild fertig ist (wenige ms), zeichnet die Ansicht die gleiche Form als Vektor.
// Kein extra Neuzeichnen, wenn ein Bild fertig wird (das würde z. B. eine angetippte Spalte/Karte verwerfen). n9: Statt
// auf den nächsten Zug zu warten, tauscht spriteLater() die Vektor-Formen eines Steins an Ort und Stelle gegen das
// fertige Bild (die Gruppe des Steins bleibt, samt Lage, Klassen und laufender Animation); ebenso bekommt ein Bild in
// der Rückfall-Größe die passende Kachel, sobald sie fertig ist.
// Licht wie überall von links oben, Schatten nach rechts unten. Maße: Kachel S × S Pixel, Objekt-Radius RS.
// n9 „je Größe“: Die Kachel wird in der Pixelgröße gebacken, in der der Stein auf dem Bildschirm erscheint (Stufen
// TILES, Maßstab aus setSpriteScale) – große Steine (Desktop, Dame) bleiben scharf, kleine (Halma) kosten beim Rastern
// weniger. Die Zeichen-Funktionen rechnen weiter in S-Einheiten (die Kachel wird skaliert). ?sprites=0 → Vektor.
import { DEKO } from './deko.js';
import { urlFlag } from './flags.js';

export const S = 168;          // Kachelgröße (px) der Zeichen-Funktionen (und ohne bekannten Maßstab)
export const RS = S * 0.36;    // Radius des Objekts in der Kachel (Platz für Schatten rechts unten)
export const TILES = [48, 64, 96, 128, 168, 224, 288];
const cache = new Map();       // Schlüssel@Kachel → URL | null (wird gezeichnet) | false (geht nicht)
const anySize = new Map();     // Schlüssel → zuletzt fertige URL irgendeiner Größe (Rückfall statt Vektor beim Größenwechsel)
const waiting = new Map();     // Schlüssel@Kachel → [Funktion(url)] – wartet, bis das Bild fertig ist
const useSprites = urlFlag('sprites', true);

// kleinste Kachelstufe, die einen Stein mit Radius pxR (Gerätepixel) ohne Hochskalieren trägt
export function tileFor(pxR) {
  if (!(pxR > 0)) return S;
  const need = (pxR * S) / RS;
  return TILES.find((t) => t >= need) || TILES[TILES.length - 1];
}

let pxPerUnit = 0;   // Gerätepixel je Brett-Einheit (0 = unbekannt → Kachel S)
export function setSpriteScale(k) { pxPerUnit = k > 0 && Number.isFinite(k) ? k : 0; }
export const spriteScale = () => pxPerUnit;

function make(id, key, tile, draw) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = tile;
    const x = c.getContext('2d');
    x.translate(tile / 2, tile / 2);
    if (tile !== S) x.scale(tile / S, tile / S);
    draw(x);
    c.toBlob((b) => {
      const url = b ? URL.createObjectURL(b) : false;
      cache.set(id, url);
      if (url) anySize.set(key, url);
      const fs = waiting.get(id);
      waiting.delete(id);
      if (url && fs) for (const f of fs) f(url);
    }, 'image/png');
  } catch { cache.set(id, false); waiting.delete(id); }
}

// URL des Bildchens oder null (dann bitte als Vektor zeichnen); stößt das Zeichnen beim ersten Aufruf an.
// tile = Kachelgröße in px; ist sie noch nicht fertig, gilt solange eine fertige andere Größe desselben Steins.
export function sprite(key, tile = S) {
  if (!DEKO.on || !useSprites || typeof document === 'undefined') return null;
  const id = key + '@' + tile;
  const v = cache.get(id);
  if (v) return v;
  if (v === undefined) {
    cache.set(id, null);
    const [kind, a, b] = key.split(':');
    const fn = DRAW[kind];
    if (fn) make(id, key, tile, (x) => fn(x, a, b)); else cache.set(id, false);
  }
  return anySize.get(key) || null;
}

// Sorten vorab anstoßen (z. B. beim Öffnen eines Tisches)
export function prepare(keys) { for (const k of keys) sprite(k); }

// ---------- Zeichnen ----------
const rg = (x, cx, cy, r0, r1, stops, fx = cx, fy = cy) => {
  const g = x.createRadialGradient(fx, fy, r0, cx, cy, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
};
const circle = (x, cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); };
function shadow(x, r, dx = 0.14, dy = 0.24, k = 1.1) {
  x.save();
  x.translate(r * dx, r * dy);
  x.scale(1, 0.93);
  x.fillStyle = rg(x, 0, 0, 0, r * k, [[0, 'rgba(0,0,0,.55)'], [0.55, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']]);
  circle(x, 0, 0, r * k); x.fill();
  x.restore();
}
function spec(x, r, a = 0.9, big = 0.7) {
  x.save(); x.translate(-r * 0.28, -r * 0.34); x.rotate(-0.52); x.scale(1, 0.6);
  x.fillStyle = rg(x, 0, 0, 0, r * 0.5, [[0, `rgba(255,255,255,${big})`], [0.55, `rgba(255,255,255,${big * 0.38})`], [1, 'rgba(255,255,255,0)']]);
  circle(x, 0, 0, r * 0.5); x.fill(); x.restore();
  x.save(); x.translate(-r * 0.4, -r * 0.46); x.rotate(-0.56); x.scale(1, 0.6);
  x.fillStyle = `rgba(255,255,255,${a})`; circle(x, 0, 0, r * 0.17); x.fill(); x.restore();
}
function edge(x, r, w, a) {
  const g = x.createLinearGradient(-r * 0.6, -r, r * 0.6, r);
  g.addColorStop(0, `rgba(255,255,255,${0.75 * a})`); g.addColorStop(0.35, `rgba(255,255,255,${0.05 * a})`);
  g.addColorStop(0.65, `rgba(0,0,0,${0.05 * a})`); g.addColorStop(1, `rgba(0,0,0,${0.6 * a})`);
  x.strokeStyle = g; x.lineWidth = w; circle(x, 0, 0, r * 0.93); x.stroke();
}
function crown(x, k) {
  const g = x.createLinearGradient(0, -k * 0.62, 0, k * 0.7);
  g.addColorStop(0, '#fff4c4'); g.addColorStop(0.38, '#f2c64e'); g.addColorStop(1, '#a8741a');
  x.fillStyle = g; x.strokeStyle = '#8a6412'; x.lineJoin = 'round'; x.lineWidth = k * 0.09;
  x.beginPath();
  for (const [px, py] of [[-0.82, 0.42], [-0.95, -0.38], [-0.45, 0.02], [0, -0.62], [0.45, 0.02], [0.95, -0.38], [0.82, 0.42]]) x.lineTo(px * k, py * k);
  x.closePath(); x.fill(); x.stroke();
  x.lineWidth = k * 0.07; x.beginPath(); x.rect(-0.82 * k, 0.5 * k, 1.64 * k, 0.2 * k); x.fill(); x.stroke();
  x.fillStyle = '#fff3c4';
  for (const [px, py, pr] of [[0, -0.62, 0.13], [-0.95, -0.38, 0.11], [0.95, -0.38, 0.11]]) { circle(x, px * k, py * k, pr * k); x.fill(); }
}

const DRAW = {
  // gedrechselter Stein (Mühle, Dame, Reversi, Backgammon): a = 'w' | 'b', b = 'k' (Dame mit Krone)
  st(x, col, king) {
    const r = RS, w = col === 'w';
    shadow(x, r);
    x.fillStyle = w ? rg(x, -r * 0.08, -r * 0.12, 0, r * 1.3, [[0, '#fffef8'], [0.4, '#f2e6ce'], [0.78, '#d3bc93'], [1, '#9c8259']], -r * 0.32, -r * 0.44)
      : rg(x, -r * 0.08, -r * 0.12, 0, r * 1.3, [[0, '#7d6858'], [0.3, '#3d2d22'], [0.78, '#160d08'], [1, '#050302']], -r * 0.32, -r * 0.44);
    circle(x, 0, 0, r); x.fill();
    x.strokeStyle = w ? '#8d7651' : '#020101'; x.lineWidth = r * 0.05; x.stroke();
    edge(x, r, r * 0.1, w ? 0.75 : 0.6);
    x.strokeStyle = w ? 'rgba(120,90,50,.36)' : 'rgba(255,232,200,.17)'; x.lineWidth = r * 0.07; circle(x, 0, 0, r * 0.7); x.stroke();
    x.strokeStyle = w ? 'rgba(120,90,50,.2)' : 'rgba(255,232,200,.1)'; x.lineWidth = r * 0.05; circle(x, 0, 0, r * 0.36); x.stroke();
    spec(x, r, w ? 0.95 : 0.55, w ? 0.7 : 0.3);
    if (king === 'k') crown(x, r * 0.62);
  },
  // glänzende Kugel/Scheibe in Farbe a (Halma-Murmel, Ludo, Hold'em-Marke); b = 'r' mit hellem Ring
  ball(x, col, ring) {
    const r = RS;
    shadow(x, r, 0.16, 0.26);
    x.fillStyle = col; circle(x, 0, 0, r); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = r * 0.07; x.stroke();
    x.fillStyle = rg(x, -r * 0.07, -r * 0.12, 0, r * 1.2, [[0, 'rgba(255,255,255,.55)'], [0.35, 'rgba(255,255,255,.08)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.42)']], -r * 0.38, -r * 0.5);
    circle(x, 0, 0, r * 0.965); x.fill();
    if (ring === 'r') { x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = r * 0.08; circle(x, 0, 0, r * 0.66); x.stroke(); }
    spec(x, r, 0.9, 0.55);
  },
  // Vier-Stein (Kunststoff-Scheibe mit geprägtem Ring), ohne Schatten (liegt hinter der Platte)
  v4(x, col) {
    const r = RS;
    x.fillStyle = col; circle(x, 0, 0, r); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = r * 0.073; x.stroke();
    x.fillStyle = rg(x, -r * 0.07, -r * 0.12, 0, r * 1.2, [[0, 'rgba(255,255,255,.55)'], [0.35, 'rgba(255,255,255,.08)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.42)']], -r * 0.38, -r * 0.5);
    circle(x, 0, 0, r * 0.97); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = r * 0.12; circle(x, r * 0.036, r * 0.05, r * 0.66); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.42)'; x.lineWidth = r * 0.1; circle(x, 0, 0, r * 0.66); x.stroke();
    x.save(); x.translate(-r * 0.34, -r * 0.42); x.rotate(-0.52); x.scale(1, 0.53);
    x.fillStyle = 'rgba(255,255,255,.6)'; circle(x, 0, 0, r * 0.34); x.fill(); x.restore();
  },
  // Casino-Chip in Draufsicht (schräg: Höhe 0,42 der Breite) mit Kante, Randstreifen, Innenring, Glanz
  chip(x, col) {
    const r = RS, ry = r * 0.42, e = (cy, rx = r, ryy = ry) => { x.beginPath(); x.ellipse(0, cy, rx, ryy, 0, 0, Math.PI * 2); };
    x.fillStyle = 'rgba(0,0,0,.28)'; e(5 * r / 20); x.fill();
    x.fillStyle = col; e(3.5 * r / 20); x.fill(); x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = r * 0.075; x.stroke();
    const side = x.createLinearGradient(-r, 0, r, 0);
    side.addColorStop(0, 'rgba(0,0,0,.1)'); side.addColorStop(0.5, 'rgba(255,255,255,.12)'); side.addColorStop(1, 'rgba(0,0,0,.45)');
    x.fillStyle = side; e(3.5 * r / 20); x.fill();
    x.fillStyle = col; e(0); x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = r * 0.06; x.stroke();
    x.save(); x.setLineDash([r * 0.42, r * 0.36]); x.strokeStyle = '#fff7e6'; x.lineWidth = r * 0.13; e(0); x.stroke(); x.restore();
    x.strokeStyle = 'rgba(255,247,230,.55)'; x.lineWidth = r * 0.08; e(0, r * 0.62, ry * 0.62); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.22)'; e(-ry * 0.35, r * 0.45, ry * 0.32); x.save(); x.translate(-r * 0.25, 0); x.fill(); x.restore();
  },
  // Kaffeebohne (Blackjack-Einsatz)
  bean(x) {
    const k = RS / 13.5;
    x.scale(k, k);
    x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.ellipse(1.2, 2, 13.5, 9, 0, 0, 7); x.fill();
    x.fillStyle = rg(x, -2, -2.5, 0, 13, [[0, '#b8642e'], [0.55, '#8a3f1a'], [1, '#5a2510']], -4, -4);
    x.beginPath(); x.ellipse(0, 0, 13.5, 9, 0, 0, 7); x.fill(); x.strokeStyle = '#3d1708'; x.lineWidth = 1; x.stroke();
    x.strokeStyle = 'rgba(45,15,4,.75)'; x.lineWidth = 1.8; x.lineCap = 'round';
    x.beginPath(); x.moveTo(-8, 1.5); x.bezierCurveTo(-3, -4, 3, 4.5, 8, -1); x.stroke();
    x.save(); x.translate(-4.5, -4); x.rotate(-0.31); x.fillStyle = 'rgba(255,226,196,.45)'; x.beginPath(); x.ellipse(0, 0, 4.5, 2, 0, 0, 7); x.fill(); x.restore();
  },
  // Würfel mit Tiefe: a = Augen 0–6 (0 = leer)
  die(x, v) {
    v = Number(v);
    const size = RS * 1.62, h = size / 2, rx = size * 0.2;
    const rr = (a, b, w, hh, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + hh, r); x.arcTo(a + w, b + hh, a, b + hh, r); x.arcTo(a, b + hh, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
    x.fillStyle = `rgba(0,0,0,${v ? 0.3 : 0.12})`; rr(-h + size * 0.05, -h + size * 0.09, size, size, rx); x.fill();
    x.fillStyle = v ? rg(x, -size * 0.1, -size * 0.15, 0, size * 0.8, [[0, '#ffffff'], [0.55, '#f8f1e3'], [1, '#d9ccb2']]) : 'rgba(255,253,246,.55)';
    rr(-h, -h, size, size, rx); x.fill(); x.strokeStyle = '#6b5238'; x.lineWidth = size * 0.03; x.stroke();
    const gl = x.createLinearGradient(0, -h, 0, -h + size * 0.48);
    gl.addColorStop(0, 'rgba(255,255,255,.85)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gl; rr(-h + size * 0.08, -h + size * 0.06, size * 0.84, size * 0.42, rx * 0.75); x.fill();
    const o = size * 0.26;
    const P = { 1: [[0, 0]], 2: [[-o, -o], [o, o]], 3: [[-o, -o], [0, 0], [o, o]], 4: [[-o, -o], [o, -o], [-o, o], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] }[v] || [];
    for (const [px, py] of P) {
      x.fillStyle = rg(x, px - size * 0.02, py - size * 0.02, 0, size * 0.1, [[0, '#000'], [0.7, '#24170e'], [1, '#5a4636']]);
      circle(x, px, py, size * 0.092); x.fill();
      x.fillStyle = 'rgba(255,255,255,.18)'; circle(x, px + size * 0.022, py + size * 0.026, size * 0.05); x.fill();
    }
  }
};

const tileOf = (r) => (pxPerUnit ? tileFor(r * pxPerUnit) : S);
function onReady(key, tile, f) {
  const id = key + '@' + tile;
  if (!waiting.has(id)) waiting.set(id, []);
  waiting.get(id).push(f);
}
function makeImage(s, url, r, cx, cy) {
  const w = (S * r) / RS;
  return s('image', { href: url, x: cx - w / 2, y: cy - w / 2, width: w, height: w, class: 'dk-spr' });
}

// Bild-Element für eine Sorte, zentriert auf (0, 0); r = gewünschter Objekt-Radius in Brett-Einheiten.
// Ist die passende Kachel noch nicht fertig, kommt eine andere Größe; sie wird gegen die passende getauscht.
export function spriteImage(s, key, r, cx = 0, cy = 0) {
  const tile = tileOf(r);
  const url = sprite(key, tile);
  if (!url) return null;
  const img = makeImage(s, url, r, cx, cy);
  if (cache.get(key + '@' + tile) !== url) onReady(key, tile, (u) => img.setAttribute('href', u));
  return img;
}

// Stein wurde als Vektor gezeichnet (Bild noch nicht fertig): sobald es fertig ist, die Formen nodes durch das Bild
// ersetzen – nur wenn sie noch im Dokument hängen (sonst wurde längst neu gezeichnet). attrs: z. B. transform.
export function spriteLater(s, key, r, nodes, cx = 0, cy = 0, attrs = null) {
  if (!DEKO.on || !useSprites || typeof document === 'undefined' || !nodes.length) return;
  const tile = tileOf(r);
  if (cache.get(key + '@' + tile) === false) return;
  onReady(key, tile, (url) => {
    const first = nodes[0];
    if (!first.isConnected || !first.parentNode) return;
    const img = makeImage(s, url, r, cx, cy);
    if (attrs) for (const [k, v] of Object.entries(attrs)) img.setAttribute(k, v);
    first.parentNode.insertBefore(img, first);
    for (const n of nodes) n.remove();
  });
}
