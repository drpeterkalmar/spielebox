// Verzierungen („Deko“, Verschönerung 05.10.2026): Licht, Material, kleine Effekte – ressourcenschonend.
// Stufen: 0 = altes Aussehen (A/B-Vergleich: ?deko=0), 1 = Licht und Material (alles statisch, keine Partikel),
// 2 = zusätzlich Effekte (Funken, Staub, Konfetti, Sieg-Animation). Standard 2; Einstellung „Optik“ bzw. ?deko=0|1|2.
// Grundsätze: Statisches (Holz, Filz, Licht, Schatten) wird einmal in eine eigene Ebene unter das Brett gezeichnet und
// danach nicht mehr neu gerastert – Zug-Animationen malen nur die bewegten Steine. Keine Dauer-Animation im Leerlauf,
// Effekte laufen nur kurz und nur bei sichtbarem Tab; prefers-reduced-motion → keine Partikel und kein Wackeln.
// Auto-Drosselung: Während eines Effekts werden die Frame-Zeiten gemessen; sind sie zu lang, gibt es erst weniger
// Partikel, dann keine mehr (gemerkt in den Einstellungen, „Optik“ setzt es zurück).
import * as store from '../store.js';

const urlLevel = () => {
  try { const v = new URLSearchParams(location.search).get('deko'); return v === '0' || v === '1' || v === '2' ? Number(v) : null; } catch { return null; }
};
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function settingLevel() {
  const st = store.settings();
  return st.deko === 0 || st.deko === 1 || st.deko === 2 ? st.deko : 2;
}

export const DEKO = {
  level: 2,
  url: null,          // per URL erzwungen (A/B) → Einstellung zeigt das an
  quality: 1,         // Partikel-Menge 1 / 0.5 / 0 (Auto-Drosselung)
  get on() { return this.level > 0; },
  // Effekte (Partikel, Sieg-Animation): Stufe 2, nicht bei reduzierter Bewegung, nicht abgeschaltet
  get fx() { return this.level >= 2 && !reducedMotion() && this.quality > 0; },
  get reduced() { return reducedMotion(); }
};

export function readDeko() {
  DEKO.url = urlLevel();
  DEKO.level = DEKO.url ?? settingLevel();
  const q = store.settings().dekoQ;
  DEKO.quality = q === 0 || q === 0.5 ? q : 1;
  return DEKO;
}

// Einstellung „Optik“ speichern (Auto-Drosselung zurücksetzen) und sofort anwenden
export function setDekoLevel(level) {
  const st = store.settings();
  st.deko = level;
  delete st.dekoQ;
  store.saveSettings(st);
  DEKO.quality = 1;
  if (DEKO.url === null) DEKO.level = level;
  applyDeko();
  for (const fn of listeners) { try { fn(DEKO); } catch { /* egal */ } }
}

const listeners = new Set();
export function onDeko(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------- Hintergrund: Filz mit warmem Licht von oben und Vignette (einmal gerastert, eigene Ebene) ----------
let noiseUrl = null, noisePending = null;

// Filz-Kachel (256 px): feines Rauschen + kurze helle/dunkle Fasern, einmal je Sitzung erzeugt (Blob-URL, kein Netz)
export function feltNoise() {
  if (noiseUrl || noisePending || typeof document === 'undefined') return noiseUrl;
  try {
    const N = 256;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N);
    let seed = 0x9e3779b9;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 10000) / 10000; };
    // Rauschen: 2 Oktaven, wechselnd hell/dunkel, sehr leise
    const coarse = new Float32Array((N / 4) * (N / 4)).map(() => rnd() * 2 - 1);
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const v = 0.55 * (rnd() * 2 - 1) + 0.45 * coarse[(yy >> 2) * (N / 4) + (xx >> 2)];
      const i = (yy * N + xx) * 4;
      const light = v > 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = Math.round(Math.abs(v) * (light ? 15 : 24));
    }
    x.putImageData(img, 0, 0);
    // Fasern (nahtlos: auch über den Rand gespiegelt)
    x.lineCap = 'round';
    for (let k = 0; k < 900; k++) {
      const px = rnd() * N, py = rnd() * N, a = rnd() * Math.PI, l = 2 + rnd() * 6;
      x.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)';
      x.lineWidth = 0.6 + rnd() * 0.6;
      for (const [ox, oy] of [[0, 0], [-N, 0], [0, -N], [-N, -N], [N, 0], [0, N]]) {
        x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l); x.stroke();
      }
    }
    noisePending = new Promise((resolve) => c.toBlob((b) => {
      noiseUrl = b ? URL.createObjectURL(b) : c.toDataURL();
      document.documentElement.style.setProperty('--deko-noise', `url("${noiseUrl}")`);
      for (const fn of noiseWaiters) fn(noiseUrl);
      noiseWaiters.length = 0;
      resolve(noiseUrl);
    }, 'image/png'));
  } catch { /* ohne Rauschen weiter */ }
  return noiseUrl;
}
const noiseWaiters = [];
export function whenNoise(fn) { if (noiseUrl) fn(noiseUrl); else noiseWaiters.push(fn); }

let bgEl = null;
export function applyDeko() {
  const root = document.documentElement;
  root.classList.toggle('deko', DEKO.on);
  root.classList.toggle('deko-fx', DEKO.fx);
  if (DEKO.on && !bgEl) {
    feltNoise();
    bgEl = document.createElement('div');
    bgEl.id = 'deko-bg';
    bgEl.setAttribute('aria-hidden', 'true');
    document.body.prepend(bgEl);
  }
  if (bgEl) bgEl.hidden = !DEKO.on;
}

// ---------- Ebenen: Statisches unter (bzw. über) dem Brett, einmal gerastert ----------
const NS = 'http://www.w3.org/2000/svg';

// Legt neben svg (im selben Behälter) eine Ebene darunter („under“) und eine darüber („over“, ohne Tipp-Ziele) an –
// gleiche viewBox, gleiche Größe. Die Ebenen tragen auch die Klasse „board“ (Stile gelten), stehen aber im DOM nach
// dem Brett (document.querySelector('svg.board') findet weiter das Brett) und werden per z-index einsortiert.
// Ohne Deko: null (die Ansicht zeichnet wie bisher alles ins Brett).
export function boardLayers(svg, host, { over = false } = {}) {
  if (!DEKO.on) return null;
  const mk = (cls) => {
    const el = document.createElementNS(NS, 'svg');
    // gleiche Klassen wie das Brett (Stile wie .board .x und .board-vier .x gelten auch hier)
    el.setAttribute('class', `${svg.getAttribute('class') || 'board'} deko-layer ${cls}`);
    el.setAttribute('aria-hidden', 'true');
    for (const a of ['viewBox', 'preserveAspectRatio']) if (svg.hasAttribute(a)) el.setAttribute(a, svg.getAttribute(a));
    host.appendChild(el);
    return el;
  };
  const under = mk('deko-under');
  const top = over ? mk('deko-over') : null;
  // viewBox der Ansicht folgen (Dame 8×8 ↔ 10×10, Backgammon/Schiffe hoch ↔ quer)
  const mo = new MutationObserver(() => {
    const vb = svg.getAttribute('viewBox');
    if (vb) { under.setAttribute('viewBox', vb); if (top) top.setAttribute('viewBox', vb); }
  });
  mo.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
  svg.classList.add('deko-main');
  const rm = svg.remove.bind(svg);
  svg.remove = () => { mo.disconnect(); under.remove(); if (top) top.remove(); rm(); };
  return { under, over: top };
}

// ---------- Effekte nur bei sichtbarem Tab; Auto-Drosselung ----------
// Während Brett-Effekte laufen (höchstens ms lang), Frame-Abstände sammeln und danach melden – kein Dauer-Loop
let watchEnd = 0, watchRaf = 0, watchLast = 0, watchDts = [];
export function watchFrames(ms) {
  if (!ms || typeof requestAnimationFrame !== 'function') return;
  watchEnd = Math.max(watchEnd, performance.now() + Math.min(ms, 3000));
  if (watchRaf) return;
  watchLast = 0; watchDts = [];
  const tick = (ts) => {
    if (watchLast) watchDts.push(ts - watchLast);
    watchLast = ts;
    if (ts < watchEnd && !document.hidden) { watchRaf = requestAnimationFrame(tick); return; }
    watchRaf = 0;
    if (watchDts.length > 20) reportFxFrames(watchDts);
  };
  watchRaf = requestAnimationFrame(tick);
}

// Frame-Zeiten eines Effekts melden: zu oft > 34 ms → Qualität halbieren, beim zweiten Mal Effekte aus (gemerkt)
let strikes = 0;
export function reportFxFrames(dts) {
  if (!dts.length || document.hidden) return;
  const slow = dts.filter((d) => d > 34).length / dts.length;
  if (slow < 0.3) { strikes = Math.max(0, strikes - 1); return; }
  strikes++;
  if (strikes < 2) return;
  strikes = 0;
  DEKO.quality = DEKO.quality >= 1 ? 0.5 : 0;
  const st = store.settings();
  st.dekoQ = DEKO.quality;
  store.saveSettings(st);
  document.documentElement.classList.toggle('deko-fx', DEKO.fx);
}
