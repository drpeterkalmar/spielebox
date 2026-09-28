// Tisch-Ansicht: Kopfzeile mit Verbindungsstatus, Spielerleisten, Brett, Status/Hinweis, Aktionen,
// Warte-Karte mit den 3 Wörtern (groß, zum Diktieren), Teilen-Link, Menü (Zugliste, Regeln, Verbindung).
import { h, clear, sheet, toast } from './dom.js';
import { gameOf } from '../games/registry.js';
import { turnOf } from '../net/table.js';
import { displayWord, formatWords } from '../words.js';
import { createBoard as muehleBoard } from '../games/muehle/view.js';
import { createBoard as dameBoard } from '../games/dame/view.js';
import { rulesMuehle, rulesDame, helpNet } from './texts.js';
import { miniBoard } from './lobby.js';

const BOARDS = { muehle: muehleBoard, dame: dameBoard };

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

function stoneIcon(color) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="8.5" fill="url(#sb-st-${color === 0 ? 'w' : 'b'})" stroke="${color === 0 ? '#7a6548' : '#000'}" stroke-width="1"/>`;
  return svg;
}

export function showTableScreen(root, { session, words = null, onLeave, onAnotherGame, onNewLocal }) {
  const mode = session.mode;
  let view = null;
  let viewGame = null;
  let hintText = '';
  let lastTable = null;
  let netMode = mode === 'online' ? 'wartet' : 'lokal';

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
  const hintEl = h('div', { class: 'hint' });
  const offerEl = h('div', { class: 'offer' });
  const actions = h('div', { class: 'actions' });
  const movesEl = h('ol', { class: 'movelist' });
  const overlay = h('div', { class: 'overlay hidden' });
  boardWrap.appendChild(overlay);

  const screen = h('div', { class: 'screen table-screen', data: { mode } },
    bar,
    h('div', { class: 'tmain' }, pTop, boardWrap, pBot),
    h('aside', { class: 'tside' }, h('div', { class: 'side-players' }, pTop2, pBot2), statusEl, hintEl, offerEl, actions, h('div', { class: 'moves-box' }, h('div', { class: 'moves-h', text: 'Züge' }), movesEl)));
  clear(root).appendChild(screen);

  const eng = () => gameOf(session.table.game).engine;
  const bottomSeat = () => (mode === 'hotseat' ? 0 : session.mySeat ?? 0);

  function ensureView(t) {
    if (view && viewGame === t.game) return;
    if (view) view.destroy();
    viewGame = t.game;
    view = BOARDS[t.game](boardWrap, {
      onMove: (m) => {
        const r = session.submitMove(m);
        if (!r.ok) { toast(r.reason || 'Zug nicht möglich'); render({ kind: 'state' }); }
      },
      onHint: (text) => { hintText = text; hintEl.textContent = text; }
    });
    boardWrap.appendChild(overlay);
  }

  function legalFor(t) {
    if (!t || t.status !== 'play' || session.pendingMove) return null;
    const seat = session.mySeat;
    if (seat === null || turnOf(t) !== seat) return null;
    if (t.seats[seat] && t.seats[seat].bot) return null;
    return eng().legalMoves(t.gs);
  }

  function seatLabel(t, seat) {
    const s = t.seats[seat];
    const name = s ? s.name : 'frei';
    const me = mode === 'online' && s && s.pid === session.me.pid;
    return me ? `${name} (du)` : name;
  }

  function playerBar(el, t, seat) {
    clear(el);
    const s = t.seats[seat];
    const e = eng();
    let sub = '';
    if (t.game === 'muehle') {
      const c = e.countStones(t.gs);
      sub = c.hand[seat] ? `${c.hand[seat]} in der Hand · ${c.board[seat]} auf dem Brett` : `${c.board[seat]} Steine${e.phase(t.gs, seat) === 'springen' ? ' · springt' : ''}`;
    } else {
      const b = t.gs.board;
      const men = b.filter((v) => (seat === 0 ? v === 1 : v === -1)).length;
      const kings = b.filter((v) => (seat === 0 ? v === 2 : v === -2)).length;
      sub = `${men} Steine${kings ? ` · ${kings} ${kings === 1 ? 'Dame' : 'Damen'}` : ''}`;
    }
    const score = s ? t.score[s.pid] || 0 : 0;
    const active = t.status === 'play' && turnOf(t) === seat;
    const here = mode !== 'online' || !s || s.bot || s.pid === session.me.pid || isHere(s.pid);
    el.className = `pbar ${el.classList.contains('top') ? 'top' : 'bottom'}${active ? ' active' : ''}`;
    el.dataset.seat = seat;
    el.append(
      stoneIcon(seat),
      h('div', { class: 'pb-text' },
        h('div', { class: 'pb-name' }, seatLabel(t, seat), !here ? h('span', { class: 'tag off', text: 'nicht da' }) : null),
        h('div', { class: 'pb-sub', text: sub })),
      h('div', { class: 'pb-score', title: 'Punkte an diesem Tisch', text: fmtScore(score) }));
  }

  function renderPlayers(t) {
    const bs = bottomSeat();
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
    if (mode === 'hotseat') return `${who.name} (${eng().PLAYERS[turn]}) ist am Zug`;
    if (who && who.bot) return 'Der Computer denkt nach …';
    if (seat === turn) {
      if (t.game === 'dame' && t.gs.pusted) return 'Gepustet – jetzt normal ziehen';
      return 'Du bist am Zug';
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
      actions.append(btn('Übersicht', 'leave', () => onLeave()));
      return;
    }
    if (seat === null && mode === 'online') {
      actions.append(h('span', { class: 'muted', text: 'Du schaust zu.' }));
      return;
    }
    const canOffer = mode !== 'bot' && (t.drawOffer === null || t.drawOffer === undefined);
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
      movesEl.appendChild(h('li', { class: 'mv mv-' + e.by, value: first + k + 1 }, stoneIcon(e.by), e.d));
    });
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  function renderOverlay(t) {
    clear(overlay);
    let show = false;
    if (!t) {
      show = true;
      overlay.append(h('div', { class: 'ov-card' },
        h('h2', { text: 'Verbinde mit dem Tisch …' }),
        words ? wordsBlock(words) : null,
        h('p', { class: 'muted', text: netMode === 'getrennt' ? 'Keine Verbindung. Ist der Tisch offen?' : 'Warte auf den Gastgeber. Das kann ein paar Sekunden dauern.' }),
        h('div', { class: 'row' }, h('button', { class: 'btn', on: { click: () => onLeave() } }, 'Abbrechen'))));
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
    view.update(t, info, { legal, flip: t.game === 'dame' && bs === 1 });
    statusEl.textContent = statusText(t);
    statusEl.dataset.state = t.status;
    if (!legal) hintEl.textContent = t.status === 'play' && t.game === 'muehle' && session.mySeat === null ? '' : (legal === null && t.status === 'play' && session.mySeat !== null && turnOf(t) !== session.mySeat ? '' : hintText);
    renderActions(t);
    renderMoves(t);
    renderOverlay(t);
    screen.dataset.status = t.status;
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

  function openNet() {
    const st = session.netStatus();
    if (mode !== 'online') return;
    const peers = (st.peers || []).map((p) => h('li', {}, `${p.name || p.pid}: ${p.via === 'direkt' ? 'direkt' : p.via === 'relay' ? 'über Relay' : 'nicht erreichbar'}`));
    sheet('Verbindung',
      h('p', {}, h('strong', { text: 'Status: ' }), st.text),
      st.relay ? h('p', { text: `Relay-Fallback aktiv (${st.relayReason || ''}): ${st.relay.open} von ${st.relay.total} Relays verbunden.` }) : h('p', { text: 'Direktverbindung über WebRTC (Relay-Fallback nicht nötig).' }),
      st.joinError ? h('p', { class: 'muted small', text: 'Letzte Meldung: ' + st.joinError }) : null,
      peers.length ? h('ul', {}, ...peers) : h('p', { class: 'muted', text: 'Noch niemand verbunden.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', data: { act: 'reconnect' }, on: { click: () => { session.link.reconnect(); toast('Verbinde neu …'); } } }, 'Wiederverbinden')),
      helpNet());
  }

  function openMenu() {
    const t = session.table;
    const items = [];
    const item = (label, fn, act) => h('button', { class: 'menu-item', data: { act }, on: { click: () => { sh.close(); fn(); } } }, label);
    if (words) items.push(item('Die drei Wörter zeigen', showWords, 'words'));
    if (mode === 'online') items.push(item('Verbindung / Wiederverbinden', openNet, 'net'));
    if (t) items.push(item('Regeln', () => sheet('Regeln', t.game === 'dame' ? rulesDame() : rulesMuehle()), 'rules'));
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
    destroy() { offChange(); offNet(); offToast(); if (view) view.destroy(); }
  };
}
