// Schiffe versenken als SVG. Hochkant (1000 × 1300): oben groß das Meer des Gegners (dort schießt du), unten klein
// das eigene Meer und die Flotten-Übersicht. Quer (1500 × 1000): links groß, rechts klein.
// Aufstellen: Die Flotte liegt zufällig bereit („Neu mischen“). Schiff antippen = wählen, nochmal = drehen,
// dann leeres Feld antippen = Schiff dorthin. Schießen: Feld antippen (Fadenkreuz), nochmal antippen oder „Feuer!“.
// Fremde Schiffe sieht man erst, wenn sie versenkt sind (Sicht aus viewFor – verdeckt bleibt verdeckt).
import { ROWS, FLEETS, cells, validFleet, randomFleet, grid, cellName, revealedShips, shipName } from './engine.js';
import { s, ensureDefs, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { OWN } from '../../tempo.js';
import { boardLayers } from '../../ui/deko.js';
import { woodFrame } from '../../ui/material.js';
import * as FXS from '../../ui/fxsvg.js';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBoard(host, { onMove, onHint, onLocal }) {
  ensureDefs();
  const svg = s('svg', { class: 'board board-schiffe', role: 'img', 'aria-label': 'Schiffe versenken' });
  const gBig = s('g'), gSmall = s('g'), gInfo = s('g'), gFx = s('g');
  const gFx2 = s('g', { class: 'fx' });
  svg.append(gBig, gSmall, gInfo, gFx, gFx2);
  host.appendChild(svg);
  // Deko: Meere (Rahmen, Wasser, Wellen, Gitter, Beschriftung) in der statischen Ebene darunter
  const L = boardLayers(svg, host);
  const uBig = L ? L.under.appendChild(s('g')) : null, uSmall = L ? L.under.appendChild(s('g')) : null;
  let seaKey = '';
  function staticSeas(small) {
    const key = `${portrait}|${small}`;
    if (!L || key === seaKey) return;
    seaKey = key;
    uBig.textContent = ''; uSmall.textContent = '';
    sea(uBig, BIG, true, true);
    if (small) sea(uSmall, SMALL, !portrait, true);
  }

  let portrait = null, gs = null, me = 0, seated = true, legal = null, aim = null, hint = '', names = ['Du', 'Gegner'];
  let ships = null, pickK = null, shipsKey = '';
  // Lage der beiden Meere: { x, y, cell }
  let BIG, SMALL, W, H;
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };

  function layout() {
    const p = typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches;
    if (p === portrait) return false;
    portrait = p;
    if (p) { W = 1000; H = 1300; BIG = { x: 70, y: 66, cell: 90 }; SMALL = { x: 46, y: 1000, cell: 28 }; }
    else { W = 1500; H = 1000; BIG = { x: 70, y: 66, cell: 90 }; SMALL = { x: 1030, y: 66, cell: 42 }; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    return true;
  }

  const cxy = (G, i) => [G.x + (i % 10) * G.cell + G.cell / 2, G.y + Math.floor(i / 10) * G.cell + G.cell / 2];
  const placing = () => !!(legal && legal.some((m) => m.type === 'place'));
  const shooting = () => !!(legal && legal.some((m) => m.type === 'shot'));
  const opp = () => 1 - me;

  function sea(g, G, labels = true, deko = false) {
    const n = 10 * G.cell;
    if (deko) {
      woodFrame(g, G.x - 7, G.y - 7, n + 14, n + 14, 12, { shadow: G === BIG });
      g.append(s('rect', { x: G.x, y: G.y, width: n, height: n, class: 'sv-sea' }),
        s('rect', { x: G.x, y: G.y, width: n, height: n, fill: 'url(#dk-waves)' }),
        s('rect', { x: G.x, y: G.y, width: n, height: n, fill: 'url(#dk-water)' }),
        s('rect', { x: G.x, y: G.y, width: n, height: n, fill: 'url(#dk-vig)' }));
    } else {
      g.append(s('rect', { x: G.x - 6, y: G.y - 6, width: n + 12, height: n + 12, rx: 12, class: 'sv-frame' }),
        s('rect', { x: G.x, y: G.y, width: n, height: n, class: 'sv-sea' }));
    }
    for (let k = 1; k < 10; k++) {
      g.append(s('line', { x1: G.x + k * G.cell, y1: G.y, x2: G.x + k * G.cell, y2: G.y + n, class: 'sv-line' }),
        s('line', { x1: G.x, y1: G.y + k * G.cell, x2: G.x + n, y2: G.y + k * G.cell, class: 'sv-line' }));
    }
    if (labels) for (let k = 0; k < 10; k++) {
      g.append(s('text', { x: G.x + k * G.cell + G.cell / 2, y: G.y - 18, class: 'sv-lab', text: String(k + 1) }),
        s('text', { x: G.x - 30, y: G.y + k * G.cell + G.cell / 2 + 10, class: 'sv-lab', text: ROWS[k] }));
    }
  }

  function hull(g, G, sh, cls) {
    const [x0, y0] = cxy(G, sh.r * 10 + sh.c);
    const pad = G.cell * 0.14;
    const w = (sh.dir === 'h' ? sh.len : 1) * G.cell - 2 * pad, h2 = (sh.dir === 'v' ? sh.len : 1) * G.cell - 2 * pad;
    const x = x0 - G.cell / 2 + pad, y = y0 - G.cell / 2 + pad, r = Math.min(w, h2) / 2;
    if (L) g.append(s('rect', { x: x + 3, y: y + 5, width: w, height: h2, rx: r, fill: 'rgba(0,20,40,.35)' }));
    g.append(s('rect', { x, y, width: w, height: h2, rx: r, class: 'sv-ship ' + cls }));
    if (!L || /bad|pick/.test(cls)) return;
    // Deko: Stahl-Glanz, Deck-Linie und Aufbauten (je Feld ein Turm, nicht an den Enden)
    g.append(s('rect', { x, y, width: w, height: h2, rx: r, fill: 'url(#dk-steel)' }),
      s('rect', { x: x + r * 0.45, y: y + r * 0.45, width: w - r * 0.9, height: h2 - r * 0.9, rx: r * 0.55, fill: 'none', stroke: 'rgba(30,40,50,.28)', 'stroke-width': Math.max(1, G.cell * 0.025) }));
    for (let k = 1; k < sh.len - 1 || (sh.len === 2 && k === 1); k++) {
      const t = sh.len === 2 ? 0.5 : k / (sh.len - 1);
      const tx = sh.dir === 'h' ? x + r + (w - 2 * r) * t : x + w / 2, ty = sh.dir === 'v' ? y + r + (h2 - 2 * r) * t : y + h2 / 2;
      g.append(s('circle', { cx: tx, cy: ty, r: G.cell * 0.13, fill: cls.includes('sunk') ? '#3e302b' : '#8d99a3', stroke: 'rgba(20,30,40,.5)', 'stroke-width': Math.max(1, G.cell * 0.02) }));
      if (sh.len === 2) break;
    }
  }

  function marks(g, G, cellsInfo) {
    cellsInfo.forEach((c, i) => {
      const [x, y] = cxy(G, i);
      const r = G.cell * 0.3;
      if (c.shot === 'hit') {
        // Deko: Glut (heller Kern, roter Rand) statt flacher Scheibe
        if (L && !c.sunk) g.append(s('circle', { cx: x, cy: y, r: r * 1.5, fill: 'url(#dk-glow)' }));
        g.append(s('circle', { cx: x, cy: y, r: r * 1.1, class: 'sv-hit' + (c.sunk ? ' sunk' : '') }));
        if (L) g.append(s('circle', { cx: x, cy: y, r: r * 1.05, fill: 'url(#dk-ball)' }));
        g.append(s('path', { d: `M ${x - r * 0.6} ${y - r * 0.6} L ${x + r * 0.6} ${y + r * 0.6} M ${x + r * 0.6} ${y - r * 0.6} L ${x - r * 0.6} ${y + r * 0.6}`, class: 'sv-x' }));
      } else if (c.shot === 'miss') {
        if (L) g.append(s('circle', { cx: x, cy: y, r: r * 0.85, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': Math.max(1, G.cell * 0.03) }));
        g.append(s('circle', { cx: x, cy: y, r: r * 0.42, class: 'sv-miss' }));
      }
      else if (c.ship === false && !c.own) g.append(s('circle', { cx: x, cy: y, r: r * 0.16, class: 'sv-water' }));
    });
  }

  // ein Meer zeichnen: owner = wessen Flotte, G = Lage
  function drawSea(g, G, owner, big) {
    g.textContent = '';
    if (!L) sea(g, G, big || !portrait);
    if (!gs) return;
    const info = grid(gs, owner, seated ? me : null);
    const fleet = gs.fleets[owner];
    if (Array.isArray(fleet)) for (const sh of fleet) hull(g, G, sh, sh.hits === sh.len ? 'sunk' : 'own');
    else for (const sh of revealedShips(gs, owner)) hull(g, G, sh, 'sunk');
    if (Array.isArray(fleet)) info.forEach((c) => { c.own = true; });
    marks(g, G, info);
    const l = gs.last;
    if (l && l.seat === 1 - owner && Number.isInteger(l.i)) {
      const [x, y] = cxy(G, l.i);
      g.append(s('rect', { x: x - G.cell / 2 + 2, y: y - G.cell / 2 + 2, width: G.cell - 4, height: G.cell - 4, rx: 6, class: 'sv-last' }));
    }
  }

  // Aufstellen: eigene Flotte groß zum Verschieben
  function drawEditor() {
    gBig.textContent = '';
    if (!L) sea(gBig, BIG, true);
    const ok = validFleet(gs.opts, ships);
    const bad = new Set();
    if (!ok) {
      // welche Schiffe stören? (Überlappung/Berühren mit einem anderen)
      ships.forEach((a, i) => ships.forEach((b, j) => {
        if (i >= j) return;
        const ca = cells(a), cb = new Set(cells(b));
        const near = ca.some((x) => cb.has(x) || (!gs.opts.beruehren && [x - 11, x - 10, x - 9, x - 1, x + 1, x + 9, x + 10, x + 11].some((y) => cb.has(y) && Math.abs((y % 10) - (x % 10)) <= 1)));
        if (near) { bad.add(i); bad.add(j); }
      }));
    }
    ships.forEach((sh, k) => hull(gBig, BIG, sh, (k === pickK ? 'pick ' : '') + (bad.has(k) ? 'bad' : 'own')));
    setHint(pickK !== null ? `${shipName(gs.opts, pickK)}: Feld antippen = hierhin, nochmal aufs Schiff = drehen.` : ok ? 'Schiff antippen = verschieben. Sonst „Fertig“.' : 'Rote Schiffe liegen zu nah – verschieben!');
  }

  function drawInfo() {
    gInfo.textContent = '';
    const x0 = portrait ? 360 : 1030, y0 = portrait ? 1010 : 530;
    const list = (y, seat, title) => {
      const fl = FLEETS[gs.opts.flotte];
      const sunk = new Set((gs.sunk[1 - seat] || []));
      gInfo.append(s('text', { x: x0, y, class: 'sv-title', text: `${title}: ${fl.length - sunk.size} von ${fl.length} Schiffen` }));
      let x = x0, yy = y + 22;
      fl.forEach((f, k) => {
        const w = f.len * 22;
        if (x + w > (portrait ? 980 : 1480)) { x = x0; yy += 34; }
        gInfo.append(s('rect', { x, y: yy, width: w, height: 22, rx: 11, class: 'sv-ico' + (sunk.has(k) ? ' gone' : '') }));
        x += w + 12;
      });
      return yy + 40;
    };
    let y = y0 + 20;
    y = list(y, opp(), seated ? (names[opp()] === 'Computer' ? 'Computer' : names[opp()]) : names[1]);
    list(y + 14, me, seated ? 'Du' : names[0]);
  }

  function aimMark() {
    if (aim === null) return;
    const [x, y] = cxy(BIG, aim);
    const r = BIG.cell * 0.42;
    gBig.append(s('g', { class: 'sv-aim' }, s('circle', { cx: x, cy: y, r }), s('path', { d: `M ${x - r - 10} ${y} H ${x - r / 3} M ${x + r / 3} ${y} H ${x + r + 10} M ${x} ${y - r - 10} V ${y - r / 3} M ${x} ${y + r / 3} V ${y + r + 10}` })));
  }

  function render() {
    layout();
    gFx.textContent = '';
    staticSeas(!placing());
    if (placing()) {
      const key = `${gs.opts.flotte}|${gs.opts.beruehren}|${me}`;
      if (!ships || shipsKey !== key) { ships = randomFleet(gs.opts, Math.random); shipsKey = key; pickK = null; }
      drawEditor();
      gSmall.textContent = '';
      gInfo.textContent = '';
      const tx = portrait ? 500 : 1260, ty = portrait ? 1080 : 300;
      gInfo.append(s('text', { x: tx, y: ty, class: 'sv-title mid', text: 'Stell deine Flotte auf' }),
        s('text', { x: tx, y: ty + 46, class: 'sv-sub mid', text: 'Niemand sonst sieht sie.' }));
      return;
    }
    const target = seated ? opp() : 1;
    const mine = seated ? me : 0;
    drawSea(gBig, BIG, target, true);
    drawSea(gSmall, SMALL, mine, false);
    drawInfo();
    if (gs.phase === 'place') {
      const [x, y] = [BIG.x + 5 * BIG.cell, BIG.y + 5 * BIG.cell];
      gBig.append(s('rect', { x: x - 360, y: y - 60, width: 720, height: 110, rx: 22, class: 'end-card' }),
        s('text', { x, y: y + 12, class: 'end-sub', text: gs.fleets[gs.turn] === null && gs.turn !== me ? `${names[gs.turn]} stellt die Flotte auf …` : 'Warte auf den Gegner …' }));
    }
    if (shooting()) {
      aimMark();
      setHint(aim !== null ? `${cellName(aim)}: nochmal antippen oder „Feuer!“` : 'Tippe ein Feld im Meer des Gegners an.');
    } else setHint('');
  }

  // Schuss sichtbar: Fontäne (Wasser) bzw. Feuerball (Treffer), dazu großes Wort
  function shotFx(i, onBig, a) {
    if (!gs.last || gs.last.i !== i || reduced() || !a || a.slide <= 0) return;
    const G = onBig ? BIG : SMALL;
    const [x, y] = cxy(G, i);
    const hit = gs.last.hit, sunk = gs.last.sunk !== null && gs.last.sunk !== undefined;
    const ring = s('circle', { cx: x, cy: y, r: G.cell * 0.2, class: hit ? 'sv-boom' : 'sv-splash' });
    gFx.append(ring);
    const an = ring.animate([{ r: G.cell * 0.15, opacity: 1 }, { r: G.cell * 1.1, opacity: 0 }], { duration: a.slide + 200, easing: 'ease-out', fill: 'forwards' });
    if (an) an.onfinish = () => ring.remove();
    // Deko: Explosion bzw. Spritzer (Partikel), dazu das große Wort wie bisher
    if (hit) FXS.boom(gFx2, x, y, G.cell * 0.34, { big: sunk });
    else FXS.splash(gFx2, x, y, G.cell * 0.34);
    const word = sunk ? 'Versenkt!' : hit ? 'Treffer!' : 'Wasser';
    const tx = onBig ? BIG.x + 5 * BIG.cell : SMALL.x + 5 * SMALL.cell, ty = onBig ? BIG.y + 5 * BIG.cell : SMALL.y + 5 * SMALL.cell;
    const t = s('text', { x: tx, y: ty + 30, class: 'sv-word' + (hit ? ' hit' : '') + (onBig ? '' : ' small'), text: word });
    gFx.append(t);
    const at = t.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)', offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1600 + a.slide, fill: 'forwards' });
    t.style.transformBox = 'fill-box';
    t.style.transformOrigin = 'center';
    if (at) at.onfinish = () => t.remove();
  }

  function at(G, x, y) {
    const c = Math.floor((x - G.x) / G.cell), r = Math.floor((y - G.y) / G.cell);
    return c >= 0 && c < 10 && r >= 0 && r < 10 ? r * 10 + c : null;
  }

  function tapAt(x, y) {
    if (!legal) return;
    const i = at(BIG, x, y);
    if (placing()) {
      if (i === null) { pickK = null; return render(); }
      const k = ships.findIndex((sh) => cells(sh).includes(i));
      if (k >= 0) {
        if (k === pickK) ships = ships.map((sh, j) => (j === k ? fit({ ...sh, dir: sh.dir === 'h' ? 'v' : 'h' }) : sh));
        else pickK = k;
      } else if (pickK !== null) {
        ships = ships.map((sh, j) => (j === pickK ? fit({ ...sh, r: Math.floor(i / 10), c: i % 10 }) : sh));
      }
      render();
      onLocal && onLocal();
      return;
    }
    if (!shooting() || i === null) return;
    if (!legal.some((m) => m.type === 'shot' && m.i === i)) { setHint(`${cellName(i)} hast du schon beschossen.`); return; }
    if (aim === i) return fire();
    aim = i;
    render();
    onLocal && onLocal();
  }

  // Schiff im Brett halten
  const fit = (sh) => ({ ...sh, r: Math.min(sh.r, sh.dir === 'v' ? 10 - sh.len : 9), c: Math.min(sh.c, sh.dir === 'h' ? 10 - sh.len : 9) });

  function fire() {
    if (aim === null) return;
    const m = { type: 'shot', i: aim };
    aim = null;
    legal = null;
    onMove(m);
  }

  onTap(svg, (cx, cy) => { const p = toBoard(svg, cx, cy); if (p) tapAt(p[0], p[1]); });
  const onResize = () => { if (layout() && gs) render(); };
  addEventListener('resize', onResize);

  const api = {
    svg,
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      gs = t.gs;
      seated = ctx.seated !== false;
      me = typeof ctx.viewer === 'number' ? ctx.viewer : 0;
      names = t.seats.map((x, i) => (seated && i === me ? 'Du' : x ? (x.bot ? 'Computer' : x.name) : `Spieler ${i + 1}`));
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) aim = null;
      if (!placing()) { ships = null; pickK = null; }
      render();
      const m = info.kind === 'move' ? info.move : null;
      if (m && m.type === 'shot') shotFx(m.i, !seated || info.by === me, ctx.anim || OWN);
    },
    // für die Knöpfe (gameui.js)
    placing,
    aim: () => aim,
    fire,
    shuffle() { ships = randomFleet(gs.opts, Math.random); pickK = null; render(); onLocal && onLocal(); },
    rotate() { if (pickK === null) return; ships = ships.map((sh, j) => (j === pickK ? fit({ ...sh, dir: sh.dir === 'h' ? 'v' : 'h' }) : sh)); render(); onLocal && onLocal(); },
    picked: () => pickK,
    fleet: () => ships,
    fleetOk: () => !!ships && validFleet(gs.opts, ships),
    done() { if (placing() && api.fleetOk()) { const m = { type: 'place', ships: ships.map(({ r, c, len, dir }) => ({ r, c, len, dir })) }; legal = null; onMove(m); } },
    // Tests: Bildschirmpunkt eines Felds im großen Meer
    target(i) { layout(); return toScreen(svg, ...cxy(BIG, i)); },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: BIG.cell * scale, cellPx: BIG.cell * scale, boardPx: W * scale };
    },
    tap: tapAt,
    destroy() { removeEventListener('resize', onResize); svg.remove(); }
  };
  return api;
}
