// Filtert tools/wordlist_candidates.txt zu genau 1024 Wörtern und schreibt sie in src/words.js.
// Aufruf: node tools/wordlist_filter.mjs [--dry] [--verbose]
// Kandidatendatei: ein Wort pro Zeile, '#' = Kommentar. Mehrfach genannt → beste Markierung zählt.
//   wort!  → muss in die Liste (Beispielwörter)
//   wort+  → Kernwort, sehr häufig (gewinnt Konflikte eher)
//   wort   → normales Kandidatenwort
//   wort?  → seltener, nur als Füller
import { readFileSync, writeFileSync } from 'node:fs';
import { soundKey } from '../src/words.js';

const ZIEL = 1024;
const DRY = process.argv.includes('--dry');
const VERBOSE = process.argv.includes('--verbose');
const candUrl = new URL('./wordlist_candidates.txt', import.meta.url);
const wordsUrl = new URL('../src/words.js', import.meta.url);

const menge = (s) => new Set(s.split(/\s+/).filter(Boolean));

// Rechtschreibfallen: richtig geschrieben mit ä/ö/ü/ß
const FALLEN = menge(`
  bar kase loffel hutte kafer mowe muhle tur schlussel brucke lowe kuken rube mohre kuste
  strasse fuss fussball floss spass gruss kloss mass sosse strauss meissel giesskanne schoss busse
  eiweiss weiss
`);
// Fremde Aussprache (v wie w, französisch, englisch, italienisch …) oder Eigenname/Marke
const FREMD = menge(`
  orange avocado olive brokkoli pizza spaghetti bonbon pommes serviette omelett vanille
  balkon garage toilette poster karton jeans trainer dirndl ingenieur friseur lego jojo puzzle
  medaille ski skier surfbrett trikot judo banjo orchester pegasus kasper ostern advent
  weihnacht silvester fasching karneval
`);
// Traurig, gewaltsam, gruselig, eklig, anzüglich oder als Beleidigung nutzbar
const TABU = menge(`
  tod grab sarg waffe bombe gift blut krieg teufel mist leiche mord dieb gewehr pistole
  kanone panzer messer schwert dolch speer galgen folter soldat pirat indianer faust boxer
  ringer karate vampir mumie skelett zombie ungeheuer monster axt beil gehirn strick troll
  sau bulle ratte made laus zecke wanze kot pipi popo busen brust pickel klappe backe
`);
// Handprüfung: für Kinder zu selten/unklar, oder am Telefon leicht verwechselbar (juni/juli)
const SELTEN = menge(`
  binse dolde egge eibe erle esche ulme unke tang trog kufe knauf keil keim docht daune borke
  brise dunst kanon kauz iltis dohle greif graf zinn wels mopp reck euter laib lurch pirol spule
  streu zwirn leier liane niete orden pfahl ranke rinne wedel zacke zeile quaste schote siegel
  weber sonde lehne masche kolben knolle pforte zipfel zander wimpel taler basar juni turnen
  hain halma diele watt klamm glaser hefter herzog wisent winzer rekord bottich achsel papst
  agent anis artist aster atem bolzen butt dahlie datum delta diadem dinkel diskus dorsch erker
  fagott faser form forst funk furche gatter gebiss gelenk gewinn gibbon giebel granit hangar hirse
  jolle jurte kitt kliff knappe knirps kokon kondor koppel kutter laute lemur lotse muskat nische
  okapi pagode pate pflock pilger polka rute sage sockel spalt termin tusch volk weiche wombat zikade
  architekt feenstaub tarnkappe zentaur
`);
// Zu abstrakt (die Liste soll aus konkreten, vorstellbaren Dingen bestehen)
const ABSTRAKT = menge(`
  idee freude ruhe hunger schlaf wunsch wunder regel sieg krach besuch kunst natur teil reihe liste
  gruppe muster signal modell antwort satz reim einladung verkehr meter nummer grenze steuer preis
  zeit melodie geheimnis sprache datum termin gewinn alarm atem duft form
`);
// Wörter mit v, in denen v wie f klingt (v wie w ist nicht lautgetreu: Vase, Klavier)
const V_WIE_F = menge(`
  vogel veilchen vater vieh vorhang pulver vetter viereck vogelhaus detektiv vollmond volk
  vorrat larve nerv vogelnest eisvogel versteck verkehr vorname vorbild
`);
// Umlaut-Ersatzschreibungen: ae/oe/ue nur als au+e / eu+e (feuer, mauer) oder hier gelistet
const UMLAUT_OK = menge('oboe');

function regelFehler(w) {
  if (!/^[a-z]{3,9}$/.test(w)) return 'nicht a–z oder Länge nicht 3–9';
  if (FALLEN.has(w)) return 'richtig mit ä/ö/ü/ß';
  if (FREMD.has(w)) return 'Fremdaussprache/Eigenname';
  if (TABU.has(w)) return 'unpassend';
  if (SELTEN.has(w)) return 'zu selten/unklar';
  if (ABSTRAKT.has(w)) return 'zu abstrakt';
  if (/y|ph|th|gh|c(?![hk])|q(?!u)/.test(w)) return 'Fremdschreibung (y/ph/th/gh/c/q)';
  if (/^ch|^sh|^dsch|ou|eau/.test(w)) return 'Fremdschreibung (ch-/sh-/dsch-/ou/eau)';
  if (/v/.test(w) && !V_WIE_F.has(w)) return 'v nicht als f gesprochen';
  if (/ae|oe|ue/.test(w.replace(/qu|[ae]ue/g, '')) && !UMLAUT_OK.has(w)) return 'Umlaut-Ersatzschreibung';
  return null;
}

// Kandidaten lesen
const zeilen = readFileSync(candUrl, 'utf8').split('\n');
const STUFE = { '!': 0, '+': 1, '': 2, '?': 3 };
const GEWICHT = [1e6, 1500, 1000, 600];
const raus = { regel: [], doppelt: [], gleichklang: [], praefix: [], telefon: [], gekuerzt: [] };
const stufeVon = new Map(); // Wort → beste Stufe
let anzahlKandidaten = 0;
for (const roh of zeilen) {
  const z = roh.replace(/#.*/, '').trim();
  if (!z) continue;
  anzahlKandidaten++;
  const m = /^([a-zäöüß]+)([!+?]?)$/.exec(z);
  if (!m) {
    raus.regel.push(`${z} (Zeilenformat)`);
    continue;
  }
  const [, w, mark] = m;
  if (stufeVon.has(w)) raus.doppelt.push(w);
  stufeVon.set(w, Math.min(STUFE[mark], stufeVon.get(w) ?? 9));
}
const kandidaten = [];
for (const [w, stufe] of stufeVon) {
  const f = regelFehler(w);
  if (f) raus.regel.push(`${w} (${f})`);
  else kandidaten.push({ w, key: soundKey(w), stufe, gewicht: GEWICHT[stufe] - (stufe ? 10 * w.length : 0) });
}

// besser = höheres Gewicht, dann kürzer, dann alphabetisch
const besser = (a, b) => b.gewicht - a.gewicht || a.w.length - b.w.length || (a.w < b.w ? -1 : 1);

// 1. Gleichklang: pro Klangschlüssel nur das beste Wort
const proKey = new Map();
for (const c of [...kandidaten].sort(besser)) {
  const alt = proKey.get(c.key);
  if (alt) raus.gleichklang.push(`${c.w} (= ${alt.w}, Schlüssel ${c.key})`);
  else proKey.set(c.key, c);
}
let pool = [...proKey.values()];

// 2. Paarweise Konflikte, jeweils das bessere Wort bleibt:
//    a) Wort-Präfixe, die der Klangschlüssel nicht abdeckt (rad/radio, bus/busch)
//    b) am Telefon verwechselbar: gleich lang, genau ein Laut verschieden (mond/mund, gabel/kabel)
const istPraefix = (a, b) => a !== b && b.startsWith(a);
const NAH = new Set(['ou', 'uo', 'ei', 'ie', 'mn', 'nm', 'bp', 'pb', 'dt', 'td', 'gk', 'kg']);
function verwechselbar(a, b) {
  if (a.length !== b.length || a === b) return false;
  let pos = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (pos >= 0) return false;
    pos = i;
  }
  return NAH.has(a[pos] + b[pos]);
}
const tot = new Set();
const paare = [];
for (const a of pool) {
  for (const b of pool) {
    if (istPraefix(a.w, b.w) && !istPraefix(a.key, b.key)) paare.push([a, b, 'praefix']);
    else if (a.w < b.w && verwechselbar(a.w, b.w)) paare.push([a, b, 'telefon']);
  }
}
const sieger = ([a, b]) => (besser(a, b) < 0 ? a : b);
paare.sort((x, y) => besser(sieger(x), sieger(y))); // Paare mit den besten Wörtern zuerst
for (const [a, b, art] of paare) {
  if (tot.has(a) || tot.has(b)) continue;
  const verlierer = sieger([a, b]) === a ? b : a;
  tot.add(verlierer);
  raus[art].push(`${verlierer.w} (${art === 'praefix' ? 'Wortanfang' : 'verwechselbar'} ${a.w}/${b.w})`);
}
pool = pool.filter((c) => !tot.has(c));

// 3. Klangschlüssel-Präfixe: maximal gewichtete präfixfreie Auswahl per DP im Schlüssel-Trie.
// lambda = Preis pro Platz; so wird bei Überschuss die beste Auswahl mit ~1024 Wörtern gewählt.
const wurzel = { kids: new Map(), item: null };
for (const c of pool) {
  let k = wurzel;
  for (const ch of c.key) {
    if (!k.kids.has(ch)) k.kids.set(ch, { kids: new Map(), item: null });
    k = k.kids.get(ch);
  }
  k.item = c;
}
function waehle(lambda) {
  const wert = (k) => {
    let summe = 0;
    for (const kid of k.kids.values()) summe += wert(kid);
    const eigen = k.item ? k.item.gewicht - lambda : -Infinity;
    k.nimm = eigen > summe && eigen > 0;
    return Math.max(0, summe, eigen);
  };
  wert(wurzel);
  const out = [];
  const sammle = (k) => {
    if (k.nimm) out.push(k.item);
    else for (const kid of k.kids.values()) sammle(kid);
  };
  sammle(wurzel);
  return out;
}
if (waehle(0).length < ZIEL) {
  console.error(`Zu wenige Kandidaten nach dem Filtern: ${waehle(0).length} < ${ZIEL}`);
  console.error(`(Zeilen ${anzahlKandidaten}, Regeln ${raus.regel.length}, doppelt ${raus.doppelt.length}, ` +
    `Gleichklang ${raus.gleichklang.length}, Wortpräfix ${raus.praefix.length}, im Trie ${pool.length})`);
  if (VERBOSE) console.error(raus.regel.join(', '));
  process.exit(1);
}
let lo = 0;
let hi = 2000;
for (let i = 0; i < 50; i++) {
  const mitte = (lo + hi) / 2;
  if (waehle(mitte).length >= ZIEL) lo = mitte;
  else hi = mitte;
}
const auswahl = waehle(lo).sort(besser);
const liste = auswahl.slice(0, ZIEL);
const drin = new Set(liste);

// Nicht gewählte einordnen: Konflikt mit gewähltem Wort → Präfix, sonst gekürzt
for (const c of pool) {
  if (drin.has(c)) continue;
  const konflikt = liste.find(
    (g) => istPraefix(g.key, c.key) || istPraefix(c.key, g.key) || istPraefix(g.w, c.w) || istPraefix(c.w, g.w),
  );
  if (konflikt) raus.praefix.push(`${c.w} (Konflikt mit ${konflikt.w})`);
  else raus.gekuerzt.push(c.w);
}

// Prüfen
const woerter = liste.map((c) => c.w).sort();
const keys = woerter.map(soundKey);
const fehler = [];
if (woerter.length !== ZIEL) fehler.push(`Anzahl ${woerter.length}`);
if (new Set(keys).size !== keys.length) fehler.push('Klangschlüssel doppelt');
const sk = [...keys].sort();
for (let i = 1; i < sk.length; i++) if (sk[i].startsWith(sk[i - 1])) fehler.push(`Schlüssel-Präfix ${sk[i - 1]}/${sk[i]}`);
for (let i = 1; i < woerter.length; i++) if (woerter[i].startsWith(woerter[i - 1])) fehler.push(`Präfix ${woerter[i - 1]}/${woerter[i]}`);
for (const a of woerter) for (const b of woerter) if (a < b && verwechselbar(a, b)) fehler.push(`verwechselbar ${a}/${b}`);
for (const c of kandidaten) if (c.stufe === 0 && !woerter.includes(c.w)) fehler.push(`Pflichtwort fehlt: ${c.w}`);
if (fehler.length) {
  console.error('FEHLER:\n' + fehler.join('\n'));
  process.exit(1);
}

// Bericht
const laengen = {};
for (const w of woerter) laengen[w.length] = (laengen[w.length] || 0) + 1;
const stufen = [0, 1, 2, 3].map((s) => liste.filter((c) => c.stufe === s).length);
console.log(`Kandidaten: ${stufeVon.size} verschiedene Wörter (${anzahlKandidaten} Zeilen, ${raus.doppelt.length} doppelt)`);
console.log(`Raus wegen Regeln: ${raus.regel.length}, Gleichklang: ${raus.gleichklang.length}, ` +
  `Präfix: ${raus.praefix.length}, Telefon-verwechselbar: ${raus.telefon.length}, gekürzt (Überschuss): ${raus.gekuerzt.length}`);
console.log(`Liste: ${woerter.length} Wörter, Stufen !/+/normal/?: ${stufen.join('/')}, lambda ${lo.toFixed(1)}`);
console.log('Längen:', JSON.stringify(laengen));
if (VERBOSE) {
  for (const [name, arr] of Object.entries(raus)) console.log(`\n== ${name} (${arr.length}) ==\n${arr.join(', ')}`);
  console.log(`\n== Füllwörter (?) in der Liste ==\n${liste.filter((c) => c.stufe === 3).map((c) => c.w).sort().join(', ')}`);
}

// In src/words.js schreiben (zwischen den Markierungen)
if (!DRY) {
  const zeilenOut = [];
  let akt = ' ';
  for (const w of woerter) {
    const teil = ` '${w}',`;
    if (akt.length + teil.length > 100) {
      zeilenOut.push(akt);
      akt = ' ';
    }
    akt += teil;
  }
  zeilenOut.push(akt);
  const block = `// BEGIN WORDS\nexport const WORDS = Object.freeze([\n${zeilenOut.join('\n')}\n]);\n// END WORDS`;
  const src = readFileSync(wordsUrl, 'utf8');
  const neu = src.replace(/\/\/ BEGIN WORDS[\s\S]*?\/\/ END WORDS/, block);
  if (neu === src && !src.includes(block)) throw new Error('Markierungen in src/words.js nicht gefunden');
  writeFileSync(wordsUrl, neu);
  console.log('src/words.js geschrieben.');
}
