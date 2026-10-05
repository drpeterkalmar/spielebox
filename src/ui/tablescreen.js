// Tisch-Ansicht: Kopfzeile mit Verbindungsstatus, Spielerleisten, Brett, Status/Hinweis, Aktionen,
// Warte-Karte mit den 3 Wörtern (groß, zum Diktieren), Teilen-Link, Menü (Zugliste, Regeln, Verbindung).
// Anzeige-Warteschlange: Züge der anderen werden in Ruhe ausgespielt (Tempo aus src/tempo.js), wichtige Ereignisse
// erscheinen als Banner über der gegnerischen Leiste, die letzten Ereignisse stehen hinter der Status-Zeile.
import { h, clear, sheet, toast, onToast } from './dom.js';
import { params as tempoParams, levelFrom, animMs, holdemTimes, BANNER_MAX, LEVEL_NAMES } from '../tempo.js';
import { moveEvents } from '../events.js';
import { ownTricks } from '../games/schnapsen/engine.js';
import { openSettings } from './settings.js';
import { gameOf } from '../games/registry.js';
import { turnOf } from '../net/table.js';
import { displayWord, formatWords } from '../words.js';
import { helpNet } from './texts.js';
import { gameUi } from './gameui.js';
import { evaluateBoard } from '../botclient.js';
import { EVAL } from '../evalpos.js';
import * as store from '../store.js';
import { onDeko } from './deko.js';
import { clear as clearFx } from './fx.js';
import { celebrate } from './sieg.js';
import { onSprites } from './sprites.js';

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
  // Status-Zeile: antippen zeigt die letzten Ereignisse
  const statusTextEl = h('span', { class: 'status-t' });
  const statusEl = h('button', { class: 'status', 'aria-live': 'polite', title: 'Antippen: Was ist passiert?', data: { act: 'events' }, on: { click: () => openEvents() } },
    statusTextEl, h('span', { class: 'status-i', 'aria-hidden': 'true', text: 'ⓘ' }));
  // Banner am Brett (über der Leiste des Gegners): was der Computer bzw. Mitspieler gerade gemacht hat
  const bannerEl = h('button', { class: 'banner hidden', 'aria-live': 'assertive', data: { banner: '' }, on: { click: () => nextBanner() } });
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
  screen.appendChild(bannerEl);
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
  const level = () => levelFrom(store.settings().tempo);
  // Zug auf diesem Gerät getippt? (zu zweit am Gerät: immer; sonst eigener Sitz)
  const ownMove = (by) => mode === 'hotseat' || (by !== null && by !== undefined && by === session.mySeat);

  function ensureView(t) {
    if (view && viewGame === t.game) return;
    if (view) view.destroy();
    viewGame = t.game;
    view = gameUi(t.game).board(boardWrap, {
      onMove: (m) => {
        const r = session.submitMove(m);
        if (!r.ok) { toast(r.reason || 'Zug nicht möglich'); render({ kind: 'state' }); } else movedByMe();
      },
      onHint: (text) => { hintText = text; hintEl.textContent = text; },
      onLocal: () => { if (session.table) renderActions(session.table); },
      onStiche: () => openStiche()
    });
    boardWrap.appendChild(overlay);
    boardWrap.appendChild(evalBar);
  }

  function legalFor(t) {
    if (!t || t.status !== 'play' || session.pendingMove || locked(t) || animating) return null;
    const seat = session.mySeat;
    if (seat === null || turnOf(t) !== seat) return null;
    if (t.seats[seat] && t.seats[seat].bot) return null;
    return eng().legalMoves(shownOf(t).gs);
  }

  function submit(m) {
    const r = session.submitMove(m);
    if (!r.ok) { toast(r.reason || 'Zug nicht möglich'); render({ kind: 'state' }); } else movedByMe();
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
      gameUi(t.game).icon(seat, t),
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
      gameUi(t.game).icon(seat, t),
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
    if (t.seats.length === 1) {
      // allein (Würfelglück): nur die eigene Leiste
      for (const el of [pTop, pTop2]) { clear(el); el.className = 'pbar top solo'; }
      playerBar(pBot, t, 0);
      playerBar(pBot2, t, 0);
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
      if (t.seats.length === 1) return `Geschafft: ${r.reason || ''}`;
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
    if (mode === 'hotseat') return who.name === eng().PLAYERS[turn] ? `${who.name} ist am Zug` : `${who.name} (${eng().PLAYERS[turn]}) ist am Zug`;
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
      else if (gu.idle && !locked(t)) actions.append(...gu.idle(shownOf(t), view, { mode, seat: viewer() ?? null, newLocal: mode !== 'online' ? onNewLocal : null, animating, act: (a) => { const r = session.act(a, viewer()); if (r && r.ok === false && r.reason) toast(r.reason); } }));
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
      movesEl.appendChild(h('li', { class: 'mv mv-' + e.by, value: first + k + 1 }, gameUi(t.game).icon(e.by, t), e.d));
    });
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  function renderOverlay(t) {
    clear(overlay);
    let show = false;
    if (t && locked(t) && !animating) {
      // Sichtschutz: Gerät weitergeben, erst dann die Karten zeigen (erst wenn der letzte Zug ausgespielt ist –
      // z. B. das Ergebnis einer Hold'em-Hand soll jeder noch sehen)
      show = true;
      const turn = turnOf(t);
      const name = t.seats[turn] ? t.seats[turn].name : `Spieler ${turn + 1}`;
      overlay.append(h('div', { class: 'ov-card', data: { overlay: 'handoff' } },
        h('h2', { text: `Gerät an ${name} weitergeben` }),
        gameUi(t.game).handoff && gameUi(t.game).handoff(t) ? h('p', { class: 'handoff-note', text: gameUi(t.game).handoff(t) }) : null,
        h('p', { text: gameUi(t.game).secret ? `Die ${gameUi(t.game).secret} bleibt verdeckt, bis du bereit bist.` : 'Die Karten bleiben verdeckt, bis du bereit bist.' }),
        h('button', { class: 'btn primary big', data: { act: 'unlock' }, on: { click: () => { unlocked = turn; render({ kind: 'state' }); } } }, `Ich bin ${name} – ${gameUi(t.game).secret || 'Karten'} zeigen`)));
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

  // ---------- Anzeige-Warteschlange ----------
  // Jeder neue Stand kommt in die Schlange und wird der Reihe nach gezeigt. Ein Zug wird erst zu Ende ausgespielt
  // (Dauer aus tempo.js), bevor der nächste Stand erscheint; solange gibt es keine erlaubten Züge (kein Fehltipp),
  // danach wird der Stand noch einmal mit den erlaubten Zügen gezeigt.
  const queue = [];
  let busyUntil = 0, qTimer = null, shownStatus = null, animating = false, animBy = null, animVerb = 'zieht';
  const snap = (t) => (t ? { ...t, seats: t.seats.slice(), hist: t.hist.slice(), score: { ...t.score } } : null);

  function render(info = {}) {
    queue.push({ t: snap(session.table), info });
    pump();
  }

  function pump() {
    clearTimeout(qTimer);
    qTimer = null;
    const wait = busyUntil - Date.now();
    if (wait > 0) { qTimer = setTimeout(pump, wait); return; }
    if (!queue.length) return;
    if (queue.length > 6) queue.splice(0, queue.length - 6);   // z. B. nach langer Pause im Hintergrund
    const it = queue.shift();
    const dur = draw(it.t, it.info);
    if (dur > 0) {
      busyUntil = Date.now() + dur;
      qTimer = setTimeout(() => {
        if (!queue.length) queue.push({ t: snap(session.table), info: { kind: 'settle' } });
        pump();
      }, dur);
    } else if (queue.length) pump();
  }

  function draw(t, info = {}) {
    renderStatusPill();
    if (!t) { renderOverlay(null); statusTextEl.textContent = 'Verbinde …'; return 0; }
    ensureView(t);
    const g = gameOf(t.game);
    clear(title).append(...[h('span', { class: 'tb-game', text: g.title }), g.id === 'dame' ? h('span', { class: 'tb-var', text: g.variantName(t.opts) }) : null].filter(Boolean));
    renderPlayers(t);
    const bs = bottomSeat();
    // Zug ausspielen: fremde Züge im eingestellten Tempo, eigene kurz
    const lv = level();
    let dur = 0, anim = null;
    // verdeckte Karten: auch der Stand vor dem Zug nur in der Sicht dieses Geräts (Host hat sonst alles)
    if (hidden() && info.prevGs) info = { ...info, prevGs: eng().viewFor(info.prevGs, locked(t) ? null : viewer() ?? null) };
    if (info.kind === 'move' && info.move) {
      anim = tempoParams(lv, ownMove(info.by));
      dur = animMs(t.game, info.move, info.prevGs, t.gs, anim);
      // Hold'em: Ergebnis der Hand melden, sobald die Karten aufgedeckt sind (nicht erst nach dem neuen Austeilen)
      const ht = t.game === 'holdem' ? holdemTimes(anim, t.gs) : null;
      noteMove(t, info, ht ? ht.chip + ht.toPot + ht.runout : dur);
    }
    animating = dur > 0 || queue.length > 0;
    animBy = dur > 0 && !anim.own ? info.by : null;
    animVerb = info.move && info.move.type === 'roll' ? 'würfelt' : t.game === 'schnapsen' || t.game === 'blackjack' ? 'spielt' : 'zieht';
    const legal = legalFor(t);
    if (stichSheet && (locked(t) || t.game !== 'schnapsen')) { stichSheet.close(); stichSheet = null; }
    view.update(shownOf(t), info, { legal, flip: !!gameUi(t.game).flip && bs === 1, viewer: viewer() ?? bs, seated: viewer() !== null && viewer() !== undefined, anim, tempo: tempoParams(lv), mode, help: helpOn(t) });
    // solange der Zug eines anderen ausgespielt wird: „Computer zieht …“ statt schon „Du bist am Zug“
    const st = animBy !== null && animBy !== undefined && t.status === 'play' ? `${nameOf(t, animBy)} ${animVerb} …` : statusText(t);
    statusTextEl.textContent = st;
    if (t.status === 'over' && shownStatus !== 'over') addEvent(st);
    // Deko: Sieg-Animation, wenn die Partie gerade hier zu Ende gespielt wurde (nicht nach dem Neuladen)
    if (t.status === 'over' && shownStatus === 'play' && info.kind === 'move' && dur > 0) {
      const w = t.result && t.result.winner;
      // erst nach dem Nachzeichnen am Ende des Zugs (sonst ersetzt das Brett die hüpfenden Steine)
      celebrate({ t, view, wrap: boardWrap, game: t.game, delay: dur + 120, mine: w !== null && w !== undefined && (mode === 'hotseat' || w === session.mySeat) });
    }
    shownStatus = t.status;
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
    return dur;
  }

  // ---------- Ereignisse: Liste und Banner ----------
  const events = [];         // { at, text } – die letzten Ereignisse (Liste zeigt 5)
  let banner = null, bannerTimer = null, stichSheet = null;
  const bannerQ = [];

  function addEvent(text) {
    if (!text) return;
    const last = events[events.length - 1];
    if (last && last.text === text && Date.now() - last.at < 3000) return;
    events.push({ at: Date.now(), text });
    if (events.length > 20) events.shift();
  }

  const nameOf = (t, seat) => {
    const s = t.seats[seat];
    if (!s) return eng().PLAYERS[seat] || `Spieler ${seat + 1}`;
    return s.bot && t.seats.length === 2 ? 'Computer' : s.name;
  };

  // Ereignisse eines Zugs: erst wenn er fertig ausgespielt ist (z. B. „Bank hat 22“ nach der letzten Bank-Karte)
  let noteTimers = [];
  function noteMove(t, info, delay = 0) {
    const you = (seat) => mode !== 'hotseat' && seat === session.mySeat;
    const d = t.last && t.last.d;
    const list = moveEvents({ game: t.game, move: info.move, by: info.by, prevGs: info.prevGs, gs: t.gs, d, name: (s) => nameOf(t, s), you });
    if (!list.length) return;
    if (delay > 0) { noteTimers.push(setTimeout(() => showEvents(list, you), delay)); return; }
    showEvents(list, you);
  }

  function showEvents(list, you) {
    for (const e of list) {
      addEvent(e.text);
      // Banner: was die anderen (vor allem der Computer) gemacht haben; zu zweit am Gerät alles Wichtige
      if (e.big && (mode === 'hotseat' || !you(e.seat) || e.prio || /^Pasch|^Schach|^Fünferpasch/.test(e.text))) pushBanner(e.text, !!e.prio);
    }
  }

  // prio (Hold'em-Ergebnis): verdrängt wartende gewöhnliche Banner und erscheint sofort
  const prioQ = new Set();
  function pushBanner(text, prio = false) {
    if (banner && banner.text === text) return;
    if (prio) {
      for (let i = bannerQ.length - 1; i >= 0; i--) if (!prioQ.has(bannerQ[i])) bannerQ.splice(i, 1);
      prioQ.add(text);
      bannerQ.push(text);
      if (!banner || !prioQ.has(banner.text)) nextBanner();
      return;
    }
    bannerQ.push(text);
    if (bannerQ.length > 3) bannerQ.shift();
    if (!banner || Date.now() - banner.since >= tempoParams(level()).banner) nextBanner();
  }

  // nächstes Banner zeigen (bzw. ausblenden); Antippen = weiter
  function nextBanner() {
    clearTimeout(bannerTimer);
    const text = bannerQ.shift();
    if (!text) { banner = null; bannerEl.classList.add('hidden'); return; }
    banner = { text, since: Date.now(), moved: false };
    bannerEl.textContent = text;
    placeBanner();
    bannerEl.classList.remove('hidden');
    if (screen.dataset.game === 'holdem') placeBanner();   // Höhe erst jetzt messbar
    bannerEl.classList.remove('pop');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('pop');
    bannerTimer = setTimeout(checkBanner, tempoParams(level()).banner);
  }

  // Banner bleibt mindestens `banner` ms und bis zum nächsten eigenen Zug (höchstens BANNER_MAX)
  function checkBanner() {
    clearTimeout(bannerTimer);
    if (!banner) return;
    const age = Date.now() - banner.since, min = tempoParams(level()).banner;
    if (age < min) { bannerTimer = setTimeout(checkBanner, min - age); return; }
    if (bannerQ.length || banner.moved || age >= BANNER_MAX) { nextBanner(); return; }
    bannerTimer = setTimeout(checkBanner, 500);
  }

  function movedByMe() {
    if (banner) { banner.moved = true; checkBanner(); }
  }

  // über der sichtbaren Leiste des Gegners (hoch: über dem Brett, quer: oben in der Seitenspalte)
  function placeBanner() {
    if (screen.dataset.game === 'holdem') {
      // Hold'em: Sitze stehen auf dem Tisch – Banner über dem Brett (hoch: im freien Platz darüber), quer über der Status-Zeile
      const portrait = innerHeight > innerWidth;
      const r = (portrait ? boardWrap : statusEl).getBoundingClientRect();
      const top = portrait ? Math.max(bar.getBoundingClientRect().bottom + 2, r.top - Math.max(56, bannerEl.offsetHeight) - 4) : r.top;
      Object.assign(bannerEl.style, { left: `${Math.round(r.left)}px`, top: `${Math.round(top)}px`, width: `${Math.round(r.width)}px`, minHeight: '56px' });
      return;
    }
    const anchor = [pTop, pTop2].find((el) => el.getClientRects().length && el.getBoundingClientRect().height > 0);
    const r = anchor ? anchor.getBoundingClientRect() : boardWrap.getBoundingClientRect();
    Object.assign(bannerEl.style, { left: `${Math.round(r.left)}px`, top: `${Math.round(r.top)}px`, width: `${Math.round(r.width)}px`, minHeight: `${Math.round(Math.max(48, anchor ? r.height : 56))}px` });
  }
  const onResize = () => { if (banner) placeBanner(); };
  addEventListener('resize', onResize);

  function openEvents() {
    const list = events.slice(-5).reverse();
    const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`; };
    sheet('Was ist passiert?',
      list.length ? h('ol', { class: 'eventlist', data: { events: '' } }, ...list.map((e) => h('li', {}, h('span', { class: 'ev-t', text: e.text }), h('span', { class: 'ev-ago', text: ago(e.at) })))) : h('p', { class: 'muted', text: 'Noch nichts passiert.' }),
      h('p', { class: 'muted small', text: `Die letzten 5 Ereignisse. Computer-Tempo: ${LEVEL_NAMES[level()]} (Menü → Computer-Tempo).` }));
  }

  // Schnapsen: eigene Stiche ansehen (nur die eigenen, erst hinter dem Sichtschutz)
  function openStiche() {
    const t = session.table;
    if (!t || t.game !== 'schnapsen' || locked(t)) return;
    const seat = viewer();
    if (seat === null || seat === undefined) return;
    const gs = shownOf(t).gs;
    if (gs.opts && gs.opts.stiche === false) { toast('„Eigene Stiche ansehen“ ist aus (Turnierregel)'); return; }
    const own = ownTricks(gs, seat);
    if (!own) return;
    if (stichSheet) stichSheet.close();
    stichSheet = sheet('Deine Stiche', gameUi('schnapsen').stichBlatt(own, { seat, augenHilfe: !!(gs.opts && gs.opts.augenHilfe), atout: gs.atout, opp: nameOf(t, 1 - seat) }));
    stichSheet.box.dataset.sheet = 'stiche';
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
  // Hold'em: Hand-Hilfe (eigene Hand benennen, Draws); Standard an, wenn ein Computer „leicht“ mitspielt
  const helpOn = (t) => { const v = store.settings().holdemHelp; return v === undefined ? t.seats.some((x) => x && x.bot === 1) : !!v; };

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
    if (cfg.label) { evalBtn.textContent = cfg.label(evalRes); evalBtn.title = cfg.title || ''; return; }
    const x = evalRes.x;
    const ax = Math.abs(x).toFixed(cfg.digits), zero = Number(ax) === 0;   // −0,3 → „±0“, nicht „−0“
    const num = Math.abs(x) >= 99 ? (cfg.win ? (x > 0 ? cfg.win[0] : cfg.win[1]) : x > 0 ? 'Matt in Sicht' : 'Matt droht') : `${zero ? '±' : x > 0 ? '+' : '−'}${ax.replace('.', ',')} ${cfg.unit}`;
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
    items.push(item('Was ist passiert? (letzte Ereignisse)', openEvents, 'events'));
    items.push(item(`Computer-Tempo: ${LEVEL_NAMES[level()]}`, () => openSettings(), 'tempo'));
    if (t && t.game === 'schnapsen' && viewer() !== null && viewer() !== undefined && !locked(t)) items.push(item('Deine Stiche ansehen', openStiche, 'stiche'));
    if (t && gameUi(t.game).menu) items.push(...gameUi(t.game).menu(shownOf(t), { item, share: shareText, sheet, rerender: () => { evalKey = ''; render({ kind: 'state' }); } }));
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
  const offToastLog = onToast((text) => addEvent(text));
  // Optik umgestellt (Einstellungen): Brett neu aufbauen
  const offDeko = onDeko(() => { if (view) { view.destroy(); view = null; viewGame = null; } render({ kind: 'state' }); });
  // vorgezeichnete Steine fertig: einmal neu zeichnen (nur in Ruhe, nie mitten in einer Zug-Animation)
  const offSprites = onSprites(() => { if (view && session.table && busyUntil <= Date.now() && !queue.length) render({ kind: 'state' }); });
  render({ kind: 'start' });

  return {
    get view() { return view; },
    render,
    showWords,
    // Tests: läuft gerade eine Zug-Animation bzw. wartet ein Stand?
    busy: () => busyUntil > Date.now() || queue.length > 0,
    events: () => events.slice(),
    banner: () => (banner ? banner.text : null),
    destroy() {
      clearTimeout(reconnectTimer); clearTimeout(qTimer); clearTimeout(bannerTimer); noteTimers.forEach(clearTimeout); removeEventListener('resize', onResize);
      offChange(); offNet(); offToast(); offToastLog(); offDeko(); offSprites(); clearFx(); if (stichSheet) stichSheet.close(); bannerEl.remove(); if (view) view.destroy();
    }
  };
}
