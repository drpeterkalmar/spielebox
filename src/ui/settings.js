// Einstellungen (Lobby-Fuß und Tisch-Menü): Computer-Tempo, Ton, Vibration und Optik. Gespeichert in store.settings().tempo,
// .sound, .vibration bzw. .deko.
import { h, clear, sheet } from './dom.js';
import { LEVELS, LEVEL_NAMES, LEVEL_SUBS, levelFrom } from '../tempo.js';
import * as store from '../store.js';
import { DEKO, setDekoLevel } from './deko.js';
import { ensureDekoDefs } from './svg.js';
import { prepareCardArt } from './cards.js';

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
  const optik = seg('Optik', OPTIK, DEKO.level, (v) => { setDekoLevel(v); ensureDekoDefs(); prepareCardArt(); }, { setting: 'deko' });
  return sheet('Einstellungen',
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Computer-Tempo' }), tempo),
    h('p', { class: 'muted small', text: 'So lange denkt der Computer mindestens nach, bevor er zieht. Bei „gemütlich“ gleiten seine Steine langsam, Sprungketten und Würfelzüge laufen Schritt für Schritt, und ein fertiger Stich bleibt 2 Sekunden liegen. Am Online-Tisch bestimmt der Gastgeber, wie lange der Computer denkt.' }),
    h('p', { class: 'muted small', text: 'Meldungen bleiben mindestens 5 Sekunden stehen (antippen schließt sie). Verpasstes steht unter der Status-Zeile: einfach antippen.' }),
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Ton' }), ton),
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Vibration' }), vib),
    h('p', { class: 'muted small', text: 'Steht das Handy auf lautlos, bleibt die Spielebox still. Vibriert wird nur bei großen Momenten, höchstens alle 1,5 Sekunden (am iPhone gar nicht).' }),
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Optik' }), optik),
    h('p', { class: 'muted small', text: DEKO.url !== null
      ? `Gerade per Link festgelegt (deko=${DEKO.url}) – ohne den Zusatz im Link gilt die Auswahl hier.`
      : 'Funken und Konfetti gibt es nur bei „Verziert“. Wird das Handy dabei zu langsam, nimmt die Spielebox die Effekte von selbst zurück. Bei „Bewegung reduzieren“ im Handy gibt es keine Funken.' }));
}
