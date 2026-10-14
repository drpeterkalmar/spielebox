// Einstellungen (Lobby-Fuß und Tisch-Menü): Computer-Tempo, Ton, Vibration und Optik. Gespeichert in store.settings().tempo,
// .sound, .vibration bzw. .deko.
import { h, clear, sheet } from './dom.js';
import { LEVELS, LEVEL_NAMES, LEVEL_SUBS, levelFrom } from '../tempo.js';
import * as store from '../store.js';
import { DEKO, setDekoLevel } from './deko.js';
import { ensureDekoDefs } from './svg.js';
import { prepareCardArt } from './cards.js';
import { GAMES } from '../games/registry.js';

const OPTIK = [
  { v: 2, t: 'Verziert', sub: 'Licht, Holz, Glanz, kleine Effekte' },
  { v: 1, t: 'Ruhig', sub: 'wie verziert, ohne Funken' },
  { v: 0, t: 'Klassisch', sub: 'das bisherige Aussehen' }
];

function seg(label, items, value, onPick, data) {
  const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label, data });
  const draw = () => {
    clear(box);
    for (const it of items) {
      box.appendChild(h('button', {
        class: 'seg-btn' + (it.v === value ? ' on' : ''), role: 'radio', 'aria-checked': String(it.v === value), data: { v: String(it.v) },
        on: { click: () => { value = it.v; onPick(it.v); draw(); } }
      }, h('span', { class: 'seg-t', text: it.t }), h('span', { class: 'seg-sub', text: it.sub })));
    }
  };
  draw();
  return box;
}

export function openSettings() {
  const tempo = seg('Computer-Tempo', LEVELS.map((v) => ({ v, t: LEVEL_NAMES[v], sub: LEVEL_SUBS[v] })), levelFrom(store.settings().tempo),
    (v) => { const st = store.settings(); st.tempo = v; store.saveSettings(st); }, { setting: 'tempo' });
  // n10: Ton und Vibration (Standard an; Lautlos-Schalter des Handys gilt zusätzlich)
  const onOff = (key, label, subOn, subOff) => seg(label, [{ v: true, t: 'an', sub: subOn }, { v: false, t: 'aus', sub: subOff }], store.settings()[key] !== false,
    (v) => { const st = store.settings(); st[key] = v; store.saveSettings(st); }, { setting: key });
  const ton = onOff('sound', 'Ton', 'leise Klack- und Kartengeräusche', 'ganz still');
  const vib = onOff('vibration', 'Vibration', 'kurz bei Sieg, Schach, Mühle, Rauswurf', 'nie');
  const emo = onOff('emotes', 'Reaktionen', 'Emoji der Mitspieler zeigen, selbst senden', 'keine Emoji');
  const optik = seg('Optik', OPTIK, DEKO.level, (v) => { setDekoLevel(v); ensureDekoDefs(); prepareCardArt(); }, { setting: 'deko' });
  return sheet('Einstellungen',
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Computer-Tempo' }), tempo),
    h('p', { class: 'muted small', text: 'So lange denkt der Computer mindestens nach, bevor er zieht. Bei „gemütlich“ gleiten seine Steine langsam, Sprungketten und Würfelzüge laufen Schritt für Schritt, und ein fertiger Stich bleibt 2 Sekunden liegen. Am Online-Tisch bestimmt der Gastgeber, wie lange der Computer denkt.' }),
    h('p', { class: 'muted small', text: 'Meldungen bleiben mindestens 5 Sekunden stehen (antippen schließt sie). Verpasstes steht unter der Status-Zeile: einfach antippen.' }),
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Ton' }), ton),
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Vibration' }), vib),
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Reaktionen (online)' }), emo),
    h('p', { class: 'muted small', text: 'Steht das Handy auf lautlos, bleibt die Spielebox still. Vibriert wird nur bei großen Momenten, höchstens alle 1,5 Sekunden (am iPhone gar nicht).' }),
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Optik' }), optik),
    statsBlock(),
    h('p', { class: 'muted small', text: DEKO.url !== null
      ? `Gerade per Link festgelegt (deko=${DEKO.url}) – ohne den Zusatz im Link gilt die Auswahl hier.`
      : 'Funken und Konfetti gibt es nur bei „Verziert“. Wird das Handy dabei zu langsam, nimmt die Spielebox die Effekte von selbst zurück. Bei „Bewegung reduzieren“ im Handy gibt es keine Funken.' }));
}

// n10 E4: Statistik dieses Geräts (Siege/Niederlagen/Remis je Spiel, längste Serie) + Zurücksetzen
const KIND_NAMES = { computer1: 'Computer leicht', computer2: 'Computer mittel', computer3: 'Computer stark', mensch: 'Menschen online', allein: 'allein' };
function statsBlock() {
  const box = h('div', { class: 'field', data: { stats: '' } });
  const draw = () => {
    clear(box);
    box.append(h('div', { class: 'field-label', text: 'Statistik (nur auf diesem Gerät)' }));
    const st = store.stats();
    const games = Object.keys(st.g).filter((g) => GAMES[g]);
    if (!games.length) { box.append(h('p', { class: 'muted small', text: 'Noch keine Partie zu Ende gespielt.' })); return; }
    const rows = [];
    for (const g of games) {
      for (const [kind, e] of Object.entries(st.g[g])) {
        rows.push(h('tr', {}, h('td', { text: GAMES[g].title }), h('td', { class: 'muted', text: KIND_NAMES[kind] || kind }),
          h('td', { class: 'num', text: String(e.w) }), h('td', { class: 'num', text: String(e.l) }), h('td', { class: 'num', text: String(e.d) }), h('td', { class: 'num', text: String(e.best) })));
      }
    }
    box.append(h('table', { class: 'stats-table' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Spiel' }), h('th', { text: 'gegen' }), h('th', { class: 'num', text: 'S' }), h('th', { class: 'num', text: 'N' }), h('th', { class: 'num', text: 'R' }), h('th', { class: 'num', text: 'Serie' }))),
      h('tbody', {}, ...rows)),
      h('p', { class: 'muted small', text: 'S = Siege, N = Niederlagen, R = Remis, Serie = längste Siegesserie.' }),
      h('button', { class: 'btn small', data: { act: 'stats-reset' }, on: { click: () => { if (confirm('Statistik wirklich zurücksetzen?')) { store.resetStats(); draw(); } } } }, 'Statistik zurücksetzen'));
  };
  draw();
  return box;
}
