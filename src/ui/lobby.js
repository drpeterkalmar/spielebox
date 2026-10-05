// Lobby: Profilname, Tisch aufmachen (Spiel + Optionen), Beitreten mit 3 Wörtern (Autovervollständigung),
// Zuschauen, Weiterspielen (laufende Tische und lokale Partien).
import { h, clear, sheet, toast, relTime } from './dom.js';
import { GAME_LIST, LIVE, gameOf } from '../games/registry.js';
import { suggest, findWord, parseWords, displayWord } from '../words.js';
import * as store from '../store.js';
import { helpNet, credits } from './texts.js';
import { BUILD } from '../build.js';
import { openSettings } from './settings.js';
import { DEKO } from './deko.js';

const liveGames = () => GAME_LIST.filter((g) => LIVE.has(g.id) || /[?&]alle/.test(location.search));
// Regeln für die Lobby (je Spiel in src/games/<id>/ui.js)
const lobbyRules = (id) => { const u = gameOf(id).ui; return (u.lobbyRules || u.rules)(); };

const LEVELS = [{ v: 1, t: 'Leicht' }, { v: 2, t: 'Mittel' }, { v: 3, t: 'Stark' }];
const COLORS = [{ v: 'weiss', t: 'Weiß' }, { v: 'schwarz', t: 'Schwarz' }, { v: 'zufall', t: 'Zufall' }];

export function miniBoard(game) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'mini');
  svg.setAttribute('aria-hidden', 'true');
  if (game === 'trainer') {
    let sq = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2) sq += `<rect x="${c * 25}" y="${r * 25}" width="25" height="25"/>`;
    svg.innerHTML = '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' + `<g fill="url(#sb-wood-dark)">${sq}</g>` +
      '<image href="assets/pieces/wN.svg" x="4" y="54" width="42" height="42"/><image href="assets/pieces/bK.svg" x="54" y="4" width="42" height="42"/>' +
      '<line x1="28" y1="70" x2="58" y2="42" stroke="rgba(40,175,105,.92)" stroke-width="8" stroke-linecap="round"/><path d="M68 32 L50 40 L60 50Z" fill="rgba(40,175,105,.92)"/>';
  } else {
    svg.innerHTML = gameOf(game).ui.mini();   // je Spiel in src/games/<id>/ui.js
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
      h('button', { class: 'btn link', on: { click: () => sheet('Regeln', lobbyRules(gameId)) } }, 'Regeln lesen')
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
      h('button', { class: 'btn link', on: { click: () => sheet('Regeln', ...liveGames().map((g) => lobbyRules(g.id))) } }, 'Regeln'),
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
