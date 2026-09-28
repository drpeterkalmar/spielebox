// Wortliste und Hilfsfunktionen für den Tisch-Code aus 3 Wörtern.
// 1024 Wörter = 10 Bit pro Wort, 3 Wörter = 30 Bit.
// Die Liste ist präfixfrei (kein Wort und kein Klangschlüssel ist Anfang eines anderen)
// und klanglich eindeutig (keine zwei Wörter mit gleichem Klangschlüssel).
// Erzeugt mit tools/wordlist_filter.mjs aus tools/wordlist_candidates.txt – nicht von Hand ändern.

// BEGIN WORDS
export const WORDS = Object.freeze([
  'abend', 'acker', 'adler', 'ahorn', 'akrobat', 'album', 'allee', 'alm', 'alpaka', 'ameise',
  'ampel', 'amsel', 'ananas', 'angel', 'anker', 'anorak', 'antenne', 'antilope', 'anzug', 'apfel',
  'aprikose', 'april', 'aquarium', 'ara', 'arche', 'arena', 'arm', 'arzt', 'asche', 'ast', 'atlas',
  'aufkleber', 'aufzug', 'auge', 'august', 'ausflug', 'ausgang', 'auto', 'bach', 'bad', 'bagger',
  'bahnhof', 'ball', 'bambus', 'banane', 'bank', 'bart', 'bauch', 'bauer', 'bauklotz', 'baum',
  'baustein', 'baustelle', 'becher', 'becken', 'beere', 'bein', 'benzin', 'berg', 'besen',
  'besteck', 'bett', 'beutel', 'biber', 'biene', 'bild', 'birke', 'birne', 'blase', 'blatt',
  'blaubeere', 'blaulicht', 'blaumeise', 'blech', 'bleistift', 'blinker', 'blitz', 'block', 'blume',
  'bluse', 'boa', 'boden', 'bogen', 'bohne', 'bohrer', 'boje', 'boot', 'braten', 'braue', 'brause',
  'braut', 'brei', 'bremse', 'brennholz', 'brett', 'brief', 'brille', 'brombeere', 'brot', 'bruder',
  'brunnen', 'buch', 'bullauge', 'bumerang', 'buntstift', 'burg', 'bus', 'butter', 'dach', 'dackel',
  'dame', 'dampf', 'dattel', 'daumen', 'decke', 'delfin', 'detektiv', 'dezember', 'diamant',
  'dienstag', 'dirigent', 'distel', 'doktor', 'dom', 'donner', 'dorf', 'dorn', 'dose', 'drache',
  'draht', 'dreieck', 'dreirad', 'drossel', 'drucker', 'dusche', 'ebbe', 'echse', 'ecke',
  'edelstein', 'efeu', 'eiche', 'eichhorn', 'eidechse', 'eieruhr', 'eimer', 'eingang', 'einhorn',
  'einrad', 'eintopf', 'eisbahn', 'eisberg', 'eisen', 'eiskugel', 'eisvogel', 'eiszapfen', 'elch',
  'elefant', 'elfe', 'ellbogen', 'elster', 'eltern', 'emu', 'engel', 'ente', 'erbse', 'erdbeere',
  'erde', 'erdnuss', 'erfinder', 'ernte', 'esel', 'essig', 'esstisch', 'eule', 'euro', 'fabrik',
  'fackel', 'faden', 'fahne', 'fahrer', 'fahrkarte', 'fahrplan', 'fahrrad', 'fahrstuhl', 'falke',
  'falter', 'familie', 'farbe', 'farn', 'fass', 'februar', 'feder', 'feier', 'feige', 'feile',
  'feld', 'fels', 'fenster', 'ferien', 'ferkel', 'fernglas', 'fernrohr', 'fernseher', 'ferse',
  'fest', 'feuer', 'fichte', 'figur', 'film', 'filzstift', 'finger', 'fink', 'fisch', 'flagge',
  'flamingo', 'flamme', 'flasche', 'fleck', 'fleisch', 'fliege', 'fliese', 'flocke', 'flosse',
  'flugzeug', 'flur', 'fluss', 'flut', 'fohlen', 'forelle', 'forscher', 'fossil', 'foto', 'frage',
  'frau', 'freibad', 'freitag', 'freund', 'frisur', 'frosch', 'frost', 'frucht', 'fuchs', 'funke',
  'futter', 'gabel', 'gans', 'garderobe', 'garnele', 'garten', 'gast', 'gazelle', 'gebirge',
  'gedicht', 'geige', 'geist', 'geld', 'gepard', 'gerste', 'geschenk', 'geschirr', 'gesicht',
  'gespenst', 'getreide', 'geweih', 'gewitter', 'gipfel', 'gips', 'giraffe', 'girlande', 'gitarre',
  'gitter', 'glas', 'gleis', 'gletscher', 'globus', 'glocke', 'glut', 'gold', 'golf', 'gondel',
  'gong', 'gorilla', 'graben', 'gras', 'griff', 'grill', 'gummi', 'gurke', 'gurt', 'haar', 'hafen',
  'hafer', 'hagel', 'hai', 'haken', 'halle', 'halm', 'halsband', 'halskette', 'hammer', 'hamster',
  'hand', 'hang', 'hase', 'haufen', 'haus', 'haut', 'hebel', 'hecht', 'hecke', 'hefe', 'heft',
  'held', 'helfer', 'helm', 'hemd', 'hengst', 'henkel', 'henne', 'herbst', 'hering', 'herz', 'heu',
  'hexe', 'himbeere', 'himmel', 'hirsch', 'hirte', 'hitze', 'hochbett', 'hochhaus', 'hochzeit',
  'hocker', 'hof', 'holz', 'honig', 'horizont', 'horn', 'hose', 'hotel', 'hufeisen', 'hummel',
  'hummer', 'hund', 'hupe', 'hut', 'igel', 'iglu', 'insekt', 'insel', 'jacke', 'jaguar', 'jahr',
  'januar', 'juli', 'junge', 'juwel', 'kabine', 'kachel', 'kaffee', 'kaiser', 'kajak', 'kakadu',
  'kakao', 'kaktus', 'kalb', 'kalender', 'kamel', 'kamera', 'kamin', 'kanal', 'kaninchen', 'kanne',
  'kante', 'kanu', 'kappe', 'kapuze', 'karotte', 'karpfen', 'karte', 'kartoffel', 'karussell',
  'kasse', 'kastanie', 'kater', 'katze', 'kaufhaus', 'kaufmann', 'kaugummi', 'kegel', 'keks',
  'kelle', 'kellner', 'kern', 'kerze', 'kescher', 'kessel', 'kette', 'kiefer', 'kiesel', 'kind',
  'kino', 'kiosk', 'kirche', 'kirsche', 'kissen', 'kiste', 'kiwi', 'klammer', 'klasse', 'kleber',
  'klecks', 'kleid', 'klempner', 'klingel', 'klinke', 'klippe', 'kloster', 'klotz', 'knete', 'knie',
  'knoblauch', 'knochen', 'knopf', 'knospe', 'knoten', 'koala', 'kobold', 'kobra', 'koch', 'koffer',
  'kohle', 'kohlrabi', 'kokosnuss', 'kolibri', 'komet', 'kommode', 'kompass', 'konfetti', 'konzert',
  'kopf', 'koralle', 'korb', 'korken', 'korn', 'krabbe', 'kragen', 'krake', 'kralle', 'kranich',
  'kranz', 'krater', 'kraut', 'krawatte', 'kreide', 'kreis', 'kresse', 'kreuz', 'krippe',
  'kristall', 'krokodil', 'krokus', 'krone', 'krug', 'kuchen', 'kuckuck', 'kugel', 'kuli', 'kumpel',
  'kupfer', 'kuppel', 'kurbel', 'kutsche', 'lachs', 'laden', 'lager', 'laken', 'lakritz', 'lama',
  'lampe', 'land', 'lappen', 'larve', 'lasso', 'laster', 'lastwagen', 'laterne', 'laub', 'lauch',
  'laufrad', 'lebkuchen', 'leder', 'leguan', 'lehm', 'lehrer', 'leim', 'leine', 'leiter', 'lenkrad',
  'leopard', 'lerche', 'leute', 'lexikon', 'libelle', 'licht', 'lied', 'liege', 'lilie', 'limonade',
  'linde', 'lineal', 'linie', 'linse', 'lippe', 'loch', 'lok', 'lolli', 'luchs', 'luft', 'lunge',
  'lupe', 'lutscher', 'magen', 'magier', 'magnet', 'maler', 'malkasten', 'mama', 'mammut',
  'mandarine', 'mango', 'mantel', 'mappe', 'marder', 'marke', 'markt', 'marmelade', 'marzipan',
  'maschine', 'maske', 'mast', 'matratze', 'matrose', 'matsch', 'matte', 'mauer', 'maulwurf',
  'maurer', 'maus', 'meer', 'mehl', 'meise', 'meister', 'mensch', 'metall', 'meteor', 'mikrofon',
  'milch', 'minute', 'minze', 'mittag', 'mittwoch', 'monat', 'mond', 'monitor', 'moor', 'moos',
  'moped', 'motorboot', 'motorrad', 'motte', 'murmel', 'muschel', 'museum', 'musik', 'muskel',
  'mutter', 'nabel', 'nachbar', 'nacht', 'nacken', 'nadel', 'nagel', 'naht', 'name', 'napf',
  'narwal', 'nase', 'nashorn', 'nebel', 'nelke', 'nest', 'netz', 'nilpferd', 'nixe', 'note',
  'notiz', 'nudel', 'nuss', 'oase', 'obst', 'ochse', 'ofen', 'ohrring', 'oktober', 'oktopus', 'oma',
  'onkel', 'opa', 'oper', 'ordner', 'orgel', 'orkan', 'otter', 'ozean', 'paddel', 'paket', 'palast',
  'palme', 'panda', 'pantoffel', 'papa', 'papier', 'pappe', 'paprika', 'park', 'pauke', 'pause',
  'pedal', 'pelikan', 'pendel', 'perle', 'pfad', 'pfanne', 'pfarrer', 'pfau', 'pfeffer', 'pfeife',
  'pfeil', 'pferd', 'pfiff', 'pfirsich', 'pflanze', 'pflaster', 'pflaume', 'pflug', 'pfote',
  'picknick', 'pilot', 'pilz', 'pinguin', 'pinsel', 'pinzette', 'piste', 'plakat', 'planet',
  'plastik', 'platte', 'platz', 'pokal', 'polizei', 'polizist', 'posaune', 'postbote', 'postkarte',
  'prinz', 'professor', 'propeller', 'pudding', 'pudel', 'pulli', 'pult', 'puma', 'pumpe', 'punkt',
  'puppe', 'pute', 'quadrat', 'qualle', 'quark', 'quelle', 'rabe', 'rad', 'rahmen', 'rakete',
  'rampe', 'ranzen', 'rasen', 'rassel', 'rauch', 'raum', 'raupe', 'rechen', 'regal', 'regen',
  'reibe', 'reifen', 'reiher', 'reis', 'reiter', 'rennwagen', 'rentier', 'rezept', 'richter',
  'riegel', 'riese', 'rind', 'ring', 'ritter', 'robbe', 'roboter', 'rock', 'roggen', 'rohr',
  'rolle', 'rollschuh', 'rollstuhl', 'rose', 'rosine', 'rubin', 'rucksack', 'ruder', 'runde',
  'rutsche', 'sack', 'saft', 'sahne', 'saite', 'salami', 'salat', 'salz', 'samen', 'samstag',
  'sand', 'sardine', 'sattel', 'saurier', 'schach', 'schaf', 'schal', 'schatten', 'schatz',
  'schauer', 'schaufel', 'schaukel', 'schaum', 'scheibe', 'schere', 'scheune', 'schiene', 'schiff',
  'schild', 'schilf', 'schinken', 'schippe', 'schirm', 'schlange', 'schlauch', 'schleife',
  'schlitten', 'schloss', 'schmied', 'schmuck', 'schnabel', 'schnee', 'schneider', 'schnitzel',
  'schnuller', 'schnur', 'schrank', 'schraube', 'schreiner', 'schublade', 'schulbank', 'schulbuch',
  'schule', 'schulhof', 'schulter', 'schulweg', 'schuppe', 'schuster', 'schwalbe', 'schwamm',
  'schwan', 'schwarm', 'schwein', 'schwester', 'schwimmer', 'seehund', 'seekuh', 'seemann',
  'seerose', 'seestern', 'segel', 'seide', 'seife', 'seil', 'semmel', 'senf', 'september', 'sessel',
  'sieb', 'sieger', 'silber', 'silo', 'sirene', 'sirup', 'sitz', 'socke', 'sofa', 'sohle', 'sommer',
  'sonne', 'sonntag', 'spange', 'spardose', 'spargel', 'spaten', 'spatz', 'specht', 'speck',
  'spiegel', 'spiel', 'spinat', 'spinne', 'spitze', 'spitzmaus', 'sport', 'sprudel', 'sprung',
  'spur', 'stab', 'stachel', 'stadion', 'stadt', 'stall', 'stamm', 'standuhr', 'stange', 'start',
  'stau', 'steckdose', 'stecker', 'stein', 'stempel', 'stern', 'stiefel', 'stiel', 'stier', 'stift',
  'stimme', 'stock', 'stoff', 'storch', 'strahl', 'strand', 'strauch', 'streifen', 'streusel',
  'strich', 'strohhalm', 'strom', 'strumpf', 'stufe', 'stuhl', 'stunde', 'sturm', 'stute', 'sumpf',
  'suppe', 'tablett', 'tacker', 'tafel', 'takt', 'tal', 'tamburin', 'tandem', 'tank', 'tanne',
  'tante', 'tanz', 'tapete', 'tasche', 'tasse', 'taste', 'tatze', 'taube', 'taucher', 'taxi',
  'teekanne', 'teich', 'teig', 'telefon', 'teleskop', 'teller', 'tempel', 'tennis', 'teppich',
  'terrasse', 'tierarzt', 'tierheim', 'tierpark', 'tiger', 'tinte', 'tipi', 'tisch', 'tochter',
  'tomate', 'ton', 'topf', 'torte', 'torwart', 'traktor', 'trampolin', 'traube', 'traum', 'treppe',
  'tresor', 'tretboot', 'triangel', 'trichter', 'trick', 'trommel', 'trompete', 'tropfen', 'truhe',
  'tuba', 'tube', 'tuch', 'tukan', 'tulpe', 'tunnel', 'turm', 'turnhalle', 'turnschuh', 'ufer',
  'uhr', 'uhu', 'umhang', 'umschlag', 'vater', 'veilchen', 'versteck', 'viereck', 'vogel',
  'vollmond', 'vorhang', 'wabe', 'wachs', 'wade', 'waffel', 'wagen', 'wald', 'walnuss', 'walross',
  'wand', 'wange', 'wanne', 'wappen', 'wasser', 'watte', 'weg', 'weide', 'weizen', 'welle', 'welpe',
  'welt', 'werkstatt', 'werkzeug', 'wespe', 'weste', 'wetter', 'wichtel', 'wiege', 'wiese',
  'wimper', 'wind', 'wippe', 'wirt', 'wischmopp', 'witz', 'woche', 'wohnmobil', 'wohnung',
  'wohnwagen', 'wolf', 'wolke', 'wolle', 'wort', 'wurm', 'wurst', 'wurzel', 'zahl', 'zahnarzt',
  'zahnpasta', 'zahnrad', 'zange', 'zapfen', 'zauber', 'zaun', 'zebra', 'zehe', 'zeichen', 'zeiger',
  'zeitung', 'zelt', 'zement', 'zettel', 'ziege', 'ziel', 'ziffer', 'zimmer', 'zimt', 'zirkel',
  'zirkus', 'zitrone', 'zoo', 'zug', 'zunge', 'zweig', 'zwerg', 'zwieback', 'zwiebel', 'zwilling',
]);
// END WORDS

// Eingabe vereinheitlichen: klein, Umlaute ausgeschrieben, nur a–z
export function normalize(str) {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD') // Akzente abtrennen (é → e)
    .replace(/[^a-z]/g, '');
}

// Vokale im Klangschlüssel; E = ei/ai, O = eu/äu
const V = 'aeiouEO';
const RE_DEHNUNG = new RegExp(`([${V}])h(?![${V}])`, 'g');
const RE_IH = new RegExp(`ieh|ie|ih(?![${V}])`, 'g');
const RE_DOPPEL_KONS = new RegExp(`([^${V}])\\1+`, 'g');
const RE_IG_ENDE = new RegExp(`([^${V}])ig$`);

// Klangschlüssel roh (ohne normalize); final = Wortende-Regeln anwenden
function keyOf(w, final) {
  let s = w
    .replace(/sch/g, 'S')
    .replace(/chs/g, 'ks') // Fuchs, Dachs
    .replace(/ch/g, 'X')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/a?eu/g, 'O') // eu, äu
    .replace(/[ae][iy]/g, 'E') // ei, ai, ey, ay
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/x/g, 'ks')
    .replace(/tz|zz/g, 'ts')
    .replace(/z/g, 'ts')
    .replace(/c/g, 'k')
    .replace(/v/g, 'f')
    .replace(/dt/g, 't')
    .replace(/y/g, 'i')
    .replace(/ae/g, 'e'); // ä klingt wie e
  if (final) s = s.replace(RE_IG_ENDE, '$1iX'); // Honig → Honich
  s = s
    .replace(RE_IH, 'i')
    .replace(RE_DEHNUNG, '$1') // Dehnungs-h
    .replace(/([aeiou])\1+/g, '$1') // aa, ee, oo
    .replace(RE_DOPPEL_KONS, '$1'); // Doppelkonsonanten
  if (final) s = s.replace(/b$/, 'p').replace(/d$/, 't').replace(/(?<!n)g$/, 'k'); // Auslautverhärtung
  return s;
}

// Deutscher Klangschlüssel: gleich klingende Schreibungen ergeben denselben Schlüssel
export function soundKey(word) {
  return keyOf(normalize(word), true);
}

// Erster Index in sortiertem Array mit arr[i] >= x
function lowerBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Indizes beim Modulstart
const WORD_SET = new Set(WORDS);
const KEY_TO_WORD = new Map(WORDS.map((w) => [soundKey(w), w]));
const KEYS = [...KEY_TO_WORD.keys()].sort();
const MAX_LEN = WORDS.reduce((m, w) => Math.max(m, w.length), 0);

// Wort aus der Liste oder null: erst exakt, dann gleich klingend
export function findWord(input) {
  const n = normalize(input);
  if (!n) return null;
  if (WORD_SET.has(n)) return n;
  return KEY_TO_WORD.get(keyOf(n, true)) ?? null;
}

// Zeilenpuffer für die Abstandsberechnung (keine Allokation pro Aufruf)
const ROW_A = new Int32Array(64);
const ROW_B = new Int32Array(64);
const ROW_C = new Int32Array(64);

// Tippfehler-Abstand (Levenshtein, Vertauschung zweier Nachbarn zählt 1).
// Liefert den Abstand zum ganzen Wort oder – falls prefix – den kleinsten Abstand
// zu einem Wortanfang plus 0.5; Infinity, wenn alles über max liegt.
function typoScore(a, b, max, prefix) {
  const m = a.length;
  const n = b.length;
  let pp = ROW_A;
  let p = ROW_B;
  let c = ROW_C;
  for (let j = 0; j <= n; j++) p[j] = j;
  for (let i = 1; i <= m; i++) {
    c[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = p[j - 1] + (ai === bj ? 0 : 1);
      if (p[j] + 1 < v) v = p[j] + 1;
      if (c[j - 1] + 1 < v) v = c[j - 1] + 1;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj && pp[j - 2] + 1 < v) {
        v = pp[j - 2] + 1;
      }
      c[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return Infinity;
    const t = pp;
    pp = p;
    p = c;
    c = t;
  }
  if (p[n] <= max) return p[n];
  if (!prefix) return Infinity;
  let best = Infinity;
  for (let j = 0; j < n; j++) if (p[j] < best) best = p[j];
  return best <= max ? best + 0.5 : Infinity;
}

// Vorschläge fürs Eingabefeld: Präfix-, dann Klang-, dann Tippfehler-Treffer
export function suggest(input, limit = 6) {
  const n = normalize(input);
  if (!n || !(limit > 0)) return [];
  const out = [];
  const seen = new Set();
  const add = (list) => {
    for (const w of list) {
      if (seen.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= limit) return true;
    }
    return false;
  };

  // 1. Wörter, die mit der Eingabe beginnen (WORDS ist sortiert)
  const pre = [];
  for (let i = lowerBound(WORDS, n); i < WORDS.length && WORDS[i].startsWith(n); i++) pre.push(WORDS[i]);
  if (add(pre)) return out;

  // 2. Wörter, deren Klangschlüssel mit dem der Eingabe beginnt
  // (Wortende-Regeln erst ab 3 Buchstaben, sonst wird aus 'g' schon 'k')
  const sound = [];
  const ks = n.length >= 3 ? [keyOf(n, false), keyOf(n, true)] : [keyOf(n, false)];
  for (const k of new Set(ks)) {
    for (let i = lowerBound(KEYS, k); i < KEYS.length && KEYS[i].startsWith(k); i++) {
      sound.push(KEY_TO_WORD.get(KEYS[i]));
    }
  }
  if (add(sound.sort())) return out;

  // 3. Tippfehler (Abstand ≤ 1, ab 5 Buchstaben ≤ 2)
  if (n.length > MAX_LEN + 2) return out;
  const max = n.length >= 5 ? 2 : 1;
  const prefix = n.length >= 3; // ab 3 Buchstaben auch Wortanfänge mit Tippfehler
  const hits = [];
  for (const w of WORDS) {
    if (seen.has(w) || w.length < n.length - max || (!prefix && w.length > n.length + max)) continue;
    const s = typoScore(n, w, max, prefix);
    if (s !== Infinity) hits.push([s, w]);
  }
  hits.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
  add(hits.map((h) => h[1]));
  return out;
}

// Aneinandergeschriebene Wörter zerlegen ('baumwolkeball'); dank Präfixfreiheit eindeutig
function splitJoined(s) {
  const parts = [];
  let i = 0;
  while (i < s.length) {
    let len = 0;
    for (let l = 3; l <= MAX_LEN && i + l <= s.length; l++) {
      if (WORD_SET.has(s.slice(i, i + l))) {
        len = l;
        break;
      }
    }
    if (!len) return null;
    parts.push(s.slice(i, i + len));
    i += len;
  }
  return parts.length > 1 ? parts : null;
}

// Text/URL in bis zu 3 Wörter zerlegen; unbekannte Stücke als null
export function parseWords(str) {
  if (typeof str !== 'string') return [];
  let s = str.normalize('NFC');
  const hash = s.lastIndexOf('#');
  if (hash > 0 && s.slice(0, hash).includes('/')) s = s.slice(hash + 1); // ganze URL: nur der #-Teil
  const pieces = s
    .replace(/(\p{Ll})(?=\p{Lu})/gu, '$1 ') // BaumWolkeBall
    .split(/[^\p{L}]+/u) // Leerraum . , - _ + / # usw.
    .filter(Boolean);
  const out = [];
  for (const piece of pieces) {
    if (out.length >= 3) break;
    const w = findWord(piece);
    if (w) out.push(w);
    else out.push(...(splitJoined(normalize(piece)) ?? [null]));
  }
  return out.slice(0, 3);
}

// Zufallszahlen aus crypto.getRandomValues, gepuffert
const POOL = new Uint32Array(256);
let poolPos = POOL.length;
function rand32() {
  if (poolPos >= POOL.length) {
    globalThis.crypto.getRandomValues(POOL);
    poolPos = 0;
  }
  return POOL[poolPos++];
}

// Gleichverteilte Ganzzahl in [0, n) ohne Modulo-Verzerrung
function cryptoRandInt(n) {
  if ((n & (n - 1)) === 0) return rand32() & (n - 1); // Zweierpotenz: 1024 → 10 Bit
  const limit = 2 ** 32 - (2 ** 32 % n);
  let x;
  do x = rand32();
  while (x >= limit);
  return x % n;
}

// n verschiedene Zufallswörter
export function randomWords(n = 3, randInt = cryptoRandInt) {
  if (!Number.isInteger(n) || n < 0 || n > WORDS.length) {
    throw new RangeError(`randomWords: n muss zwischen 0 und ${WORDS.length} liegen`);
  }
  const picked = new Set();
  let tries = 0;
  while (picked.size < n) {
    const i = randInt(WORDS.length);
    if (!Number.isInteger(i) || i < 0 || i >= WORDS.length) {
      throw new RangeError(`randomWords: randInt lieferte ${i}`);
    }
    picked.add(i); // Doppelte verwerfen, bleibt gleichverteilt
    if (++tries > 1000 * (n + 1)) throw new Error('randomWords: randInt liefert keine neuen Werte');
  }
  return [...picked].map((i) => WORDS[i]);
}

// ['baum','wolke','ball'] → 'baum-wolke-ball'
export function formatWords(words) {
  return (Array.isArray(words) ? words : []).map(normalize).filter(Boolean).join('-');
}

// 'baum' → 'Baum'
export function displayWord(w) {
  const s = typeof w === 'string' ? w.trim() : '';
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
