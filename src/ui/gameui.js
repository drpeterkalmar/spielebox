// Spielspezifische Teile der Tisch-Ansicht: Brett, Symbol je Sitz, Unterzeile der Spielerleiste, Regeln,
// Brett drehen, Zusatz-Einträge im Menü. So bleibt tablescreen.js für alle Spiele gleich.
import { h } from './dom.js';
import { gameOf } from '../games/registry.js';
import { createBoard as muehleBoard } from '../games/muehle/view.js';
import { createBoard as dameBoard } from '../games/dame/view.js';
import { createBoard as schachBoard } from '../games/schach/view.js';
import { material, inCheck, pgn } from '../games/schach/engine.js';
import { rulesMuehle, rulesDame, rulesSchach, rulesSchnapsen } from './texts.js';
import { createBoard as schnapsenBoard } from '../games/schnapsen/view.js';
import * as SN from '../games/schnapsen/engine.js';
import { createBoard as backgammonBoard } from '../games/backgammon/view.js';
import * as BG from '../games/backgammon/engine.js';
import { rulesBackgammon } from './texts.js';

import { SEAT_COLORS, SEAT_SYMBOLS } from './seatcolors.js';
import { createBoard as blackjackBoard } from '../games/blackjack/view.js';
import * as BJ from '../games/blackjack/engine.js';
import { rulesBlackjack, rulesHalma } from './texts.js';
import { createBoard as halmaBoard } from '../games/halma/view.js';
import * as HM from '../games/halma/engine.js';
import { rulesFromData } from './texts.js';
import { createBoard as ludoBoard } from '../games/ludo/view.js';
import * as LD from '../games/ludo/engine.js';
import { RULES as LUDO_RULES } from '../games/ludo/rules.js';
import { createBoard as schiffeBoard } from '../games/schiffe/view.js';
import * as SV from '../games/schiffe/engine.js';
import { RULES as SCHIFFE_RULES } from '../games/schiffe/rules.js';
import { createBoard as vierBoard } from '../games/vier/view.js';
import { RULES as VIER_RULES } from '../games/vier/rules.js';
import { createBoard as maumauBoard } from '../games/maumau/view.js';
import * as MM from '../games/maumau/engine.js';
import { RULES as MAUMAU_RULES } from '../games/maumau/rules.js';
import { createBoard as wuerfelBoard } from '../games/wuerfel/view.js';
import * as WG from '../games/wuerfel/engine.js';
import { RULES as WUERFEL_RULES } from '../games/wuerfel/rules.js';
import { createBoard as reversiBoard } from '../games/reversi/view.js';
import * as RV from '../games/reversi/engine.js';
import { RULES as REVERSI_RULES } from '../games/reversi/rules.js';
export { SEAT_COLORS, SEAT_SYMBOLS };

const NS = 'http://www.w3.org/2000/svg';

function stoneIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="8.5" fill="url(#sb-st-${seat === 0 ? 'w' : 'b'})" stroke="${seat === 0 ? '#7a6548' : '#000'}" stroke-width="1"/>`;
  return svg;
}

function kingIcon(seat) {
  const img = h('img', { class: 'stone-ico', src: `assets/pieces/${seat === 0 ? 'w' : 'b'}K.svg`, alt: '' });
  return img;
}

function seatIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="9" fill="${SEAT_COLORS[seat % 6]}" stroke="rgba(0,0,0,.5)"/><text x="10" y="14.2" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">${seat + 1}</text>`;
  return svg;
}

function cardIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = '<rect x="4" y="1.5" width="12" height="17" rx="2" fill="#a3282a" stroke="#f3e3c0" stroke-width="1.5"/>';
  return svg;
}

function bummerlTafel(t) {
  const gs = t.gs;
  const names = t.seats.map((x, i) => (x ? x.name : `Spieler ${i + 1}`));
  const rows = [];
  let cur = null, pts = [0, 0];
  for (const g of gs.games || []) {
    if (g.bummerl !== cur) { cur = g.bummerl; pts = [0, 0]; rows.push(h('tr', { class: 'bt-head' }, h('td', { colspan: 3, text: `Bummerl ${cur}` }))); }
    pts[g.winner] += g.points;
    rows.push(h('tr', {}, h('td', { text: `${g.spiel}. Spiel: ${names[g.winner]} +${g.points}` }), h('td', { class: 'bt-num', text: String(pts[0]) }), h('td', { class: 'bt-num', text: String(pts[1]) })));
  }
  return h('div', { class: 'rules' },
    h('p', {}, h('strong', { text: `Bummerl: ${names[0]} ${gs.bummerl[0]} · ${names[1]} ${gs.bummerl[1]}` }), ` (Partie auf ${gs.opts.bummerl})`),
    h('p', { text: `Laufendes Bummerl: ${gs.points[0]} : ${gs.points[1]} Punkte (7 gewinnt)` }),
    rows.length ? h('table', { class: 'bummerl' }, h('tr', {}, h('th', { text: 'Spiel' }), h('th', { text: names[0] }), h('th', { text: names[1] })), ...rows) : h('p', { class: 'muted', text: 'Noch kein Spiel fertig.' }));
}

const UI = {
  muehle: {
    board: muehleBoard,
    icon: stoneIcon,
    rules: rulesMuehle,
    sub(t, seat) {
      const e = gameOf('muehle').engine;
      const c = e.countStones(t.gs);
      return c.hand[seat] ? `${c.hand[seat]} in der Hand · ${c.board[seat]} auf dem Brett` : `${c.board[seat]} Steine${e.phase(t.gs, seat) === 'springen' ? ' · springt' : ''}`;
    }
  },
  dame: {
    board: dameBoard,
    icon: stoneIcon,
    rules: rulesDame,
    flip: true,
    sub(t, seat) {
      const b = t.gs.board;
      const men = b.filter((v) => (seat === 0 ? v === 1 : v === -1)).length;
      const kings = b.filter((v) => (seat === 0 ? v === 2 : v === -2)).length;
      return `${men} Steine${kings ? ` · ${kings} ${kings === 1 ? 'Dame' : 'Damen'}` : ''}`;
    },
    status(t, seat) {
      return seat === t.gs.turn && t.gs.pusted ? 'Gepustet – jetzt normal ziehen' : null;
    }
  },
  schach: {
    board: schachBoard,
    icon: kingIcon,
    rules: rulesSchach,
    flip: true,
    sub(t, seat) {
      const m = material(t.gs);
      const d = m[seat] - m[1 - seat];
      const check = t.status === 'play' && t.gs.turn === seat && inCheck(t.gs);
      const mat = d > 0 ? `Material +${d}` : d < 0 ? `Material −${-d}` : 'Material gleich';
      return check ? `Schach! · ${mat}` : mat;
    },
    status(t, seat) {
      return t.status === 'play' && t.gs.turn === seat && inCheck(t.gs) ? 'Schach! Du bist am Zug' : null;
    },
    menu(t, { item, share }) {
      const names = t.seats.map((s, i) => (s ? s.name : ['Weiß', 'Schwarz'][i]));
      return [item('Partie als PGN teilen', () => share('Schachpartie (PGN)', pgn(t.gs, { white: names[0], black: names[1] })), 'pgn')];
    }
  }
};

UI.schnapsen = {
  board: schnapsenBoard,
  icon: () => cardIcon(),
  rules: rulesSchnapsen,
  hidden: true,
  sub(t, seat, viewer) {
    const gs = t.gs;
    const parts = [`${gs.points[seat]} Pkt · ${gs.bummerl[seat]} Bummerl`];
    if (gs.phase === 'play') {
      const a = SN.cardPoints(gs, seat);
      // eigene Augen nur mit „Augen-Hilfe“ (sonst zählt man selbst mit, wie am Wirtshaustisch)
      if (seat === viewer && a !== null && gs.opts && gs.opts.augenHilfe) {
        const pend = SN.pendingPoints(gs, seat);
        parts.push(`${a} Augen${pend ? ` (+${pend} schwebend)` : ''}`);
      } else parts.push(gs.tricks[seat] ? `${gs.tricks[seat]} ${gs.tricks[seat] === 1 ? 'Stich' : 'Stiche'}` : 'stichlos');
    }
    return parts.join(' · ');
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'spielende') return 'Spiel vorbei – weiter zum nächsten Spiel';
    if (gs.openAnsage) return `Angesagt – König oder Ober ausspielen`;
    return null;
  },
  // Knöpfe je nach erlaubten Zügen
  actions(t, legal, submit) {
    const gs = t.gs;
    const out = [];
    for (const m of legal) {
      if (m.type === 'ansagen') out.push([`${m.suit === gs.atout ? 40 : 20} ansagen (${SN.SUIT_NAMES[m.suit]})`, 'ansagen-' + m.suit, m]);
      if (m.type === 'tauschen') out.push(['Atout-Unter tauschen', 'tauschen', m]);
      if (m.type === 'zudrehen') out.push(['Zudrehen', 'zudrehen', m]);
      if (m.type === 'ausmelden' && SN.canDeclare(gs)) out.push(['Ausmelden (66)', 'ausmelden', m, true]);
      if (m.type === 'weiter') out.push(['Nächstes Spiel', 'weiter', m, true]);
    }
    return out.map(([label, act, m, primary]) => h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: () => submit(m) } }, label));
  },
  menu(t, { item, sheet }) {
    return [item('Bummerl-Tafel', () => sheet('Bummerl-Tafel', bummerlTafel(t)), 'tafel')];
  },
  // Stich-Blatt: own = SN.ownTricks(Sicht, Sitz) – enthält nur die eigenen gewonnenen Karten
  // (Bilder wie auf dem Tisch: am Handy @2x, die sind offline vorgeladen)
  stichBlatt(own, { seat, augenHilfe, opp }) {
    const card = (c, lead) => h('span', { class: 'sb-card' + (lead ? ' lead' : '') },
      h('img', { src: `assets/cards/de/${c}${typeof devicePixelRatio === 'number' && devicePixelRatio >= 1.5 ? '@2x' : ''}.webp`, alt: SN.cardName(c), title: SN.cardName(c), width: 60, height: 96, data: { card: c } }),
      lead ? h('span', { class: 'sb-lead', text: 'ausgespielt' }) : null);
    const rows = own.tricks.map((tr) => h('li', { class: 'sb-trick', data: { trick: String(tr.nr) } },
      h('span', { class: 'sb-nr', text: `${tr.nr}.` }),
      h('span', { class: 'sb-cards' }, card(tr.cards[0], true), card(tr.cards[1], false)),
      h('span', { class: 'sb-who' },
        tr.lead === null ? '' : tr.lead === seat ? 'Du hast ausgespielt' : `${opp} hat ausgespielt`,
        augenHilfe ? h('span', { class: 'sb-augen', text: `${tr.augen} Augen` }) : null)));
    const ans = own.ansagen.map((a) => `${a.points} (${SN.SUIT_NAMES[a.suit]})`);
    return h('div', { class: 'stichblatt' },
      own.tricks.length ? h('ol', { class: 'sb-list' }, ...rows) : h('p', { class: 'muted', text: 'Noch kein Stich gewonnen.' }),
      h('p', { class: 'sb-ansagen' }, h('strong', { text: 'Deine Ansagen: ' }), ans.length ? ans.join(', ') : 'keine'),
      augenHilfe
        ? h('p', { class: 'sb-sum' }, h('strong', { text: `Summe: ${own.total} Augen` }),
          own.pending ? ` (+${own.pending} schwebend, zählen ab deinem ersten Stich)` : own.ansagen.length ? ` (Stiche ${own.augen} + Ansagen ${own.total - own.augen})` : '', own.total >= 66 ? ' – du kannst dich ausmelden!' : '')
        : h('p', { class: 'muted small', text: 'Zähl selbst mit – wer 66 Augen hat, meldet sich aus. (Die Summe zeigt die „Augen-Hilfe“ in den Schnapsen-Optionen.)' }),
      h('p', { class: 'muted small', text: 'Nur deine eigenen Stiche. Die Stiche des Gegners bleiben verdeckt.' }));
  }
};

UI.backgammon = {
  board: backgammonBoard,
  icon: stoneIcon,
  rules: rulesBackgammon,
  sub(t, seat) {
    const gs = t.gs;
    const parts = [`${BG.pips(gs, seat)} Pips`];
    if (gs.bar[seat]) parts.push(`${gs.bar[seat]} auf der Bar`);
    if (gs.off[seat]) parts.push(`${gs.off[seat]} abgetragen`);
    if (gs.options.cube && gs.cube.owner === seat) parts.push(`Doppler ${gs.cube.value}`);
    return parts.join(' · ');
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'double' && seat !== gs.turn) return `Verdoppelt auf ${gs.cube.value * 2} – annehmen?`;
    if (gs.phase === 'roll') return 'Du bist dran: würfeln';
    return null;
  },
  actions(t, legal, submit, view) {
    const gs = t.gs;
    const b = (label, act, fn, primary) => h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: fn } }, label);
    const out = [];
    const has = (type) => legal.find((m) => m.type === type);
    if (gs.phase === 'roll') {
      out.push(b('Würfeln', 'roll', () => submit(has('roll')), true));
      if (has('double')) out.push(b(`Verdoppeln auf ${gs.cube.value * 2}`, 'double', () => submit(has('double'))));
    } else if (gs.phase === 'double') {
      out.push(b(`Annehmen (${gs.cube.value * 2})`, 'take', () => submit(has('take')), true));
      out.push(b(`Aufgeben (−${gs.cube.value})`, 'drop', () => submit(has('drop'))));
    } else if (gs.phase === 'move' && view) {
      if (legal.length === 1 && legal[0].steps && !legal[0].steps.length) {
        out.push(b('Weiter (kein Zug möglich)', 'pass', () => submit(legal[0]), true));
      } else {
        if (view.canUndo()) out.push(b('Zurück', 'undo', () => view.undo()));
        if (view.offStep()) out.push(b('Abtragen', 'off', () => view.bearOff(), true));
        out.push(Object.assign(b('Fertig', 'done', () => view.finish(), view.complete()), { disabled: !view.complete() }));
      }
    }
    return out;
  }
};

UI.blackjack = {
  board: blackjackBoard,
  icon: seatIcon,
  rules: rulesBlackjack,
  hidden: true,
  shared: true,   // alle sehen dasselbe (Spielerkarten liegen offen) → kein Sichtschutz nötig
  sub(t, seat) {
    const gs = t.gs;
    const parts = [`${BJ.fmtBeans(gs.beans[seat])} Bohnen`];
    if (seat === gs.bank) parts.push(`Bank (noch ${Math.max(1, BJ.ROUNDS_PER_BANK - gs.bankRounds)} ${BJ.ROUNDS_PER_BANK - gs.bankRounds === 1 ? 'Runde' : 'Runden'})`);
    else if (gs.bets[seat]) parts.push(`setzt ${BJ.fmtBeans(gs.bets[seat])}`);
    return parts.join(' · ');
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'bet') return 'Setz deinen Einsatz';
    return null;
  },
  actions(t, legal, submit) {
    const gs = t.gs;
    const b = (label, act, m, primary) => h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: () => submit(m) } }, label);
    const out = [];
    const bets = legal.filter((m) => m.type === 'bet');
    if (bets.length) {
      const max = Math.max(...bets.map((m) => m.amount));
      const picks = [...new Set([1, 2, 5, 10, 20, 50].filter((x) => x <= max).concat([max]))].slice(-6);
      for (const a of picks) out.push(b(a === max && max !== 50 && ![1, 2, 5, 10, 20].includes(a) ? `${a} (alles)` : String(a), 'bet-' + a, { type: 'bet', amount: a }, a === 5));
      return [h('div', { class: 'bet-row' }, h('span', { class: 'bet-t', text: 'Einsatz:' }), ...out)];
    }
    const has = (type) => legal.find((m) => m.type === type);
    if (has('hit')) out.push(b('Ziehen', 'hit', has('hit'), true));
    if (has('stand')) out.push(b('Stehen', 'stand', has('stand')));
    if (has('double')) out.push(b('Verdoppeln', 'double', has('double')));
    if (has('split')) out.push(b('Teilen', 'split', has('split')));
    return out;
  }
};

function halmaIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="9" fill="${SEAT_COLORS[seat % 6]}" stroke="rgba(0,0,0,.5)"/><text x="10" y="14" text-anchor="middle" font-size="11" fill="#fff">${SEAT_SYMBOLS[seat % 6]}</text>`;
  return svg;
}

UI.halma = {
  board: halmaBoard,
  icon: halmaIcon,
  rules: () => rulesHalma(HM.BLOCK_RULE_TEXT),
  sub(t, seat) {
    const gs = t.gs;
    const inGoal = HM.CAMP[HM.targetCamp(gs.n, seat)].filter((i) => gs.board[i] === seat).length;
    return `${HM.PLAYERS[seat]} · Restweg ${HM.distance(gs, seat)} · ${inGoal}/10 im Ziel`;
  },
  // „Lupe“: Brett vergrößert und verschiebbar (121 Löcher sind am Handy eng)
  actions(t, legal, submit, view) {
    const wrap = view && view.svg.parentNode;
    const on = !!(wrap && wrap.classList.contains('zoom'));
    const out = [h('button', { class: 'btn', data: { act: 'lupe' }, on: { click: () => {
      if (!wrap) return;
      const z = wrap.classList.toggle('zoom');
      if (z) { wrap.scrollTop = wrap.scrollHeight; wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; }
      const b = document.querySelector('[data-act=lupe]');
      if (b) b.textContent = z ? 'Lupe aus' : 'Lupe (größer)';
    } } }, on ? 'Lupe aus' : 'Lupe (größer)')];
    if (legal.length === 1 && legal[0].pass) out.push(h('button', { class: 'btn primary', data: { act: 'pass' }, on: { click: () => submit(legal[0]) } }, 'Aussetzen'));
    return out;
  }
};

// Ludo: Farbe je Sitz kommt aus dem Zustand (zu zweit Rot gegen Grün)
function ludoIcon(seat, t) {
  const c = t && t.gs && t.gs.colors ? t.gs.colors[seat] : seat;
  return halmaIcon(c ?? seat);
}

UI.ludo = {
  board: ludoBoard,
  icon: ludoIcon,
  rules: (o) => rulesFromData(LUDO_RULES, o),
  sub(t, seat) {
    const ps = t.gs.pieces[seat] || [];
    const goal = ps.filter((p) => p >= 40).length, out = ps.filter((p) => p >= 0 && p < 40).length;
    return `${LD.PLAYERS[LD.colorOf(t.gs, seat)]} · ${goal}/4 im Ziel`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'roll') return gs.tries > 0 && LD.mayRollThrice(gs) ? `Nochmal würfeln (Versuch ${gs.tries + 1} von 3)` : gs.lastRoll && gs.lastRoll.seat === seat && gs.lastRoll.value === 6 && gs.lastRoll.moved ? 'Eine 6 – nochmal würfeln!' : 'Du bist dran: würfeln';
    if (gs.phase === 'move') return `Du hast eine ${gs.die} – welche Figur?`;
    return null;
  },
  actions(t, legal, submit) {
    const roll = legal.find((m) => m.type === 'roll');
    return roll ? [h('button', { class: 'btn primary', data: { act: 'roll' }, on: { click: () => submit(roll) } }, 'Würfeln')] : [];
  }
};

function shipIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="9" fill="${seat ? '#c8582f' : '#2f6fd6'}" stroke="rgba(0,0,0,.5)"/><path d="M4 11h12l-2 4H6z M9 5v6 M9 5l4 4H9" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>`;
  return svg;
}

UI.schiffe = {
  board: schiffeBoard,
  icon: shipIcon,
  rules: (o) => rulesFromData(SCHIFFE_RULES, o),
  hidden: true,
  sub(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'place') return gs.turn > seat ? 'Flotte steht' : gs.turn === seat ? 'stellt die Flotte auf' : 'wartet';
    const all = SV.fleetOf(gs.opts).length;
    const left = all - (gs.sunk[1 - seat] || []).length;
    return `${left} von ${all} Schiffen · ${SV.remaining(gs, seat)} Felder heil`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase === 'place' && gs.turn === seat) return 'Stell deine Flotte auf';
    if (gs.phase === 'shoot' && gs.turn === seat) return gs.last && gs.last.seat === seat && gs.last.hit ? 'Treffer – du darfst nochmal!' : 'Du bist dran: schießen';
    return null;
  },
  // Sichtschutz zu zweit: was zuletzt passiert ist (der Schütze sieht sein Ergebnis sonst nicht mehr)
  handoff(t) {
    const l = t.last;
    return l && l.m && l.m.type === 'shot' && l.d ? `${t.seats[l.by] ? t.seats[l.by].name : 'Spieler ' + (l.by + 1)}: ${l.d}` : null;
  },
  actions(t, legal, submit, view) {
    if (!view) return [];
    const b = (label, act, fn, primary, disabled) => Object.assign(h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: fn } }, label), { disabled: !!disabled });
    if (view.placing()) {
      const out = [b('Neu mischen', 'shuffle', () => view.shuffle())];
      if (view.picked() !== null) out.push(b('Drehen', 'rotate', () => view.rotate()));
      out.push(b('Fertig', 'place', () => view.done(), true, !view.fleetOk()));
      return out;
    }
    const a = view.aim();
    if (a !== null) return [b(`Feuer auf ${SV.cellName(a)}!`, 'fire', () => view.fire(), true)];
    return [];
  }
};

function discIcon(color) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="8.5" fill="${color}" stroke="rgba(0,0,0,.5)"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/>`;
  return svg;
}

UI.vier = {
  board: vierBoard,
  icon: (seat) => discIcon(seat ? '#f2c230' : '#d8453b'),
  rules: (o) => rulesFromData(VIER_RULES, o),
  sub(t, seat) {
    const n = t.gs.cols.reduce((a, c) => a + c.filter((x) => x === seat).length, 0);
    return `${seat ? 'Gelb' : 'Rot'} · ${n} ${n === 1 ? 'Stein' : 'Steine'}`;
  },
  status(t, seat) { return t.gs.turn === seat ? 'Du bist dran: Spalte wählen' : null; }
};

UI.maumau = {
  board: maumauBoard,
  icon: (seat) => seatIcon(seat),
  rules: (o) => rulesFromData(MAUMAU_RULES, o),
  hidden: true,
  sub(t, seat) {
    const gs = t.gs, n = gs.hands[seat].length;
    return `${n} ${n === 1 ? 'Karte' : 'Karten'}${gs.mau && gs.mau[seat] && n === 1 ? ' · Mau!' : ''}`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.turn !== seat || gs.phase !== 'play') return null;
    if (gs.penalty > 0) return `Eine 7! Kontern oder ${gs.penalty} ziehen`;
    if (gs.drawn) return 'Gezogen – legen oder weiter';
    if (gs.wish) return `Du bist dran – gewünscht: ${MM.SUIT_NAMES[gs.wish]}`;
    return null;
  },
  actions(t, legal, submit, view) {
    const b = (label, act, fn, cls = '') => h('button', { class: 'btn' + cls, data: { act }, on: { click: fn } }, label);
    const out = [];
    if (view && view.needsWish()) {
      for (const s2 of MM.SUITS) out.push(b(MM.SUIT_NAMES[s2], 'wish-' + s2, () => view.wish(s2), ' primary'));
      return [h('div', { class: 'bet-row' }, h('span', { class: 'bet-t', text: 'Welche Farbe wünschst du dir?' }), ...out)];
    }
    if (view && view.canMau()) out.push(b(view.mauOn() ? 'Mau! ✓' : 'Mau sagen', 'mau', () => view.toggleMau(), view.mauOn() ? ' primary' : ''));
    const d = legal.find((m) => m.type === 'draw'), p = legal.find((m) => m.type === 'pass');
    if (d) out.push(b(t.gs.penalty > 0 ? `${t.gs.penalty} Karten ziehen` : 'Karte ziehen', 'draw', () => submit(d)));
    if (p) out.push(b('Weiter', 'pass', () => submit(p), ' primary'));
    return out;
  }
};

// ganzer Spielblock aller Spieler (Menü)
function wgBlock(t) {
  const gs = t.gs;
  const names = t.seats.map((x, i) => (x ? x.name : `Spieler ${i + 1}`));
  const row = (label, vals, cls = '') => h('tr', { class: cls }, h('td', { text: label }), ...vals.map((v) => h('td', { class: 'bt-num', text: v === null || v === undefined ? '' : String(v) })));
  const tot = gs.sheets.map(WG.totals);
  return h('div', { class: 'rules' }, h('table', { class: 'bummerl wg-block' },
    h('tr', {}, h('th', { text: '' }), ...names.map((n) => h('th', { class: 'bt-num', text: n }))),
    ...WG.CATS.filter((c) => c.section === 'oben').map((c) => row(c.name, gs.sheets.map((sh) => sh[c.key]))),
    row('Bonus', tot.map((x) => x.bonus || `${x.oben}/63`), 'bt-head'),
    ...WG.CATS.filter((c) => c.section === 'unten').map((c) => row(c.name, gs.sheets.map((sh) => sh[c.key]))),
    tot.some((x) => x.extra) ? row('Extra', tot.map((x) => x.extra)) : null,
    row('Summe', tot.map((x) => x.gesamt), 'bt-head')));
}

UI.wuerfel = {
  board: wuerfelBoard,
  icon: (seat) => seatIcon(seat),
  rules: (o) => rulesFromData(WUERFEL_RULES, o),
  sub(t, seat) {
    const sh = t.gs.sheets[seat];
    if (!sh) return '';
    const filled = WG.CAT_KEYS.filter((k) => sh[k] !== null).length;
    return `${WG.totals(sh).gesamt} Punkte · ${filled}/13 Felder`;
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.turn !== seat) return null;
    if (gs.phase === 'roll') return `Runde ${gs.round}: würfeln`;
    if (gs.phase === 'choose') return gs.rolls < 3 ? `Wurf ${gs.rolls} von 3 – halten oder eintragen` : 'Letzter Wurf – eintragen';
    return null;
  },
  menu(t, { item, sheet }) {
    return [item('Spielblock (alle Spieler)', () => sheet('Spielblock', wgBlock(t)), 'block')];
  },
  actions(t, legal, submit, view) {
    if (!view) return [];
    const gs = t.gs;
    const b = (label, act, fn, primary, disabled) => Object.assign(h('button', { class: 'btn' + (primary ? ' primary' : ''), data: { act }, on: { click: fn } }, label), { disabled: !!disabled });
    const out = [];
    const sel = view.selected();
    if (gs.phase === 'roll') out.push(b('Würfeln', 'roll', () => view.roll(), true));
    else if (gs.phase === 'choose') {
      if (gs.rolls < 3) out.push(b(`Würfeln (noch ${3 - gs.rolls})`, 'roll', () => view.roll(), !sel, view.allHeld()));
      if (sel) {
        const pts = WG.scoreFor(gs.dice, sel, gs.sheets[gs.turn], gs.opts);
        out.push(b(`Eintragen: ${WG.CAT_NAME[sel]} ${pts ? '+' + pts : '(0)'}`, 'score', () => view.scoreSelected(), true));
      }
    }
    return out;
  }
};

UI.reversi = {
  board: reversiBoard,
  icon: (seat) => stoneIcon(1 - seat),   // Sitz 0 = Schwarz
  rules: (o) => rulesFromData(REVERSI_RULES, o),
  sub(t, seat) {
    const c = RV.counts(t.gs);
    return `${seat ? 'Weiß' : 'Schwarz'} · ${c[seat]} Steine`;
  },
  status(t, seat) {
    if (t.gs.turn !== seat) return null;
    const l = RV.legalMoves(t.gs);
    return l.length === 1 && l[0].pass ? 'Kein Feld frei – du musst passen' : 'Du bist dran: Feld wählen';
  },
  actions(t, legal, submit) {
    const p = legal.length === 1 && legal[0].pass ? legal[0] : null;
    return p ? [h('button', { class: 'btn primary', data: { act: 'pass' }, on: { click: () => submit(p) } }, 'Passen')] : [];
  }
};

export function gameUi(id) {
  return UI[id];
}
