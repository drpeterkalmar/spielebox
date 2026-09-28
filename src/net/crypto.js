// Krypto-Helfer für Tisch-Zutritt und Relay-Fallback.
// Läuft im Browser und in Node (nur globalThis.crypto.subtle, TextEncoder, btoa/atob).
// Die Wörter werden NICHT normalisiert: Aufrufer liefert kleingeschriebene Wörter.

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

const SALT = 'spielebox-v1/relay';
const ITERATIONEN = 150000;
const IV_LEN = 12;
const TAG_LEN = 16; // AES-GCM-Authentifizierungs-Tag

function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// Bytes → base64 (stückweise, damit große Arrays den Aufruf-Stack nicht sprengen)
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// SHA-256 als Hex-String
export async function sha256Hex(text) {
  const buf = await subtle().digest('SHA-256', enc.encode(text));
  return toHex(new Uint8Array(buf));
}

// Raum-ID für joinRoom: SHA-256 der drei Wörter
export async function roomIdFor(words) {
  return sha256Hex(words.join(' '));
}

// Topic für den Relay-Fallback – Relays sehen nur diesen Hash
export async function relayTopicFor(roomId) {
  return sha256Hex('spielebox-v1/relay/' + roomId);
}

// AES-GCM-256-Schlüssel aus den Wörtern (PBKDF2-SHA-256, 150 000 Runden, nicht extrahierbar)
export async function deriveKey(words) {
  const basis = await subtle().importKey('raw', enc.encode(words.join(' ')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITERATIONEN },
    basis,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Objekt → JSON → AES-GCM (zufälliger 12-Byte-IV) → base64(iv ‖ ciphertext)
export async function seal(key, obj) {
  const json = JSON.stringify(obj);
  if (json === undefined) throw new TypeError('seal: Objekt nicht als JSON darstellbar');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json)));
  const out = new Uint8Array(IV_LEN + ct.length);
  out.set(iv);
  out.set(ct, IV_LEN);
  return toB64(out);
}

// Umkehrung von seal; wirft bei falschem Schlüssel, Manipulation oder kaputtem base64
export async function open(key, b64) {
  if (typeof b64 !== 'string') throw new TypeError('open: base64-String erwartet');
  const bytes = fromB64(b64);
  if (bytes.length < IV_LEN + TAG_LEN) throw new Error('open: Nachricht zu kurz');
  const pt = await subtle().decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, IV_LEN) },
    key,
    bytes.subarray(IV_LEN)
  );
  return JSON.parse(dec.decode(pt));
}
