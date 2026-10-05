// Lobby: Profilname, Tisch aufmachen (Spiel + Optionen), Beitreten mit 3 Wörtern (Autovervollständigung),
// Zuschauen, Weiterspielen (laufende Tische und lokale Partien).
import { h, clear, sheet, toast, relTime } from './dom.js';
import { GAME_LIST, LIVE, gameOf } from '../games/registry.js';
import { suggest, findWord, parseWords, displayWord } from '../words.js';
import * as store from '../store.js';
import { rulesMuehle, rulesDame, rulesSchach, rulesSchnapsen, rulesBackgammon, rulesBlackjack, rulesHalma, helpNet, credits } from './texts.js';

const RULES = { muehle: rulesMuehle, dame: rulesDame, schach: rulesSchach, schnapsen: rulesSchnapsen, backgammon: rulesBackgammon, blackjack: rulesBlackjack, halma: rulesHalma };
const liveGames = () => GAME_LIST.filter((g) => LIVE.has(g.id) || /[?&]alle/.test(location.search));
import { BUILD } from '../build.js';
import { RULES as LUDO_RULES } from '../games/ludo/rules.js';
import { rulesFromData } from './texts.js';
RULES.ludo = () => rulesFromData(LUDO_RULES);
import { RULES as SCHIFFE_RULES } from '../games/schiffe/rules.js';
RULES.schiffe = () => rulesFromData(SCHIFFE_RULES);
import { RULES as VIER_RULES } from '../games/vier/rules.js';
RULES.vier = () => rulesFromData(VIER_RULES);
import { RULES as MAUMAU_RULES } from '../games/maumau/rules.js';
RULES.maumau = () => rulesFromData(MAUMAU_RULES);
import { RULES as WUERFEL_RULES } from '../games/wuerfel/rules.js';
RULES.wuerfel = () => rulesFromData(WUERFEL_RULES);
import { RULES as REVERSI_RULES } from '../games/reversi/rules.js';
RULES.reversi = () => rulesFromData(REVERSI_RULES);
import { RULES as PAARE_RULES } from '../games/paare/rules.js';
RULES.paare = () => rulesFromData(PAARE_RULES);
import { openSettings } from './settings.js';
import { rulesHoldem } from '../games/holdem/help.js';
RULES.holdem = () => rulesHoldem();
import { DEKO } from './deko.js';

const LEVELS = [{ v: 1, t: 'Leicht' }, { v: 2, t: 'Mittel' }, { v: 3, t: 'Stark' }];
const COLORS = [{ v: 'weiss', t: 'Weiß' }, { v: 'schwarz', t: 'Schwarz' }, { v: 'zufall', t: 'Zufall' }];

export function miniBoard(game) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'mini');
  svg.setAttribute('aria-hidden', 'true');
  if (game === 'muehle') {
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' +
      '<g fill="none" stroke="#3a2515" stroke-width="3.2"><rect x="12" y="12" width="76" height="76"/><rect x="25" y="25" width="50" height="50"/><rect x="38" y="38" width="24" height="24"/>' +
      '<path d="M50 12V38M50 62V88M12 50H38M62 50H88"/></g>' +
      '<circle cx="12" cy="12" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="50" cy="25" r="7.5" fill="url(#sb-st-b)"/><circle cx="88" cy="88" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="62" cy="62" r="7.5" fill="url(#sb-st-b)"/>';
  } else if (game === 'schnapsen' || game === 'blackjack' || game === 'maumau') {
    const de = game !== 'blackjack';
    const cards = game === 'maumau' ? ['H7', 'LU', 'S9'] : de ? ['HA', 'LK', 'EO'] : ['AS', 'KH', 'TD'];
    const dir = de ? 'de' : 'fr';
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="#1d5a3f"/>' + cards.map((c, i) =>
      `<g transform="translate(${30 + i * 20} ${56}) rotate(${(i - 1) * 14})"><image href="assets/cards/${dir}/${c}.webp" x="-17" y="-27" width="34" height="${de ? 54 : 49}"/></g>`).join('');
  } else if (game === 'holdem') {
    const chip = (x, y, c) => `<ellipse cx="${x}" cy="${y + 2}" rx="11" ry="5" fill="rgba(0,0,0,.35)"/><ellipse cx="${x}" cy="${y}" rx="11" ry="5" fill="${c}" stroke="#fff7e6" stroke-width="1.6" stroke-dasharray="5 3.5"/>`;
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-frame)"/><ellipse cx="50" cy="52" rx="44" ry="34" fill="#1d5a3f" stroke="#0f3a28" stroke-width="2"/>' +
      ['AS', 'AH'].map((c, i) => `<g transform="translate(${40 + i * 18} 44) rotate(${(i - 0.5) * 16})"><image href="assets/cards/fr/${c}.webp" x="-14" y="-20" width="28" height="41"/></g>`).join('') +
      chip(24, 74, '#c0392b') + chip(24, 69, '#c0392b') + chip(76, 76, '#222') + chip(76, 71, '#d6a21e') + chip(76, 66, '#d6a21e');
  } else if (game === 'backgammon') {
    let tri = '';
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 14;
      tri += `<path d="M${x} 8 L${x + 7} 44 L${x + 14} 8Z" fill="${i % 2 ? '#e8d7b5' : '#8b2f24'}"/><path d="M${x} 92 L${x + 7} 56 L${x + 14} 92Z" fill="${i % 2 ? '#8b2f24' : '#e8d7b5'}"/>`;
    }
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' + tri +
      '<circle cx="15" cy="84" r="6.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="15" cy="72" r="6.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="85" cy="16" r="6.5" fill="url(#sb-st-b)"/>' +
      '<rect x="40" y="40" width="20" height="20" rx="4" fill="#fff" stroke="#333"/><circle cx="45" cy="45" r="2" fill="#222"/><circle cx="55" cy="55" r="2" fill="#222"/><circle cx="50" cy="50" r="2" fill="#222"/>';
  } else if (game === 'halma') {
    const col = ['#d8453b', '#2f6fd6', '#2e9e57', '#e0b12c', '#8a4fc9', '#e07b27'];
    let dots = '';
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 + 90) * Math.PI / 180;
      for (let j = 0; j < 3; j++) dots += `<circle cx="${50 + Math.cos(a) * (28 + j * 6)}" cy="${50 + Math.sin(a) * (28 + j * 6)}" r="4" fill="${col[k]}"/>`;
    }
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/><path d="M50 6 L62 30 L88 30 L74 50 L88 70 L62 70 L50 94 L38 70 L12 70 L26 50 L12 30 L38 30Z" fill="rgba(90,55,25,.25)" stroke="#5a3a1a" stroke-width="1.5"/>' + dots;
  } else if (game === 'ludo') {
    const col = ['#d8453b', '#2f6fd6', '#2e9e57', '#e0b12c'];
    let d = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>';
    const corners = [[8, 62], [8, 8], [62, 8], [62, 62]];
    corners.forEach(([x, y], k) => { d += `<rect x="${x}" y="${y}" width="30" height="30" rx="7" fill="${col[k]}" opacity=".35"/>`; });
    d += '<path d="M42 8H58V42H92V58H58V92H42V58H8V42H42Z" fill="#f4e9d2" stroke="#5a3a1a" stroke-width="2"/>';
    corners.forEach(([x, y], k) => { d += `<circle cx="${x + 15}" cy="${y + 15}" r="8" fill="${col[k]}" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/>`; });
    svg.innerHTML = d + '<rect x="40" y="40" width="20" height="20" rx="4" fill="#fff" stroke="#333"/><circle cx="45" cy="45" r="2" fill="#222"/><circle cx="55" cy="55" r="2" fill="#222"/>';
  } else if (game === 'paare') {
    let d = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>';
    const face = { 0: '🐱', 3: '🐱', 5: '🐶' };
    for (let k = 0; k < 9; k++) { const x = 8 + (k % 3) * 29, y = 8 + Math.floor(k / 3) * 29; d += face[k] ? `<rect x="${x}" y="${y}" width="26" height="26" rx="5" fill="#fffaf0" stroke="#b8862c" stroke-width="1.5"/><text x="${x + 13}" y="${y + 19}" font-size="16" text-anchor="middle">${face[k]}</text>` : `<rect x="${x}" y="${y}" width="26" height="26" rx="5" fill="#2f6f8f" stroke="#1d4357" stroke-width="1.5"/>`; }
    svg.innerHTML = d;
  } else if (game === 'reversi') {
    let d = '<rect width="100" height="100" rx="12" fill="#2f7a4a"/>';
    for (let k = 1; k < 4; k++) d += `<path d="M${k * 25} 4V96M4 ${k * 25}H96" stroke="rgba(10,40,20,.7)" stroke-width="1.6"/>`;
    const disc = (x, y, b) => `<circle cx="${x}" cy="${y}" r="9.5" fill="url(#sb-st-${b ? 'b' : 'w'})" stroke="${b ? '#000' : '#7a6548'}"/>`;
    svg.innerHTML = d + disc(37.5, 37.5, 0) + disc(62.5, 62.5, 0) + disc(62.5, 37.5, 1) + disc(37.5, 62.5, 1) + disc(62.5, 12.5, 1);
  } else if (game === 'wuerfel') {
    const die = (x, y, r, v) => { const o = 7; const P = { 1: [[0, 0]], 3: [[-o, -o], [0, 0], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] }[v];
      return `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fffdf6" stroke="#3a2515" stroke-width="1.5"/>${P.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="2.6" fill="#1f140c"/>`).join('')}</g>`; };
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="#1d5a3f"/>' + die(26, 30, -12, 5) + die(66, 26, 10, 5) + die(30, 70, 8, 5) + die(70, 68, -6, 6) + die(50, 48, 3, 5);
  } else if (game === 'vier') {
    let d = '<rect width="100" height="100" rx="12" fill="#2459b8"/>';
    const b = ['....', '..r.', '.yr.', 'yrry'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const v = b[r][c]; d += `<circle cx="${17 + c * 22}" cy="${17 + r * 22}" r="8.5" fill="${v === 'r' ? '#d8453b' : v === 'y' ? '#f2c230' : '#163a7c'}"/>`; }
    svg.innerHTML = d;
  } else if (game === 'schiffe') {
    let d = '<rect width="100" height="100" rx="12" fill="#1e5d8c"/>';
    for (let k = 1; k < 6; k++) d += `<path d="M${k * 16.6} 6V94M6 ${k * 16.6}H94" stroke="rgba(255,255,255,.25)" stroke-width="1.2"/>`;
    d += '<rect x="12" y="20" width="44" height="13" rx="6.5" fill="#cfd6dc" stroke="#53606a" stroke-width="1.5"/>';
    d += '<rect x="68" y="44" width="13" height="40" rx="6.5" fill="#cfd6dc" stroke="#53606a" stroke-width="1.5"/>';
    d += '<circle cx="42" cy="26.5" r="6" fill="#e5483b"/><path d="M38 23l8 7M46 23l-8 7" stroke="#fff" stroke-width="2"/><circle cx="28" cy="66" r="3" fill="#fff"/><circle cx="50" cy="80" r="3" fill="#fff"/>';
    svg.innerHTML = d;
  } else if (game === 'trainer') {
    let sq = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2) sq += `<rect x="${c * 25}" y="${r * 25}" width="25" height="25"/>`;
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' + `<g fill="url(#sb-wood-dark)">${sq}</g>` +
      '<image href="assets/pieces/wN.svg" x="4" y="54" width="42" height="42"/><image href="assets/pieces/bK.svg" x="54" y="4" width="42" height="42"/>' +
      '<line x1="28" y1="70" x2="58" y2="42" stroke="rgba(40,175,105,.92)" stroke-width="8" stroke-linecap="round"/><path d="M68 32 L50 40 L60 50Z" fill="rgba(40,175,105,.92)"/>';
  } else if (game === 'schach') {
    let sq = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2) sq += `<rect x="${c * 25}" y="${r * 25}" width="25" height="25"/>`;
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' +
      `<g fill="url(#sb-wood-dark)">${sq}</g>` +
      '<image href="assets/pieces/bK.svg" x="52" y="2" width="46" height="46"/><image href="assets/pieces/wN.svg" x="2" y="52" width="46" height="46"/>';
  } else {
    let sq = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if ((r + c) % 2) sq += `<rect x="${c * 20}" y="${r * 20}" width="20" height="20"/>`;
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' +
      `<g fill="url(#sb-wood-dark)">${sq}</g>` +
      '<circle cx="30" cy="10" r="7.5" fill="url(#sb-st-b)"/><circle cx="70" cy="10" r="7.5" fill="url(#sb-st-b)"/><circle cx="50" cy="50" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="10" cy="90" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="90" cy="70" r="7.5" fill="url(#sb-st-w)" stroke="#7a6548"/>';
  }
  if (DEKO.on) dekoMini(svg);
  return svg;
}

// Deko: Steine im Bildchen mit Glanz, darüber Lack-Glanz und eine helle Kante (einmal gezeichnet, statisch)
function dekoMini(svg) {
  svg.innerHTML = svg.innerHTML.replace(/url\(#sb-st-w\)/g, 'url(#dk-st-w)').replace(/url\(#sb-st-b\)/g, 'url(#dk-st-b)') +
    '<rect width="100" height="100" rx="12" fill="url(#dk-sheen)"/>' +
    '<rect x="1.2" y="1.2" width="97.6" height="97.6" rx="11" fill="none" stroke="url(#dk-bevel)" stroke-width="2.4"/>';
}

function segmented(label, items, value, onChange) {
  const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const render = () => {
    clear(box);
    for (const it of items) {
      box.appendChild(h('button', {
        class: 'seg-btn' + (it.v === value ? ' on' : ''), role: 'radio', 'aria-checked': String(it.v === value), data: { v: String(it.v) },
        on: { click: () => { value = it.v; render(); onChange(it.v); } }
      }, h('span', { class: 'seg-t', text: it.t }), it.sub ? h('span', { class: 'seg-sub', text: it.sub }) : null));
    }
  };
  render();
  return h('div', { class: 'field' }, h('div', { class: 'field-label', text: label }), box);
}

function toggle(label, sub, value, onChange, key) {
  const btn = h('button', { class: 'switch' + (value ? ' on' : ''), role: 'switch', 'aria-checked': String(value), data: { key },
    on: { click: () => { value = !value; btn.classList.toggle('on', value); btn.setAttribute('aria-checked', String(value)); onChange(value); } } },
  h('span', { class: 'sw-text' }, h('span', { class: 'sw-label', text: label }), h('span', { class: 'sw-sub', text: sub })),
  h('span', { class: 'sw-knob', 'aria-hidden': 'true' }));
  return btn;
}

// Auswahlblatt für ein Spiel: Optionen + Modus (online, Computer, zu zweit)
export function openGameSheet(gameId, { onOnline, onLocal, title, onlyOnline = false, onlineLabel }) {
  const g = gameOf(gameId);
  const st = store.settings();
  const opts = { ...(st.opts && st.opts[gameId]) };
  let color = st.hostColor || 'weiss';
  let level = st.botLevel || 2;
  const remember = () => {
    const s2 = store.settings();
    s2.opts = { ...(s2.opts || {}), [gameId]: opts };
    s2.hostColor = color;
    s2.botLevel = level;
    store.saveSettings(s2);
  };
  const body = [];
  for (const o of g.options) {
    if (opts[o.key] === undefined && o.dflt !== undefined) opts[o.key] = o.dflt;
    if (o.type === 'choice') {
      if (opts[o.key] === undefined) opts[o.key] = o.choices[0].value;
      body.push(segmented(o.label, o.choices.map((c) => ({ v: c.value, t: c.label, sub: c.sub })), opts[o.key], (v) => { opts[o.key] = v; }));
    } else {
      body.push(toggle(o.label, o.sub, !!opts[o.key], (v) => { opts[o.key] = v; }, o.key));
    }
  }
  // Farbnamen je Spiel (Vier in einer Reihe: Rot/Gelb, Reversi: Schwarz/Weiß) – Wert bleibt Sitz 0 / Sitz 1
  const colorItems = g.colorNames ? [{ v: 'weiss', t: g.colorNames[0] }, { v: 'schwarz', t: g.colorNames[1] }, COLORS[2]] : COLORS;
  if (g.colors) body.push(segmented('Du spielst', colorItems, color, (v) => { color = v; }));
  const sh = sheet(title || g.title, ...body);
  const go = (fn) => () => { remember(); sh.close(); fn(); };
  sh.body.append(
    h('button', { class: 'btn primary big', data: { act: 'online' }, on: { click: go(() => onOnline(gameId, g.engine.normalizeOptions(opts), color)) } },
      h('span', { text: onlineLabel || 'Online-Tisch aufmachen' }), h('small', { text: onlyOnline ? 'am selben Tisch, gleiche Wörter' : typeof g.seats === 'function' ? 'Du bekommst 3 Wörter für die Mitspieler' : 'Du bekommst 3 Wörter für deinen Mitspieler' }))
  );
  if (!onlyOnline) {
    sh.body.append(
      h('div', { class: 'bot-row' },
        segmented(typeof g.seats === 'function' ? 'Mit Computer-Spielern' : 'Gegen den Computer', LEVELS, level, (v) => { level = v; }),
        h('button', { class: 'btn', data: { act: 'bot' }, on: { click: go(() => onLocal('bot', gameId, g.engine.normalizeOptions(opts), color, level)) } }, 'Spielen')),
      h('button', { class: 'btn', data: { act: 'hotseat' }, on: { click: go(() => onLocal('hotseat', gameId, g.engine.normalizeOptions(opts), 'weiss')) } }, typeof g.seats === 'function' ? 'Alle an diesem Gerät' : 'Zu zweit an diesem Gerät'),
      h('button', { class: 'btn link', on: { click: () => sheet('Regeln', RULES[gameId]()) } }, 'Regeln lesen')
    );
  }
  return sh;
}

let lobbyShown = false;
export function renderLobby(root, handlers) {
  const me = store.profile();
  const nameInput = h('input', {
    id: 'name', class: 'input', maxlength: 20, autocomplete: 'nickname', placeholder: 'z. B. Peter', value: me.name || '',
    'aria-label': 'Dein Name',
    on: { input: () => { const p = store.profile(); p.name = nameInput.value.trim().slice(0, 20); store.saveProfile(p); } }
  });

  const needName = () => {
    if (store.profile().name) return true;
    nameInput.focus();
    nameInput.classList.add('shake');
    setTimeout(() => nameInput.classList.remove('shake'), 500);
    toast('Bitte zuerst deinen Namen eintragen');
    return false;
  };

  // --- Neuer Tisch ---
  const games = h('div', { class: 'games' + (DEKO.on && !lobbyShown ? ' enter' : '') }, ...liveGames().flatMap((g) => [
    h('button', { class: 'game', data: { game: g.id }, on: { click: () => openGameSheet(g.id, {
      onOnline: (...a) => { if (needName()) handlers.onCreate(...a); },
      onLocal: (...a) => handlers.onLocal(...a)
    }) } }, miniBoard(g.id), h('span', { class: 'game-t', text: g.title }), h('span', { class: 'game-sub', text: g.blurb })),
    // Schach-Trainer gleich nach Schach: allein üben, kein Tisch
    g.id === 'schach' && handlers.onTrainer ? h('button', { class: 'game trainer-tile', data: { game: 'trainer' }, on: { click: () => handlers.onTrainer() } },
      miniBoard('trainer'), h('span', { class: 'game-t', text: 'Schach-Trainer' }), h('span', { class: 'game-sub', text: 'Eröffnungen, Taktik, Endspiele – allein üben' })) : null
  ].filter(Boolean)));

  // --- Beitreten ---
  const fields = [0, 1, 2].map((k) => h('input', {
    class: 'input word', id: 'w' + k, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: false,
    enterkeyhint: k < 2 ? 'next' : 'go', placeholder: ['Wort 1', 'Wort 2', 'Wort 3'][k], 'aria-label': `Wort ${k + 1}`
  }));
  const chips = h('div', { class: 'chips', 'aria-live': 'polite' });
  const btnPlay = h('button', { class: 'btn primary', data: { act: 'join' }, disabled: true, on: { click: () => doJoin('play') } }, 'Mitspielen');
  const btnWatch = h('button', { class: 'btn', data: { act: 'watch' }, disabled: true, on: { click: () => doJoin('watch') } }, 'Zuschauen');
  let active = 0;

  const words = () => fields.map((f) => findWord(f.value));
  const refresh = () => {
    const ws = words();
    fields.forEach((f, k) => {
      f.classList.toggle('ok', !!ws[k]);
      f.classList.toggle('bad', !!f.value.trim() && !ws[k] && document.activeElement !== f);
    });
    const complete = ws.every(Boolean) && new Set(ws).size === 3;
    btnPlay.disabled = !complete;
    btnWatch.disabled = !complete;
    renderChips();
  };
  const renderChips = () => {
    clear(chips);
    const f = fields[active];
    const v = f.value.trim();
    if (!v || (findWord(v) && findWord(v) === v.toLowerCase())) return;
    for (const w of suggest(v, 6)) {
      chips.appendChild(h('button', { class: 'chip', data: { word: w }, on: { click: () => pickWord(active, w) } }, displayWord(w)));
    }
  };
  const pickWord = (k, w) => {
    fields[k].value = displayWord(w);
    const next = fields.findIndex((f, j) => j > k && !findWord(f.value));
    const any = next >= 0 ? next : fields.findIndex((f) => !findWord(f.value));
    if (any >= 0) { active = any; fields[any].focus(); } else fields[k].blur();
    refresh();
  };
  fields.forEach((f, k) => {
    f.addEventListener('focus', () => { active = k; refresh(); });
    f.addEventListener('input', () => {
      // eingefügte Wortgruppe („baum wolke ball“ oder Link) auf die Felder verteilen
      if (/[\s,.;/#+_-]/.test(f.value.trim()) || f.value.length > 12) {
        const ws = parseWords(f.value);
        if (ws.filter(Boolean).length >= 2) {
          ws.forEach((w, j) => { if (w && k + j < 3) fields[k + j].value = displayWord(w); });
          const nextEmpty = fields.findIndex((x) => !findWord(x.value));
          if (nextEmpty >= 0) fields[nextEmpty].focus(); else f.blur();
        }
      }
      refresh();
    });
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || (e.key === ' ' && f.value.trim())) {
        e.preventDefault();
        const w = findWord(f.value) || suggest(f.value, 1)[0];
        if (w) pickWord(k, w);
        else if (k === 2 && !btnPlay.disabled) doJoin('play');
      }
    });
    f.addEventListener('blur', () => {
      const w = findWord(f.value);
      if (w) f.value = displayWord(w);
      setTimeout(refresh, 150);
    });
  });
  const doJoin = (want) => {
    const ws = words();
    if (!ws.every(Boolean)) return;
    if (!needName()) return;
    handlers.onJoin(ws, want);
  };

  // --- Weiterspielen ---
  const resume = h('div', { class: 'resume-list' });
  const renderResume = () => {
    clear(resume);
    const items = [];
    for (const mode of ['bot', 'hotseat']) {
      const t = store.loadLocal(mode);
      if (t && t.status !== 'over') items.push({ kind: mode, t, updated: t.updated });
    }
    for (const e of store.tableList()) items.push({ kind: 'online', e, updated: e.updated });
    items.sort((a, b) => b.updated - a.updated);
    if (!items.length) {
      resume.appendChild(h('p', { class: 'muted', text: 'Noch keine laufenden Partien.' }));
      return;
    }
    for (const it of items.slice(0, 8)) {
      const game = it.kind === 'online' ? it.e.game : it.t.game;
      const opts = it.kind === 'online' ? it.e.opts : it.t.opts;
      const g = gameOf(game || 'muehle');
      const title = g.id === 'dame' ? `Dame · ${g.variantName(opts).split(' · ')[0]}` : g.title;
      let sub;
      if (it.kind === 'online') {
        const names = (it.e.seats || []).filter(Boolean).join(' – ');
        sub = `${it.e.words.map(displayWord).join(' · ')}${names ? ' · ' + names : ''}`;
      } else {
        sub = it.kind === 'bot' ? 'gegen den Computer' : 'zu zweit an diesem Gerät';
      }
      const status = it.kind === 'online' ? ({ wait: 'wartet', play: 'läuft', over: 'beendet' }[it.e.status] || '') : 'läuft';
      resume.appendChild(h('div', { class: 'resume-item' },
        h('button', { class: 'resume-main', data: { resume: it.kind === 'online' ? it.e.roomId : it.kind }, on: { click: () => handlers.onResume(it) } },
          miniBoard(g.id),
          h('span', { class: 'resume-text' },
            h('span', { class: 'resume-t', text: title }),
            h('span', { class: 'resume-sub', text: sub }),
            h('span', { class: 'resume-meta', text: `${status} · ${relTime(it.updated)}` }))),
        h('button', { class: 'icon-btn', 'aria-label': 'Entfernen', text: '✕', on: { click: () => {
          if (it.kind === 'online') store.forgetTable(it.e.roomId); else store.forgetLocal(it.kind);
          renderResume();
        } } })));
    }
  };
  renderResume();

  const screen = h('div', { class: 'screen lobby' },
    h('header', { class: 'lobby-head' },
      h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '' }),
      h('div', {}, h('h1', { text: 'Spielebox' }), h('p', { text: 'Brett- und Kartenspiele – ohne Konto, mit 3 Wörtern' }))),
    h('div', { class: 'lobby-grid' },
      h('div', { class: 'col' },
        h('section', { class: 'card profile' }, h('label', { for: 'name', class: 'card-label', text: 'Dein Name' }), nameInput),
        h('section', { class: 'card new' }, h('h2', { text: 'Tisch aufmachen' }), games)),
      h('div', { class: 'col' },
        h('section', { class: 'card join' },
          h('h2', { text: 'Beitreten' }),
          h('p', { class: 'muted', text: 'Die drei Wörter vom Gastgeber eintippen – Reihenfolge egal.' }),
          h('div', { class: 'wordfields' }, ...fields),
          chips,
          h('div', { class: 'row' }, btnPlay, btnWatch)),
        h('section', { class: 'card resume' }, h('h2', { text: 'Weiterspielen' }), resume))),
    h('footer', { class: 'lobby-foot' },
      h('button', { class: 'btn link', on: { click: () => sheet('So geht’s', helpNet()) } }, 'So geht’s'),
      h('button', { class: 'btn link', on: { click: () => sheet('Regeln', ...liveGames().map((g) => RULES[g.id]())) } }, 'Regeln'),
      h('button', { class: 'btn link', on: { click: () => sheet('Credits', credits()) } }, 'Credits'),
      h('button', { class: 'btn link', data: { act: 'settings' }, on: { click: () => openSettings() } }, 'Einstellungen'),
      h('span', { class: 'version', text: 'Version ' + BUILD })));

  clear(root).appendChild(screen);
  // Deko: Kacheln erscheinen beim ersten Öffnen nacheinander (einmal je Sitzung, kurz)
  if (DEKO.on) [...games.children].forEach((el, i) => el.style.setProperty('--i', i));
  lobbyShown = true;
  return {
    // Wörter aus einem Link vorbelegen
    prefill(ws) {
      ws.forEach((w, k) => { if (w && k < 3) fields[k].value = displayWord(w); });
      refresh();
      screen.querySelector('.join').scrollIntoView({ block: 'center' });
      btnPlay.classList.add('pulse');
    },
    fields
  };
}
