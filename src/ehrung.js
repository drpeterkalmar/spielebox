// Auszeichnungen am Partie-Ende (n10 E4) – nur Anzeige, ändern NIE Ergebnis oder Rangliste. Ohne DOM → Node-Tests.
// Der Tisch (Host bzw. lokal) zählt bei jedem Stand mit (t.tally): Ludo „Meiste Rauswürfe“, „Meiste Sechsen“,
// Würfelglück „Höchster Wurf“ (meiste Punkte mit einem Eintrag), Mau-Mau „Meiste Siebener“. Gleichstand → alle.
// Abschaltbar per ?ehrung=0 (dann wird auch nichts angezeigt; gezählt wird trotzdem, das kostet nichts).
import { totals } from './games/wuerfel/engine.js';

export const EHRUNGEN = {
  ludo: [{ key: 'raus', icon: '💥', title: 'Meiste Rauswürfe' }, { key: 'sechs', icon: '🎲', title: 'Meiste Sechsen' }],
  wuerfel: [{ key: 'hoch', icon: '⭐', title: 'Höchster Wurf' }],
  maumau: [{ key: 'sieben', icon: '7️⃣', title: 'Meiste Siebener' }]
};

const add = (tal, key, seat, n = 1, max = false) => {
  const arr = (tal[key] ||= []);
  while (arr.length <= seat) arr.push(0);
  arr[seat] = max ? Math.max(arr[seat], n) : arr[seat] + n;
};

// neuer Zählerstand nach einem Stand-Wechsel prev → gs (move/by: der Zug, falls es einer war); tal wird nicht verändert
export function tallyStep(game, tal, prev, gs, move = null, by = null) {
  if (!EHRUNGEN[game] || !gs || prev === gs) return tal;
  const t = tal ? JSON.parse(JSON.stringify(tal)) : {};
  try {
    if (game === 'ludo') {
      const rk = gs.lastRoll ? JSON.stringify([gs.ply, gs.lastRoll]) : null;
      if (rk && rk !== t.rk) { t.rk = rk; if (gs.lastRoll.value === 6) add(t, 'sechs', gs.lastRoll.seat); }
      const ck = gs.last && gs.last.capture ? JSON.stringify([gs.ply, gs.last]) : null;
      if (ck && ck !== t.ck) { t.ck = ck; add(t, 'raus', gs.last.seat); }
    } else if (game === 'wuerfel' && prev && Array.isArray(gs.sheets) && Array.isArray(prev.sheets)) {
      gs.sheets.forEach((sh, seat) => {
        const before = prev.sheets[seat] ? totals(prev.sheets[seat]).gesamt : 0;
        const got = totals(sh).gesamt - before;
        if (got > 0) add(t, 'hoch', seat, got, true);
      });
    } else if (game === 'maumau' && move && move.type === 'play' && typeof move.card === 'string' && move.card[1] === '7' && Number.isInteger(by)) {
      add(t, 'sieben', by);
    }
  } catch { return tal; }
  return t;
}

// Auszeichnungen aus dem Zählerstand: [{ icon, title, value, seats }] – nur wo jemand > 0 hat; Gleichstand → alle
export function awards(game, tal, nSeats) {
  const out = [];
  for (const e of EHRUNGEN[game] || []) {
    const arr = (tal && tal[e.key]) || [];
    const best = Math.max(0, ...arr);
    if (best <= 0) continue;
    const seats = [];
    for (let s = 0; s < nSeats; s++) if ((arr[s] || 0) === best) seats.push(s);
    out.push({ icon: e.icon, title: e.title, value: best, seats });
  }
  return out;
}
