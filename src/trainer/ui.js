// Schach-Trainer: Übersicht, Eröffnungen (Ansehen / Lernen / Wiederholen), Taktik-Aufgaben, Endspiel-Lektionen,
// Fortschritt. Allein spielbar, offline, Fortschritt nur auf diesem Gerät (store.trainer()).
// Wird erst beim Öffnen geladen (dynamischer Import in app.js) → die Lobby startet nicht langsamer.
// Wege (#-Teil der URL): trainer · trainer/eroeffnungen · trainer/e/<linie>/<ansehen|lernen>/<w|b> · trainer/wiederholen
//   · trainer/taktik · trainer/t/<motiv|mix> · trainer/endspiele · trainer/s/<lektion> · trainer/fortschritt
import { h, clear, sheet, toast } from '../ui/dom.js';
import { createBoard } from '../games/schach/view.js';
import * as S from '../games/schach/engine.js';
import * as store from '../store.js';
import { chooseBotMove, evaluateBoard } from '../botclient.js';
import { EVAL } from '../evalpos.js';
import { params as tempoParams, levelFrom, OWN } from '../tempo.js';
import { LINES, lineMoves, lineName, lineById, familyOf, byFamily, checkMove } from './opening.js';
import { MOTIFS, PUZZLES } from './data/puzzles.js';
import * as PZ from './puzzle.js';
import * as LT from './leitner.js';
import { rate, pickNear } from './rating.js';
import { GROUPS, LESSONS, lessonById, checkGoal, tbReply, tbProbe, randomFen, mateStars, helpStars, userColorOf } from './lessons.js';
import { bestMove as tbBest, build as tbBuild, materialOf } from './tb.js';

const PIECE_DAT = { p: 'dem Bauern', n: 'dem Springer', b: 'dem Läufer', r: 'dem Turm', q: 'der Dame', k: 'dem König' };
const COLOR = { w: 'Weiß', b: 'Schwarz' };
const seatOf = (c) => (c === 'w' ? 0 : 1);
const colorOfGs = (gs) => (gs.turn === 0 ? 'w' : 'b');
const moveNo = (ply) => `${Math.floor(ply / 2) + 1}.${ply % 2 ? '..' : ''}`;
const plain = (m) => (m.promo ? { from: m.from, to: m.to, promo: m.promo } : { from: m.from, to: m.to });
const starsText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const now = () => Date.now();

// Tempo der Computerzüge aus der Einstellung „Computer-Tempo“ (im Trainer etwas flotter als am Tisch)
const tempoLevel = () => levelFrom(store.settings().tempo);
const replyDelay = () => ({ gemuetlich: 900, normal: 600, flott: 300, test: 0 }[tempoLevel()] ?? 700);

function load() { return store.trainer(); }
function save(t) { store.saveTrainer(t); }

function lessonGoal(l) {
  if (l.goal === 'mate') return `Ziel: Matt in höchstens ${l.limit} Zügen`;
  if (l.goal === 'promote') return 'Ziel: Bauer umwandeln';
  return `Ziel: ${l.holdMoves} Züge Remis halten`;
}

function seg(label, items, value, onChange) {
  const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const draw = () => {
    clear(box);
    for (const it of items) {
      box.appendChild(h('button', { class: 'seg-btn' + (it.v === value ? ' on' : ''), role: 'radio', 'aria-checked': String(it.v === value), data: { v: String(it.v) },
        on: { click: () => { value = it.v; draw(); onChange(it.v); } } }, h('span', { class: 'seg-t', text: it.t }), it.sub ? h('span', { class: 'seg-sub', text: it.sub }) : null));
    }
  };
  draw();
  return h('div', { class: 'field' }, h('div', { class: 'field-label', text: label }), box);
}

// kleines Brett-Symbol für die Übersicht
function icon(kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'mini');
  svg.setAttribute('aria-hidden', 'true');
  let sq = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2) sq += `<rect x="${c * 25}" y="${r * 25}" width="25" height="25"/>`;
  const base = `<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/><g fill="url(#sb-wood-dark)">${sq}</g>`;
  const arrow = (x1, y1, x2, y2, col) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="7" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="7" fill="${col}"/>`;
  const img = (p, x, y, s = 40) => `<image href="assets/pieces/${p}.svg" x="${x}" y="${y}" width="${s}" height="${s}"/>`;
  if (kind === 'trainer') svg.innerHTML = base + img('wN', 4, 54, 42) + arrow(25, 75, 62, 38, 'rgba(40,175,105,.9)') + img('bK', 54, 4, 42);
  else if (kind === 'eroeffnungen') svg.innerHTML = base + img('wP', 30, 55, 40) + arrow(50, 70, 50, 30, 'rgba(40,175,105,.9)');
  else if (kind === 'taktik') svg.innerHTML = base + img('wN', 30, 30, 40) + img('bK', 4, 2, 30) + img('bQ', 66, 2, 30) + arrow(50, 45, 20, 20, 'rgba(229,72,59,.85)') + arrow(50, 45, 80, 20, 'rgba(229,72,59,.85)');
  else if (kind === 'endspiele') svg.innerHTML = base + img('wK', 30, 55, 38) + img('wP', 30, 30, 34) + img('bK', 55, 2, 38);
  else svg.innerHTML = base + '<text x="50" y="62" text-anchor="middle" font-size="40" fill="#2a1d12">★</text>';
  return svg;
}

// ---------------------------------------------------------------------------------------------------------------
export function showTrainer(root, nav) {
  let epoch = 0;
  const timers = new Set();
  let page = null;        // Debug/Tests: { kind, … }
  let scr = null;         // Brett-Bildschirm (falls offen)

  const later = (fn, ms) => {
    const my = epoch;
    const t = setTimeout(() => { timers.delete(t); if (my === epoch) fn(); }, ms);
    timers.add(t);
  };
  function reset() {
    epoch++;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (scr) { scr.destroy(); scr = null; }
    page = null;
  }

  // ---------- Listen-Seiten ----------
  function listPage(title, back, ...cards) {
    const el = h('div', { class: 'screen lobby trainer' },
      h('header', { class: 'tr-head' },
        h('button', { class: 'icon-btn back', 'aria-label': 'Zurück', text: '‹', data: { act: 'back' }, on: { click: back } }),
        h('h1', { text: title })),
      h('div', { class: 'tr-cards' }, ...cards));
    clear(root).appendChild(el);
    window.scrollTo(0, 0);
    return el;
  }

  function row({ title, sub, badge, badgeCls, onClick, data }) {
    return h('button', { class: 'tr-row', data, on: { click: onClick } },
      h('span', { class: 'tr-row-text' }, h('span', { class: 'tr-row-t', text: title }), sub ? h('span', { class: 'tr-row-sub', text: sub }) : null),
      badge ? h('span', { class: 'tr-badge ' + (badgeCls || ''), text: badge }) : null);
  }

  function home() {
    reset();
    page = { kind: 'home' };
    const t = load();
    const n = now();
    const learned = Object.keys(t.open).length;
    const due = LT.dueKeys(t.open, n).length;
    const solved = Object.values(t.tac.done || {}).filter(Boolean).length;
    const stars = Object.values(t.end).reduce((a, b) => a + b, 0);
    const card = (kind, title, text, stat, btn, path) => h('section', { class: 'card tr-card', data: { area: kind } },
      h('button', { class: 'tr-card-main', on: { click: () => nav.go(path) } }, icon(kind),
        h('span', { class: 'tr-card-text' }, h('span', { class: 'tr-card-t', text: title }), h('span', { class: 'tr-card-sub', text }), h('span', { class: 'tr-card-stat', text: stat }))),
      btn);
    listPage('Schach-Trainer', () => nav.lobby(),
      h('p', { class: 'tr-lead', text: 'Allein üben, ohne Konto und offline. Dein Fortschritt bleibt auf diesem Gerät.' }),
      card('eroeffnungen', 'Eröffnungen', `${LINES.length} Hauptlinien: ansehen, lernen, wiederholen`, `${learned} gelernt · ${due} fällig`,
        due ? h('button', { class: 'btn primary', data: { act: 'review' }, on: { click: () => nav.go('trainer/wiederholen') } }, `Wiederholen (${due})`) : null, 'trainer/eroeffnungen'),
      card('taktik', 'Taktik', `${PUZZLES.length} Aufgaben in ${MOTIFS.length} Motiven`, `Wertung ${t.tac.rating} · ${solved} gelöst · Serie ${t.tac.streak}`,
        h('button', { class: 'btn', data: { act: 'mix' }, on: { click: () => nav.go('trainer/t/mix') } }, 'Aufgabe passend zur Wertung'), 'trainer/taktik'),
      card('endspiele', 'Endspiele', `${LESSONS.length} Lektionen gegen den Computer`, `${stars} von ${LESSONS.length * 3} Sternen`, null, 'trainer/endspiele'),
      h('section', { class: 'card tr-card' },
        h('button', { class: 'tr-card-main', data: { act: 'progress' }, on: { click: () => nav.go('trainer/fortschritt') } }, icon('fortschritt'),
          h('span', { class: 'tr-card-text' }, h('span', { class: 'tr-card-t', text: 'Fortschritt' }), h('span', { class: 'tr-card-sub', text: 'Gelernt, zu wiederholen, gelöst – und zurücksetzen' })))));
  }

  function openingsList() {
    reset();
    page = { kind: 'eroeffnungen' };
    const t = load();
    const n = now();
    const due = LT.dueKeys(t.open, n);
    const next = LT.nextDue(t.open, n);
    const cards = [];
    cards.push(h('section', { class: 'card' },
      h('h2', { text: 'Wiederholen' }),
      h('p', { class: 'muted', text: due.length ? `${due.length} Linie${due.length === 1 ? '' : 'n'} fällig. Linien, die du vergisst, kommen öfter dran.` :
        Object.keys(t.open).length ? `Gerade nichts fällig${next ? ` – nächste ${whenText(next - n)}` : ''}.` : 'Lerne zuerst eine Linie – dann fragt der Trainer sie in wachsenden Abständen wieder ab.' }),
      h('button', { class: 'btn primary', disabled: !due.length, data: { act: 'review' }, on: { click: () => nav.go('trainer/wiederholen') } }, due.length ? `Jetzt wiederholen (${due.length})` : 'Nichts fällig')));
    for (const f of byFamily()) {
      cards.push(h('section', { class: 'card tr-family', data: { family: f.id } },
        h('h2', { text: f.name }),
        h('p', { class: 'muted small', text: f.intro }),
        ...f.lines.map((l) => {
          const cw = t.open[LT.cardKey(l.id, 'w')], cb = t.open[LT.cardKey(l.id, 'b')];
          const cs = [cw, cb].filter(Boolean);
          const isDue = cs.some((c) => LT.isDue(c, n));
          const badge = !cs.length ? 'neu' : isDue ? 'fällig' : `Fach ${Math.max(...cs.map((c) => c.box))}`;
          return row({ title: l.name, sub: `${COLOR[l.side]} lernt · ${Math.ceil(lineMoves(l).length / 2)} Züge · ${l.eco}`, badge, badgeCls: !cs.length ? 'new' : isDue ? 'due' : 'ok',
            data: { line: l.id }, onClick: () => lineSheet(l) });
        })));
    }
    listPage('Eröffnungen', () => nav.go('trainer'), ...cards);
  }

  function lineSheet(l) {
    let color = l.side;
    const sh = sheet(lineName(l),
      h('p', { text: l.idea }),
      h('p', { class: 'muted small', text: `${l.eco} · Lichess: ${l.lichess} · ${lineMoves(l).map((m, i) => (i % 2 ? '' : moveNo(i) + ' ') + m.de).join(' ')}` }),
      seg('Du spielst', [{ v: 'w', t: 'Weiß' }, { v: 'b', t: 'Schwarz' }], color, (v) => { color = v; }));
    sh.body.append(
      h('div', { class: 'row' },
        h('button', { class: 'btn', data: { act: 'view' }, on: { click: () => { sh.close(); nav.go(`trainer/e/${l.id}/ansehen/${color}`); } } }, 'Ansehen'),
        h('button', { class: 'btn primary', data: { act: 'learn' }, on: { click: () => { sh.close(); nav.go(`trainer/e/${l.id}/lernen/${color}`); } } }, 'Lernen')),
      h('p', { class: 'muted small', text: 'Ansehen: Züge mit Pfeilen vor- und zurückblättern. Lernen: Du ziehst deine Seite, der Trainer die andere – bei einem falschen Zug gibt es einen Hinweis.' }));
  }

  function whenText(ms) {
    const d = ms / LT.DAY;
    if (d < 1 / 24) return 'in wenigen Minuten';
    if (d < 1) return `in ${Math.max(1, Math.round(d * 24))} Std.`;
    if (d < 1.5) return 'morgen';
    return `in ${Math.round(d)} Tagen`;
  }

  function tacticsList() {
    reset();
    page = { kind: 'taktik' };
    const t = load();
    const done = t.tac.done || {};
    const solved = PUZZLES.filter((p) => done[p[0]]).length;
    listPage('Taktik', () => nav.go('trainer'),
      h('section', { class: 'card tr-stat' },
        h('div', { class: 'tr-stat-row' },
          h('div', {}, h('div', { class: 'tr-big', text: String(t.tac.rating) }), h('div', { class: 'muted small', text: 'deine Wertung' })),
          h('div', {}, h('div', { class: 'tr-big', text: String(t.tac.streak) }), h('div', { class: 'muted small', text: `Serie (beste ${t.tac.best})` })),
          h('div', {}, h('div', { class: 'tr-big', text: `${solved}` }), h('div', { class: 'muted small', text: `von ${PUZZLES.length} gelöst` }))),
        h('button', { class: 'btn primary', data: { act: 'mix' }, on: { click: () => nav.go('trainer/t/mix') } }, 'Gemischt – passend zu deiner Wertung'),
        h('p', { class: 'muted small', text: 'Die Wertung ist wie bei Lichess: Löst du eine Aufgabe ohne Fehler und ohne Tipp, steigt sie – je schwerer die Aufgabe, desto mehr. Gewertet wird nur der erste Versuch.' })),
      h('section', { class: 'card' }, h('h2', { text: 'Motive' }),
        ...MOTIFS.map((m) => {
          const rows = PUZZLES.filter((p) => p[4] === m.id);
          const ok = rows.filter((p) => done[p[0]]).length;
          return row({ title: m.name, sub: `${rows.length} Aufgaben, Wertung ${rows[0][3]}–${rows[rows.length - 1][3]}`, badge: `${ok}/${rows.length}`, badgeCls: ok === rows.length ? 'ok' : ok ? '' : 'new',
            data: { motif: m.id }, onClick: () => nav.go(`trainer/t/${m.id}`) });
        })),
      h('p', { class: 'muted small tr-src', text: 'Aufgaben: Lichess-Puzzle-Datenbank (CC0), kuratierte Auswahl.' }));
  }

  function endgamesList() {
    reset();
    page = { kind: 'endspiele' };
    const t = load();
    listPage('Endspiele', () => nav.go('trainer'),
      ...GROUPS.map((g) => h('section', { class: 'card', data: { group: g.id } },
        h('h2', { text: g.name }),
        h('p', { class: 'muted small', text: g.intro }),
        ...LESSONS.filter((l) => l.group === g.id).map((l) => row({
          title: l.title + (l.optional ? ' (für Profis)' : ''), sub: `${lessonGoal(l)} · ${COLOR[userColorOf(l)]}`, badge: starsText(t.end[l.id] || 0), badgeCls: 'stars' + (t.end[l.id] ? ' ok' : ''),
          data: { lesson: l.id }, onClick: () => nav.go(`trainer/s/${l.id}`)
        })))));
  }

  function progressPage() {
    reset();
    page = { kind: 'fortschritt' };
    const t = load();
    const n = now();
    const cards = Object.entries(t.open);
    const due = LT.dueKeys(t.open, n).length;
    const boxes = [1, 2, 3, 4, 5].map((b) => cards.filter(([, c]) => c.box === b).length);
    const done = t.tac.done || {};
    const clean = Object.values(done).filter((v) => v === 1).length;
    const helped = Object.values(done).filter((v) => v === 2).length;
    const passed = LESSONS.filter((l) => t.end[l.id]).length;
    const stars = Object.values(t.end).reduce((a, b) => a + b, 0);
    const dl = (...pairs) => h('dl', { class: 'tr-dl' }, ...pairs.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
    listPage('Fortschritt', () => nav.go('trainer'),
      h('section', { class: 'card' }, h('h2', { text: 'Eröffnungen' }), dl(
        ['gelernt', `${cards.length} Linie(n) (je Farbe gezählt) von ${LINES.length} Linien`],
        ['zu wiederholen', due ? `${due} jetzt fällig` : 'nichts fällig'],
        ['Fächer 1–5', boxes.join(' · ')])),
      h('section', { class: 'card' }, h('h2', { text: 'Taktik' }), dl(
        ['gelöst', `${clean + helped} von ${PUZZLES.length} (${clean} ohne Hilfe)`],
        ['Wertung', `${t.tac.rating} nach ${t.tac.games} gewerteten Aufgaben`],
        ['Serie', `${t.tac.streak} (beste ${t.tac.best})`]),
      ...MOTIFS.map((m) => { const rows = PUZZLES.filter((p) => p[4] === m.id); return h('div', { class: 'tr-bar-row' }, h('span', { text: m.name }), h('span', { class: 'tr-bar' }, h('span', { style: { width: `${(100 * rows.filter((p) => done[p[0]]).length) / rows.length}%` } }))); })),
      h('section', { class: 'card' }, h('h2', { text: 'Endspiele' }), dl(
        ['bestanden', `${passed} von ${LESSONS.length} Lektionen`],
        ['Sterne', `${stars} von ${LESSONS.length * 3}`])),
      h('section', { class: 'card' }, h('h2', { text: 'Zurücksetzen' }),
        h('p', { class: 'muted small', text: 'Löscht den gesamten Trainer-Fortschritt auf diesem Gerät (Karteikarten, Wertung, Sterne). Laufende Partien bleiben.' }),
        h('button', { class: 'btn', data: { act: 'reset' }, on: { click: () => {
          const sh = sheet('Fortschritt löschen?', h('p', { text: 'Wirklich alles zurücksetzen? Das lässt sich nicht rückgängig machen.' }),
            h('div', { class: 'row' },
              h('button', { class: 'btn', on: { click: () => sh.close() } }, 'Abbrechen'),
              h('button', { class: 'btn primary', data: { act: 'reset-yes' }, on: { click: () => { store.resetTrainer(); sh.close(); toast('Trainer-Fortschritt gelöscht'); progressPage(); } } }, 'Ja, löschen')));
        } } }, 'Fortschritt zurücksetzen')));
  }

  // ---------- Brett-Bildschirm ----------
  function boardScreen({ title, sub, back }) {
    const bar = h('header', { class: 'tbar' },
      h('button', { class: 'icon-btn back', 'aria-label': 'Zurück', text: '‹', data: { act: 'back' }, on: { click: back } }),
      h('div', { class: 'tb-title' }, h('span', { class: 'tb-game', text: title }), h('span', { class: 'tb-var', text: sub || '' })),
      h('button', { class: 'icon-btn', 'aria-label': 'Menü', text: '⋯', data: { act: 'menu' }, on: { click: () => menu() } }));
    const boardWrap = h('div', { class: 'board-wrap' });
    const evalBar = h('div', { class: 'evalbar hidden', 'aria-hidden': 'true' }, h('div', { class: 'evalfill' }));
    boardWrap.appendChild(evalBar);
    const statusEl = h('div', { class: 'status tr-status', 'aria-live': 'polite' });
    const evalBtn = h('button', { class: 'eval-btn hidden', data: { act: 'eval' }, on: { click: () => {
      const st = store.settings(); st.evalMode = st.evalMode === 'pct' ? 'num' : 'pct'; store.saveSettings(st); drawEval();
    } } });
    const hintEl = h('div', { class: 'hint' });
    const actions = h('div', { class: 'actions' });
    const infoEl = h('div', { class: 'tr-info' });
    const movesEl = h('ol', { class: 'movelist' });
    const screen = h('div', { class: 'screen table-screen trainer-board' },
      bar,
      h('div', { class: 'tmain' }, boardWrap),
      h('aside', { class: 'tside' }, h('div', { class: 'status-row' }, statusEl, evalBtn), hintEl, actions, infoEl,
        h('div', { class: 'moves-box' }, h('div', { class: 'moves-h', text: 'Züge' }), movesEl)));
    clear(root).appendChild(screen);
    document.body.dataset.screen = 'table';
    let onMove = null, flip = false, cur = null, evalRes = null, evalKey = '', evalSrc = null;
    const view = createBoard(boardWrap, { onMove: (m) => onMove && onMove(m), onHint: (t) => { hintEl.textContent = t; } });
    const evalOn = () => !!load().opt.eval;

    function drawEval() {
      const on = evalOn() && !!evalRes;
      evalBar.classList.toggle('hidden', !on);
      evalBtn.classList.toggle('hidden', !evalOn());
      evalBtn.classList.toggle('pending', evalOn() && !evalRes);
      if (!evalOn()) return;
      if (!evalRes) { evalBtn.textContent = 'Wer gewinnt? …'; return; }
      evalBar.firstChild.style.transform = `scaleY(${Math.max(0, Math.min(1, evalRes.p)).toFixed(3)})`;   // n9: nur Compositor
      if (evalRes.text) { evalBtn.textContent = `Wer gewinnt? ${evalRes.text}`; return; }
      const cfg = EVAL.schach, x = evalRes.x;
      const ax = Math.abs(x).toFixed(cfg.digits), zero = Number(ax) === 0;
      const num = Math.abs(x) >= 99 ? (x > 0 ? 'Matt in Sicht' : 'Matt droht') : `${zero ? '±' : x > 0 ? '+' : '−'}${ax.replace('.', ',')} ${cfg.unit}`;
      evalBtn.textContent = `Wer gewinnt? ${store.settings().evalMode === 'pct' ? `${Math.round(evalRes.p * 100)} % Gewinnchance` : num}`;
    }
    function refreshEval() {
      if (!evalOn() || !cur || !evalSrc) { drawEval(); return; }
      const { gs, seat, exact } = evalSrc;
      const key = gs.fen + seat;
      if (key === evalKey && evalRes) return drawEval();
      evalKey = key;
      evalRes = null;
      if (exact) {
        const p = tbProbe(gs.fen);
        if (p) {
          const mine = (gs.turn === seat) ? p.result : p.result === 'win' ? 'loss' : p.result === 'loss' ? 'win' : 'draw';
          evalRes = { p: mine === 'win' ? 1 : mine === 'loss' ? 0 : 0.5, text: mine === 'draw' ? 'Remis (exakt)' : mine === 'win' ? `Du gewinnst – Matt in ${p.mateIn}` : `Du verlierst – Matt in ${p.mateIn}` };
          return drawEval();
        }
      }
      drawEval();
      if (gs.over) { evalRes = { x: gs.over.winner === null ? 0 : gs.over.winner === seat ? 99 : -99, p: gs.over.winner === null ? 0.5 : gs.over.winner === seat ? 1 : 0 }; return drawEval(); }
      evaluateBoard('schach', gs, seat).then((r) => { if (evalKey === key) { evalRes = r; drawEval(); } }).catch(() => {});
    }

    function menu() {
      const sh = sheet('Menü',
        h('button', { class: 'menu-item', data: { act: 'eval-toggle' }, on: { click: () => { const t = load(); t.opt.eval = !t.opt.eval; save(t); sh.close(); evalKey = ''; refreshEval(); } } },
          `„Wer gewinnt?“ ${evalOn() ? 'ausblenden' : 'einblenden'}`),
        h('button', { class: 'menu-item', data: { act: 'flip' }, on: { click: () => { sh.close(); flip = !flip; api.redraw(); } } }, 'Brett drehen'),
        h('button', { class: 'menu-item', on: { click: () => { sh.close(); nav.go('trainer'); } } }, 'Trainer-Übersicht'),
        h('button', { class: 'menu-item', on: { click: () => { sh.close(); nav.lobby(); } } }, 'Zur Spielebox'));
    }

    let autoMoves = false;
    const api = {
      view,
      setFlip(f) { flip = f; },
      autoMoves() { autoMoves = true; },
      onMove(fn) { onMove = fn; },
      // Stellung zeigen; move+prevGs → animiert; cpu → im Computer-Tempo
      show({ gs, last = null, move = null, prevGs = null, cpu = false, legal = false, marks = null, evalFor = null, exact = false }) {
        cur = { gs, last: last ? { m: last } : null, legal, marks };
        if (autoMoves) api.moves(sanPairs(gs), Number.MAX_SAFE_INTEGER);
        view.update(cur, move ? { kind: 'move', move, prevGs } : { kind: 'state' }, {
          legal: legal && !gs.over ? S.legalMoves(gs) : null, flip, anim: cpu ? tempoParams(tempoLevel()) : OWN, marks
        });
        if (evalFor !== null) evalSrc = { gs, seat: evalFor, exact };
        refreshEval();
      },
      redraw() { if (cur) view.update(cur, { kind: 'state' }, { legal: cur.legal && !cur.gs.over ? S.legalMoves(cur.gs) : null, flip, anim: OWN, marks: cur.marks }); },
      marks(m) { if (cur) cur.marks = m; view.marks(m); },
      status(t, state = '') { statusEl.textContent = t; statusEl.dataset.state = state; },
      hint(t) { hintEl.textContent = t; },
      info(...nodes) { clear(infoEl).append(...nodes.filter(Boolean)); infoEl.classList.toggle('hidden', !nodes.filter(Boolean).length); },
      actions(...btns) { clear(actions).append(...btns.filter(Boolean)); },
      moves(items, active = -1) {
        clear(movesEl);
        if (active === Number.MAX_SAFE_INTEGER) active = items.length - 1;
        movesEl.parentNode.classList.toggle('empty', !items.length);
        items.forEach((it, i) => movesEl.appendChild(h('li', { class: 'mv' + (i === active ? ' on' : ''), text: it })));
        const on = movesEl.querySelector('.on');
        if (on) on.scrollIntoView({ block: 'nearest' });
      },
      destroy() { view.destroy(); }
    };
    return api;
  }

  const btn = (label, onClick, { primary = false, act = null, disabled = false } = {}) =>
    h('button', { class: 'btn' + (primary ? ' primary' : ''), data: act ? { act } : undefined, disabled, on: { click: onClick } }, label);

  // ---------- Eröffnung: Ansehen ----------
  function gsAlong(line) {
    const mv = lineMoves(line);
    const list = [S.initialState()];
    for (const m of mv) list.push(S.applyMove(list[list.length - 1], plain(m)));
    return list;
  }

  // Zugliste einer Partie ab beliebiger Stellung (Aufgaben, Endspiele): „12… Sf3  13. Dxd5“
  function sanPairs(gs) {
    const start = (gs.start || S.START).split(' ');
    let ply = (Number(start[5]) - 1) * 2 + (start[1] === 'b' ? 1 : 0);
    const out = [];
    for (const san of gs.sans) {
      const de = S.sanDe(san);
      if (ply % 2 === 0 || !out.length) out.push(`${moveNo(ply)} ${de}`);
      else out[out.length - 1] += `  ${de}`;
      ply++;
    }
    return out;
  }

  function movePairs(mv) {
    const out = [];
    for (let i = 0; i < mv.length; i += 2) out.push(`${moveNo(i)} ${mv[i].de}${mv[i + 1] ? '  ' + mv[i + 1].de : ''}`);
    return out;
  }

  function openingView(line, color) {
    reset();
    const mv = lineMoves(line);
    const gl = gsAlong(line);
    scr = boardScreen({ title: lineName(line), sub: `Ansehen · ${COLOR[color]} unten`, back: () => nav.go('trainer/eroeffnungen') });
    scr.setFlip(color === 'b');
    let ply = 0;
    page = { kind: 'ansehen', line: line.id, get ply() { return ply; } };
    const draw = (animate) => {
      const prev = ply > 0 ? mv[ply - 1] : null;
      const next = ply < mv.length ? mv[ply] : null;
      scr.show({ gs: gl[ply], last: prev ? plain(prev) : null, move: animate && prev ? plain(prev) : null, prevGs: animate ? gl[ply - 1] : null,
        marks: next ? { arrows: [{ from: next.from, to: next.to, cls: next.ply % 2 ? 'b' : 'w' }] } : null, evalFor: seatOf(color) });
      scr.status(ply === 0 ? 'Grundstellung' : `${moveNo(ply - 1)} ${prev.de}`);
      scr.hint(next ? `Pfeil: nächster Zug ${moveNo(ply)} ${next.de}` : 'Ende der Linie');
      const note = line.notes && prev ? line.notes[ply - 1] : null;
      scr.info(h('p', { class: 'tr-idea', text: note || line.idea }), note ? null : h('p', { class: 'muted small', text: `${line.eco} · ${line.lichess}` }));
      scr.moves(movePairs(mv), ply ? Math.floor((ply - 1) / 2) : -1);
      scr.actions(
        btn('‹ Zurück', () => { if (ply > 0) { ply--; draw(false); } }, { act: 'prev', disabled: ply === 0 }),
        btn('Vor ›', () => { if (ply < mv.length) { ply++; draw(true); } }, { act: 'next', primary: ply < mv.length, disabled: ply >= mv.length }),
        btn('Von vorn', () => { ply = 0; draw(false); }, { act: 'start' }),
        btn('Lernen', () => nav.go(`trainer/e/${line.id}/lernen/${color}`), { act: 'learn', primary: ply >= mv.length }));
    };
    draw(false);
  }

  // ---------- Eröffnung: Lernen / Wiederholen ----------
  // queue: Liste von Kartenschlüsseln (Wiederholen) oder null (Lernen einer Linie)
  function openingDrill(line, color, queue = null, qi = 0) {
    reset();
    const review = !!queue;
    const mv = lineMoves(line);
    const gl = gsAlong(line);
    scr = boardScreen({ title: lineName(line), sub: review ? `Wiederholen ${qi + 1}/${queue.length} · ${COLOR[color]}` : `Lernen · du spielst ${COLOR[color]}`, back: () => nav.go('trainer/eroeffnungen') });
    scr.setFlip(color === 'b');
    let ply = 0, mistakes = 0, hint = 0, done = false;
    page = { kind: review ? 'wiederholen' : 'lernen', line: line.id, color, get ply() { return ply; }, get mistakes() { return mistakes; }, get done() { return done; } };
    const myTurn = () => (ply % 2 === 0 ? 'w' : 'b') === color;

    const draw = (animMove = null, cpu = false) => {
      const prev = ply > 0 ? mv[ply - 1] : null;
      const next = mv[ply];
      const marks = !done && next && myTurn() && hint ? { squares: [{ sq: next.from, cls: 'hint' }, ...(hint >= 2 ? [{ sq: next.to, cls: 'hint-to' }] : [])], arrows: hint >= 2 ? [{ from: next.from, to: next.to, cls: 'hint' }] : [] } : null;
      scr.show({ gs: gl[ply], last: prev ? plain(prev) : null, move: animMove, prevGs: animMove ? gl[ply - 1] : null, cpu, legal: !done && myTurn() && ply < mv.length, marks, evalFor: seatOf(color) });
      scr.moves(movePairs(mv.slice(0, ply)), ply ? Math.floor((ply - 1) / 2) : -1);
    };

    function step(animMove = null, cpu = false) {
      if (ply >= mv.length) return finish(animMove, cpu);
      draw(animMove, cpu);
      const note = line.notes && ply > 0 ? line.notes[ply - 1] : null;
      scr.info(note ? h('p', { class: 'tr-idea', text: note }) : h('p', { class: 'tr-idea muted', text: review ? 'Spiel die Linie aus dem Gedächtnis.' : line.idea }));
      if (!myTurn()) {
        scr.status(`${COLOR[ply % 2 ? 'b' : 'w']} zieht …`);
        scr.actions(btn('Tipp', () => {}, { act: 'tip', disabled: true }), btn('Aufhören', () => nav.go('trainer/eroeffnungen'), { act: 'quit' }));
        later(() => { ply++; step(plain(mv[ply - 1]), true); }, replyDelay() + 150);
        return;
      }
      scr.status(`Du bist dran (${COLOR[color]}) – Zug ${moveNo(ply)}`);
      scr.actions(
        btn('Tipp', () => { hint = Math.min(2, hint + 1); mistakes++; draw(); scr.hint(hint >= 2 ? `So geht es: ${moveNo(ply)} ${mv[ply].de}` : `Zieh mit ${PIECE_DAT[pieceAt(gl[ply], mv[ply].from)]}.`); }, { act: 'tip' }),
        btn('Aufhören', () => nav.go('trainer/eroeffnungen'), { act: 'quit' }));
    }

    scr.onMove((m) => {
      if (done || !myTurn()) return;
      if (checkMove(line, ply, m)) {
        hint = 0;
        ply++;
        step(m, false);
        return;
      }
      mistakes++;
      hint = Math.min(2, hint + 1);
      const want = mv[ply];
      draw();
      scr.status('Nicht ganz – versuch es nochmal', 'warn');
      scr.hint(hint >= 2 ? `In dieser Linie: ${moveNo(ply)} ${want.de} (Pfeil)` : `Tipp: Zieh mit ${PIECE_DAT[pieceAt(gl[ply], want.from)]}.`);
    });

    function finish(animMove, cpu) {
      done = true;
      draw(animMove, cpu);
      const t = load();
      const key = LT.cardKey(line.id, color);
      const before = t.open[key];
      t.open[key] = review ? LT.review(before, mistakes, now()) : LT.learned(before, mistakes, now());
      save(t);
      const c = t.open[key];
      scr.status(mistakes ? `Linie geschafft – mit ${mistakes} Hilfe${mistakes === 1 ? '' : 'n'}` : 'Linie fehlerfrei geschafft! ✓', 'over');
      scr.info(h('p', { class: 'tr-idea', text: line.idea }),
        h('p', { class: 'muted small', text: mistakes ? 'Die Linie kommt bald noch einmal zum Wiederholen.' : `Nächste Wiederholung ${whenText(c.due - now())} (Fach ${c.box}).` }));
      const playOn = btn('Gegen Computer weiterspielen', () => levelSheet((level) => nav.playFrom({ moves: mv.map(plain), color, level })), { act: 'play-on', primary: !review });
      if (review) {
        const t2 = load();
        const rest = LT.dueKeys(t2.open, now()).filter((k) => !queue.slice(0, qi + 1).includes(k));
        const nextKey = queue[qi + 1] || null;
        scr.actions(
          nextKey || rest.length ? btn('Nächste Linie', () => startReview(queue, qi + 1), { act: 'next', primary: true }) : btn('Fertig', () => nav.go('trainer/eroeffnungen'), { act: 'done', primary: true }),
          playOn);
      } else {
        scr.actions(playOn, btn('Nochmal', () => openingDrill(line, color), { act: 'again' }), btn('Zur Liste', () => nav.go('trainer/eroeffnungen'), { act: 'list' }));
      }
      later(() => {
        // Linie fertig: am Ende den letzten Zug nicht verdecken – Hinweis als Meldung
        if (!mistakes) toast(review ? 'Richtig erinnert!' : 'Gut gemacht!');
      }, 200);
    }
    step();
  }

  function pieceAt(gs, sq) {
    const b = S.board(gs);
    const p = b[8 - Number(sq[1])]['abcdefgh'.indexOf(sq[0])];
    return p ? p.type : 'p';
  }

  function levelSheet(fn) {
    const sh = sheet('Gegen den Computer',
      h('p', { class: 'muted', text: 'Die Partie geht aus dieser Stellung weiter – wie eine normale Partie gegen den Computer (mit Zugliste, Remis, PGN).' }),
      ...[[1, 'Leicht'], [2, 'Mittel'], [3, 'Stark']].map(([v, t]) => h('button', { class: 'menu-item', data: { level: String(v) }, on: { click: () => { sh.close(); fn(v); } } }, t)));
  }

  function startReview(queue = null, qi = 0) {
    const t = load();
    const q = queue && qi < queue.length ? queue : LT.dueKeys(t.open, now());
    const i = queue && qi < queue.length ? qi : 0;
    if (!q.length) { toast('Nichts fällig – gut gemacht!'); nav.go('trainer/eroeffnungen'); return; }
    const [id, color] = q[i].split(':');
    const line = lineById(id);
    if (!line) { const t2 = load(); delete t2.open[q[i]]; save(t2); return startReview(); }
    openingDrill(line, color, q, i);
  }

  // ---------- Taktik ----------
  function nextPuzzle(motif) {
    const t = load();
    const done = t.tac.done || {};
    if (motif === 'mix') return pickNear(PUZZLES, t.tac.rating, done);
    const rows = PUZZLES.filter((p) => p[4] === motif);
    return rows.find((p) => !done[p[0]]) || rows.find((p) => done[p[0]] !== 1) || rows[(t.tac.cycle?.[motif] || 0) % rows.length];
  }

  function puzzle(motif, row = null) {
    reset();
    row = row || nextPuzzle(motif);
    const p = PZ.puzzleObj(row);
    const m = MOTIFS.find((x) => x.id === p.motif);
    const st0 = PZ.startOf(p);
    const user = st0.userColor;
    const steps = PZ.userSteps(p);
    const mateN = /^matt(\d)$/.exec(p.motif);
    scr = boardScreen({ title: motif === 'mix' ? 'Taktik – gemischt' : `Taktik – ${m.name}`, sub: `Aufgabe ${p.id} · Wertung ${p.rating}`, back: () => nav.go('trainer/taktik') });
    scr.setFlip(user === 'b');
    scr.autoMoves();
    let gs = S.fromFen(p.fen);
    let step = 0, mistakes = 0, helped = false, done = false, last = null;
    page = { kind: 'taktik', id: p.id, motif: p.motif, user, get step() { return step; }, get done() { return done; }, get mistakes() { return mistakes; }, puzzle: p };
    const task = mateN ? `Setze matt in ${mateN[1]} ${mateN[1] === '1' ? 'Zug' : 'Zügen'}` : 'Finde den besten Zug';
    scr.info(h('p', { class: 'tr-idea' }, h('b', { text: m.name + ': ' }), m.intro));
    scr.status(`${COLOR[user]} am Zug – ${task}`);
    scr.show({ gs, evalFor: seatOf(user) });
    scr.actions(btn('Tipp', () => {}, { act: 'tip', disabled: true }));
    // erst den Gegnerzug zeigen
    later(() => {
      const prev = gs;
      gs = S.applyMove(gs, st0.opp);
      last = st0.opp;
      ready(st0.opp, prev, true);
    }, 650);

    function ready(move = null, prevGs = null, cpu = false, marks = null) {
      scr.show({ gs, last, move, prevGs, cpu, legal: !done, marks, evalFor: seatOf(user) });
      if (done) return;
      scr.actions(
        btn('Tipp', () => { helped = true; hintLevel(mistakes + 1); }, { act: 'tip' }),
        btn('Lösung zeigen', () => showSolution(), { act: 'solution' }),
        btn('Überspringen', () => puzzle(motif), { act: 'skip' }));
    }

    function hintLevel(level) {
      const e = PZ.expected(p, step);
      if (level <= 1) {
        scr.marks({ squares: [{ sq: e.from, cls: 'hint' }] });
        scr.hint(`Tipp: ${m.hint}`);
      } else {
        scr.marks({ squares: [{ sq: e.from, cls: 'hint' }, { sq: e.to, cls: 'hint-to' }], arrows: [{ from: e.from, to: e.to, cls: 'hint' }] });
        scr.hint(`So geht es: ${S.describeMove(gs, e)}`);
      }
    }

    scr.onMove((mv) => {
      if (done) return;
      const r = PZ.judge(p, step, mv);
      if (r === 'wrong') {
        mistakes++;
        scr.status('Nicht ganz – versuch es nochmal', 'warn');
        ready();
        hintLevel(mistakes);
        return;
      }
      const promo = mv.promo || (r === 'correct' ? PZ.expected(p, step).promo : undefined);
      const move = promo ? { from: mv.from, to: mv.to, promo } : { from: mv.from, to: mv.to };
      const prev = gs;
      gs = S.applyMove(gs, move);
      last = move;
      if (r === 'mate' || PZ.isLast(p, step)) { solved(move, prev); return; }
      scr.status('Richtig! Weiter …', 'ok');
      scr.show({ gs, last, move, prevGs: prev, legal: false, evalFor: seatOf(user) });
      const rep = PZ.reply(p, step);
      step++;
      later(() => {
        const pv = gs;
        gs = S.applyMove(gs, rep);
        last = rep;
        scr.status(`Und jetzt? (${step + 1} von ${steps})`);
        ready(rep, pv, true);
      }, replyDelay() + 200);
    });

    function solved(move, prev) {
      done = true;
      scr.show({ gs, last, move, prevGs: prev, legal: false, evalFor: seatOf(user) });
      finish(mistakes === 0 && !helped);
    }

    function showSolution() {
      if (done) return;
      done = true;
      helped = true;
      let k = step;
      const play = () => {
        const e = PZ.expected(p, k);
        if (!e) return finish(false, true);
        const pv = gs;
        gs = S.applyMove(gs, e);
        last = e;
        scr.show({ gs, last, move: e, prevGs: pv, cpu: true, legal: false, marks: null, evalFor: seatOf(user) });
        const rep = PZ.reply(p, k);
        if (!rep) { later(() => finish(false, true), 500); return; }
        later(() => { const pv2 = gs; gs = S.applyMove(gs, rep); last = rep; scr.show({ gs, last, move: rep, prevGs: pv2, cpu: true, legal: false, evalFor: seatOf(user) }); k++; later(play, replyDelay() + 300); }, replyDelay() + 300);
      };
      scr.status('Die Lösung …');
      scr.actions();
      play();
    }

    function finish(clean, shown = false) {
      const t = load();
      t.tac.done = t.tac.done || {};
      t.tac.rated = t.tac.rated || {};
      let delta = null;
      if (!t.tac.rated[p.id]) {
        const r = rate(t.tac, p.rating, clean);
        delta = r.delta;
        Object.assign(t.tac, r.st);
        t.tac.rated[p.id] = 1;
      }
      if (!shown) t.tac.done[p.id] = clean || t.tac.done[p.id] === 1 ? 1 : 2;
      if (motif !== 'mix') { t.tac.cycle = t.tac.cycle || {}; t.tac.cycle[motif] = (t.tac.cycle[motif] || 0) + 1; }
      save(t);
      const dText = delta === null ? '(schon gewertet)' : `(${delta >= 0 ? '+' : '−'}${Math.abs(delta)})`;
      if (shown) scr.status('Das war die Lösung.', 'warn');
      else scr.status(clean ? 'Gelöst! ✓' : 'Gelöst – mit Hilfe', 'over');
      scr.hint(`Wertung ${t.tac.rating} ${dText} · Serie ${t.tac.streak}`);
      scr.info(h('p', { class: 'tr-idea' }, h('b', { text: m.name + ': ' }), m.intro), h('p', { class: 'muted small', text: `Lichess-Aufgabe ${p.id}, Wertung ${p.rating}` }));
      if (clean && delta !== null && [3, 5, 10, 15, 20, 30, 50].includes(t.tac.streak)) toast(`${t.tac.streak} richtig in Folge!`);
      scr.actions(
        btn('Nächste Aufgabe', () => puzzle(motif), { act: 'next', primary: true }),
        btn('Nochmal', () => puzzle(motif, row), { act: 'again' }),
        btn('Motive', () => nav.go('trainer/taktik'), { act: 'list' }));
    }
  }

  // ---------- Endspiele ----------
  function lesson(l, fen = null) {
    reset();
    const mat = l.engine === 'tb' ? materialOf(l.fen) : null;
    if (mat) {
      // Tabelle bauen (einmal; ~0,1 s am Mac, am Handy etwas länger)
      try { tbBuild(mat.mat); } catch { /* bleibt null → Bot */ }
    }
    fen = fen || l.fen;
    const user = userColorOf(l);
    const startProbe = l.engine === 'tb' ? tbProbe(fen) : null;
    const optimal = startProbe && startProbe.mateIn ? startProbe.mateIn : null;
    scr = boardScreen({ title: l.title, sub: lessonGoal(l), back: () => nav.go('trainer/endspiele') });
    scr.setFlip(user === 'b');
    scr.autoMoves();
    let gs = S.fromFen(fen), last = null, moves = 0, hints = 0, promoted = false, done = false, busy = false;
    const hist = [];
    page = { kind: 'endspiel', id: l.id, user, get moves() { return moves; }, get done() { return done; }, get busy() { return busy; }, get fen() { return gs.fen; }, result: null };
    const exact = l.engine === 'tb';
    scr.info(h('p', { class: 'tr-idea', text: l.intro }),
      optimal && l.goal === 'mate' ? h('p', { class: 'muted small', text: `Mit bestem Spiel: Matt in ${optimal} Zügen. Der Computer verteidigt sich perfekt (exakte Endspiel-Tabelle).` }) :
        exact ? h('p', { class: 'muted small', text: 'Der Computer spielt perfekt (exakte Endspiel-Tabelle).' }) : h('p', { class: 'muted small', text: 'Der Computer spielt mit voller Stärke des Übungs-Computers.' }));

    const statusLine = () => `${COLOR[user]} · Zug ${moves + 1}${l.goal === 'mate' ? ` · Ziel: Matt bis Zug ${l.limit}` : l.goal === 'hold' ? ` · ${Math.max(0, l.holdMoves - moves)} Züge noch halten` : ''}`;
    function draw(move = null, prevGs = null, cpu = false, marks = null) {
      scr.show({ gs, last, move, prevGs, cpu, legal: !done && !busy && colorOfGs(gs) === user, marks, evalFor: seatOf(user), exact });
    }
    function controls() {
      scr.actions(
        btn('Tipp', () => tip(), { act: 'tip', disabled: done || busy }),
        btn('Zurück', () => undo(), { act: 'undo', disabled: busy || !hist.length }),
        btn(l.random ? 'Andere Stellung' : 'Neu starten', () => lesson(l, l.random ? randomFen(l) : null), { act: 'restart' }));
    }
    const repOf = () => gs.rep[S.positionKey(gs)] || 1;

    function tip() {
      if (done || busy) return;
      hints++;
      const show = (m) => { if (m) { scr.marks({ squares: [{ sq: m.from, cls: 'hint' }, { sq: m.to, cls: 'hint-to' }], arrows: [{ from: m.from, to: m.to, cls: 'hint' }] }); scr.hint(`Tipp: ${S.describeMove(gs, m)} – ${l.tip}`); } };
      if (exact && tbProbe(gs.fen)) show(tbBest(gs.fen));
      else { const my = epoch; scr.hint('Computer denkt nach …'); chooseBotMove('schach', gs, 3).then((m) => { if (my === epoch) show(m); }).catch(() => {}); }
    }
    function undo() {
      if (busy || !hist.length) return;
      ({ gs, last, moves, promoted } = hist.pop());
      hints++;
      done = false;
      scr.status(statusLine());
      scr.hint('Zug zurückgenommen (kostet einen Stern).');
      draw();
      controls();
    }

    function evaluate(by) {
      const r = checkGoal({ lesson: l, fen: gs.fen, user, moves, promoted, lastBy: by, rep: repOf() });
      if (!r.done) return false;
      done = true;
      busy = false;
      page.result = r;
      const t = load();
      if (r.ok) {
        const stars = l.goal === 'mate' ? Math.min(mateStars(l, moves, optimal || 0), helpStars(hints)) : helpStars(hints);
        t.end[l.id] = Math.max(t.end[l.id] || 0, stars);
        save(t);
        scr.status(`${r.reason} ${starsText(stars)}`, 'over');
        scr.hint(l.goal === 'mate' ? `${moves} Züge${optimal ? ` (bestes Spiel: ${optimal})` : ''}${hints ? ` · ${hints} Hilfe(n)` : ''}` : hints ? `${hints} Hilfe(n)` : 'Ohne Hilfe – perfekt!');
        const idx = LESSONS.indexOf(l);
        scr.actions(
          LESSONS[idx + 1] ? btn('Nächste Lektion', () => nav.go(`trainer/s/${LESSONS[idx + 1].id}`), { act: 'next', primary: true }) : btn('Zur Liste', () => nav.go('trainer/endspiele'), { act: 'list', primary: true }),
          btn(l.random ? 'Andere Stellung' : 'Nochmal', () => lesson(l, l.random ? randomFen(l) : null), { act: 'again' }),
          btn('Liste', () => nav.go('trainer/endspiele'), { act: 'list2' }));
      } else {
        scr.status(r.reason, 'warn');
        scr.hint(r.mistake ? 'Nimm den Zug zurück und versuch es anders – oder hol dir einen Tipp.' : 'Versuch es noch einmal.');
        scr.actions(
          hist.length ? btn('Zug zurücknehmen', () => undo(), { act: 'undo', primary: true }) : null,
          btn('Neu starten', () => lesson(l, fen), { act: 'restart' }),
          btn('Liste', () => nav.go('trainer/endspiele'), { act: 'list2' }));
      }
      return true;
    }

    function cpuMove() {
      busy = true;
      controls();
      const my = epoch;
      const t0 = Date.now();
      const apply = (m) => {
        if (my !== epoch || !m) return;
        later(() => {
          const prev = gs;
          gs = S.applyMove(gs, m);
          last = m;
          busy = false;
          draw(m, prev, true);
          if (evaluate('cpu')) return;
          scr.status(statusLine());
          scr.hint('');
          controls();
        }, Math.max(0, replyDelay() - (Date.now() - t0)));
      };
      if (exact && tbProbe(gs.fen)) apply(tbReply(gs.fen));
      else chooseBotMove('schach', gs, 3).then(apply).catch(() => { busy = false; controls(); });
    }

    scr.onMove((m) => {
      if (done || busy || colorOfGs(gs) !== user) return;
      hist.push({ gs, last, moves, promoted });
      const prev = gs;
      gs = S.applyMove(gs, m);
      last = m;
      moves++;
      if (m.promo) promoted = true;
      draw(m, prev);
      if (evaluate('user')) return;
      scr.status(statusLine());
      scr.hint('');
      cpuMove();
    });
    const go = () => {
      draw();
      scr.status(statusLine());
      controls();
      if (colorOfGs(gs) !== user) cpuMove();
    };
    go();
  }

  // ---------- Navigation ----------
  function show(path) {
    const parts = path.split('/');
    document.body.dataset.screen = 'trainer';
    const sub = parts[1] || '';
    if (!sub) return home();
    if (sub === 'eroeffnungen') return openingsList();
    if (sub === 'taktik') return tacticsList();
    if (sub === 'endspiele') return endgamesList();
    if (sub === 'fortschritt') return progressPage();
    if (sub === 'wiederholen') { reset(); return startReview(); }
    if (sub === 'e') {
      const line = lineById(parts[2]);
      const color = parts[4] === 'b' ? 'b' : 'w';
      if (!line) return openingsList();
      return parts[3] === 'ansehen' ? openingView(line, color) : openingDrill(line, color);
    }
    if (sub === 't') {
      const motif = parts[2] === 'mix' || MOTIFS.some((m) => m.id === parts[2]) ? parts[2] : 'mix';
      const row = parts[3] ? PZ.PUZZLE_BY_ID.get(parts[3]) : null;
      return puzzle(motif, row || null);
    }
    if (sub === 's') {
      const l = lessonById(parts[2]);
      return l ? lesson(l) : endgamesList();
    }
    return home();
  }

  return {
    show,
    destroy() { reset(); },
    // Tests
    page: () => page,
    target: (sq) => (scr ? scr.view.target(sq) : null),
    promoTarget: (to, k) => (scr ? scr.view.promoTarget(to, k) : null),
    metrics: () => (scr ? scr.view.metrics() : null)
  };
}
