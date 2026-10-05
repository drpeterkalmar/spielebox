// Sieg-Animation (Deko-Stufe 2): wenn eine Partie gerade live endet (nicht beim Neuladen), nach dem letzten Zug.
// Gewinnt dieses Gerät (bzw. zu zweit am Gerät: jemand), gibt es Konfetti über dem Brett und dazu einen Akzent je Spiel
// (Gewinnersteine hüpfen, König kippt um, Chips regnen …, siehe celebrate() der Ansichten). Dauer ≈ 2,5 s, danach
// steht alles still. Bei reduzierter Bewegung oder abgeschalteten Effekten: nichts davon.
import { DEKO } from './deko.js';
import { confetti, cannons, rain, stars } from './fx.js';

// Steine einer Liste der Reihe nach kurz hüpfen lassen (Elemente mit place()-Lage)
export function hopWave(els, { delay = 0, step = 70, up = 1.22 } = {}) {
  if (!DEKO.fx) return;
  els.forEach((el, k) => {
    if (!el || !el.animate || el.dataset.x === undefined) return;
    const t = `translate(${el.dataset.x}px, ${el.dataset.y}px)`;
    el.animate([{ transform: `${t} scale(1)` }, { transform: `${t} scale(${up})`, offset: 0.45, easing: 'ease-in' }, { transform: `${t} scale(.96)`, offset: 0.8 }, { transform: `${t} scale(1)` }],
      { duration: 520, delay: delay + k * step, easing: 'ease-out' });
  });
}

// t = Tisch (status over), view = Brett-Ansicht, wrap = Brett-Behälter, mine = dieses Gerät hat gewonnen, delay = bis der Zug liegt
export function celebrate({ t, view, wrap, mine, delay = 0, game }) {
  if (!DEKO.fx || !t || !t.result) return;
  const winner = t.result.winner;
  if (winner === null || winner === undefined) return;   // Remis: kein Konfetti
  setTimeout(() => {
    if (!wrap.isConnected || document.hidden) return;
    const r = wrap.getBoundingClientRect();
    if (view && view.celebrate) { try { view.celebrate({ winner, mine }); } catch { /* Deko darf nie stören */ } }
    if (!mine) return;
    const big = { left: r.left, top: r.top, width: r.width, height: r.height };
    if (game === 'holdem') rain('chips', { rect: big, count: 36 });
    else if (game === 'blackjack') rain('beans', { rect: big, count: 34 });
    confetti({ rect: big, count: 90 });
    cannons({ rect: big, count: 34 });
    stars([r.left + r.width / 2, r.top + r.height * 0.42], { count: 10, spread: 7, size: 26 });
  }, Math.max(0, delay));
}
