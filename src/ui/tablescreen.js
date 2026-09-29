// Tisch-Ansicht: Kopfzeile mit Verbindungsstatus, Spielerleisten, Brett, Status/Hinweis, Aktionen,
// Warte-Karte mit den 3 Wörtern (groß, zum Diktieren), Teilen-Link, Menü (Zugliste, Regeln, Verbindung).
import { h, clear, sheet, toast } from './dom.js';
import { gameOf } from '../games/registry.js';
import { turnOf } from '../net/table.js';
import { displayWord, formatWords } from '../words.js';
import { helpNet } from './texts.js';
import { gameUi } from './gameui.js';
import { evaluateBoard } from '../botclient.js';
import { EVAL } from '../evalpos.js';
import * as store from '../store.js';

export function shareUrl(words) {
  return location.origin + location.pathname + '#' + formatWords(words);
}

export function wordsBlock(words) {
  return h('div', { class: 'words-big', 'aria-label': 'Die drei Wörter' }, ...words.map((w, k) =>
    h('div', { class: 'word-big' }, h('span', { class: 'word-n', text: String(k + 1) }), h('span', { class: 'word-t', text: displayWord(w) }))));
}

async function share(words, game) {
  const url = shareUrl(words);
  const text = `Komm an meinen Spieltisch (${game}): ${words.map(displayWord).join(' · ')}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Spielebox', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copy(`${text}\n${url}`);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert');
  } catch {
    toast('Kopieren nicht möglich – bitte die Wörter ansagen');
  }
}

// Text teilen (Android-Teilen-Menü) oder kopieren
async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copy(text);
}

export function showTableScreen(root, { session, words = null, onLeave, onAnotherGame, onNewLocal }) {
  const mode = session.mode;
  let view = null;
  let viewGame = null;
  let hintText = '';
  let lastTable = null;
  let netMode = mode === 'online' ? 'wartet' : 'lokal';
  let unlocked = null;   // zu zweit an einem Gerät mit verdeckten Karten: wessen Hand gerade gezeigt wird

  const title = h('div', { class: 'tb-title' });
  const pill = h('button', { class: 'pill', data: { net: '' }, on: { click: () => openNet() } });
  const bar = h('header', { class: 'tbar' },
    h('button', { class: 'icon-btn back', 'aria-label': 'Zur Übersicht', text: '‹', on: { click: () => onLeave() } }),
    title,
    pill,
    h('button', { class: 'icon-btn', 'aria-label': 'Menü', text: '⋯', data: { act: 'menu' }, on: { click: () => openMenu() } }));
  const pTop = h('div', { class: 'pbar top' });
  const pBot = h('div', { class: 'pbar bottom' });
  // Querformat: dieselben Leisten in der Seitenspalte
  const pTop2 = h('div', { class: 'pbar top' });
  const pBot2 = h('div', { class: 'pbar bottom' });
  const boardWrap = h('div', { class: 'board-wrap' });
  const statusEl = h('div', { class: 'status', 'aria-live': 'polite' });
  const fairEl = h('button', { class: 'fair-badge hidden', data: { act: 'fair' }, on: { click: () => openFair() } });
  // „Wer gewinnt?“: Balken am Brettrand + Zahl (antippen: Einheit ↔ Prozent)
  const evalBar = h('div', { class: 'evalbar hidden', 'aria-hidden': 'true' }, h('div', { class: 'evalfill' }));
  const evalBtn = h('button', { class: 'eval-btn hidden', data: { act: 'eval' }, on: { click: () => {
    const st = store.settings(); st.evalMode = st.evalMode === 'pct' ? 'num' : 'pct'; store.saveSettings(st); showEval();
  } } });
  let evalRes = null, evalKey = '';
  const hintEl = h('div', { class: 'hint' });
  const offerEl = h('div', { class: 'offer' });
  // Wiederverbinden: erst weich (Trystero + Relays neu), hilft das nach 12 s nicht, Seite neu laden –
  // Wörter stehen im #-Teil, der Stand in localStorage → die Partie geht danach einfach weiter
  let reconnectTimer = null;
  const reconnectNow = () => {
    session.link.reconnect();
    toast('Verbinde neu …');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      const m = session.netStatus().mode;
      if (m === 'getrennt' || (!session.table && m !== 'direkt' && m !== 'relay')) location.reload();
    }, 12000);
  };
  const netEl = h('div', { class: 'netwarn hidden' },
    h('span', { text: 'Verbindung weg.' }),
    h('button', { class: 'btn primary small', data: { act: 'reconnect-now' }, on: { click: reconnectNow } }, 'Wiederverbinden'));
  const actions = h('div', { class: 'actions' });
  const movesEl = h('ol', { class: 'movelist' });
  const overlay = h('div', { class: 'overlay hidden' });
  boardWrap.appendChild(overlay);

  const screen = h('div', { class: 'screen table-screen', data: { mode, game: '' } },
    bar,
    h('div', { class: 'tmain' }, pTop, boardWrap, pBot),
    h('aside', { class: 'tside' }, h('div', { class: 'side-players' }, pTop2, pBot2), h('div', { class: 'status-row' }, statusEl, evalBtn), fairEl, hintEl, netEl, offerEl, actions, h('div', { class: 'moves-box' }, h('div', { class: 'moves-h', text: 'Züge' }), movesEl)));
  clear(root).appendChild(screen);

  const eng = () => gameOf(session.table.game).engine;
  const hidden = () => !!(session.table && eng().HIDDEN);
  // wer schaut gerade auf den Bildschirm (Sitz, dessen Karten gezeigt werden)
  const viewer = () => (mode === 'hotseat' ? (hidden() ? unlocked : null) : session.mySeat);
  const bottomSeat = () => (mode === 'hotseat' ? (hidden() ? unlocked ?? 0 : 0) : session.mySeat ?? 0);
  // zu zweit am Gerät + verdeckte Karten: Hand erst zeigen, wenn der Richtige das Gerät hat
  const locked = (t) => mode === 'hotseat' && hidden() && !gameUi(t.game).shared && t.status === 'play' && turnOf(t) !== null && turnOf(t) !== unlocked &&
    !(eng().phase && eng().phase(t.gs) === 'spielende');
  const shownOf = (t) => (hidden() ? { ...t, gs: eng().viewFor(t.gs, locked(t) ? null : viewer() ?? null) } : t);

  function ensureView(t) {
    if (view && viewGame === t.game) return;
    if (view) view.destroy();
    viewGame = t.game;
    view = gameUi(t.game).board(boardWrap, {
      onMove: (m) => {
        const r = session.submitMove(m);
        if (!r.ok) { toast(r.reason || 'Zug nicht möglich'); render({ kind: 'state' }); }
      },
      onHint: (text) => { hintText = text; hintEl.textContent = text; },
      onLocal: () => { if (session.table) renderActions(session.table); }
    });
    boardWrap.appendChild(overlay);
    boardWrap.appendChild(evalBar);
  }

  function legalFor(t) {
    if (!t || t.status !== 'play' || session.pendingMove || locked(t)) return null;
    const seat = session.mySeat;
    if (seat === null || turnOf(t) !== seat) return null;
    if (t.seats[seat] && t.seats[seat].bot) return null;
    return eng().legalMoves(shownOf(t).gs);
  }

  function submit(m) {
    const r = session.submitMove(m);
    if (!r.ok) { toast(r.reason || 'Zug nicht möglich'); render({ kind: 'state' }); }
  }

  function seatLabel(t, seat) {
    const s = t.seats[seat];
    const name = s ? s.name : 'Platz frei';
    const me = mode === 'online' && s && s.pid === session.me.pid;
    return me ? `${name} (du)` : name;
  }

  function playerBar(el, t, seat) {
    clear(el);
    const s = t.seats[seat];
    const e = eng();
    const sub = gameUi(t.game).sub(shownOf(t), seat, viewer());
    const score = s ? t.score[s.pid] || 0 : 0;
    const active = t.status === 'play' && turnOf(t) === seat;
    const here = mode !== 'online' || !s || s.bot || s.pid === session.me.pid || isHere(s.pid);
    el.className = `pbar ${el.classList.contains('top') ? 'top' : 'bottom'}${active ? ' active' : ''}`;
    el.dataset.seat = seat;
    el.append(
      gameUi(t.game).icon(seat),
      h('div', { class: 'pb-text' },
        h('div', { class: 'pb-name' }, seatLabel(t, seat), !here ? h('span', { class: 'tag off', text: 'nicht da' }) : null),
        h('div', { class: 'pb-sub', text: sub })),
      h('div', { class: 'pb-score', title: 'Punkte an diesem Tisch', text: fmtScore(score) }));
  }

  // mehr als zwei Plätze: oben kompakte Liste aller anderen, unten der eigene Platz
  function chip(t, seat) {
    const s = t.seats[seat];
    const active = t.status === 'play' && turnOf(t) === seat;
    const here = mode !== 'online' || !s || s.bot || s.pid === session.me.pid || isHere(s.pid);
    return h('div', { class: 'pchip' + (active ? ' active' : ''), data: { seat } },
      gameUi(t.game).icon(seat),
      h('div', { class: 'pb-text' },
        h('div', { class: 'pb-name' }, seatLabel(t, seat), !here ? h('span', { class: 'tag off', text: 'nicht da' }) : null),
        h('div', { class: 'pb-sub', text: s || t.status !== 'wait' ? gameUi(t.game).sub(shownOf(t), seat, viewer()) : 'Platz frei' })));
  }

  function renderPlayers(t) {
    const bs = bottomSeat();
    if (t.seats.length > 2) {
      for (const el of [pTop, pTop2]) {
        clear(el);
        el.className = 'pbar top multi';
        for (let k = 1; k < t.seats.length; k++) el.append(chip(t, (bs + k) % t.seats.length));
      }
      playerBar(pBot, t, bs);
      playerBar(pBot2, t, bs);
      return;
    }
    playerBar(pTop, t, 1 - bs);
    playerBar(pBot, t, bs);
    playerBar(pTop2, t, 1 - bs);
    playerBar(pBot2, t, bs);
  }

  function isHere(pid) {
    const st = session.netStatus();
    if (session.table.hostPid === pid && session.role === 'client') return st.mode === 'direkt' || st.mode === 'relay';
    const p = (st.peers || []).find((x) => x.pid === pid);
    return !!p && p.via !== 'weg';
  }

  const fmtScore = (x) => (x % 1 ? (Math.floor(x) || '') + '½' : String(x));

  function statusText(t) {
    const seat = session.mySeat;
    if (t.status === 'wait') return session.role === 'host' ? 'Warte auf Mitspieler …' : 'Warte auf einen freien Platz …';
    if (t.status === 'over') {
      const r = t.result || {};
      if (r.winner === null || r.winner === undefined) return `Remis – ${r.reason || ''}`;
      const reason = r.reason ? ` (${r.reason})` : '';
      if (mode === 'online' && seat === r.winner) return `Du gewinnst!${reason}`;
      if (mode === 'bot' && seat === r.winner) return `Du gewinnst!${reason}`;
      return `${t.seats[r.winner] ? t.seats[r.winner].name : eng().PLAYERS[r.winner]} gewinnt${reason}`;
    }
    const turn = turnOf(t);
    const who = t.seats[turn];
    if (session.pendingMove) return 'Zug wird übertragen …';
    if (turn === null) {
      const c = eng().chance && eng().chance(t.gs);
      return c && c.kind === 'dice' ? 'Es wird gewürfelt …' : 'Karten werden gemischt …';
    }
    if (mode === 'hotseat') return `${who.name} (${eng().PLAYERS[turn]}) ist am Zug`;
    if (who && who.bot) return t.seats.length > 2 ? `${who.name} ist dran …` : 'Der Computer denkt nach …';
    if (seat === turn) {
      const extra = gameUi(t.game).status && gameUi(t.game).status(t, seat);
      return extra || 'Du bist am Zug';
    }
    return `${who ? who.name : eng().PLAYERS[turn]} ist am Zug`;
  }

  function renderActions(t) {
    clear(actions);
    clear(offerEl);
    const seat = session.mySeat;
    const btn = (label, act, fn, cls = 'btn') => h('button', { class: cls, data: { act }, on: { click: fn } }, label);
    if (t.status === 'play' && t.drawOffer !== null && t.drawOffer !== undefined && seat !== null && mode === 'online') {
      if (t.drawOffer !== seat) {
        offerEl.append(h('div', { class: 'offer-box' },
          h('span', { text: `${t.seats[t.drawOffer].name} bietet Remis an` }),
          btn('Annehmen', 'draw-accept', () => session.act('draw-accept'), 'btn primary small'),
          btn('Ablehnen', 'draw-decline', () => session.act('draw-decline'), 'btn small')));
      } else {
        offerEl.append(h('div', { class: 'offer-box muted', text: 'Remis angeboten – warte auf Antwort' }));
      }
    }
    if (t.status === 'over') {
      if (seat !== null || mode !== 'online') actions.append(btn('Revanche', 'rematch', () => session.act('rematch'), 'btn primary'));
      if (session.role === 'host') actions.append(btn('Anderes Spiel', 'another', () => onAnotherGame()));
      actions.append(btn('Übersicht', 'leave', () => onLeave()));
      return;
    }
    if (t.status === 'wait') {
      if (words) actions.append(btn('Wörter zeigen', 'words', () => showWords()));
      if (session.role === 'host' && t.seats.length > 2) actions.append(btn('Freie Plätze: Computer', 'fill-bots', () => session.act('fill-bots'), 'btn primary'));
      actions.append(btn('Übersicht', 'leave', () => onLeave()));
      return;
    }
    if (seat === null && mode === 'online') {
      actions.append(h('span', { class: 'muted', text: 'Du schaust zu.' }));
      return;
    }
    const gu = gameUi(t.game);
    if (gu.actions) {
      const legal = legalFor(t);
      if (legal) actions.append(...gu.actions(shownOf(t), legal, submit, view));
      if (gu.hidden || !gameOf(t.game).draws) return; // Aufgeben steht dann im Menü
    }
    const canOffer = mode !== 'bot' && gameOf(t.game).draws && (t.drawOffer === null || t.drawOffer === undefined);
    if (canOffer) actions.append(btn(mode === 'hotseat' ? 'Remis' : 'Remis anbieten', 'draw-offer', () => confirmAct('Remis', mode === 'hotseat' ? 'Partie als Remis beenden?' : 'Remis anbieten?', 'draw-offer')));
    actions.append(btn('Aufgeben', 'resign', () => confirmAct('Aufgeben', mode === 'hotseat' ? `${t.seats[turnOf(t)].name} gibt auf?` : 'Wirklich aufgeben?', 'resign')));
  }

  function confirmAct(titleText, question, act) {
    const sh = sheet(titleText, h('p', { text: question }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', data: { act: 'confirm' }, on: { click: () => { sh.close(); session.act(act); } } }, 'Ja'),
        h('button', { class: 'btn', on: { click: () => sh.close() } }, 'Nein')));
  }

  function renderMoves(t) {
    clear(movesEl);
    const first = t.nmoves - t.hist.length;
    t.hist.forEach((e, k) => {
      movesEl.appendChild(h('li', { class: 'mv mv-' + e.by, value: first + k + 1 }, gameUi(t.game).icon(e.by), e.d));
    });
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  function renderOverlay(t) {
    clear(overlay);
    let show = false;
    if (t && locked(t)) {
      // Sichtschutz: Gerät weitergeben, erst dann die Karten zeigen
      show = true;
      const turn = turnOf(t);
      const name = t.seats[turn] ? t.seats[turn].name : `Spieler ${turn + 1}`;
      overlay.append(h('div', { class: 'ov-card', data: { overlay: 'handoff' } },
        h('h2', { text: `Gerät an ${name} weitergeben` }),
        h('p', { text: 'Die Karten bleiben verdeckt, bis du bereit bist.' }),
        h('button', { class: 'btn primary big', data: { act: 'unlock' }, on: { click: () => { unlocked = turn; render({ kind: 'state' }); } } }, `Ich bin ${name} – Karten zeigen`)));
    } else if (!t) {
      show = true;
      overlay.append(h('div', { class: 'ov-card' },
        h('h2', { text: 'Verbinde mit dem Tisch …' }),
        words ? wordsBlock(words) : null,
        h('p', { class: 'muted', text: netMode === 'getrennt' ? 'Keine Verbindung. Ist der Tisch offen?' : 'Warte auf den Gastgeber. Das kann ein paar Sekunden dauern – ohne Direktverbindung gut 15 Sekunden.' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn', data: { act: 'retry' }, on: { click: () => location.reload() } }, 'Neu versuchen'),
          h('button', { class: 'btn', on: { click: () => onLeave() } }, 'Abbrechen'))));
    } else if (t.status === 'wait' && session.role === 'host' && words) {
      show = true;
      const g = gameOf(t.game);
      overlay.append(h('div', { class: 'ov-card', data: { overlay: 'wait' } },
        h('h2', { text: 'Tisch ist offen' }),
        h('p', { text: 'Sag deinem Mitspieler diese drei Wörter:' }),
        wordsBlock(words),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', data: { act: 'share' }, on: { click: () => share(words, g.title) } }, 'Teilen'),
          h('button', { class: 'btn', data: { act: 'copy' }, on: { click: () => copy(`${words.map(displayWord).join(' · ')}\n${shareUrl(words)}`) } }, 'Kopieren')),
        h('p', { class: 'muted small', text: 'Er öffnet die Spielebox und tippt die Wörter unter „Beitreten“ ein. Reihenfolge egal.' })));
    }
    overlay.classList.toggle('hidden', !show);
  }

  function renderStatusPill() {
    const st = session.netStatus();
    netMode = st.mode;
    pill.dataset.net = st.mode;
    pill.textContent = st.text;
    pill.title = st.relay ? `Relays offen: ${st.relay.open}/${st.relay.total}` : '';
    netEl.classList.toggle('hidden', !(mode === 'online' && st.mode === 'getrennt'));
  }

  function render(info = {}) {
    const t = session.table;
    renderStatusPill();
    if (!t) { renderOverlay(null); statusEl.textContent = 'Verbinde …'; return; }
    ensureView(t);
    const g = gameOf(t.game);
    clear(title).append(...[h('span', { class: 'tb-game', text: g.title }), g.id === 'dame' ? h('span', { class: 'tb-var', text: g.variantName(t.opts) }) : null].filter(Boolean));
    renderPlayers(t);
    const bs = bottomSeat();
    const legal = legalFor(t);
    view.update(shownOf(t), info, { legal, flip: !!gameUi(t.game).flip && bs === 1, viewer: viewer() ?? bs });
    statusEl.textContent = statusText(t);
    renderFair(t);
    requestEval(t);
    statusEl.dataset.state = t.status;
    if (!legal) hintEl.textContent = t.status === 'play' && t.game === 'muehle' && session.mySeat === null ? '' : (legal === null && t.status === 'play' && session.mySeat !== null && turnOf(t) !== session.mySeat ? '' : hintText);
    renderActions(t);
    renderMoves(t);
    renderOverlay(t);
    screen.dataset.status = t.status;
    screen.dataset.game = t.game;
    lastTable = t;
  }

  function showWords() {
    if (!words) return;
    const g = gameOf(session.table ? session.table.game : 'muehle');
    sheet('Die drei Wörter', wordsBlock(words),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', on: { click: () => share(words, g.title) } }, 'Teilen'),
        h('button', { class: 'btn', on: { click: () => copy(`${words.map(displayWord).join(' · ')}\n${shareUrl(words)}`) } }, 'Kopieren')),
      h('p', { class: 'muted small', text: 'Mit diesen Wörtern kann auch jemand zuschauen oder nach einem Neustart weiterspielen.' }));
  }

  const evalOn = () => store.settings().evalOn !== false;

  function requestEval(t) {
    const cfg = EVAL[t.game];
    const seat = hidden() ? viewer() : bottomSeat();
    if (!evalOn() || !cfg || t.status === 'wait' || seat === null || seat === undefined || locked(t) || (eng().chance && eng().chance(t.gs))) {
      evalRes = null; showEval(); return;
    }
    const key = `${t.game}|${t.round}|${t.nmoves}|${t.seq}|${seat}`;
    if (key === evalKey) return;
    evalKey = key;
    showEval();
    const gs = shownOf(t).gs;
    evaluateBoard(t.game, gs, seat).then((r) => { if (evalKey === key) { evalRes = { ...r, game: t.game }; showEval(); } }).catch(() => {});
  }

  function showEval() {
    const t = session.table;
    const supported = !!(t && EVAL[t.game]) && evalOn() && t.status !== 'wait';
    const on = supported && !!evalRes && evalRes.game === t.game;
    evalBar.classList.toggle('hidden', !on);
    // Platz bleibt reserviert, solange gerechnet wird (sonst springt das Brett)
    evalBtn.classList.toggle('hidden', !supported);
    evalBtn.classList.toggle('pending', supported && !on);
    if (!on) { if (supported && !evalBtn.textContent) evalBtn.textContent = 'Wer gewinnt? …'; return; }
    const cfg = EVAL[evalRes.game];
    const p = Math.max(0, Math.min(1, evalRes.p));
    evalBar.firstChild.style.height = `${(p * 100).toFixed(1)}%`;
    const x = evalRes.x;
    const num = Math.abs(x) >= 99 ? (x > 0 ? 'Matt in Sicht' : 'Matt droht') : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(cfg.digits).replace('.', ',')} ${cfg.unit}`;
    const pct = `${Math.round(p * 100)} % Gewinnchance`;
    evalBtn.textContent = `Wer gewinnt? ${store.settings().evalMode === 'pct' ? pct : num}`;
    evalBtn.title = 'Antippen: Zahl ↔ Prozent';
  }

  // Fair-Play-Anzeige: eigenes Gerät hat Commit, Kette und Mischung/Würfe nachgeprüft
  function renderFair(t) {
    const fc = session.fairCheck;
    const kind = eng().chance ? (gameOf(t.game).cards ? 'gemischt' : 'gewürfelt') : null;
    const show = mode === 'online' && kind && fc && (fc.checked > 0 || !fc.ok);
    fairEl.classList.toggle('hidden', !show);
    if (!show) return;
    fairEl.classList.toggle('bad', !fc.ok);
    fairEl.textContent = fc.ok ? `✓ fair ${kind} (${fc.checked} geprüft${fc.fallback ? `, ${fc.fallback} ohne Mitspieler` : ''})` : `⚠ Prüfung fehlgeschlagen`;
  }

  function openFair() {
    const fc = session.fairCheck;
    if (!fc) return;
    sheet('Fair Play',
      h('p', { text: fc.ok ? `Dein Gerät hat ${fc.checked} Zufallsereignisse nachgeprüft: Jede Mischung bzw. jeder Wurf passt zu den vorher festgelegten Ketten aller Spieler.` : 'Achtung: Mindestens ein Zufallsereignis passt nicht zu den festgelegten Ketten.' }),
      fc.bad && fc.bad.length ? h('ul', {}, ...fc.bad.slice(0, 6).map((b) => h('li', { text: b }))) : null,
      fc.fallback ? h('p', { class: 'muted', text: `${fc.fallback} Ereignis(se) ohne Beitrag eines Mitspielers (war nicht erreichbar) – diese sind nicht prüfbar.` }) : null,
      h('p', { class: 'muted small', text: 'Kartenmischungen werden erst nach dem jeweiligen Spiel offengelegt und dann geprüft.' }));
  }

  function openNet() {
    const st = session.netStatus();
    if (mode !== 'online') return;
    const peers = (st.peers || []).map((p) => h('li', {}, `${p.name || p.pid}: ${p.via === 'direkt' ? 'direkt' : p.via === 'relay' ? 'über Relay' : 'nicht erreichbar'}`));
    sheet('Verbindung',
      h('p', {}, h('strong', { text: 'Status: ' }), st.text),
      st.relay ? h('p', { text: `Relay-Fallback aktiv (${st.relayReason || ''}): ${st.relay.open} von ${st.relay.total} Relays verbunden.` }) : h('p', { text: 'Direktverbindung über WebRTC (Relay-Fallback nicht nötig).' }),
      st.joinError ? h('p', { class: 'muted small', text: 'Letzte Meldung: ' + st.joinError }) : null,
      peers.length ? h('ul', {}, ...peers) : h('p', { class: 'muted', text: 'Noch niemand verbunden.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', data: { act: 'reconnect' }, on: { click: reconnectNow } }, 'Wiederverbinden')),
      helpNet());
  }

  function openMenu() {
    const t = session.table;
    const items = [];
    const item = (label, fn, act) => h('button', { class: 'menu-item', data: { act }, on: { click: () => { sh.close(); fn(); } } }, label);
    if (words) items.push(item('Die drei Wörter zeigen', showWords, 'words'));
    if (mode === 'online') items.push(item('Verbindung / Wiederverbinden', openNet, 'net'));
    if (t && EVAL[t.game]) items.push(item(`„Wer gewinnt?“ ${evalOn() ? 'ausblenden' : 'einblenden'}`, () => {
      const st = store.settings(); st.evalOn = !evalOn(); store.saveSettings(st); evalKey = ''; render({ kind: 'state' });
    }, 'eval-toggle'));
    if (t) items.push(item('Regeln', () => sheet('Regeln', gameUi(t.game).rules(t.opts)), 'rules'));
    if (t && gameUi(t.game).menu) items.push(...gameUi(t.game).menu(shownOf(t), { item, share: shareText, sheet }));
    if (t && t.status === 'play' && session.mySeat !== null && gameUi(t.game).actions && (gameUi(t.game).hidden || !gameOf(t.game).draws)) {
      items.push(item(t.seats.length > 2 ? 'Platz dem Computer überlassen' : 'Aufgeben', () => confirmAct('Aufgeben', t.seats.length > 2 ? 'Der Computer spielt für dich weiter. Sicher?' : 'Wirklich aufgeben?', 'resign'), 'resign'));
    }
    if (t && mode !== 'online') items.push(item('Neue Partie', () => onNewLocal(), 'new'));
    items.push(item('Zur Übersicht', () => onLeave(), 'leave'));
    const sh = sheet('Menü', ...items);
  }

  const offChange = session.on('change', (t, info) => render(info));
  const offNet = session.on('net', () => { renderStatusPill(); if (session.table && lastTable) renderPlayers(session.table); if (!session.table) renderOverlay(null); });
  const offToast = session.on('toast', (text) => toast(text));
  render({ kind: 'start' });

  return {
    get view() { return view; },
    render,
    showWords,
    destroy() { clearTimeout(reconnectTimer); offChange(); offNet(); offToast(); if (view) view.destroy(); }
  };
}
