// Live-Messung: Welche Nostr-Relays leiten ephemere Spielebox-Events zuverlässig weiter?
// ECHTES NETZ – nicht Teil der normalen Testsuite. Aufruf: node tests/relay_live.mjs  (Dauer < 4 min)
// 1) Jedes Relay einzeln: 2 Durchgänge (Retry bei Verbindungsfehler) mit Kanal A und B auf einem
//    Zufalls-Topic; A sendet 3 Nachrichten (200 / 1200 / 6000 Zeichen) im Abstand von 1,5 s.
// 2) Belastung für die Spitzengruppe: 20 Nachrichten im Abstand von 300 ms (deckt Rate-Limits auf).
// 3) Die besten 6 gemeinsam in EINEM Kanal: 10 Nachrichten A→B und 10 B→A.
// Ergebnis: Tabellen auf der Konsole und tests/out/relay_live.json (mit Verlauf früherer Läufe)
// Nur die gewählte Liste prüfen (RELAYS aus src/net/relays.js, ~20 s): node tests/relay_live.mjs --nur-gesamt
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defaultRelayUrls } from '../lib/trystero.js';
import { RelayChannel } from '../src/net/relaychannel.js';

// bekannte große Relays zusätzlich zu Trysteros Standardliste
const EXTRA = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://nostr.mom',
  'wss://relay.snort.social',
  'wss://offchain.pub',
  'wss://nostr.wine', // vermutlich kostenpflichtig → sollte als unbrauchbar erkannt werden
  'wss://relay.nostr.bg',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostr.net',
  'wss://nostr.bitcoiner.social',
  'wss://relay.nos.social',
  'wss://relay.0xchat.com',
  'wss://nostr.einundzwanzig.space',
  'wss://relay.coinos.io'
];

const PARALLEL = 10;
const DURCHGAENGE = 2;
const GROESSEN = [200, 1200, 6000];
const ABSTAND_MS = 1500;
const BELASTUNG = { anzahl: 20, groesse: 300, abstandMs: 300, relays: 16 };
const VERBINDEN_MS = 8000;
const NACHLAUF_MS = 4000;
const FRIST_EINZEL_MS = 150000; // danach keine neuen Durchgänge mehr
const BESTE_N = 6;
const VERLAUF_MAX = 10;

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const ausgabe = join(wurzel, 'tests', 'out', 'relay_live.json');
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const summe = (xs) => xs.reduce((a, b) => a + b, 0);
const hex = (n) => [...globalThis.crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const fuell = (n) => Array.from({ length: n }, () => B64[Math.floor(Math.random() * 64)]).join('');
// Inhalt wie ein seal()-Ergebnis (base64), Kennung vorne
const inhalt = (kennung, laenge) => (kennung + ':' + fuell(laenge)).slice(0, Math.max(laenge, kennung.length + 1));
const kennungVon = (content) => content.slice(0, content.indexOf(':'));
const kurz = (url) => url.replace(/^wss:\/\//, '');

async function warteBis(fn, ms) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (fn()) return true;
    await schlaf(25);
  }
  return fn();
}

// ---- VPN-Status ----

function vpnInfo() {
  const info = { scutil: [], utun: [], zusammenfassung: '' };
  try {
    const s = execFileSync('scutil', ['--nc', 'list'], { encoding: 'utf8', timeout: 5000 });
    info.scutil = s.split('\n').filter((l) => /^\s*\*?\s*\((Connected|Disconnected|Connecting|Disconnecting)\)/.test(l))
      .map((l) => l.trim().replace(/\s+/g, ' '));
  } catch (e) {
    info.scutil = ['scutil nicht auswertbar: ' + e.message];
  }
  try {
    const s = execFileSync('ifconfig', { encoding: 'utf8', timeout: 5000 });
    for (const block of s.split(/\n(?=\S)/)) {
      const name = block.split(':')[0];
      if (!name.startsWith('utun')) continue;
      const inet = block.match(/\binet (\d+\.\d+\.\d+\.\d+)/);
      info.utun.push(name + (inet ? ' ' + inet[1] : ' (nur IPv6 link-local)'));
    }
  } catch (e) {
    info.utun = ['ifconfig nicht auswertbar: ' + e.message];
  }
  const proton = info.scutil.find((l) => /protonvpn/i.test(l));
  const weitere = info.scutil.filter((l) => /\(Connected\)/.test(l) && !/protonvpn/i.test(l))
    .map((l) => (l.match(/"([^"]+)"/) || [])[1]).filter(Boolean);
  info.zusammenfassung = (proton
    ? (/\(Connected\)/.test(proton) ? 'ProtonVPN aktiv (scutil: Connected)' : 'ProtonVPN eingerichtet, aber nicht verbunden')
    : 'ProtonVPN in scutil nicht gefunden') + (weitere.length ? '; außerdem verbunden: ' + weitere.join(', ') : '');
  return info;
}

// ---- Probe: A und B auf EINEM Relay, A sendet Nachrichten der Größen `groessen` ----

async function probe(url, groessen, abstandMs) {
  const topic = hex(32);
  const t0 = Date.now();
  const offenNach = { A: null, B: null };
  const angekommen = new Map(); // Kennung → Empfangszeit bei B
  const mk = (seite) => new RelayChannel({
    urls: [url],
    topic,
    timing: { verbinden: VERBINDEN_MS },
    onMessage: (content) => {
      if (seite === 'B' && !angekommen.has(kennungVon(content))) angekommen.set(kennungVon(content), Date.now());
    },
    onStatus: (s) => {
      if (s.relays[0].state === 'open' && offenNach[seite] === null) offenNach[seite] = Date.now() - t0;
    }
  });
  const A = mk('A');
  const B = mk('B');
  const rel = (k) => k.status().relays[0];
  const tot = () => rel(A).state === 'closed' || rel(B).state === 'closed';
  const erg = {
    verbunden: false, verbindungMs: null, gesendet: 0, zugestellt: 0, ok: 0, abgelehnt: 0,
    latenzen: [], acks: [], angekommen: groessen.map(() => false), fehler: [], unbrauchbar: null
  };
  // Ack-Zeiten mitschreiben, sobald ein OK eintrifft
  let bisher = 0;
  const sammler = setInterval(() => {
    const s = rel(A);
    if (s.ok + s.rejected > bisher) {
      bisher = s.ok + s.rejected;
      if (s.lastAckMs !== null) erg.acks.push(s.lastAckMs);
    }
  }, 20);
  try {
    A.start();
    B.start();
    await warteBis(() => (rel(A).state === 'open' && rel(B).state === 'open') || tot(), VERBINDEN_MS + 1000);
    await schlaf(50); // onStatus-Mikrotask abwarten
    if (rel(A).state === 'open' && rel(B).state === 'open' && !tot()) {
      erg.verbunden = true;
      erg.verbindungMs = Math.max(offenNach.A ?? 0, offenNach.B ?? 0);
      await schlaf(1000); // Abo von B beim Relay ankommen lassen
      const gesendetUm = new Map();
      for (let i = 0; i < groessen.length && !tot(); i++) {
        const tStart = Date.now();
        const kennung = 'm' + i;
        const { sentTo } = await A.publish(inhalt(kennung, groessen[i]));
        if (sentTo > 0) {
          erg.gesendet++;
          gesendetUm.set(kennung, Date.now());
        }
        const rest = abstandMs - (Date.now() - tStart);
        if (i < groessen.length - 1 && rest > 0) await schlaf(rest);
      }
      await warteBis(() => angekommen.size >= erg.gesendet || tot(), NACHLAUF_MS);
      // OKs können nach der Zustellung an B kommen
      await warteBis(() => rel(A).ok + rel(A).rejected >= erg.gesendet || tot(), 2000);
      for (const [kennung, t] of angekommen) {
        if (!gesendetUm.has(kennung)) continue;
        erg.zugestellt++;
        erg.latenzen.push(t - gesendetUm.get(kennung));
        erg.angekommen[Number(kennung.slice(1))] = true;
      }
    }
    const sA = rel(A);
    const sB = rel(B);
    erg.ok = sA.ok;
    erg.abgelehnt = sA.rejected;
    erg.fehler = [...new Set([sA.lastError, sB.lastError].filter(Boolean))];
    if (tot()) erg.unbrauchbar = (sA.state === 'closed' ? sA.lastError : sB.lastError) || 'geschlossen';
  } finally {
    clearInterval(sammler);
    A.close();
    B.close();
  }
  return erg;
}

async function probeMitRetry(url) {
  const erster = await probe(url, GROESSEN, ABSTAND_MS);
  if (erster.verbunden || erster.unbrauchbar) return erster;
  await schlaf(1500);
  const zweiter = await probe(url, GROESSEN, ABSTAND_MS);
  zweiter.retry = true;
  zweiter.fehlerErsterVersuch = erster.fehler;
  return zweiter;
}

let fristEinzel = 0;
async function testeRelay(url, quelle) {
  const t0 = Date.now();
  const durchgaenge = [];
  for (let i = 0; i < DURCHGAENGE; i++) {
    if (Date.now() > fristEinzel) {
      durchgaenge.push({ zeitlimit: true, verbunden: false, gesendet: 0, zugestellt: 0, ok: 0, abgelehnt: 0, latenzen: [], acks: [], fehler: ['Zeitlimit des Messlaufs'] });
      continue;
    }
    const d = await probeMitRetry(url);
    durchgaenge.push(d);
    if (d.unbrauchbar) break; // Auth/PoW/Bezahlung/Sperre: ein zweiter Durchgang bringt nichts
  }
  return auswerten(url, quelle, durchgaenge, Date.now() - t0);
}

function auswerten(url, quelle, durchgaenge, dauerMs) {
  const erwartet = DURCHGAENGE * GROESSEN.length;
  const gesendet = summe(durchgaenge.map((d) => d.gesendet));
  const zugestellt = summe(durchgaenge.map((d) => d.zugestellt));
  const ok = summe(durchgaenge.map((d) => d.ok));
  const abgelehnt = summe(durchgaenge.map((d) => d.abgelehnt));
  const latenzen = durchgaenge.flatMap((d) => d.latenzen);
  const acks = durchgaenge.flatMap((d) => d.acks);
  const verbindungen = durchgaenge.filter((d) => d.verbunden).map((d) => d.verbindungMs);
  const unbrauchbar = durchgaenge.find((d) => d.unbrauchbar)?.unbrauchbar ?? null;
  const fehler = [...new Set(durchgaenge.flatMap((d) => [...(d.fehlerErsterVersuch || []), ...d.fehler]))];
  const quote = unbrauchbar ? 0 : zugestellt / erwartet;
  const grossFehlt = durchgaenge.some((d) => d.verbunden && d.angekommen && d.angekommen[0] && !d.angekommen[2]);
  let urteil;
  if (unbrauchbar) urteil = 'unbrauchbar';
  else if (!verbindungen.length) urteil = 'keine Verbindung';
  else if (quote === 1) urteil = 'ok';
  else if (zugestellt === 0 && ok === 0 && abgelehnt === 0) urteil = 'stumm (kein OK, keine Weiterleitung)';
  else if (zugestellt === 0 && ok > 0) urteil = 'OK, aber keine Weiterleitung';
  else if (zugestellt === 0 && abgelehnt > 0) urteil = 'lehnt ab';
  else urteil = 'teilweise';
  return {
    url,
    quelle,
    urteil,
    quote,
    zugestellt,
    erwartet,
    gesendet,
    ok,
    abgelehnt,
    okQuote: gesendet ? ok / gesendet : 0,
    verbundenIn: `${verbindungen.length}/${durchgaenge.length}`,
    retries: durchgaenge.filter((d) => d.retry).length,
    verbindungMedianMs: median(verbindungen),
    latenzMedianMs: median(latenzen),
    latenzMaxMs: latenzen.length ? Math.max(...latenzen) : null,
    ackMedianMs: median(acks),
    grossFehlt,
    unbrauchbar,
    fehler,
    belastung: null,
    dauerMs,
    durchgaenge
  };
}

// Belastungsquote: Anteil Nachrichten mit OK UND Zustellung (null = nicht gemessen)
const lastQuote = (e) => (e.belastung ? Math.min(e.belastung.ok, e.belastung.zugestellt) / BELASTUNG.anzahl : null);

// Rangfolge: Zustellquote, Belastung (≥ 95 % gilt als voll), OK-Quote, Latenz, Verbindungszeit
function vergleiche(a, b) {
  const last = (e) => {
    const q = lastQuote(e);
    return q === null ? -1 : q >= 0.95 ? 1 : q;
  };
  return (b.quote - a.quote) || (last(b) - last(a)) || (b.okQuote - a.okQuote) ||
    ((a.latenzMedianMs ?? 1e9) - (b.latenzMedianMs ?? 1e9)) ||
    ((a.verbindungMedianMs ?? 1e9) - (b.verbindungMedianMs ?? 1e9));
}

// ---- Gesamt-Durchgang mit den besten Relays in einem Kanal ----

async function gesamtDurchgang(urls) {
  const topic = hex(32);
  const n = 10;
  const angekommen = { A: new Map(), B: new Map() };
  const zuerst = {};
  const mk = (seite) => new RelayChannel({
    urls,
    topic,
    timing: { verbinden: VERBINDEN_MS },
    onMessage: (content, meta) => {
      const k = kennungVon(content);
      if (angekommen[seite].has(k)) return;
      angekommen[seite].set(k, Date.now());
      zuerst[meta.relay] = (zuerst[meta.relay] || 0) + 1;
    }
  });
  const A = mk('A');
  const B = mk('B');
  const t0 = Date.now();
  const gesendetUm = new Map();
  const sentTo = [];
  try {
    A.start();
    B.start();
    await warteBis(() => A.status().open === urls.length && B.status().open === urls.length, 10000);
    const offenBeimStart = { A: A.status().open, B: B.status().open, nachMs: Date.now() - t0 };
    await schlaf(1000);
    for (let i = 0; i < n; i++) {
      for (const [von, kanal] of [['A', A], ['B', B]]) {
        const kennung = `${von}${i}`;
        const res = await kanal.publish(inhalt(kennung, 300));
        gesendetUm.set(kennung, Date.now());
        sentTo.push(res.sentTo);
        await schlaf(300);
      }
    }
    await warteBis(() => angekommen.B.size + angekommen.A.size >= 2 * n, 6000);
    await schlaf(500); // späte OKs
    const latenzen = [];
    for (const seite of ['A', 'B']) {
      for (const [k, t] of angekommen[seite]) if (gesendetUm.has(k)) latenzen.push(t - gesendetUm.get(k));
    }
    const proRelay = urls.map((url) => {
      const a = A.status().relays.find((r) => r.url === url);
      const b = B.status().relays.find((r) => r.url === url);
      return {
        url,
        zustand: `${a.state}/${b.state}`,
        gesendet: a.sent + b.sent,
        ok: a.ok + b.ok,
        abgelehnt: a.rejected + b.rejected,
        empfangen: a.received + b.received,
        zuerst: zuerst[url] || 0,
        fehler: [...new Set([a.lastError, b.lastError].filter(Boolean))]
      };
    });
    return {
      relays: urls,
      offenBeimStart,
      gesendet: 2 * n,
      zugestelltAB: angekommen.B.size,
      zugestelltBA: angekommen.A.size,
      quote: (angekommen.A.size + angekommen.B.size) / (2 * n),
      sentToMin: Math.min(...sentTo),
      latenzMedianMs: median(latenzen),
      latenzMaxMs: latenzen.length ? Math.max(...latenzen) : null,
      proRelay
    };
  } finally {
    A.close();
    B.close();
  }
}

// ---- Ausgabe ----

const zelle = (v, n, rechts = false) => {
  const s = v === null || v === undefined ? '–' : String(v);
  return rechts ? s.padStart(n) : s.padEnd(n);
};

function tabelle(ergebnisse) {
  const kopf = zelle('#', 3, true) + ' ' + zelle('Relay', 33) + zelle('Qu.', 4) + zelle('verb.', 6) +
    zelle('Zust.', 6) + zelle('OK', 6) + zelle('Last', 6) + zelle('Lat.med', 8, true) + zelle('max', 6, true) +
    zelle('Ack', 5, true) + zelle('Verb.', 6, true) + '  Urteil / letzter Fehler';
  console.log(kopf);
  console.log('-'.repeat(kopf.length + 30));
  ergebnisse.forEach((e, i) => {
    const q = e.quelle.map((x) => (x === 'trystero' ? 'T' : 'E')).join('');
    const last = e.belastung ? `${Math.min(e.belastung.ok, e.belastung.zugestellt)}/${BELASTUNG.anzahl}` : '';
    let hinweis = e.unbrauchbar || e.fehler[0] || '';
    if (e.urteil === 'ok') hinweis = [e.grossFehlt ? '6-kB-Nachricht fehlte' : '', ...(e.belastung?.fehler || [])].filter(Boolean).join('; ');
    console.log(zelle(i + 1, 3, true) + ' ' + zelle(kurz(e.url), 33) + zelle(q, 4) +
      zelle(e.verbundenIn, 6) + zelle(`${e.zugestellt}/${e.erwartet}`, 6) + zelle(`${e.ok}/${e.gesendet}`, 6) + zelle(last, 6) +
      zelle(e.latenzMedianMs, 8, true) + zelle(e.latenzMaxMs, 6, true) + zelle(e.ackMedianMs, 5, true) +
      zelle(e.verbindungMedianMs, 6, true) + '  ' + e.urteil + (hinweis ? ' – ' + String(hinweis).slice(0, 80) : ''));
  });
}

// kompakte Zusammenfassung eines Laufs für den Verlauf
function kompakt(bericht) {
  return {
    datum: bericht.datum,
    vpn: bericht.vpn?.zusammenfassung ?? null,
    relays: Object.fromEntries((bericht.einzeln || []).map((e) => [e.url, {
      urteil: e.urteil,
      zugestellt: e.zugestellt,
      erwartet: e.erwartet,
      ok: e.ok,
      gesendet: e.gesendet,
      latenzMedianMs: e.latenzMedianMs,
      belastung: e.belastung ? { ok: e.belastung.ok, zugestellt: e.belastung.zugestellt, gesendet: e.belastung.gesendet } : null
    }])),
    gesamt: bericht.gesamt ? { relays: bericht.gesamt.relays, quote: bericht.gesamt.quote, latenzMedianMs: bericht.gesamt.latenzMedianMs } : null
  };
}

function zeigeGesamt(g) {
  console.log(`Zustellung A→B ${g.zugestelltAB}/10, B→A ${g.zugestelltBA}/10 (${(g.quote * 100).toFixed(0)} %),` +
    ` Latenz Median ${g.latenzMedianMs} ms, Max ${g.latenzMaxMs} ms; offen beim Start A ${g.offenBeimStart.A}/B ${g.offenBeimStart.B} nach ${g.offenBeimStart.nachMs} ms`);
  for (const r of g.proRelay) {
    console.log(`  ${kurz(r.url).padEnd(33)} ${r.zustand.padEnd(12)} gesendet ${r.gesendet}, OK ${r.ok}, empfangen ${r.empfangen}, zuerst da ${r.zuerst}` +
      (r.fehler.length ? ' – ' + r.fehler.join('; ') : ''));
  }
}

function leseBericht() {
  try {
    return JSON.parse(readFileSync(ausgabe, 'utf8'));
  } catch {
    return null; // kein früherer Lauf
  }
}

// ---- Ablauf ----

const start = Date.now();
const vpn = vpnInfo();
console.log(`Relay-Live-Messung ${new Date().toISOString()} – Node ${process.version}`);
console.log(`VPN: ${vpn.zusammenfassung}; utun: ${vpn.utun.join(', ')}`);

// Kurzprüfung der gewählten Liste: node tests/relay_live.mjs --nur-gesamt  (RELAYS aus src/net/relays.js)
if (process.argv.includes('--nur-gesamt')) {
  const { RELAYS } = await import('../src/net/relays.js');
  console.log(`Gesamt-Durchgang mit RELAYS aus src/net/relays.js: ${RELAYS.map(kurz).join(', ')}`);
  const g = await gesamtDurchgang(RELAYS);
  zeigeGesamt(g);
  const bericht = leseBericht() || {};
  bericht.pruefungRelays = [...(bericht.pruefungRelays || []), { datum: new Date().toISOString(), vpn: vpn.zusammenfassung, ...g }].slice(-VERLAUF_MAX);
  mkdirSync(dirname(ausgabe), { recursive: true });
  writeFileSync(ausgabe, JSON.stringify(bericht, null, 2));
  const gut = g.quote >= 0.95 && g.offenBeimStart.A === RELAYS.length && g.offenBeimStart.B === RELAYS.length;
  console.log((gut ? '✅' : '❌') + ` RELAYS: ≥ 95 % Zustellung und alle ${RELAYS.length} offen (in tests/out/relay_live.json → pruefungRelays)`);
  process.exit(gut ? 0 : 1);
}

const quellen = new Map();
for (const u of defaultRelayUrls) quellen.set(u, ['trystero']);
for (const u of EXTRA) quellen.set(u, [...(quellen.get(u) || []), 'extra']);
const kandidaten = [...quellen.keys()];
console.log(`${kandidaten.length} Kandidaten (${defaultRelayUrls.length} aus Trystero, ${EXTRA.length} weitere), ${PARALLEL} parallel\n`);

// 1) Einzeltest
fristEinzel = start + FRIST_EINZEL_MS;
const ergebnisse = [];
const warteschlange = [...kandidaten];
let fertig = 0;
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (warteschlange.length) {
    const url = warteschlange.shift();
    let e;
    try {
      e = await testeRelay(url, quellen.get(url));
    } catch (err) {
      e = auswerten(url, quellen.get(url), [{ verbunden: false, gesendet: 0, zugestellt: 0, ok: 0, abgelehnt: 0, latenzen: [], acks: [], fehler: ['Messfehler: ' + err.message] }], 0);
    }
    ergebnisse.push(e);
    fertig++;
    console.log(`[${String(fertig).padStart(2)}/${kandidaten.length}] ${kurz(url).padEnd(33)} ${e.urteil}` +
      ` (${e.zugestellt}/${e.erwartet}${e.latenzMedianMs !== null ? ', ' + e.latenzMedianMs + ' ms' : ''})`);
  }
}));
const dauerEinzelMs = Date.now() - start;
ergebnisse.sort(vergleiche);

// 2) Belastung für die Spitzengruppe (alle gleichzeitig)
const spitze = ergebnisse.filter((e) => e.quote === 1).slice(0, BELASTUNG.relays);
console.log(`\nBelastung: ${spitze.length} Relays, je ${BELASTUNG.anzahl} Nachrichten im Abstand von ${BELASTUNG.abstandMs} ms …`);
await Promise.all(spitze.map(async (e) => {
  try {
    const b = await probe(e.url, Array(BELASTUNG.anzahl).fill(BELASTUNG.groesse), BELASTUNG.abstandMs);
    e.belastung = {
      verbunden: b.verbunden, gesendet: b.gesendet, ok: b.ok, abgelehnt: b.abgelehnt, zugestellt: b.zugestellt,
      latenzMedianMs: median(b.latenzen), latenzMaxMs: b.latenzen.length ? Math.max(...b.latenzen) : null,
      fehler: b.fehler, unbrauchbar: b.unbrauchbar
    };
  } catch (err) {
    e.belastung = { verbunden: false, gesendet: 0, ok: 0, abgelehnt: 0, zugestellt: 0, fehler: ['Messfehler: ' + err.message] };
  }
}));
ergebnisse.sort(vergleiche);

console.log(`\nEinzelmessung (${(dauerEinzelMs / 1000).toFixed(0)} s) + Belastung, sortiert nach Zustellung, Belastung, OK, Latenz:`);
tabelle(ergebnisse);
console.log('Qu. T = Trystero-Standardliste, E = zusätzlich; Zust./OK aus 2×3 Nachrichten; Last = OK+zugestellt bei 20 Nachrichten/6 s;');
console.log('Lat. = Senden bei A → Empfang bei B (ms); Ack = Senden → OK (ms); Verb. = Verbindungsaufbau (ms)');

// 3) Gesamt-Durchgang
const perfekt = ergebnisse.filter((e) => e.quote === 1 && e.okQuote === 1).length;
const beste = ergebnisse.filter((e) => e.quote > 0).slice(0, BESTE_N).map((e) => e.url);
console.log(`\nGesamt-Durchgang mit den besten ${beste.length}: ${beste.map(kurz).join(', ')}`);
let gesamt = null;
if (beste.length) {
  gesamt = await gesamtDurchgang(beste);
  zeigeGesamt(gesamt);
}

// Bericht mit Verlauf früherer Läufe
const bericht = {
  datum: new Date().toISOString(),
  node: process.version,
  vpn: { hinweis: 'Messung lief über ProtonVPN (Mac mini, Hermes-Server)', ...vpn },
  einstellungen: { parallel: PARALLEL, durchgaenge: DURCHGAENGE, groessen: GROESSEN, abstandMs: ABSTAND_MS, belastung: BELASTUNG, verbindenMs: VERBINDEN_MS },
  dauerEinzelMs,
  dauerGesamtMs: Date.now() - start,
  kandidaten: kandidaten.length,
  rangliste: ergebnisse.map((e) => ({ url: e.url, urteil: e.urteil, quote: e.quote, belastung: lastQuote(e), latenzMedianMs: e.latenzMedianMs })),
  perfekt,
  beste,
  gesamt,
  einzeln: ergebnisse
};
const alt = leseBericht();
const frueher = alt ? (alt.verlauf ?? (alt.einzeln ? [kompakt(alt)] : [])) : [];
bericht.verlauf = [...frueher, kompakt(bericht)].slice(-VERLAUF_MAX);
if (alt?.pruefungRelays) bericht.pruefungRelays = alt.pruefungRelays;

// Summe über alle Läufe im Verlauf (für die Auswahl in src/net/relays.js)
if (bericht.verlauf.length > 1) {
  const n = bericht.verlauf.length;
  const kumuliert = ergebnisse.filter((e) => e.quote > 0).map((e) => {
    const laeufe = bericht.verlauf.map((v) => v.relays[e.url]).filter(Boolean);
    const z = summe(laeufe.map((l) => l.zugestellt));
    const erw = summe(laeufe.map((l) => l.erwartet));
    const mitLast = laeufe.filter((l) => l.belastung);
    const last = mitLast.length
      ? `${summe(mitLast.map((l) => Math.min(l.belastung.ok, l.belastung.zugestellt)))}/${mitLast.length * BELASTUNG.anzahl}` : '–';
    return { url: e.url, laeufe: laeufe.length, z, erw, last, lat: median(laeufe.map((l) => l.latenzMedianMs).filter((x) => x !== null)) };
  }).sort((a, b) => (b.z / b.erw - a.z / a.erw) || (a.lat - b.lat));
  console.log(`\nÜber alle ${n} Läufe im Verlauf (Zustellung, Belastung, Median der Latenz-Mediane):`);
  for (const k of kumuliert.slice(0, 16)) {
    console.log(`  ${kurz(k.url).padEnd(33)} ${String(k.laeufe).padStart(2)} Läufe  ${`${k.z}/${k.erw}`.padEnd(7)} Last ${k.last.padEnd(7)} ${String(k.lat).padStart(5)} ms`);
  }
  bericht.kumuliert = kumuliert;
}

// Plausibilitätsprüfungen
let fehlerZahl = 0;
const pruefe = (name, bed, zaehlt = true) => {
  if (bed) console.log('✅ ' + name);
  else {
    console.log('❌ ' + name);
    if (zaehlt) fehlerZahl++;
  }
};
console.log('');
pruefe(`mindestens ${BESTE_N} Relays mit 100 % Zustellung und OK (gefunden: ${perfekt})`, perfekt >= BESTE_N);
pruefe('Gesamt-Durchgang: ≥ 95 % Zustellung', gesamt !== null && gesamt.quote >= 0.95);
const vollLast = ergebnisse.filter((e) => (lastQuote(e) ?? 0) >= 0.95).length;
pruefe(`Belastung: mindestens ${BESTE_N} Relays mit ≥ 95 % (gefunden: ${vollLast})`, vollLast >= BESTE_N, false);
const wine = ergebnisse.find((e) => e.url === 'wss://nostr.wine');
pruefe(`nostr.wine als unbrauchbar erkannt (${wine ? wine.urteil + (wine.unbrauchbar ? ': ' + wine.unbrauchbar : '') : 'nicht gemessen'})`,
  wine && wine.urteil !== 'ok', false);

mkdirSync(dirname(ausgabe), { recursive: true });
writeFileSync(ausgabe, JSON.stringify(bericht, null, 2));
console.log(`\nGeschrieben: tests/out/relay_live.json (Verlauf: ${bericht.verlauf.length} Läufe, Gesamtdauer ${((Date.now() - start) / 1000).toFixed(0)} s)`);
process.exit(fehlerZahl ? 1 : 0);
