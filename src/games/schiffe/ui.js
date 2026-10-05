// Schiffe versenken: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as SV from './engine.js';
import { RULES as SCHIFFE_RULES } from './rules.js';
import { NS } from '../../ui/gameicons.js';
import { rulesFromData } from '../../ui/texts.js';

function shipIcon(seat) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'stone-ico');
  svg.innerHTML = `<circle cx="10" cy="10" r="9" fill="${seat ? '#c8582f' : '#2f6fd6'}" stroke="rgba(0,0,0,.5)"/><path d="M4 11h12l-2 4H6z M9 5v6 M9 5l4 4H9" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>`;
  return svg;
}

export const ui = {
  icon: shipIcon,
  rules: (o) => rulesFromData(SCHIFFE_RULES, o),
  hidden: true,
  secret: 'Flotte',   // Sichtschutz: „Flotte zeigen“ statt „Karten zeigen“
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
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    let d = '<rect width="100" height="100" rx="12" fill="#1e5d8c"/>';
    for (let k = 1; k < 6; k++) d += `<path d="M${k * 16.6} 6V94M6 ${k * 16.6}H94" stroke="rgba(255,255,255,.25)" stroke-width="1.2"/>`;
    d += '<rect x="12" y="20" width="44" height="13" rx="6.5" fill="#cfd6dc" stroke="#53606a" stroke-width="1.5"/>';
    d += '<rect x="68" y="44" width="13" height="40" rx="6.5" fill="#cfd6dc" stroke="#53606a" stroke-width="1.5"/>';
    d += '<circle cx="42" cy="26.5" r="6" fill="#e5483b"/><path d="M38 23l8 7M46 23l-8 7" stroke="#fff" stroke-width="2"/><circle cx="28" cy="66" r="3" fill="#fff"/><circle cx="50" cy="80" r="3" fill="#fff"/>';
    return d;
  }
};
