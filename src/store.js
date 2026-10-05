// localStorage: Profil, laufende Tische (Schlüssel = Wort-Hash), lokale Partien.
// Alles fehlertolerant (privater Modus, voller Speicher → einfach ohne Speichern weiter).
const P = 'sb.';
const MAX_TABLES = 12;

function get(key, fallback) {
  try {
    const s = localStorage.getItem(P + key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
  } catch { /* Speicher voll oder gesperrt */ }
}

// wie set, meldet aber, ob es geklappt hat (Speicher voll → false)
function trySet(key, value) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function del(key) {
  try { localStorage.removeItem(P + key); } catch { /* egal */ }
}

function randomPid() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export function profile() {
  let p = get('profile', null);
  if (!p || typeof p.pid !== 'string') {
    p = { pid: randomPid(), name: '' };
    set('profile', p);
  }
  return p;
}

// Geräte-Geheimnis für die eigenen Hash-Ketten (Fair Play); bleibt über Neuladen gleich
export function deviceSecret() {
  const p = profile();
  if (typeof p.secret !== 'string' || p.secret.length < 32) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    p.secret = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    set('profile', p);
  }
  return p.secret;
}

export function saveProfile(p) {
  set('profile', p);
}

// Liste der laufenden Online-Tische (für „Weiterspielen“)
export function tableList() {
  return get('tables', []).filter((e) => e && e.roomId && Array.isArray(e.words));
}

// Online-Tische werden entprellt geschrieben: frühestens SAVE_MS nach der letzten Änderung (spätestens SAVE_MAX nach
// der ersten), sofort beim Verlassen der Seite (pagehide, visibilitychange: hidden) und beim Verlassen des Tisches
// (flushTables). Bis dahin liefert loadTable den neuesten Stand aus dem Speicher.
export const SAVE_MS = 250;
const SAVE_MAX = 2000;
const pending = new Map();   // roomId → entry
let flushTimer = null;
let firstPending = 0;

export function loadTable(roomId) {
  return pending.get(roomId) || get('t.' + roomId, null);
}

// entry: { roomId, words, want, table }
export function saveTable(entry) {
  pending.set(entry.roomId, entry);
  const now = Date.now();
  if (!firstPending) firstPending = now;
  if (flushTimer) clearTimeout(flushTimer);
  const wait = Math.max(0, Math.min(SAVE_MS, firstPending + SAVE_MAX - now));
  flushTimer = setTimeout(flushTables, wait);
}

export function flushTables() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  firstPending = 0;
  const all = [...pending.values()];
  pending.clear();
  for (const entry of all) writeTable(entry);
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', flushTables);
  addEventListener('visibilitychange', () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushTables(); });
}

// Kurzbeschreibung für die Liste „Weiterspielen“
function listEntry(entry) {
  const t = entry.table;
  return {
    roomId: entry.roomId,
    words: entry.words,
    game: t ? t.game : entry.game,
    opts: t ? t.opts : entry.opts,
    status: t ? t.status : 'wait',
    seats: t ? t.seats.map((s) => s && s.name) : [],
    updated: Date.now()
  };
}

const sig = (e) => JSON.stringify([e.game, e.opts, e.status, e.seats, e.words]);

function writeTable(entry) {
  // Speicher voll: ältesten anderen Tisch verwerfen und einmal erneut versuchen
  if (!trySet('t.' + entry.roomId, entry)) {
    const old = tableList().filter((e) => e.roomId !== entry.roomId).pop();
    if (old) forgetTable(old.roomId);
    if (!trySet('t.' + entry.roomId, entry)) return;
  }
  // Liste nur schreiben, wenn sich Spiel/Sitze/Status geändert haben, der Tisch nicht vorn steht oder die Zeitangabe
  // älter als 30 s ist (Anzeige „gerade eben“ in der Lobby)
  const list = tableList();
  const next = listEntry(entry);
  const top = list[0];
  if (top && top.roomId === entry.roomId && sig(top) === sig(next) && next.updated - (top.updated || 0) < 30000) return;
  const rest = list.filter((e) => e.roomId !== entry.roomId);
  rest.unshift(next);
  while (rest.length > MAX_TABLES) {
    const old = rest.pop();
    del('t.' + old.roomId);
  }
  set('tables', rest);
}

export function forgetTable(roomId) {
  pending.delete(roomId);
  del('t.' + roomId);
  set('tables', tableList().filter((e) => e.roomId !== roomId));
}

// lokale Partien (gegen Computer / zu zweit): eine je Modus
export function loadLocal(mode) {
  return get('local.' + mode, null);
}

export function saveLocal(mode, table) {
  set('local.' + mode, table);
}

export function forgetLocal(mode) {
  del('local.' + mode);
}

export function settings() {
  return get('settings', { botLevel: 2, hostColor: 'weiss' });
}

export function saveSettings(s) {
  set('settings', s);
}

// Schach-Trainer: Fortschritt nur auf diesem Gerät (Eröffnungs-Karteikarten, Taktik-Wertung, Endspiel-Sterne)
export function trainer() {
  const t = get('trainer', null);
  return t && t.v === 1 ? t : { v: 1, open: {}, tac: { rating: 1000, games: 0, streak: 0, best: 0, done: {} }, end: {}, opt: {} };
}

export function saveTrainer(t) {
  set('trainer', t);
}

export function resetTrainer() {
  del('trainer');
}
