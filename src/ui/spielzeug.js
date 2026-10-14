// Brett-Spielzeug (n10 E1): Wer auf den Holzrand des Bretts oder den Tisch daneben tippt, hört ein Holz-„Tock“ und
// sieht ein paar Staubkörnchen (nur bei Optik „Verziert“). Höchstens einmal je 0,5 s. Spielzüge bleiben unberührt:
// Nur der äußere Rand (RAND × kürzere Brettseite) zählt, und nur bei Brettern, deren Rand reines Holz ist; bei
// Kartentischen (Handkarten reichen bis an den Rand) nur die Fläche neben dem Brett. Und nur, wenn das Spiel mit dem
// Tipp nichts angefangen hat (manche Bretter nehmen Tipps am Rand für den nächsten Punkt, z. B. Mühle): Sieht das Brett
// STILL_MS nach dem Loslassen anders aus als beim Fingerauflegen, bleibt das Spielzeug still.
// Abschaltbar per ?spielzeug=0.
import { urlFlag } from './flags.js';
import { play } from './sound.js';
import { dust } from './fx.js';

export const RAND = 0.03;
export const PAUSE_MS = 500;
// Bretter mit reinem Holzrand ganz außen
export const RAND_SPIELE = new Set(['muehle', 'dame', 'schach', 'reversi', 'vier', 'ludo', 'halma']);
const TAP_PX = 8, TAP_MS = 450, STILL_MS = 80;

// Liegt (x, y) in der Spielzeug-Zone? r = Brett-Rechteck auf dem Bildschirm (viewBox), w = Behälter; rein → testbar
export function inToyZone(x, y, r, w, game) {
  if (!w || x < w.left || x > w.right || y < w.top || y > w.bottom) return false;
  if (!r) return false;
  const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  if (!inside) return true;
  if (!RAND_SPIELE.has(game)) return false;
  const band = RAND * Math.min(r.right - r.left, r.bottom - r.top);
  return x - r.left < band || r.right - x < band || y - r.top < band || r.bottom - y < band;
}

// Bildschirm-Rechteck der viewBox des Bretts
function boardRect(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal, m = svg.getScreenCTM && svg.getScreenCTM();
  if (!vb || !vb.width || !m) return null;
  const p = (x, y) => { const q = svg.createSVGPoint(); q.x = x; q.y = y; return q.matrixTransform(m); };
  const a = p(vb.x, vb.y), b = p(vb.x + vb.width, vb.y + vb.height);
  return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
}

export function boardToy(wrap, gameOf) {
  if (!urlFlag('spielzeug', true)) return () => {};
  let down = null, last = 0, timer = 0;
  // Stand des Bretts beim Fingerauflegen (nur in der Spielzeug-Zone): hat das Spiel den Tipp genutzt (Auswahl, Zug,
  // Hinweis), sieht das Brett danach anders aus. Gleich neu gezeichnete Hinweise zählen nicht.
  const snap = () => wrap.innerHTML;
  const zone = (x, y) => {
    const svg = wrap.querySelector('svg.board');
    return !!svg && inToyZone(x, y, boardRect(svg), wrap.getBoundingClientRect(), gameOf());
  };
  const onDown = (e) => {
    clearTimeout(timer);
    down = Date.now() - last >= PAUSE_MS && zone(e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY, at: Date.now(), id: e.pointerId, html: snap() } : null;
  };
  const onUp = (e) => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId || Date.now() - d.at > TAP_MS || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) return;
    if (e.target && e.target.closest && e.target.closest('button, .overlay:not(.hidden), .evalbar')) return;
    const p = [e.clientX, e.clientY];
    timer = setTimeout(() => {
      if (snap() !== d.html) return;
      last = Date.now();
      wrap.dataset.toy = String(Number(wrap.dataset.toy || 0) + 1);   // Tests: wie oft hat das Spielzeug reagiert
      play('tock');
      dust(p, { count: 6 });
    }, STILL_MS);
  };
  wrap.addEventListener('pointerdown', onDown, { capture: true, passive: true });   // vor dem Brett: Stand vor jeder Reaktion
  wrap.addEventListener('pointerup', onUp, { passive: true });
  return () => { clearTimeout(timer); wrap.removeEventListener('pointerdown', onDown, { capture: true }); wrap.removeEventListener('pointerup', onUp); };
}
