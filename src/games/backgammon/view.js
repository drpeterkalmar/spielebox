// Backgammon-Brett als SVG. Modell waagrecht (1000 × 640): unten die Punkte 1–12 (rechts → links), oben 13–24,
// Bar in der Mitte; gezeigt immer aus Sicht des eigenen Sitzes (Schwarz sieht das Brett gespiegelt, Heimfeld rechts unten).
// Im Hochformat wird das Brett um 90° gedreht (Heimfeld unten), damit jeder Punkt ≥ 48 px breit bleibt.
// Bedienung: Stein antippen → Ziele leuchten → Ziel antippen; „Zurück“/„Fertig“/„Abtragen“ kommen als Knöpfe.
import { partialSteps, applySteps, isComplete } from './engine.js';
import { s, ensureDefs, piece, place, animatePath, toBoard, toScreen, onTap } from '../../ui/svg.js';

const W = 1000, H = 640, M = 10, BAR = 40;
const PW = (W - 2 * M - BAR) / 12;
const L = 272;           // Länge eines Punkts (Dreieck)
const R = 29;            // Steinradius
const BARX = M + 6 * PW + BAR / 2;

export function createBoard(host, { onMove, onHint, onLocal }) {
  ensureDefs();
  const svg = s('svg', { class: 'board board-bg', role: 'img', 'aria-label': 'Backgammon-Brett' });
  const root = s('g');
  const gBoard = s('g'), gHi = s('g', { class: 'hints' }), gPieces = s('g', { class: 'pieces' }), gDice = s('g', { class: 'dice' }), gTop = s('g', { class: 'hints' });
  root.append(gBoard, gHi, gPieces, gDice, gTop);
  svg.append(root);
  host.appendChild(svg);

  let portrait = null, table = null, gs = null, shown = null, me = 0, legal = null, steps = [], sel = null, hint = '', lastDice = '';
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };

  // Punkt (absolut 1–24) → Anzeige-Spalte/Reihe aus Sicht von `me`
  const disp = (p) => (me === 1 ? 25 - p : p);
  function colOf(p) {
    const d = disp(p);
    if (d <= 12) return { c: 12 - d, bottom: true };
    return { c: d - 13, bottom: false };
  }
  const colX = (c) => M + c * PW + PW / 2 + (c >= 6 ? BAR : 0);
  function stackXY(p, k, n) {
    const { c, bottom } = colOf(p);
    const step = n > 1 ? Math.min(2 * R, (L - 2 * R) / (n - 1)) : 0;
    return [colX(c), bottom ? H - M - R - k * step : M + R + k * step];
  }
  function barXY(seat, k, n) {
    const step = n > 1 ? Math.min(2 * R, 150 / (n - 1)) : 0;
    const mine = seat === me;
    return [BARX, mine ? H / 2 - 50 - k * step : H / 2 + 50 + k * step];
  }
  // Text im Hochformat zurückdrehen (sonst stünde er quer)
  const txt = (x, y, cls, text) => s('text', { x, y, class: cls, text, transform: portrait ? `rotate(-90 ${x} ${y})` : null });
  // Modell ↔ Bildschirm
  const toModel = (x, y) => (portrait ? [y, H - x] : [x, y]);
  const fromModel = (x, y) => (portrait ? [H - y, x] : [x, y]);

  function layout() {
    const p = typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches;
    if (p === portrait) return false;
    portrait = p;
    svg.setAttribute('viewBox', portrait ? `0 0 ${H} ${W}` : `0 0 ${W} ${H}`);
    root.setAttribute('transform', portrait ? `translate(${H} 0) rotate(90)` : '');
    drawBoard();
    return true;
  }

  function drawBoard() {
    gBoard.textContent = '';
    gBoard.append(
      s('rect', { width: W, height: H, rx: 18, fill: 'url(#sb-wood-frame)' }),
      s('rect', { x: M, y: M, width: W - 2 * M, height: H - 2 * M, rx: 6, fill: 'url(#sb-wood-light)' }),
      s('rect', { x: BARX - BAR / 2, y: M, width: BAR, height: H - 2 * M, fill: 'url(#sb-wood-frame)' }));
    for (let c = 0; c < 12; c++) {
      const x = colX(c);
      const dark = c % 2 === 0;
      gBoard.append(s('path', { d: `M ${x - PW / 2 + 2} ${H - M} L ${x} ${H - M - L} L ${x + PW / 2 - 2} ${H - M} Z`, class: dark ? 'pt-a' : 'pt-b' }));
      gBoard.append(s('path', { d: `M ${x - PW / 2 + 2} ${M} L ${x} ${M + L} L ${x + PW / 2 - 2} ${M} Z`, class: dark ? 'pt-b' : 'pt-a' }));
    }
    // Punktnummern aus Sicht des Spielers (klein am Rand)
    for (let d = 1; d <= 24; d++) {
      const p = me === 1 ? 25 - d : d;
      const { c, bottom } = colOf(p);
      gBoard.append(txt(colX(c), bottom ? H - M - L - 14 : M + L + 22, 'pt-num', String(d)));
    }
  }

  function drawPieces() {
    gPieces.textContent = '';
    const st = shown;
    for (let p = 1; p <= 24; p++) {
      const v = st.points[p - 1];
      const n = Math.abs(v);
      const color = v > 0 ? 0 : 1;
      for (let k = 0; k < n; k++) {
        const [x, y] = stackXY(p, k, n);
        const el = place(piece(color, R), ...fromModelPiece(x, y));
        el.dataset.p = p;
        gPieces.append(el);
      }
      if (n > 5) {
        const [x, y] = stackXY(p, n - 1, n);
        gPieces.append(txt(x, y, 'stack-n ' + (color ? 'on-b' : 'on-w'), String(n)));
      }
    }
    for (const seat of [0, 1]) {
      const n = st.bar[seat];
      for (let k = 0; k < n; k++) {
        const [x, y] = barXY(seat, k, n);
        const el = place(piece(seat, R), x, y);
        el.dataset.p = 'bar' + seat;
        gPieces.append(el);
      }
    }
  }
  // Steine stehen im gedrehten Modell-Koordinatensystem (root trägt die Drehung) → keine Umrechnung nötig
  const fromModelPiece = (x, y) => [x, y];

  function die(x, y, v, used, size = 58) {
    const g = s('g', { class: 'die' + (used ? ' used' : ''), transform: `translate(${x} ${y})` });
    g.append(s('rect', { x: -size / 2, y: -size / 2, width: size, height: size, rx: 11, class: 'die-face' }));
    const o = size * 0.26;
    const pips = { 1: [[0, 0]], 2: [[-o, -o], [o, o]], 3: [[-o, -o], [0, 0], [o, o]], 4: [[-o, -o], [o, -o], [-o, o], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] }[v] || [];
    for (const [px, py] of pips) g.append(s('circle', { cx: px, cy: py, r: size * 0.09, class: 'die-pip' }));
    return g;
  }

  function drawDice() {
    gDice.textContent = '';
    // Verdopplungswürfel: Mitte der Bar, bzw. beim Besitzer
    if (gs.options && gs.options.cube) {
      const own = gs.cube.owner;
      const y = own === null ? H / 2 : own === me ? H - M - 40 : M + 40;
      const g = s('g', { class: 'cube', transform: `translate(${BARX} ${y})` });
      g.append(s('rect', { x: -24, y: -24, width: 48, height: 48, rx: 7, class: 'cube-face' }), s('text', { y: 0, x: 0, class: 'cube-n', text: String(own === null ? 64 : gs.cube.value), transform: portrait ? 'rotate(-90)' : null }));
      gDice.append(g);
    }
    if (!gs.dice || gs.phase === 'roll' || gs.phase === 'double') return;
    const dice = gs.dice[0] === gs.dice[1] ? [gs.dice[0], gs.dice[0], gs.dice[0], gs.dice[0]] : gs.dice.slice();
    const used = (shown.used || []).slice();
    const mine = gs.turn === me;
    const cx = mine ? M + 9 * PW + BAR : M + 3 * PW;
    const gap = dice.length > 2 ? 62 : 72;
    const grp = s('g', { class: 'dice-grp' });
    dice.forEach((v, i) => {
      const k = used.indexOf(v);
      const isUsed = k >= 0;
      if (isUsed) used.splice(k, 1);
      grp.append(die(cx + (i - (dice.length - 1) / 2) * gap, H / 2, v, isUsed));
    });
    gDice.append(grp);
    const key = JSON.stringify([gs.ply, gs.dice]);
    if (key !== lastDice) {
      lastDice = key;
      if (grp.animate) grp.animate([{ transform: 'rotate(-25deg) scale(.6)', opacity: 0.2 }, { transform: 'rotate(10deg) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'rotate(0) scale(1)' }], { duration: 650, easing: 'ease-out' });
      grp.style.transformBox = 'fill-box';
      grp.style.transformOrigin = 'center';
    }
  }

  function nexts() {
    return legal && gs.phase === 'move' ? partialSteps(gs, steps) : [];
  }

  function hintRing(p, cls) {
    if (p === 'bar') {
      const [x, y] = barXY(me, 0, 1);
      gHi.append(s('circle', { cx: x, cy: y, r: R + 8, class: cls }));
      return;
    }
    const n = Math.abs(shown.points[p - 1]);
    const [x, y] = stackXY(p, Math.max(0, n - 1), Math.max(n, 1));
    gHi.append(s('circle', { cx: x, cy: y, r: R + 8, class: cls }));
  }

  function drawHints() {
    gHi.textContent = '';
    gTop.textContent = '';
    if (!legal || gs.phase !== 'move') return;
    const ns = nexts();
    if (!ns.length) {
      setHint(steps.length ? 'Zug vollständig – „Fertig“ tippen (oder „Zurück“).' : 'Kein Zug möglich.');
      return;
    }
    if (sel === null) {
      for (const f of new Set(ns.map((x) => x.from))) hintRing(f, 'hint-can');
      setHint(ns.some((x) => x.from === 'bar') ? 'Zuerst den Stein von der Bar einwürfeln.' : 'Tippe einen Stein an.');
      return;
    }
    hintRing(sel, 'hint-sel');
    const tos = ns.filter((x) => x.from === sel);
    for (const x of tos) {
      if (x.to === 'off') continue;
      const { c, bottom } = colOf(x.to);
      const cx = colX(c);
      gTop.append(s('path', { d: bottom ? `M ${cx - PW / 2 + 4} ${H - M} L ${cx} ${H - M - L} L ${cx + PW / 2 - 4} ${H - M} Z` : `M ${cx - PW / 2 + 4} ${M} L ${cx} ${M + L} L ${cx + PW / 2 - 4} ${M} Z`, class: 'pt-target' }));
      const n = Math.abs(shown.points[x.to - 1]);
      const own = (shown.points[x.to - 1] > 0 ? 0 : 1) === me;
      const [px, py] = stackXY(x.to, own ? n : 0, own ? n + 1 : 1);
      gTop.append(s('circle', { cx: px, cy: py, r: 15, class: 'hint-dot' }));
    }
    setHint(tos.some((x) => x.to === 'off') ? 'Ziel antippen oder „Abtragen“.' : 'Wohin? Tippe ein leuchtendes Feld an.');
  }

  function render() {
    layout();
    shown = steps.length ? applySteps(gs, steps) : gs;
    drawPieces();
    drawDice();
    drawHints();
  }

  function addStep(st) {
    steps = [...steps, { from: st.from, to: st.to, die: st.die }];
    sel = null;
    // Stein gleich weiter führen, wenn er noch Ziele hat
    const ns = partialSteps(gs, steps);
    if (st.to !== 'off' && ns.some((x) => x.from === st.to)) sel = st.to;
    render();
    const el = [...gPieces.querySelectorAll(`[data-p="${st.to}"]`)].pop();
    if (el && st.from !== 'bar') {
      const n0 = Math.abs(shown.points[st.from - 1]);
      animatePath(el, [stackXY(st.from, n0, n0 + 1), [Number(el.dataset.x), Number(el.dataset.y)]], 200);
    }
    onLocal && onLocal();
  }

  function tap(mx, my) {
    if (!legal || gs.phase !== 'move') return;
    const ns = nexts();
    let p = null;
    if (Math.abs(mx - BARX) <= BAR / 2 + 6) p = 'bar';
    else {
      let best = null, bd = Infinity;
      for (let c = 0; c < 12; c++) { const d = Math.abs(colX(c) - mx); if (d < bd) { bd = d; best = c; } }
      const bottom = my > H / 2;
      const d = bottom ? 12 - best : best + 13;
      p = me === 1 ? 25 - d : d;
    }
    if (sel !== null) {
      const cand = ns.filter((x) => x.from === sel && x.to === p);
      if (cand.length) return addStep(cand[0]);
    }
    sel = ns.some((x) => x.from === p) && sel !== p ? p : null;
    render();
    onLocal && onLocal();
  }

  onTap(svg, (cx, cy) => {
    const q = toBoard(svg, cx, cy);
    if (!q) return;
    const [mx, my] = toModel(q[0], q[1]);
    tap(mx, my);
  });
  const onResize = () => { if (layout() && table) render(); };
  addEventListener('resize', onResize);

  const api = {
    svg,
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      table = t;
      gs = t.gs;
      const newMe = ctx.viewer === 1 ? 1 : 0;
      if (newMe !== me) { me = newMe; portrait = null; }
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) { steps = []; sel = null; }
      render();
      // Zug des anderen: bewegte Steine gleiten
      if (info.kind === 'move' && info.move && info.move.type === 'play' && info.prevGs && info.move.steps.length) {
        for (const st of info.move.steps) {
          if (st.to === 'off') continue;
          const el = [...gPieces.querySelectorAll(`[data-p="${st.to}"]`)].pop();
          if (!el) continue;
          const from = st.from === 'bar' ? barXY(info.by, 0, 1) : stackXY(st.from, 0, 1);
          animatePath(el, [from, [Number(el.dataset.x), Number(el.dataset.y)]], 240);
        }
      }
    },
    // für die Knöpfe
    get steps() { return steps; },
    complete: () => !!legal && gs.phase === 'move' && isComplete(gs, steps),
    canUndo: () => steps.length > 0,
    undo() { steps = steps.slice(0, -1); sel = null; render(); onLocal && onLocal(); },
    offStep: () => (sel === null ? null : nexts().find((x) => x.from === sel && x.to === 'off') || null),
    bearOff() { const st = api.offStep(); if (st) addStep(st); },
    finish() { if (api.complete()) { const m = { type: 'play', steps }; steps = []; sel = null; legal = null; onMove(m); } },
    // Tests: Bildschirmpunkt eines Punkts (oberster Stein bzw. Punktmitte) oder der Bar
    target(p) {
      let x, y;
      if (p === 'bar') [x, y] = barXY(me, 0, 1);
      else { const n = Math.abs(shown.points[p - 1]); [x, y] = stackXY(p, Math.max(0, n - 1), Math.max(1, n)); }
      const [sx, sy] = fromModel(x, y);
      return toScreen(svg, sx, sy);
    },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: PW * scale, boardPx: (portrait ? W : W) * scale };
    },
    tap,
    destroy() { removeEventListener('resize', onResize); svg.remove(); }
  };
  return api;
}
