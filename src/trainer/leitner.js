// Schach-Trainer – Wiederholen nach Leitner (Lernkartei mit Fächern), ohne DOM.
// Eine Karte = eine Eröffnungslinie mit Farbe: { box, due, ok, bad, last }. box 1…5, due = Zeitpunkt (ms), ab dem
// sie wieder dran ist. Richtig → ein Fach weiter (längere Pause), Fehler → zurück in Fach 1 (kommt bald wieder).
// So kommen Linien, die man vergisst, öfter dran, sichere Linien nur noch selten.
export const DAY = 24 * 3600 * 1000;
// Pause nach dem Wiederholen je Fach (Tage); Fach 1 = morgen wieder
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35];
export const MAX_BOX = INTERVAL_DAYS.length - 1;
// Nach einem Fehler kommt die Linie noch in derselben Sitzung (nach 10 Minuten) wieder
export const RETRY_MS = 10 * 60 * 1000;

// Erstes Lernen abgeschlossen: ohne Fehler → Fach 1 (morgen), mit Fehlern → Fach 1, aber gleich wieder fällig
export function learned(card, mistakes, now) {
  const c = card ? { ...card } : { box: 0, ok: 0, bad: 0 };
  c.box = Math.max(1, c.box || 0);
  c.last = now;
  if (mistakes) { c.bad = (c.bad || 0) + 1; c.due = now + RETRY_MS; } else { c.ok = (c.ok || 0) + 1; c.due = now + INTERVAL_DAYS[c.box] * DAY; }
  return c;
}

// Wiederholung abgeschlossen (ohne Pfeile): fehlerfrei → nächstes Fach, sonst zurück in Fach 1
export function review(card, mistakes, now) {
  const c = card ? { ...card } : { box: 0, ok: 0, bad: 0 };
  c.last = now;
  if (mistakes) {
    c.box = 1;
    c.bad = (c.bad || 0) + 1;
    c.due = now + RETRY_MS;
  } else {
    c.box = Math.min(MAX_BOX, (c.box || 0) + 1);
    c.ok = (c.ok || 0) + 1;
    c.due = now + INTERVAL_DAYS[c.box] * DAY;
  }
  return c;
}

export function isDue(card, now) {
  return !!card && card.box > 0 && card.due <= now;
}

// fällige Karten: zuerst die am längsten überfälligen, bei Gleichstand das niedrigere Fach
export function dueKeys(cards, now) {
  return Object.entries(cards || {})
    .filter(([, c]) => isDue(c, now))
    .sort((a, b) => (a[1].due - b[1].due) || (a[1].box - b[1].box) || (a[0] < b[0] ? -1 : 1))
    .map(([k]) => k);
}

// nächster Termin (ms) unter allen Karten, null wenn keine
export function nextDue(cards, now) {
  let best = null;
  for (const c of Object.values(cards || {})) if (c && c.box > 0 && c.due > now && (best === null || c.due < best)) best = c.due;
  return best;
}

// Schlüssel einer Karte: Linie + Farbe, die man spielt
export const cardKey = (lineId, color) => `${lineId}:${color}`;
