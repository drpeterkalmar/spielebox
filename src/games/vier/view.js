// Vier in einer Reihe als SVG: blaue Platte mit 7 × 6 Löchern, darüber eine Einwurf-Reihe. Die Steine liegen hinter der
// Platte und fallen sichtbar hinunter (Dauer aus tempo.js). Bedienung: Spalte antippen → Stein schwebt über der Spalte,
// nochmal antippen → einwerfen (Schutz vor Fehltipps, wie das Ausspielen bei Schnapsen). Gewinnreihe leuchtet.
import { COLS, ROWS } from './engine.js';
import { s, ensureDefs, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { OWN, vierFall } from '../../tempo.js';

const U = 100, F = 20, R = 41;
const W = COLS * U + 2 * F, H = (ROWS + 1) * U + 2 * F;
const COLORS = ['#d8453b', '#f2c230'];
const cx = (c) => F + c * U + U / 2;
const cy = (r) => F + (ROWS - r) * U + U / 2;   // r = 0 unten; Einwurf-Reihe = r 6
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'board board-vier', role: 'img', 'aria-label': 'Vier in einer Reihe' });
  const gBack = s('g'), gStones = s('g', { class: 'pieces' }), gPlate = s('g'), gTop = s('g', { class: 'hints' });
  svg.append(gBack, gStones, gPlate, gTop);
  host.appendChild(svg);

  let gs = null, legal = null, sel = null, hint = '', me = 0;
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };

  // Platte mit Löchern (evenodd), Rahmen, Füße
  (function drawPlate() {
    gBack.append(s('rect', { x: F - 6, y: F + U - 6, width: COLS * U + 12, height: ROWS * U + 12, rx: 18, fill: 'rgba(10,30,70,.55)' }));
    let d = `M ${F - 8} ${F + U - 8} h ${COLS * U + 16} v ${ROWS * U + 16} h ${-(COLS * U + 16)} Z`;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) d += ` M ${cx(c) - R - 3} ${cy(r)} a ${R + 3} ${R + 3} 0 1 0 ${2 * R + 6} 0 a ${R + 3} ${R + 3} 0 1 0 ${-(2 * R + 6)} 0`;
    gPlate.append(s('path', { d, class: 'v4-plate', 'fill-rule': 'evenodd' }));
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) gPlate.append(s('circle', { cx: cx(c), cy: cy(r), r: R + 3, class: 'v4-rim' }));
  })();

  function stone(seat, c, r, cls = '') {
    const g = s('g', { class: 'v4-stone ' + cls, transform: `translate(${cx(c)} ${cy(r)})`, 'data-c': c, 'data-r': r });
    g.append(s('circle', { r: R, fill: COLORS[seat], stroke: 'rgba(0,0,0,.45)', 'stroke-width': 3 }),
      s('circle', { r: R * 0.68, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 4 }),
      s('circle', { r: R * 0.36, fill: 'rgba(0,0,0,.08)' }));
    return g;
  }

  function render(info, ctx) {
    gStones.textContent = '';
    gTop.textContent = '';
    gs.cols.forEach((col, c) => col.forEach((seat, r) => gStones.append(stone(seat, c, r))));
    // letzter Stein markiert
    const lm = info && info.lastCol !== undefined ? info.lastCol : null;
    if (lm !== null && gs.cols[lm] && gs.cols[lm].length) gTop.append(s('circle', { cx: cx(lm), cy: cy(gs.cols[lm].length - 1), r: 12, class: 'v4-last' }));
    // Gewinnreihe
    if (gs.win && gs.win.line) {
      for (const [c, r] of gs.win.line) gTop.append(s('circle', { cx: cx(c), cy: cy(r), r: R + 2, class: 'v4-win' }));
    }
    if (!legal) { setHint(''); return; }
    const cols = legal.map((m) => m.col);
    if (sel !== null && cols.includes(sel)) {
      gTop.append(s('rect', { x: cx(sel) - U / 2 + 4, y: F + U - 4, width: U - 8, height: ROWS * U + 8, rx: 14, class: 'v4-col' }));
      gTop.append(stone(gs.turn, sel, ROWS, 'hover'));
      const r = gs.cols[sel].length;
      gTop.append(s('circle', { cx: cx(sel), cy: cy(r), r: 16, class: 'hint-dot' }));
      setHint('Nochmal antippen zum Einwerfen – oder andere Spalte wählen.');
    } else {
      for (const c of cols) gTop.append(s('path', { d: `M ${cx(c) - 18} ${F + 34} L ${cx(c) + 18} ${F + 34} L ${cx(c)} ${F + 62} Z`, class: 'v4-arrow' }));
      setHint('Tippe eine Spalte an.');
    }
  }

  function fall(c, r, dur, delay = 0) {
    const el = gStones.querySelector(`[data-c="${c}"][data-r="${r}"]`);
    if (!el || !el.animate || reduced() || dur <= 0) return;
    const y0 = cy(ROWS), y1 = cy(r), x = cx(c);
    const bounce = Math.min(14, 4 + (y1 - y0) / 40);
    el.animate([
      { transform: `translate(${x}px, ${y0}px)`, easing: 'cubic-bezier(.55,0,1,.6)' },
      { transform: `translate(${x}px, ${y1}px)`, offset: 0.78, easing: 'ease-out' },
      { transform: `translate(${x}px, ${y1 - bounce}px)`, offset: 0.89, easing: 'ease-in' },
      { transform: `translate(${x}px, ${y1}px)` }
    ], { duration: dur, delay, fill: delay > 0 ? 'backwards' : 'none' });
  }

  let lastCtx = {};
  function tapCol(c) {
    if (!legal || c === null) return;
    const m = legal.find((x) => x.col === c);
    if (!m) { sel = null; return render(null, lastCtx); }
    if (sel === c) { sel = null; legal = null; gTop.textContent = ''; onMove(m); return; }
    sel = c;
    render(null, lastCtx);
  }

  onTap(svg, (x, y) => {
    const p = toBoard(svg, x, y);
    if (!p) return;
    const c = Math.floor((p[0] - F) / U);
    tapCol(c >= 0 && c < COLS ? c : null);
  });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      gs = t.gs;
      me = typeof ctx.viewer === 'number' ? ctx.viewer : 0;
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) sel = null;
      lastCtx = ctx;
      const lastCol = t.last && t.last.m && Number.isInteger(t.last.m.col) ? t.last.m.col : undefined;
      render({ lastCol }, ctx);
      if (info.kind === 'move' && info.move && Number.isInteger(info.move.col)) {
        const c = info.move.col, r = gs.cols[c].length - 1;
        fall(c, r, vierFall(ctx.anim || OWN, ROWS - r));
      }
    },
    // Tests: Bildschirmpunkt über Spalte c (Einwurf-Reihe)
    target(c) { return toScreen(svg, cx(c), cy(ROWS)); },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: U * scale, boardPx: W * scale };
    },
    tap: tapCol,
    destroy() { svg.remove(); }
  };
}
