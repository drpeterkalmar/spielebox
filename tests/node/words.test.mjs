// Tests für src/words.js – eigenständig: node tests/node/words.test.mjs
import assert from 'node:assert/strict';
import {
  WORDS,
  normalize,
  soundKey,
  findWord,
  suggest,
  parseWords,
  randomWords,
  formatWords,
  displayWord,
} from '../../src/words.js';

let fehler = 0;
// Ein Testfall = eine Ergebniszeile; fn darf einen Zusatztext zurückgeben
function test(name, fn) {
  try {
    const info = fn();
    console.log(`✅ ${name}${info ? ` – ${info}` : ''}`);
  } catch (err) {
    fehler++;
    console.log(`❌ ${name}\n   ${String(err.message).split('\n').join('\n   ')}`);
  }
}

// Folge fester Werte als randInt (für deterministische Tests)
const folge = (werte) => {
  let i = 0;
  return () => werte[i++ % werte.length];
};

// ---------------------------------------------------------------- Liste

test('Liste: genau 1024 Einträge', () => {
  assert.equal(WORDS.length, 1024);
});

test('Liste: alle Einträge eindeutig', () => {
  assert.equal(new Set(WORDS).size, WORDS.length);
});

test('Liste: alphabetisch sortiert', () => {
  assert.deepEqual([...WORDS], [...WORDS].sort());
});

test('Liste: nur a–z, Länge 3–9', () => {
  const falsch = WORDS.filter((w) => !/^[a-z]{3,9}$/.test(w));
  assert.deepEqual(falsch, []);
});

// ae/oe/ue kommt nur vor, wo kein Umlaut gemeint ist
const UMLAUT_AUSNAHMEN = {
  bauer: 'au + e',
  braue: 'au + e',
  mauer: 'au + e',
  schauer: 'au + e',
  feuer: 'eu + e',
  quelle: 'qu + e',
};
test('Liste: keine Umlaut-Ersatzschreibungen (ae/oe/ue nur in begründeten Ausnahmen)', () => {
  const treffer = WORDS.filter((w) => /ae|oe|ue/.test(w));
  const unbegruendet = treffer.filter((w) => !UMLAUT_AUSNAHMEN[w]);
  assert.deepEqual(unbegruendet, [], `ae/oe/ue ohne Begründung: ${unbegruendet.join(', ')}`);
  return `Ausnahmen: ${treffer.map((w) => `${w} (${UMLAUT_AUSNAHMEN[w]})`).join(', ')}`;
});

test('Liste: keine Fremdschreibungen (y, ph, th, c außer ch/ck, q außer qu)', () => {
  const falsch = WORDS.filter((w) => /y|ph|th|c(?![hk])|q(?!u)/.test(w));
  assert.deepEqual(falsch, []);
});

test('Liste: keine Rechtschreibfallen (Wörter, die richtig ä/ö/ü/ß haben)', () => {
  const fallen = [
    'strasse', 'fuss', 'floss', 'spass', 'gruss', 'kloss', 'weiss', 'eiweiss', 'strauss', 'sosse',
    'bar', 'baer', 'kase', 'kaese', 'tur', 'tuer', 'lowe', 'loewe', 'kafer', 'mowe', 'loffel',
    'hutte', 'muhle', 'brucke', 'schlussel', 'kuste', 'rube', 'mohre', 'kuken',
  ];
  const drin = fallen.filter((w) => WORDS.includes(w));
  assert.deepEqual(drin, []);
});

test('Liste: keine am Telefon leicht verwechselbaren Paare (mond/mund, gabel/kabel …)', () => {
  // gleich lang, genau eine Stelle verschieden, und die Laute sind sich nah
  const nah = new Set(['ou', 'uo', 'ei', 'ie', 'mn', 'nm', 'bp', 'pb', 'dt', 'td', 'gk', 'kg']);
  const paare = [];
  for (const a of WORDS) {
    for (const b of WORDS) {
      if (a >= b || a.length !== b.length) continue;
      const diff = [...a].map((c, i) => c + b[i]).filter((p) => p[0] !== p[1]);
      if (diff.length === 1 && nah.has(diff[0])) paare.push(`${a}/${b}`);
    }
  }
  assert.deepEqual(paare, []);
});

test('Klang: alle Klangschlüssel eindeutig', () => {
  const keys = new Map();
  for (const w of WORDS) {
    const k = soundKey(w);
    assert.ok(!keys.has(k), `${w} klingt wie ${keys.get(k)} (${k})`);
    keys.set(k, w);
  }
});

// sortiert prüfen: ist a Präfix eines anderen, steht ein solches Wort direkt dahinter
function praefixPaare(liste) {
  const s = [...liste].sort();
  const paare = [];
  for (let i = 1; i < s.length; i++) if (s[i].startsWith(s[i - 1])) paare.push(`${s[i - 1]}/${s[i]}`);
  return paare;
}

test('Präfix: kein Wort ist Anfang eines anderen', () => {
  assert.deepEqual(praefixPaare(WORDS), []);
});

test('Präfix: kein Klangschlüssel ist Anfang eines anderen', () => {
  assert.deepEqual(praefixPaare(WORDS.map(soundKey)), []);
});

// Sperrliste: gleich klingende Paare – nie beide in der Liste, Schlüssel muss sie gleich machen
const GLEICHKLANG = [
  ['meer', 'mehr'], ['wal', 'wahl'], ['rad', 'rat'], ['lied', 'lid'], ['stiel', 'stil'],
  ['seite', 'saite'], ['mal', 'mahl'], ['mine', 'miene'], ['moor', 'mohr'], ['weise', 'waise'],
  ['uhr', 'ur'], ['stadt', 'statt'], ['bund', 'bunt'], ['boot', 'bot'], ['war', 'wahr'],
  ['heer', 'her'], ['sole', 'sohle'], ['lehre', 'leere'], ['fiel', 'viel'], ['laib', 'leib'],
  ['lerche', 'lärche'], ['ehre', 'ähre'], ['wände', 'wende'], ['leute', 'läute'], ['heute', 'häute'],
  ['seid', 'seit'], ['wird', 'wirt'], ['weiß', 'weis'], ['lachs', 'lax'], ['delfin', 'delphin'],
  ['foto', 'photo'], ['vetter', 'fetter'], ['ihn', 'in'], ['kahn', 'kann'], ['wieder', 'wider'],
  ['staat', 'stadt'], ['beeren', 'bären'], ['seele', 'säle'], ['weg', 'weck'], ['held', 'hält'],
  ['feld', 'fällt'], ['bald', 'ballt'], ['rain', 'rein'], ['tod', 'tot'], ['ahle', 'aale'],
  ['mär', 'meer'], ['bett', 'beet'], ['stall', 'stahl'], ['kelle', 'kehle'], ['mann', 'man'],
  ['das', 'dass'], ['welt', 'wellt'], ['malen', 'mahlen'], ['ware', 'wahre'], ['hohl', 'hol'],
  ['rum', 'ruhm'], ['mus', 'muss'], ['kante', 'kannte'], ['lieder', 'lider'], ['paar', 'par'],
  ['honig', 'honich'], ['wachs', 'wax'],
];
test(`Sperrliste: ${GLEICHKLANG.length} Gleichklang-Paare nie beide drin, Schlüssel gleich`, () => {
  for (const [a, b] of GLEICHKLANG) {
    assert.equal(soundKey(a), soundKey(b), `Schlüssel ${a}=${soundKey(a)} / ${b}=${soundKey(b)}`);
    const na = normalize(a);
    const nb = normalize(b);
    assert.ok(!(WORDS.includes(na) && WORDS.includes(nb)), `beide in der Liste: ${a}/${b}`);
  }
});

// Sperrliste: Präfix-Paare – nie beide in der Liste
const PRAEFIX = [
  ['ball', 'ballon'], ['tee', 'teer'], ['rad', 'radio'], ['tor', 'torte'], ['bau', 'baum'],
  ['eis', 'eisen'], ['see', 'seele'], ['ei', 'eimer'], ['bus', 'busch'], ['mus', 'muschel'],
  ['hand', 'handtuch'], ['wal', 'wald'], ['dach', 'dachs'], ['sand', 'sandale'], ['rind', 'rinde'],
  ['kohl', 'kohle'], ['kran', 'kranich'], ['wind', 'windel'], ['zahn', 'zahnrad'], ['ohr', 'ohrring'],
  ['schal', 'schale'], ['feuer', 'feuerwehr'], ['stern', 'sternbild'], ['gold', 'goldfisch'],
  ['apfel', 'apfelsine'], ['regen', 'regenwurm'], ['haus', 'hausschuh'], ['park', 'parkplatz'],
  ['tisch', 'tischler'], ['fisch', 'fischer'], ['spiel', 'spielzeug'], ['post', 'postbote'],
  ['musik', 'musiker'], ['auto', 'autobahn'], ['kreis', 'kreisel'], ['ton', 'tonne'],
];
test(`Sperrliste: ${PRAEFIX.length} Präfix-Paare nie beide drin`, () => {
  for (const [a, b] of PRAEFIX) {
    assert.ok(b.startsWith(a), `kein Präfix-Paar: ${a}/${b}`);
    assert.ok(!(WORDS.includes(a) && WORDS.includes(b)), `beide in der Liste: ${a}/${b}`);
  }
});

// ---------------------------------------------------------------- normalize / soundKey

test('normalize: Umlaute, ß, Groß/klein, Leer- und Sonderzeichen', () => {
  assert.equal(normalize('  Bär '), 'baer');
  assert.equal(normalize('Straße'), 'strasse');
  assert.equal(normalize('ÖL'), 'oel');
  assert.equal(normalize('Über-Müll!'), 'uebermuell');
  assert.equal(normalize('Bär'), 'baer'); // zerlegtes ä (NFD)
  assert.equal(normalize('Café 42'), 'cafe');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
});

test('soundKey: gleich für Groß/klein und Umlaut-Schreibweisen', () => {
  assert.equal(soundKey('Meer'), soundKey('meer'));
  assert.equal(soundKey('Lärche'), soundKey('laerche'));
  assert.equal(soundKey('WEISS'), soundKey('weiß'));
  assert.notEqual(soundKey('hand'), soundKey('hund'));
});

// ---------------------------------------------------------------- findWord

test('findWord: exakt, Großschreibung, Leerzeichen', () => {
  assert.equal(findWord('baum'), 'baum');
  assert.equal(findWord('BAUM'), 'baum');
  assert.equal(findWord('Wolke'), 'wolke');
  assert.equal(findWord('  ball \t'), 'ball');
  for (const w of WORDS) assert.equal(findWord(w), w);
});

test('findWord: Gleichklang-Schreibungen führen zum Listenwort', () => {
  const faelle = {
    mehr: 'meer', // eh/ee
    fogel: 'vogel', // v/f
    bine: 'biene', // ie/i
    statt: 'stadt', // dt/tt
    stat: 'stadt', // dt/t
    Rat: 'rad', // Auslautverhärtung
    Lid: 'lied',
    Stil: 'stiel',
    Beet: 'bett', // ee/tt
    Stahl: 'stall', // ah/ll
    Mohr: 'moor', // oh/oo
    Kehle: 'kelle',
    Seite: 'saite', // ei/ai
    wird: 'wirt',
    Hunt: 'hund',
    Giraffe: 'giraffe',
    Girafe: 'giraffe',
  };
  for (const [ein, aus] of Object.entries(faelle)) {
    assert.ok(WORDS.includes(aus), `${aus} nicht in der Liste`);
    assert.equal(findWord(ein), aus, `findWord('${ein}')`);
  }
});

test('findWord: Unsinn → null', () => {
  for (const x of ['', '   ', 'xyzzy', 'qqq', 'baumwolke', '123', null, undefined, 42]) {
    assert.equal(findWord(x), null, `findWord(${JSON.stringify(x)})`);
  }
});

// ---------------------------------------------------------------- suggest

test('suggest: leere Eingabe → []', () => {
  assert.deepEqual(suggest(''), []);
  assert.deepEqual(suggest('   '), []);
  assert.deepEqual(suggest(null), []);
  assert.deepEqual(suggest('-.#'), []);
});

test('suggest: Präfix „ba“ liefert zuerst ba-Wörter, alphabetisch', () => {
  const alleBa = WORDS.filter((w) => w.startsWith('ba'));
  assert.ok(alleBa.length >= 6);
  assert.deepEqual(suggest('ba'), alleBa.slice(0, 6));
  const viele = suggest('Ba', 50);
  assert.deepEqual(viele.slice(0, alleBa.length), alleBa);
  return `${alleBa.length} ba-Wörter`;
});

test('suggest: Gleichklang (mehr → meer, fogel → vogel)', () => {
  assert.equal(suggest('mehr')[0], 'meer');
  assert.equal(suggest('fogel')[0], 'vogel');
  assert.ok(suggest('fog').includes('vogel'), 'Klang-Präfix fog → vogel');
});

test('suggest: Tippfehler (vertauscht, fehlend, falsch, zu viel) findet das Wort', () => {
  const faelle = {
    wolek: 'wolke', // vertauscht
    wlke: 'wolke', // fehlt
    wokle: 'wolke', // vertauscht
    krokdil: 'krokodil', // fehlt
    elefamt: 'elefant', // falsch
    zitronne: 'zitrone', // zu viel
    bumerag: 'bumerang', // fehlt am Ende
    shcule: 'schule', // vertauscht
    pinguim: 'pinguin', // falsch
    zweig: 'zweig', // exakt
  };
  for (const [ein, aus] of Object.entries(faelle)) {
    assert.ok(WORDS.includes(aus), `${aus} nicht in der Liste`);
    assert.ok(suggest(ein).includes(aus), `suggest('${ein}') = ${suggest(ein).join(',')}`);
  }
  assert.deepEqual(suggest('qxqxqxqx'), []);
});

test('suggest: keine Duplikate, limit wird eingehalten', () => {
  for (const ein of ['b', 'ba', 'mehr', 'wolek', 'st', 'sch', 'k', 'a']) {
    for (const limit of [1, 3, 6, 20]) {
      const r = suggest(ein, limit);
      assert.ok(r.length <= limit, `${ein}/${limit}: ${r.length}`);
      assert.equal(new Set(r).size, r.length, `Duplikat bei ${ein}`);
      for (const w of r) assert.ok(WORDS.includes(w));
    }
  }
  assert.equal(suggest('ba').length, 6); // Standard-limit
  assert.deepEqual(suggest('ba', 0), []);
});

test('suggest: Laufzeit', () => {
  // Eingaben wie beim Tippen: Anfänge, ganze Wörter, Tippfehler, Unsinn
  const eingaben = [];
  for (let i = 0; eingaben.length < 10000; i++) {
    const w = WORDS[(i * 37) % WORDS.length];
    const art = i % 4;
    if (art === 0) eingaben.push(w.slice(0, 1 + (i % w.length)));
    else if (art === 1) eingaben.push(w);
    else if (art === 2) eingaben.push(w.slice(1));
    else eingaben.push(w.split('').reverse().join(''));
  }
  const t0 = performance.now();
  for (const e of eingaben) suggest(e);
  const ms = performance.now() - t0;
  assert.ok(ms / eingaben.length < 2, `Ø ${ms / eingaben.length} ms`);
  return `10 000 Aufrufe in ${ms.toFixed(0)} ms (Ø ${(ms / eingaben.length).toFixed(3)} ms)`;
});

// ---------------------------------------------------------------- parseWords / formatWords

test('parseWords: alle Schreibweisen', () => {
  const soll = ['baum', 'wolke', 'ball'];
  const formen = [
    'Baum Wolke Ball',
    'baum-wolke-ball',
    'baum.wolke.ball',
    'BaumWolkeBall',
    '#baum-wolke-ball',
    '  baum,  wolke ,ball ',
    'baum_wolke_ball',
    'baum+wolke+ball',
    'baum/wolke/ball',
    'BAUM WOLKE BALL',
    'baumWolkeBall',
    'baumwolkeball',
    'Baum\tWolke\nBall',
  ];
  for (const f of formen) assert.deepEqual(parseWords(f), soll, JSON.stringify(f));
});

test('parseWords: URL, Gleichklang, unbekannte Stücke als null, max. 3', () => {
  assert.deepEqual(parseWords('https://example.org/spielebox/#baum-wolke-ball'), ['baum', 'wolke', 'ball']);
  assert.deepEqual(parseWords('Mehr Fogel Statt'), ['meer', 'vogel', 'stadt']);
  assert.deepEqual(parseWords('Baum xyz Ball'), ['baum', null, 'ball']);
  assert.deepEqual(parseWords('baum wolke'), ['baum', 'wolke']);
  assert.deepEqual(parseWords('baum wolke ball meer'), ['baum', 'wolke', 'ball']);
  assert.deepEqual(parseWords('   '), []);
  assert.deepEqual(parseWords(null), []);
});

test('formatWords und displayWord', () => {
  assert.equal(formatWords(['baum', 'wolke', 'ball']), 'baum-wolke-ball');
  assert.equal(formatWords(['Baum', 'Wolke', 'Ball']), 'baum-wolke-ball');
  assert.equal(formatWords([]), '');
  assert.equal(displayWord('baum'), 'Baum');
  assert.equal(displayWord(''), '');
  assert.equal(displayWord(null), '');
});

test('Rundreise formatWords → parseWords für 1000 randomWords', () => {
  for (let i = 0; i < 1000; i++) {
    const w = randomWords();
    assert.deepEqual(parseWords(formatWords(w)), w);
    assert.deepEqual(parseWords('#' + formatWords(w)), w);
    assert.deepEqual(parseWords(w.map(displayWord).join('')), w); // BaumWolkeBall
    assert.deepEqual(parseWords(w.join('')), w); // zusammengeschrieben (präfixfrei)
  }
});

// ---------------------------------------------------------------- randomWords

test('randomWords: 3 verschiedene Wörter aus der Liste', () => {
  for (let i = 0; i < 1000; i++) {
    const w = randomWords();
    assert.equal(w.length, 3);
    assert.equal(new Set(w).size, 3);
    for (const x of w) assert.ok(WORDS.includes(x));
  }
  assert.equal(new Set(randomWords(10)).size, 10);
  assert.deepEqual(randomWords(0), []);
});

test('randomWords: mit gesteuertem randInt deterministisch', () => {
  const aufrufe = [];
  const rand = folge([5, 5, 7, 1023]);
  const r = randomWords(3, (n) => {
    aufrufe.push(n);
    return rand();
  });
  assert.deepEqual(r, [WORDS[5], WORDS[7], WORDS[1023]]); // doppelte 5 wird verworfen
  assert.deepEqual(aufrufe, [1024, 1024, 1024, 1024]);
  assert.deepEqual(randomWords(3, folge([5, 5, 7, 1023])), r);
});

test('randomWords: Fehlerfälle', () => {
  assert.throws(() => randomWords(1025), RangeError);
  assert.throws(() => randomWords(-1), RangeError);
  assert.throws(() => randomWords(3, () => 1024), RangeError);
  assert.throws(() => randomWords(3, () => 0.5), RangeError);
  assert.throws(() => randomWords(3, () => 7), /keine neuen Werte/); // hängt nicht
});

test('randomWords: Gleichverteilung über 100 000 Ziehungen', () => {
  const zaehler = new Map(WORDS.map((w) => [w, 0]));
  const ziehungen = 100000;
  for (let i = 0; i < ziehungen; i++) for (const w of randomWords()) zaehler.set(w, zaehler.get(w) + 1);
  const werte = [...zaehler.values()];
  const erwartet = (ziehungen * 3) / WORDS.length;
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const chi2 = werte.reduce((s, x) => s + (x - erwartet) ** 2 / erwartet, 0);
  assert.ok(min >= 1, 'jedes Wort mindestens einmal');
  assert.ok(min > erwartet * 0.6 && max < erwartet * 1.4, `min ${min}, max ${max}, erwartet ${erwartet.toFixed(0)}`);
  assert.ok(chi2 < 1400, `Chi² ${chi2.toFixed(0)} (erwartet ≈ 1023)`);
  return `300 000 Wörter, je ${min}–${max} (erwartet ${erwartet.toFixed(0)}), Chi² ${chi2.toFixed(0)}`;
});

// ---------------------------------------------------------------- Ergebnis

if (fehler) {
  console.log(`\n${fehler} Test(s) fehlgeschlagen`);
  process.exitCode = 1;
} else {
  console.log('\nAlle Tests grün');
}
