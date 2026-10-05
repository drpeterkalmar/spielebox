// Backgammon: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as BG from './engine.js';
import { stoneIcon } from '../../ui/gameicons.js';
import { rulesBackgammon } from '../../ui/texts.js';

export const ui = {
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
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    let tri = '';
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 14;
      tri += `<path d="M${x} 8 L${x + 7} 44 L${x + 14} 8Z" fill="${i % 2 ? '#e8d7b5' : '#8b2f24'}"/><path d="M${x} 92 L${x + 7} 56 L${x + 14} 92Z" fill="${i % 2 ? '#8b2f24' : '#e8d7b5'}"/>`;
    }
    return '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/>' + tri +
      '<circle cx="15" cy="84" r="6.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="15" cy="72" r="6.5" fill="url(#sb-st-w)" stroke="#7a6548"/><circle cx="85" cy="16" r="6.5" fill="url(#sb-st-b)"/>' +
      '<rect x="40" y="40" width="20" height="20" rx="4" fill="#fff" stroke="#333"/><circle cx="45" cy="45" r="2" fill="#222"/><circle cx="55" cy="55" r="2" fill="#222"/><circle cx="50" cy="50" r="2" fill="#222"/>';
  }
};
