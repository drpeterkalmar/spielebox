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

export function loadTable(roomId) {
  return get('t.' + roomId, null);
}

// entry: { roomId, words, want, table }
export function saveTable(entry) {
  set('t.' + entry.roomId, entry);
  const t = entry.table;
  const list = tableList().filter((e) => e.roomId !== entry.roomId);
  list.unshift({
    roomId: entry.roomId,
    words: entry.words,
    game: t ? t.game : entry.game,
    opts: t ? t.opts : entry.opts,
    status: t ? t.status : 'wait',
    seats: t ? t.seats.map((s) => s && s.name) : [],
    updated: Date.now()
  });
  while (list.length > MAX_TABLES) {
    const old = list.pop();
    del('t.' + old.roomId);
  }
  set('tables', list);
}

export function forgetTable(roomId) {
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
