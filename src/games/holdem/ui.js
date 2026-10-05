// Texas Hold'em: spielspezifische Teile der Tisch-Ansicht (Symbol je Sitz, Unterzeile, Hinweise, Knöpfe, Menü),
// Regeln und Mini-Brett der Lobby. Das Brett selbst steht in view.js (src/ui/gameui.js gibt es dazu).
import { h } from '../../ui/dom.js';
import * as HE from './engine.js';
import { rulesHoldem, handRanking } from './help.js';
import { seatIcon } from '../../ui/gameicons.js';
import * as store from '../../store.js';

// Hold'em: Aktionsleiste (Aussteigen / Checken–Mitgehen / Erhöhen mit Regler + Schnellknöpfen), Vorab-Knöpfe
const heBtn = (label, sub, act, fn, cls = '') => h('button', { class: 'btn he-act' + cls, data: { act }, on: { click: fn } },
  h('span', { class: 'he-act-t', text: label }), sub ? h('small', { text: sub }) : null);

// Regler 0…1000 → Betrag zwischen min und max (quadratisch: feiner bei kleinen Beträgen)
const sliderTo = (v, r, unit) => {
  if (v >= 1000) return r.max;
  const x = r.min + (r.max - r.min) * (v / 1000) ** 2;
  return Math.max(r.min, Math.min(r.max, Math.round(x / unit) * unit));
};
const toSlider = (x, r) => (r.max === r.min ? 1000 : Math.round(Math.sqrt(Math.max(0, (x - r.min) / (r.max - r.min))) * 1000));

function lastHandSheet(t) {
  const lh = t.gs.lastHand;
  if (!lh) return h('p', { class: 'muted', text: 'Noch keine Hand fertig.' });
  const name = (q) => (t.seats[q] ? t.seats[q].name : `Platz ${q + 1}`);
  const cards = (cs) => h('span', { class: 'he-mini' }, ...cs.map((c) => h('img', { src: `assets/cards/fr/${c}.webp`, alt: HE.cardName(c), title: HE.cardName(c), width: 30, height: 44 })));
  return h('div', { class: 'rules he-last' },
    h('p', {}, h('strong', { text: `Hand ${lh.no}` }), ` · Blinds ${HE.fmtChips(lh.sbAmt)}/${HE.fmtChips(lh.bbAmt)}`),
    lh.board.length ? h('p', {}, 'Board: ', cards(lh.board)) : null,
    h('ul', {}, ...lh.pots.map((p, i) => h('li', {}, `${lh.pots.length > 1 ? (i ? `Side-Pot ${i}` : 'Hauptpot') : 'Pot'} ${HE.fmtChips(p.amount)}: ${p.winners.map(name).join(' und ')}${p.name ? ` mit ${p.name}` : ''}`))),
    Object.keys(lh.shown).length ? h('ul', {}, ...Object.entries(lh.shown).map(([q, cs]) => h('li', {}, `${name(Number(q))}: `, cards(cs)))) : null,
    lh.mucked.length ? h('p', { class: 'muted small', text: `Verdeckt weggelegt: ${lh.mucked.map(name).join(', ')}` }) : null);
}

export const ui = {
  icon: (seat) => seatIcon(seat),
  rules: (o) => rulesHoldem(o),
  hidden: true,
  sub(t, seat) {
    const gs = t.gs;
    if (gs.out[seat] !== null && gs.out[seat] !== undefined) return `raus – Platz ${gs.out[seat]}`;
    const parts = [`${HE.fmtChips(gs.stacks[seat])} Chips`];
    if (gs.phase !== 'over' && seat === gs.button) parts.push('Dealer');
    if (gs.allin[seat]) parts.push('All-in');
    else if (gs.folded[seat]) parts.push('ausgestiegen');
    return parts.join(' · ');
  },
  status(t, seat) {
    const gs = t.gs;
    if (gs.phase !== 'bet' || gs.turn !== seat) return null;
    const c = HE.toCall(gs, seat);
    return c > 0 ? `Du bist dran: ${HE.fmtChips(c)} zum Mitgehen` : 'Du bist dran: checken oder setzen';
  },
  handoff(t) {
    const l = t.last;
    return l && l.d ? `${t.seats[l.by] ? t.seats[l.by].name : 'Spieler ' + (l.by + 1)} ${l.d}` : null;
  },
  actions(t, legal, submit, view) {
    const gs = t.gs;
    if (!view || gs.phase !== 'bet') return [];
    const ui = view.ui;
    const p = gs.turn;
    const call = HE.toCall(gs, p);
    const rr = HE.raiseRange(gs);
    const has = (tp) => legal.find((m) => m.type === tp);
    const unit = Math.max(1, Math.min(10, gs.sbAmt / 2));
    const out = [];
    const main = h('div', { class: 'he-main' });
    if (has('fold')) main.append(heBtn('Aussteigen', 'Fold', 'fold', () => submit({ type: 'fold' })));
    if (has('check')) main.append(heBtn('Checken', 'Check', 'check', () => submit({ type: 'check' })));
    if (has('call')) main.append(heBtn(call >= gs.stacks[p] ? `All-in ${HE.fmtChips(call)}` : `Mitgehen ${HE.fmtChips(call)}`, 'Call', 'call', () => submit({ type: 'call' }), ' he-call'));
    if (rr) {
      const word = gs.betTo === 0 ? 'Setzen' : 'Erhöhen';
      if (rr.min === rr.max) {
        main.append(heBtn(`All-in ${HE.fmtChips(rr.max)}`, gs.betTo === 0 ? 'Bet' : 'Raise', 'allin', () => submit({ type: 'raise', to: rr.max }), ' primary'));
      } else if (!ui.raiseOpen) {
        main.append(heBtn(`${word} …`, gs.betTo === 0 ? 'Bet' : 'Raise', 'raise', () => { ui.raiseTo = Math.max(rr.min, Math.min(rr.max, ui.raiseTo || rr.min)); view.toggleRaise(); }, ' primary'));
      } else {
        if (!(ui.raiseTo >= rr.min && ui.raiseTo <= rr.max)) ui.raiseTo = rr.min;
        const pot = HE.potTotal(gs);
        const label = () => (ui.raiseTo >= rr.max ? `All-in ${HE.fmtChips(rr.max)}` : `${word} auf ${HE.fmtChips(ui.raiseTo)}`);
        const confirm = heBtn(label(), gs.betTo === 0 ? 'Bet' : 'Raise', 'raise-ok', () => submit({ type: 'raise', to: ui.raiseTo }), ' primary');
        const range = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: toSlider(ui.raiseTo, rr), class: 'he-slider', 'aria-label': 'Betrag', data: { act: 'slider' } });
        const set = (x) => {
          ui.raiseTo = Math.max(rr.min, Math.min(rr.max, x));
          range.value = toSlider(ui.raiseTo, rr);
          confirm.querySelector('.he-act-t').textContent = label();
        };
        range.addEventListener('input', () => set(sliderTo(Number(range.value), rr, unit)));
        const potTo = (f) => Math.round((gs.betTo + f * (pot + call)) / unit) * unit;
        const quick = [['½ Pot', 0.5, 'half'], ['¾ Pot', 0.75, 'threeq'], ['Pot', 1, 'pot']]
          .map(([l, f, k]) => [l, Math.max(rr.min, Math.min(rr.max, potTo(f))), k]);
        const panel = h('div', { class: 'he-raise', data: { panel: 'raise' } },
          h('div', { class: 'he-quick' },
            ...quick.map(([l, x, k]) => h('button', { class: 'btn small he-q', data: { act: 'q-' + k }, on: { click: () => set(x) } }, h('span', { text: l }), h('small', { text: HE.fmtChips(x) }))),
            h('button', { class: 'btn small he-q', data: { act: 'q-allin' }, on: { click: () => set(rr.max) } }, h('span', { text: 'All-in' }), h('small', { text: HE.fmtChips(rr.max) })),
            h('button', { class: 'btn small he-x', 'aria-label': 'Regler schließen', data: { act: 'raise-close' }, on: { click: () => view.toggleRaise() } }, '✕')),
          h('div', { class: 'he-slide-row' },
            h('button', { class: 'btn small he-pm', 'aria-label': 'weniger', data: { act: 'minus' }, on: { click: () => set(ui.raiseTo >= rr.max && rr.max - gs.bbAmt < rr.min ? rr.min : ui.raiseTo - gs.bbAmt) } }, '−'),
            range,
            h('button', { class: 'btn small he-pm', 'aria-label': 'mehr', data: { act: 'plus' }, on: { click: () => set(ui.raiseTo + gs.bbAmt) } }, '+')));
        out.push(panel);
        main.append(confirm);
      }
    }
    out.push(main);
    return [h('div', { class: 'he-bar' }, ...out)];
  },
  // nicht am Zug: Vorab-Knöpfe (online/gegen Computer) und „Karten zeigen“ nach der Hand
  idle(t, view, { mode, seat, act, newLocal, animating }) {
    const gs = t.gs;
    if (!view || seat === null || seat === undefined) return [];
    const out = [];
    // gegen den Computer ausgeschieden: zuschauen oder gleich neu anfangen – erst wenn die Hand fertig ausgespielt ist
    // (sonst verriete der Knopf das Ergebnis, während River und Showdown noch laufen)
    if (mode === 'bot' && gs.out[seat] !== null && gs.out[seat] !== undefined && newLocal && !animating) {
      out.push(h('p', { class: 'muted he-out', text: `Du bist raus (Platz ${gs.out[seat]}) – die Computer spielen weiter.` }));
      out.push(h('button', { class: 'btn primary he-new', data: { act: 'new-tournament' }, on: { click: () => newLocal() } }, 'Neues Turnier'));
    }
    const ui = view.ui;
    if (mode !== 'hotseat' && gs.phase === 'bet' && HE.live(gs, seat) && !gs.allin[seat] && gs.turn !== seat) {
      const tg = (label, key) => h('button', { class: 'btn he-pre' + (ui.pre === key ? ' on' : ''), 'aria-pressed': String(ui.pre === key), data: { act: 'pre-' + key }, on: { click: () => view.setPre(key) } },
        h('span', { class: 'he-box', 'aria-hidden': 'true', text: ui.pre === key ? '✓' : '' }), label);
      out.push(h('div', { class: 'he-pre-row' }, tg('Check/Fold', 'checkfold'), tg('Call jeden Betrag', 'callany')));
    }
    if (gs.lastHoles && gs.lastHoles[seat] && HE.isLegalAct(gs, seat, 'show')) {
      out.push(h('button', { class: 'btn small he-show', data: { act: 'show' }, on: { click: () => act('show') } }, 'Meine Karten der letzten Hand zeigen'));
    }
    return out;
  },
  menu(t, { item, sheet, rerender }) {
    const st = store.settings();
    const helpOn = st.holdemHelp ?? t.seats.some((x) => x && x.bot === 1);
    return [
      item('Welche Hand ist besser?', () => sheet('Welche Hand ist besser?', h('div', { class: 'rules' }, handRanking())), 'ranking'),
      item(`Hand-Hilfe ${helpOn ? 'ausblenden' : 'einblenden'}`, () => { const s2 = store.settings(); s2.holdemHelp = !helpOn; store.saveSettings(s2); rerender && rerender(); }, 'help-toggle'),
      item(`Ton ${st.sound === false ? 'einschalten' : 'ausschalten'}`, () => { const s2 = store.settings(); s2.sound = st.sound === false; store.saveSettings(s2); }, 'sound-toggle'),
      item('Letzte Hand', () => sheet('Letzte Hand', lastHandSheet(t)), 'lasthand')
    ];
  },
  // Mini-Brett der Lobby (Inhalt des SVG, viewBox 0 0 100 100)
  mini() {
    const chip = (x, y, c) => `<ellipse cx="${x}" cy="${y + 2}" rx="11" ry="5" fill="rgba(0,0,0,.35)"/><ellipse cx="${x}" cy="${y}" rx="11" ry="5" fill="${c}" stroke="#fff7e6" stroke-width="1.6" stroke-dasharray="5 3.5"/>`;
    return '<rect width="100" height="100" rx="12" fill="url(#sb-wood-frame)"/><ellipse cx="50" cy="52" rx="44" ry="34" fill="#1d5a3f" stroke="#0f3a28" stroke-width="2"/>' +
      ['AS', 'AH'].map((c, i) => `<g transform="translate(${40 + i * 18} 44) rotate(${(i - 0.5) * 16})"><image href="assets/cards/fr/${c}.webp" x="-14" y="-20" width="28" height="41"/></g>`).join('') +
      chip(24, 74, '#c0392b') + chip(24, 69, '#c0392b') + chip(76, 76, '#222') + chip(76, 71, '#d6a21e') + chip(76, 66, '#d6a21e');
  }
};
