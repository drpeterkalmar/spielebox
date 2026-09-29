// Fair Play ohne Server: Hash-Ketten-Commits für Würfel und Mischen.
// Jeder Sitz legt zu Beginn einer Runde (Partie) den Anfang einer geheimen Hash-Kette fest:
//   L_k = H^(N-k)(seed), veröffentlicht wird L_0 (Commit). Für das k-te Zufallsereignis deckt jeder Sitz L_k auf;
//   prüfbar mit H(L_k) = L_(k-1). Der Wert (Würfel bzw. Mischung) ergibt sich aus dem Hash ALLER aufgedeckten Glieder –
//   niemand kann ihn steuern, weil alle Glieder vorher festgelegt sind und keiner die fremden Glieder vorhersagen kann.
// Würfel: Glieder sind öffentlich (jeder prüft sofort). Mischen: Glieder gehen nur an den Host, er veröffentlicht sie,
//   wenn das Spiel vorbei ist; dann prüft jeder Commit, Kette und dass die Mischung zu den eigenen Karten passt.
// Synchrones SHA-256 (klein, ohne Abhängigkeiten), damit Engine-Tests und Tisch ohne async auskommen.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

function utf8(str) {
  return new TextEncoder().encode(str);
}

export function sha256bytes(bytes) {
  const l = bytes.length;
  const n = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(n);
  m.set(bytes);
  m[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 4, bits >>> 0);
  dv.setUint32(n - 8, Math.floor(bits / 2 ** 32));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function sha256(str) {
  return hex(sha256bytes(utf8(str)));
}

export const CHAIN = 1024;   // Zufallsereignisse je Runde (Backgammon ~60 Würfe, Schnapsen ~30 Spiele)

// Kettenglied k (0 = Commit) aus dem geheimen Seed
export function chainLink(seed, k, n = CHAIN) {
  if (!(k >= 0 && k <= n)) throw new Error('Kettenglied außerhalb');
  let x = sha256('sb-seed|' + seed);
  for (let i = 0; i < n - k; i++) x = sha256(x);
  return x;
}

export function verifyLink(prev, link) {
  return typeof link === 'string' && /^[0-9a-f]{64}$/.test(link) && sha256(link) === prev;
}

// gemeinsamer Zufalls-Hash aus allen Gliedern (Reihenfolge = Sitzreihenfolge)
export function mixLinks(links, k, kind) {
  return sha256(`sb-mix|${kind}|${k}|${links.join('|')}`);
}

// gleichverteilter Bytestrom aus einem Hash (Zähler-Modus)
function byteStream(h) {
  let ctr = 0, buf = [], pos = 0;
  return () => {
    if (pos >= buf.length) { buf = sha256bytes(utf8(`${h}|${ctr++}`)); pos = 0; }
    return buf[pos++];
  };
}

// ganze Zahl in [0, n) ohne Verzerrung (Ablehnung), n ≤ 65536
function uniform(next, n) {
  const range = n <= 256 ? 256 : 65536;
  const lim = range - (range % n);
  for (;;) {
    const v = range === 256 ? next() : next() * 256 + next();
    if (v < lim) return v % n;
  }
}

export function diceFrom(h) {
  const next = byteStream(h);
  return [uniform(next, 6) + 1, uniform(next, 6) + 1];
}

export function permFrom(h, n) {
  const next = byteStream(h);
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = uniform(next, i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

// Wert eines Zufallsereignisses aus dem Mix-Hash
export function valueFor(chance, h) {
  if (chance.kind === 'dice') return diceFrom(h);
  if (chance.kind === 'shuffle') return permFrom(h, chance.n);
  throw new Error('Unbekanntes Zufallsereignis ' + chance.kind);
}

// lokaler Zufall (Solo, zu zweit an einem Gerät)
export function randomHex() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return hex(b);
}

// Protokoll einer Runde prüfen: fair = { commits: [je Sitz], log: [{ k, kind, n?, links: [je Sitz], value }] }
// Liefert { ok, checked, bad: [Text] }. Einträge mit fallback (Mitspieler war nicht erreichbar) zählen als ungeprüft.
export function verifyFair(fair) {
  const bad = [];
  let checked = 0, unchecked = 0;
  if (!fair || !Array.isArray(fair.commits)) return { ok: false, checked: 0, unchecked: 0, bad: ['kein Protokoll'] };
  const last = fair.commits.map((c, s) => ({ k: 0, link: c, seat: s }));
  for (const e of fair.log || []) {
    if (e.fallback) { unchecked++; continue; }
    for (let s = 0; s < e.links.length; s++) {
      let { k, link } = last[s];
      // Lücken (fallback-Ereignisse) überbrücken: so oft hashen, wie Glieder fehlen
      let x = e.links[s];
      if (typeof x !== 'string') { bad.push(`Ereignis ${e.k}: Glied von Sitz ${s + 1} fehlt`); continue; }
      for (let i = k; i < e.k - 1; i++) x = sha256(x);
      if (!verifyLink(link, x)) bad.push(`Ereignis ${e.k}: Kette von Sitz ${s + 1} passt nicht zum Commit`);
      last[s] = { k: e.k, link: e.links[s] };
    }
    const v = valueFor(e, mixLinks(e.links, e.k, e.kind));
    if (JSON.stringify(v) !== JSON.stringify(e.value)) bad.push(`Ereignis ${e.k}: ${e.kind === 'dice' ? 'Würfel' : 'Mischung'} passt nicht`);
    checked++;
  }
  return { ok: bad.length === 0, checked, unchecked, bad };
}
