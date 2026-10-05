// Stern-Halma: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as HM from './engine.js';
import { halmaIcon } from '../../ui/gameicons.js';
import { rulesHalma } from '../../ui/texts.js';

export const ui = {
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
  },
  // Lobby: Regeln ohne den Absatz zur Blockade-Regel (wie bisher)
  lobbyRules: () => rulesHalma(),
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    const col = ['#d8453b', '#2f6fd6', '#2e9e57', '#e0b12c', '#8a4fc9', '#e07b27'];
    let dots = '';
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 + 90) * Math.PI / 180;
      for (let j = 0; j < 3; j++) dots += `<circle cx="${50 + Math.cos(a) * (28 + j * 6)}" cy="${50 + Math.sin(a) * (28 + j * 6)}" r="4" fill="${col[k]}"/>`;
    }
    return '<rect width="100" height="100" rx="12" fill="url(#sb-wood-light)"/><path d="M50 6 L62 30 L88 30 L74 50 L88 70 L62 70 L50 94 L38 70 L12 70 L26 50 L12 30 L38 30Z" fill="rgba(90,55,25,.25)" stroke="#5a3a1a" stroke-width="1.5"/>' + dots;
  }
};
