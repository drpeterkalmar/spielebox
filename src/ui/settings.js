// Einstellungen (Lobby-Fuß und Tisch-Menü): Computer-Tempo. Gespeichert in store.settings().tempo.
import { h, clear, sheet } from './dom.js';
import { LEVELS, LEVEL_NAMES, LEVEL_SUBS, levelFrom } from '../tempo.js';
import * as store from '../store.js';

export function openSettings() {
  let value = levelFrom(store.settings().tempo);
  const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Computer-Tempo', data: { setting: 'tempo' } });
  const draw = () => {
    clear(box);
    for (const v of LEVELS) {
      box.appendChild(h('button', {
        class: 'seg-btn' + (v === value ? ' on' : ''), role: 'radio', 'aria-checked': String(v === value), data: { v },
        on: { click: () => { value = v; const st = store.settings(); st.tempo = v; store.saveSettings(st); draw(); } }
      }, h('span', { class: 'seg-t', text: LEVEL_NAMES[v] }), h('span', { class: 'seg-sub', text: LEVEL_SUBS[v] })));
    }
  };
  draw();
  return sheet('Einstellungen',
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Computer-Tempo' }), box),
    h('p', { class: 'muted small', text: 'So lange denkt der Computer mindestens nach, bevor er zieht. Bei „gemütlich“ gleiten seine Steine langsam, Sprungketten und Würfelzüge laufen Schritt für Schritt, und ein fertiger Stich bleibt 2 Sekunden liegen. Am Online-Tisch bestimmt der Gastgeber, wie lange der Computer denkt.' }),
    h('p', { class: 'muted small', text: 'Meldungen bleiben mindestens 5 Sekunden stehen (antippen schließt sie). Verpasstes steht unter der Status-Zeile: einfach antippen.' }));
}
