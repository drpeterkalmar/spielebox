// Kleine Effekte (nur Deko-Stufe 2): Funken, Staub, Spritzer, Sterne, Konfetti, Chips – ein Canvas über dem Bild.
// Sparsam gebaut: fester Partikel-Pool (typisierte Felder, keine Objekte je Partikel → keine GC-Spitzen), alle Sprites
// einmal in einen kleinen Atlas vorgezeichnet, additive Sprites statt Weichzeichner. Der Canvas ist nur sichtbar und
// die Schleife läuft nur, solange Partikel leben (kein Dauer-Loop); bei verstecktem Tab wird alles verworfen.
// Während eines Effekts werden die Frame-Zeiten gemessen (deko.js: Auto-Drosselung). Zeiten in ms, Orte in CSS-Pixeln.
import { DEKO, reportFxFrames } from './deko.js';
import { toScreen } from './svg.js';

const MAX = 400;
const X = new Float32Array(MAX), Y = new Float32Array(MAX), VX = new Float32Array(MAX), VY = new Float32Array(MAX);
const AGE = new Float32Array(MAX), LIFE = new Float32Array(MAX), SIZE = new Float32Array(MAX), GROW = new Float32Array(MAX);
const ROT = new Float32Array(MAX), VR = new Float32Array(MAX), DRAG = new Float32Array(MAX), GRAV = new Float32Array(MAX);
const SPR = new Uint8Array(MAX), ADD = new Uint8Array(MAX), FLUT = new Uint8Array(MAX), DELAY = new Float32Array(MAX);
let n = 0;

const CELL = 64;
// Sprites: Name → Index im Atlas
const SPRITES = ['spark', 'sparkW', 'dust', 'smoke', 'drop', 'star', 'fire',
  'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'chipR', 'chipB', 'chipG', 'chipK', 'bean'];
const IDX = Object.fromEntries(SPRITES.map((k, i) => [k, i]));
const CONFETTI = ['#e8463b', '#f2c230', '#3a8ee8', '#3cc47a', '#b45ee0', '#ff8a3d'];
let atlas = null;

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = CELL * 6; c.height = CELL * Math.ceil(SPRITES.length / 6);
  const g = c.getContext('2d');
  const at = (k) => { const i = IDX[k]; return [(i % 6) * CELL + CELL / 2, Math.floor(i / 6) * CELL + CELL / 2]; };
  const glow = (k, inner, outer) => {
    const [x, y] = at(k);
    const r = g.createRadialGradient(x, y, 0, x, y, CELL / 2);
    r.addColorStop(0, inner); r.addColorStop(0.25, outer); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  };
  glow('spark', 'rgba(255,250,220,1)', 'rgba(255,190,60,.55)');
  glow('sparkW', 'rgba(255,255,255,1)', 'rgba(170,220,255,.5)');
  glow('fire', 'rgba(255,240,180,1)', 'rgba(255,110,20,.6)');
  const puff = (k, rgb, a) => {
    const [x, y] = at(k);
    const r = g.createRadialGradient(x, y, 0, x, y, CELL / 2);
    r.addColorStop(0, `rgba(${rgb},${a})`); r.addColorStop(0.6, `rgba(${rgb},${a * 0.45})`); r.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = r; g.beginPath(); g.arc(x, y, CELL / 2, 0, 7); g.fill();
  };
  puff('dust', '196,170,130', 0.75);
  puff('smoke', '60,58,56', 0.7);
  { // Tropfen
    const [x, y] = at('drop');
    const r = g.createRadialGradient(x - 4, y - 5, 1, x, y, 16);
    r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(0.5, 'rgba(190,225,255,.8)'); r.addColorStop(1, 'rgba(120,180,240,0)');
    g.fillStyle = r; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill();
  }
  { // Stern (4 Zacken) mit Glühen
    const [x, y] = at('star');
    glow('star', 'rgba(255,248,210,.9)', 'rgba(255,200,80,.25)');
    g.fillStyle = 'rgba(255,246,200,1)';
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? 5 : 26; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  CONFETTI.forEach((col, i) => { // Konfetti: kleines Rechteck mit heller Kante
    const [x, y] = at('c' + i);
    g.fillStyle = col; g.fillRect(x - 22, y - 12, 44, 24);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 22, y - 12, 44, 7);
  });
  [['chipR', '#c63a2f'], ['chipB', '#2f63c6'], ['chipG', '#2e8b57'], ['chipK', '#232323']].forEach(([k, col]) => {
    const [x, y] = at(k);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 1, y + 3, 22, 22, 0, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
    g.strokeStyle = '#fff6e0'; g.lineWidth = 5; g.setLineDash([7, 6.8]); g.beginPath(); g.arc(x, y, 19, 0, 7); g.stroke(); g.setLineDash([]);
    g.strokeStyle = 'rgba(255,246,224,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12, 0, 7); g.stroke();
  });
  { // Bohne
    const [x, y] = at('bean');
    g.fillStyle = '#7a3f1d'; g.beginPath(); g.ellipse(x, y, 26, 17, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,16,4,.7)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 16, y + 2); g.bezierCurveTo(x - 5, y - 9, x + 5, y + 9, x + 16, y - 2); g.stroke();
    g.fillStyle = 'rgba(255,220,180,.4)'; g.beginPath(); g.ellipse(x - 9, y - 7, 9, 4, -0.4, 0, 7); g.fill();
  }
  return c;
}

let canvas = null, ctx = null, raf = 0, last = 0, dpr = 1, W = 0, H = 0;
let frames = [];
const timers = new Set();
// Die Leinwand ist nur so groß wie die laufenden Effekte (z. B. eine Staubwolke ≈ 150 px statt des ganzen Bildes):
// weniger Pixel zu löschen und zusammenzusetzen. B = gewünschter Bereich, C = aktuelle Lage der Leinwand (CSS-px).
const B = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
const C = { x: 0, y: 0, w: 0, h: 0 };

function ensureCanvas() {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'deko-fx';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    atlas = atlas || makeAtlas();
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  }
  canvas.hidden = false;
  const d = Math.min(1.25, devicePixelRatio || 1);   // Partikel sind weich – volle Auflösung lohnt nicht
  if (d !== dpr) { dpr = d; A.w = A.h = 0; }
  W = innerWidth; H = innerHeight;
}

// Leinwand an den Bereich B anpassen: wächst nur, wenn nötig (Größe auf 64 px gerundet), sonst wird die vorhandene
// Leinwand nur verschoben – so muss für die vielen kleinen Effekte (Staub, Funken) kein neuer Speicher her.
const A = { w: 0, h: 0 };   // angelegte Größe (CSS-px)
function fit() {
  const x0 = Math.max(0, Math.floor(B.x0)), y0 = Math.max(0, Math.floor(B.y0));
  const x1 = Math.min(W, Math.ceil(B.x1)), y1 = Math.min(H, Math.ceil(B.y1));
  if (x1 <= x0 || y1 <= y0) return;
  if (raf && x0 >= C.x && y0 >= C.y && x1 <= C.x + C.w && y1 <= C.y + C.h) return;   // passt schon
  // läuft schon ein Effekt: Bereich vereinigen
  const nx = raf ? Math.min(x0, C.x) : x0, ny = raf ? Math.min(y0, C.y) : y0;
  const nw = (raf ? Math.max(x1, C.x + C.w) : x1) - nx, nh = (raf ? Math.max(y1, C.y + C.h) : y1) - ny;
  if (nw > A.w || nh > A.h) {
    A.w = Math.min(Math.ceil(W / 64) * 64, Math.max(A.w, Math.ceil(nw / 64) * 64));
    A.h = Math.min(Math.ceil(H / 64) * 64, Math.max(A.h, Math.ceil(nh / 64) * 64));
    canvas.width = Math.round(A.w * dpr); canvas.height = Math.round(A.h * dpr);
    canvas.style.width = A.w + 'px'; canvas.style.height = A.h + 'px';
  }
  Object.assign(C, { x: Math.max(0, Math.min(nx, W - A.w)), y: Math.max(0, Math.min(ny, H - A.h)), w: A.w, h: A.h });
  canvas.style.transform = `translate(${C.x}px, ${C.y}px)`;
}

function spawn(o) {
  if (n >= MAX) return;
  // Reichweite grob abschätzen (Geschwindigkeit mit Bremse, Schwerkraft, Größe) → Bereich der Leinwand
  const life = (o.life || 600) / 16.7, sz = (o.size || 10) + (o.grow || 0);
  const v = Math.hypot(o.vx || 0, o.vy || 0), d = o.drag ?? 0.9;
  const ext = Math.min(700, sz + v * Math.min(life, 1 / Math.max(0.01, 1 - d)) + 0.5 * (o.grav || 0) * life * life * 0.6);
  B.x0 = Math.min(B.x0, o.x - ext); B.y0 = Math.min(B.y0, o.y - ext - 20);
  B.x1 = Math.max(B.x1, o.x + ext); B.y1 = Math.max(B.y1, o.y + ext + (o.grav ? ext : 0));
  const i = n++;
  X[i] = o.x; Y[i] = o.y; VX[i] = o.vx || 0; VY[i] = o.vy || 0;
  AGE[i] = 0; LIFE[i] = o.life || 600; SIZE[i] = o.size || 10; GROW[i] = o.grow || 0;
  ROT[i] = o.rot || 0; VR[i] = o.vr || 0; DRAG[i] = o.drag ?? 0.9; GRAV[i] = o.grav || 0;
  SPR[i] = IDX[o.spr] ?? 0; ADD[i] = o.add ? 1 : 0; FLUT[i] = o.flutter ? 1 : 0; DELAY[i] = o.delay || 0;
}

function kill(i) {
  const j = --n;
  if (i === j) return;
  X[i] = X[j]; Y[i] = Y[j]; VX[i] = VX[j]; VY[i] = VY[j]; AGE[i] = AGE[j]; LIFE[i] = LIFE[j]; SIZE[i] = SIZE[j]; GROW[i] = GROW[j];
  ROT[i] = ROT[j]; VR[i] = VR[j]; DRAG[i] = DRAG[j]; GRAV[i] = GRAV[j]; SPR[i] = SPR[j]; ADD[i] = ADD[j]; FLUT[i] = FLUT[j]; DELAY[i] = DELAY[j];
}

function start() {
  fit();
  if (raf || frozen) return;
  last = 0;
  frames = [];
  raf = requestAnimationFrame(tick);
}

function tick(ts) {
  raf = 0;
  const dt = last ? Math.min(50, ts - last) : 16;
  if (last) frames.push(ts - last);
  last = ts;
  const k = dt / 16.67;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = n - 1; i >= 0; i--) {
    if (DELAY[i] > 0) { DELAY[i] -= dt; continue; }
    AGE[i] += dt;
    if (AGE[i] >= LIFE[i]) { kill(i); continue; }
    const d = Math.pow(DRAG[i], k);
    VX[i] *= d; VY[i] = VY[i] * d + GRAV[i] * k;
    X[i] += VX[i] * k; Y[i] += VY[i] * k; ROT[i] += VR[i] * k;
  }
  // zwei Durchgänge: normal (Staub, Konfetti, Chips), dann additiv (Funken, Sterne, Feuer)
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      if (ADD[i] !== pass || DELAY[i] > 0) continue;
      const t = AGE[i] / LIFE[i];
      const a = t < 0.12 ? t / 0.12 : 1 - Math.max(0, (t - 0.55) / 0.45);
      const sz = (SIZE[i] + GROW[i] * t) * dpr / CELL;
      const c = Math.cos(ROT[i]) * sz, s = Math.sin(ROT[i]) * sz;
      const fx = FLUT[i] ? Math.cos(ROT[i] * 2.3) : 1;   // Konfetti flattert
      ctx.globalAlpha = a;
      ctx.setTransform(c * fx, s * fx, -s, c, (X[i] - C.x) * dpr, (Y[i] - C.y) * dpr);
      const si = SPR[i];
      ctx.drawImage(atlas, (si % 6) * CELL, Math.floor(si / 6) * CELL, CELL, CELL, -CELL / 2, -CELL / 2, CELL, CELL);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (n > 0) raf = requestAnimationFrame(tick);
  else stop();
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  if (canvas) canvas.hidden = true;
  Object.assign(B, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  if (frames.length > 20) reportFxFrames(frames);
  frames = [];
}

// alles verwerfen (Tisch verlassen, Tab versteckt)
export function clear() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
  n = 0;
  stop();
}

const ok = () => DEKO.fx && typeof document !== 'undefined' && !document.hidden;
const cnt = (k) => Math.max(1, Math.round(k * DEKO.quality));
const rnd = (a, b) => a + Math.random() * (b - a);

// Brett-Koordinaten → Bildschirm (CSS-Pixel)
export function at(svg, x, y) {
  try { return toScreen(svg, x, y); } catch { return null; }
}

// später auslösen (z. B. wenn der Stein angekommen ist); fällt aus, wenn Effekte aus sind
export function later(ms, fn) {
  if (!ok()) return;
  if (ms <= 0) { fn(); return; }
  const t = setTimeout(() => { timers.delete(t); if (ok()) fn(); }, ms);
  timers.add(t);
}

function begin() { if (!ok()) return false; ensureCanvas(); return true; }

// ---------- Effekte (groß und selten: Sieg, Fünferpasch, eigenes Spiel gewonnen) ----------
// Brett-Effekte (Staub, Funken, Explosion …) liegen direkt im Brett: fxsvg.js
// Sterne (großer Erfolg: Fünferpasch, Black Jack, Ziel erreicht)
export function stars(p, { count = 8, spread = 4, size = 20 } = {}) {
  if (!p || !begin()) return;
  for (let k = cnt(count); k > 0; k--) {
    const a = rnd(0, 6.28), v = rnd(0.5, 1) * spread;
    spawn({ x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: rnd(700, 1000), size: size * rnd(0.7, 1.2), vr: rnd(-0.08, 0.08), drag: 0.93, grav: 0.04, spr: 'star', add: true });
  }
  start();
}

// Konfetti von oben (Sieg); rect = Bereich (Brett), sonst ganzes Bild
export function confetti({ rect = null, count = 110, life = 2600 } = {}) {
  if (!begin()) return;
  const x0 = rect ? rect.left : 0, w = rect ? rect.width : W, y0 = rect ? rect.top : 0;
  for (let k = cnt(count); k > 0; k--) {
    spawn({ x: x0 + rnd(0, w), y: y0 - rnd(10, 160), vx: rnd(-0.8, 0.8), vy: rnd(1.4, 3.2), life: rnd(life * 0.7, life), size: rnd(10, 15), vr: rnd(-0.18, 0.18), rot: rnd(0, 6.28), drag: 0.985, grav: 0.035, spr: 'c' + Math.floor(rnd(0, 6)), flutter: true, delay: rnd(0, 500) });
  }
  start();
}

// Konfetti-Kanonen von beiden Seiten unten (großer Sieg)
export function cannons({ rect = null, count = 50 } = {}) {
  if (!begin()) return;
  const r = rect || { left: 0, top: 0, width: W, height: H };
  for (const side of [0, 1]) {
    const x = side ? r.left + r.width : r.left, y = r.top + r.height * 0.92;
    for (let k = cnt(count); k > 0; k--) {
      const a = side ? rnd(-2.45, -1.9) : rnd(-1.25, -0.7), v = rnd(7, 13);
      spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(1700, 2500), size: rnd(10, 14), vr: rnd(-0.2, 0.2), rot: rnd(0, 6.28), drag: 0.955, grav: 0.16, spr: 'c' + Math.floor(rnd(0, 6)), flutter: true, delay: rnd(0, 180) });
    }
  }
  start();
}

// Chips regnen (Hold'em-Turniersieg) bzw. Bohnen (Blackjack)
export function rain(kind = 'chips', { rect = null, count = 40 } = {}) {
  if (!begin()) return;
  const x0 = rect ? rect.left : 0, w = rect ? rect.width : W, y0 = rect ? rect.top : 0;
  const spr = kind === 'beans' ? ['bean'] : ['chipR', 'chipB', 'chipG', 'chipK'];
  for (let k = cnt(count); k > 0; k--) {
    spawn({ x: x0 + rnd(0, w), y: y0 - rnd(10, 120), vx: rnd(-0.6, 0.6), vy: rnd(2, 4), life: rnd(1500, 2200), size: rnd(16, 24), vr: rnd(-0.1, 0.1), rot: rnd(0, 6.28), drag: 0.99, grav: 0.12, spr: spr[k % spr.length], flutter: kind !== 'beans', delay: rnd(0, 600) });
  }
  start();
}

// Tests/Prüfbilder: alles anhalten (Canvas-Schleife und alle Animationen der Seite) bzw. weiterlaufen lassen
let frozen = false;
export function freeze(on = true) {
  frozen = !!on;
  for (const a of document.getAnimations()) { if (on) a.pause(); else a.play(); }
  if (on && raf) { cancelAnimationFrame(raf); raf = 0; }
  else if (!on && n > 0 && !raf) { last = 0; raf = requestAnimationFrame(tick); }
}

// Tests: läuft gerade ein Effekt? wie viele Partikel?
export function fxState() { return { particles: n, running: !!raf, canvas: !!canvas && !canvas.hidden }; }

export const fx = { at, later, stars, confetti, cannons, rain, clear, state: fxState };
