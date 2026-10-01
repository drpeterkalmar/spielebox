// Würfelglück: 5 Würfel (antippen = halten) und der Spielblock dessen, der dran ist (bei Computer-Zügen sieht man zu).
// Freie Felder zeigen nach dem Wurf, was sie bringen würden; der beste Vorschlag ist markiert (★).
// Feld antippen = auswählen, nochmal antippen (oder „Eintragen“) = eintragen. Würfeln über den Knopf unten.
// HTML statt SVG (Block = Tabelle), liegt wie die anderen Bretter im board-wrap.
import { h, clear } from '../../ui/dom.js';
import { s } from '../../ui/svg.js';
import { CATS, CAT_NAME, BONUS_AT, totals, scoreFor, extraFor, allowedCats, suggestions } from './engine.js';
import { OWN } from '../../tempo.js';

const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function face(v) {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'wg-face', 'aria-hidden': 'true' });
  svg.append(s('rect', { x: 4, y: 4, width: 92, height: 92, rx: 18, class: 'die-face' }));
  for (const [x, y] of PIPS[v] || []) svg.append(s('circle', { cx: x, cy: y, r: 9.5, class: 'die-pip' }));
  return svg;
}

export function createBoard(host, { onMove, onHint, onLocal }) {
  const root = h('div', { class: 'wg board', role: 'group', 'aria-label': 'Würfel und Spielblock' });
  const diceRow = h('div', { class: 'wg-dice' });
  const info = h('div', { class: 'wg-info' });
  const sheetEl = h('div', { class: 'wg-sheet' });
  root.append(h('div', { class: 'wg-top' }, diceRow, info), sheetEl);
  host.appendChild(root);

  let gs = null, legal = null, hold = [false, false, false, false, false], sel = null, hint = '', anim = OWN, timers = [], diceKey = '', seatNames = [];
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };
  const mine = () => !!legal;
  const canHold = () => mine() && gs.phase === 'choose' && gs.rolls < 3;
  const canScore = () => mine() && gs.phase === 'choose';

  function renderDice(rolled) {
    clear(diceRow);
    const dice = gs.dice || [0, 0, 0, 0, 0];
    const held = mine() && gs.phase === 'choose' ? hold : gs.phase === 'choose' || gs.phase === 'rolling' ? gs.held || hold : [false, false, false, false, false];
    dice.forEach((v, k) => {
      const b = h('button', { class: 'wg-die' + (held[k] ? ' held' : '') + (v ? '' : ' blank'), data: { die: String(k) }, 'aria-label': v ? `Würfel ${k + 1}: ${v}${held[k] ? ', gehalten' : ''}` : `Würfel ${k + 1}`, 'aria-pressed': String(!!held[k]),
        on: { click: () => toggle(k) } }, v ? face(v) : face(0), h('span', { class: 'wg-hold', text: held[k] ? 'gehalten' : '' }));
      diceRow.append(b);
      // gewürfelte (nicht gehaltene) Würfel rollen sichtbar, die Augen wechseln ein paar Mal
      if (rolled && !held[k] && v && anim.dice > 0 && b.animate && !reduced()) {
        b.animate([{ transform: 'rotate(-40deg) scale(.7)', opacity: 0.3 }, { transform: 'rotate(15deg) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none' }], { duration: anim.dice, easing: 'ease-out' });
        const flicker = Math.max(0, Math.floor(anim.dice / 200) - 1);
        for (let i = 1; i <= flicker; i++) timers.push(setTimeout(() => {
          const f = b.querySelector('.wg-face');
          if (f && b.isConnected) f.replaceWith(face(i === flicker ? v : 1 + ((v + i * (k + 2)) % 6)));
        }, (i * anim.dice * 0.6) / flicker));
      }
    });
    const left = 3 - gs.rolls;
    const who = gs.phase === 'over' ? '' : `Block ${seatNames[gs.turn] === 'Du' ? 'von dir' : 'von ' + (seatNames[gs.turn] || '')} · `;
    info.textContent = gs.phase === 'over' ? 'Alle Blöcke sind voll.' : !gs.dice ? `${who}Runde ${gs.round} von 13` : `${who}Runde ${gs.round} · Wurf ${gs.rolls} von 3${left > 0 && gs.phase === 'choose' ? '' : ' – eintragen'}`;
  }

  function renderSheet() {
    clear(sheetEl);
    const seat = gs.phase === 'over' ? (typeof viewSeat === 'number' ? viewSeat : 0) : gs.turn;
    const sheet = gs.sheets[seat];
    const t = totals(sheet);
    const dice = gs.dice;
    const choosing = gs.phase === 'choose' && dice;
    const allowed = choosing ? new Set(allowedCats(dice, sheet, gs.opts)) : new Set();
    const sug = choosing ? suggestions(gs) : [];
    const best = sug.length ? sug[0].cat : null;
    const extra = choosing ? extraFor(dice, sheet, gs.opts) : 0;
    const last = gs.last && gs.last.seat === seat ? gs.last.cat : null;
    const cell = (c) => {
      const v = sheet[c.key];
      const free = v === null;
      const pts = choosing && free ? scoreFor(dice, c.key, sheet, gs.opts) : null;
      const ok = free && allowed.has(c.key);
      const cls = ['wg-cat', free ? 'free' : 'done', ok && choosing ? 'can' : '', c.key === best ? 'best' : '', c.key === sel ? 'sel' : '', c.key === last ? 'just' : ''].filter(Boolean).join(' ');
      const val = !free ? String(v) : pts !== null && ok ? (pts > 0 ? `+${pts}` : 'streichen') : '';
      return h('button', { class: cls, data: { cat: c.key }, title: c.hint, disabled: !(canScore() && ok), on: { click: () => pick(c.key) } },
        h('span', { class: 'wg-name' }, c.key === best ? '★ ' : '', c.name), h('span', { class: 'wg-val', text: val }));
    };
    const upper = CATS.filter((c) => c.section === 'oben').map(cell);
    const lower = CATS.filter((c) => c.section === 'unten').map(cell);
    sheetEl.append(
      h('div', { class: 'wg-col' }, ...upper,
        h('div', { class: 'wg-sum' }, h('span', { text: `Bonus (ab ${BONUS_AT})` }), h('span', { text: t.bonus ? `+${t.bonus}` : `${t.oben}/${BONUS_AT}` }))),
      h('div', { class: 'wg-col' }, ...lower));
    if (extra && choosing) sheetEl.append(h('div', { class: 'wg-extra', text: `Weiterer Fünferpasch: +${extra} extra!` }));
  }

  function setHints() {
    if (!mine()) { setHint(''); return; }
    if (gs.phase === 'roll') setHint('Würfeln: Knopf unten antippen.');
    else if (sel) setHint(`${CAT_NAME[sel]} nochmal antippen oder „Eintragen“.`);
    else if (gs.rolls < 3) setHint('Würfel antippen = halten. Dann nochmal würfeln – oder ein Feld eintragen (★ = Vorschlag).');
    else setHint('Letzter Wurf – trag ein Feld ein (★ = Vorschlag).');
  }

  function toggle(k) {
    if (!canHold()) return;
    hold = hold.map((x, i) => (i === k ? !x : x));
    renderDice(false);
    onLocal && onLocal();
  }

  function pick(cat) {
    if (!canScore()) return;
    if (sel === cat) return commitScore();
    sel = cat;
    renderSheet();
    setHints();
    onLocal && onLocal();
  }

  function commitScore() {
    const m = { type: 'score', cat: sel };
    if (!sel || !legal.some((x) => x.type === 'score' && x.cat === sel)) return;
    sel = null;
    legal = null;
    onMove(m);
  }

  let viewSeat = 0;
  const api = {
    svg: root,
    update(t, info = {}, ctx = {}) {
      for (const x of timers) clearTimeout(x);
      timers = [];
      const prevLegal = legal;
      gs = t.gs;
      anim = ctx.anim || OWN;
      viewSeat = typeof ctx.viewer === 'number' ? ctx.viewer : 0;
      seatNames = t.seats.map((x, i) => (ctx.seated !== false && i === viewSeat && t.seats.length > 1 && t.seats.every((y, j) => j === i || (y && y.bot)) ? 'Du' : x ? (x.bot && t.seats.length === 2 ? 'Computer' : x.name) : `Spieler ${i + 1}`));
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) {
        sel = null;
        hold = gs.phase === 'choose' && gs.held ? gs.held.slice() : [false, false, false, false, false];
      }
      const key = JSON.stringify([gs.turn, gs.round, gs.rolls, gs.dice]);
      const rolled = info.kind === 'move' && info.move && info.move.type === 'roll' && key !== diceKey;
      diceKey = key;
      renderDice(rolled);
      renderSheet();
      setHints();
    },
    // für die Knöpfe (gameui.js)
    holdMove() { return { type: 'roll', hold: gs.phase === 'roll' ? [false, false, false, false, false] : hold.slice() }; },
    allHeld: () => hold.every(Boolean),
    selected: () => sel,
    scoreSelected: () => commitScore(),
    roll() { const m = api.holdMove(); if (legal && legal.some((x) => x.type === 'roll')) { legal = null; onMove(m); } },
    // Tests: Bildschirmpunkt von Würfel k bzw. Feld cat
    target(x) {
      const el = typeof x === 'number' ? diceRow.children[x] : sheetEl.querySelector(`[data-cat="${x}"]`);
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    },
    metrics() {
      const els = [...root.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
      return { minTargetPx: Math.min(...els.map((r) => Math.min(r.width, r.height))), boardPx: root.getBoundingClientRect().width };
    },
    destroy() { for (const x of timers) clearTimeout(x); root.remove(); }
  };
  return api;
}
