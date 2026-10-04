// Schach-Trainer – Endspiel-Lektionen: Daten und Regeln (ohne DOM, Node-testbar).
// engine 'tb' = exakte Tabelle aus tb.js (K+D/K+T/K+B gegen K): der Computer verteidigt bzw. greift perfekt an.
// engine 'bot' = Übungs-Bot (Alpha-Beta aus src/games/schach/bot.js) plus „Ziel erreicht?“-Prüfung.
// goal: 'mate' (Matt in ≤ limit Zügen), 'promote' (Bauer umwandeln, Gewinn bleibt), 'hold' (Remis halten).
import { Chess } from '../../lib/chess.js';
import { probe, scoreMoves, bestMove, materialOf } from './tb.js';

export const GROUPS = [
  { id: 'matt', name: 'Matt setzen', intro: 'Mit viel Übermacht gegen den nackten König: Wie drängt man ihn an den Rand und setzt ihn matt?' },
  { id: 'bauer', name: 'Bauernendspiele', intro: 'König und Bauer gegen König: Opposition, Quadratregel und Durchbruch entscheiden über Sieg oder Remis.' },
  { id: 'turm', name: 'Turmendspiele', intro: 'Turm und Bauer gegen Turm – die zwei wichtigsten Stellungen: Lucena (gewinnen) und Philidor (Remis halten).' }
];

export const LESSONS = [
  {
    id: 'kqk', group: 'matt', title: 'König + Dame gegen König', engine: 'tb', goal: 'mate', limit: 20, random: true,
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    intro: 'Die Dame engt den König ein (wie ein Käfig, der immer kleiner wird), dein König kommt zur Hilfe. Vorsicht vor Patt: Der gegnerische König muss immer ein Feld oder einen Zug haben, solange er nicht matt ist.',
    tip: 'Stell die Dame einen Springerzug vom König entfernt hin – das schiebt ihn zum Rand. Dann den eigenen König heranholen.'
  },
  {
    id: 'krk', group: 'matt', title: 'König + Turm gegen König', engine: 'tb', goal: 'mate', limit: 35, random: true,
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    intro: 'Der Turm schneidet den König Reihe für Reihe ab, der eigene König geht in Opposition (gegenüber, ein Feld dazwischen). Dann gibt der Turm Schach, und der König muss zurück.',
    tip: 'Bring deinen König gegenüber den anderen König. Wenn er ausweicht, rückt der Turm eine Reihe nach.'
  },
  {
    id: 'kbbk', group: 'matt', title: 'König + 2 Läufer gegen König', engine: 'bot', goal: 'mate', limit: 40, optional: true,
    fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', stars: [22, 30],
    intro: 'Für Fortgeschrittene: Die beiden Läufer stehen nebeneinander und bilden eine Wand, die der König nicht überqueren kann. Matt geht nur in einer Ecke. Hier verteidigt der Übungs-Computer (keine exakte Tabelle).',
    tip: 'Läufer nebeneinander auf die Mitte, König dicht heran. Schritt für Schritt in eine Ecke drängen – Patt vermeiden!'
  },
  {
    id: 'opposition', group: 'bauer', title: 'Opposition: Bauer durchbringen', engine: 'tb', goal: 'promote',
    fen: '8/8/4k3/8/3K4/8/4P3/8 w - - 0 1',
    intro: 'Opposition heißt: Die Könige stehen sich gegenüber, ein Feld dazwischen – und wer ziehen muss, muss weichen. Dein König geht VOR den Bauern, nicht dahinter. Hier gewinnt nur ein Zug.',
    tip: 'Erst der König nach vorn und in Opposition gehen, der Bauer kommt später.'
  },
  {
    id: 'opp-halten', group: 'bauer', title: 'Opposition: Remis halten', engine: 'tb', goal: 'hold', holdMoves: 15,
    fen: '8/8/8/3k4/8/4K3/4P3/8 b - - 0 1',
    intro: 'Jetzt verteidigst du mit Schwarz. Bleib vor dem Bauern und nimm die Opposition, wenn der weiße König vorrückt. Zieht der Bauer bis zur 7. Reihe, rettet oft ein Patt.',
    tip: 'Stell deinen König gegenüber den weißen König. Musst du weichen, dann gerade nach hinten, nicht zur Seite.'
  },
  {
    id: 'quadrat', group: 'bauer', title: 'Quadratregel: Lauf, Bauer!', engine: 'tb', goal: 'promote',
    fen: '8/8/6k1/8/1P6/8/8/6K1 w - - 0 1',
    intro: 'Zeichne in Gedanken ein Quadrat vom Bauern bis zur Grundreihe. Kann der König in dieses Quadrat hinein, holt er den Bauern ein – sonst nicht. Hier ist der schwarze König noch draußen.',
    tip: 'Zeit ist alles: Jeder Königszug von dir lässt den schwarzen König ins Quadrat.'
  },
  {
    id: 'quadrat-halten', group: 'bauer', title: 'Quadratregel: Einholen', engine: 'tb', goal: 'hold', holdMoves: 12,
    fen: '8/8/8/8/1P6/6k1/8/7K b - - 0 1',
    intro: 'Du hast Schwarz. Der weiße Bauer läuft – kannst du ihn noch einholen? Geh mit dem König in das Quadrat des Bauern und dann auf ihn zu.',
    tip: 'Schräg ziehen ist genauso schnell wie gerade: So kommst du am schnellsten ins Quadrat.'
  },
  {
    id: 'randbauer', group: 'bauer', title: 'Randbauer: in die Ecke', engine: 'tb', goal: 'hold', holdMoves: 15,
    fen: '8/8/4k3/1K6/8/P7/8/8 b - - 0 1',
    intro: 'Ein Bauer am Rand (a- oder h-Linie) gewinnt oft nicht: Erreicht der verteidigende König die Ecke vor dem Bauern, ist es Remis – er kommt da nicht mehr heraus, aber Weiß auch nicht weiter.',
    tip: 'Dein König will nach c8/b8 – dorthin, wo der Bauer umwandeln möchte.'
  },
  {
    id: 'durchbruch', group: 'bauer', title: 'Bauern-Durchbruch', engine: 'bot', goal: 'promote', limit: 15,
    fen: '6k1/ppp5/8/PPP5/8/8/8/6K1 w - - 0 1',
    intro: 'Drei gegen drei Bauern, die Könige sind weit weg. Mit einem Opfer bricht ein Bauer durch. Der mittlere Bauer macht den Anfang!',
    tip: 'Zieh den mittleren Bauern vor. Egal, wie Schwarz schlägt: Danach opferst du noch einmal.'
  },
  {
    id: 'lucena', group: 'turm', title: 'Lucena: Brücke bauen', engine: 'bot', goal: 'promote', limit: 30,
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    intro: 'Dein Bauer steht vor der Umwandlung, aber der eigene König steht davor, und der schwarze Turm gibt Schach von der Seite. Der Trick heißt „Brücke bauen“: Erst den schwarzen König mit Schach vertreiben, dann den Turm auf die 4. Reihe – er fängt später die Schachs ab.',
    tip: 'Schach auf der d-Linie, dann Turm nach d4. Danach marschiert dein König heraus und der Turm schirmt ab.'
  },
  {
    id: 'philidor', group: 'turm', title: 'Philidor: Remis halten', engine: 'bot', goal: 'hold', holdMoves: 20,
    fen: '4k3/R7/8/3KP3/8/8/8/7r b - - 0 1',
    intro: 'Du hast Schwarz, Weiß hat einen Bauern mehr. Philidors Methode: Dein Turm bleibt auf der 6. Reihe und lässt den weißen König nicht nach vorn. Zieht der Bauer auf die 6. Reihe, gibt dein Turm von hinten Schach.',
    tip: 'Turm auf die 6. Reihe (h6). Erst wenn der Bauer e6 zieht, geht der Turm ganz nach hinten und gibt Schach.'
  }
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id) || null;

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Material je Farbe (Bauerneinheiten) und Anzahl Bauern
export function materialOfFen(fen) {
  const out = { w: 0, b: 0, wp: 0, bp: 0 };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase();
    if (!(t in VALUE)) continue;
    const c = ch === t ? 'b' : 'w';
    out[c] += VALUE[t];
    if (t === 'p') out[c + 'p']++;
  }
  return out;
}

// Seite, die die Lektion spielt = Seite am Zug in der Startstellung
export const userColorOf = (lesson) => lesson.fen.split(' ')[1];

// Zufällige Startstellung für K+D / K+T: gewonnen für die Seite am Zug, nicht zu kurz, Könige nicht am Rand
export function randomFen(lesson, rng = Math.random) {
  if (!lesson.random) return lesson.fen;
  const piece = lesson.id === 'kqk' ? 'Q' : 'R';
  const minDtm = lesson.id === 'kqk' ? 13 : 23;
  for (let tries = 0; tries < 2000; tries++) {
    const sq = () => Math.floor(rng() * 64);
    const wk = sq(), bk = sq(), x = sq();
    if (new Set([wk, bk, x]).size < 3) continue;
    const rows = Array.from({ length: 8 }, () => Array(8).fill(null));
    const put = (s, c) => { rows[7 - (s >> 3)][s & 7] = c; };
    put(wk, 'K'); put(bk, 'k'); put(x, piece);
    const board = rows.map((r) => { let o = '', e = 0; for (const c of r) { if (!c) e++; else { if (e) o += e; e = 0; o += c; } } return o + (e ? e : ''); }).join('/');
    const fen = `${board} w - - 0 1`;
    const bf = bk & 7, br = bk >> 3;
    if (bf === 0 || bf === 7 || br === 0 || br === 7) continue;
    try {
      const p = probe(fen);
      if (p.result === 'win' && p.dtm >= minDtm) return fen;
    } catch { /* illegal */ }
  }
  return lesson.fen;
}

// Exakte Einschätzung der Stellung (nur tb-Lektionen): aus Sicht der Seite am Zug
export function tbProbe(fen) {
  try {
    return materialOf(fen) ? probe(fen) : null;
  } catch {
    return null;
  }
}

// Zug des Computers in tb-Lektionen.
// Verteidigt er (verliert er): längster Widerstand. Gewinnt er: kürzester Weg.
// Remis-Stellung und er ist die starke Seite (Lektion „Remis halten“): ein Remis-Zug, der dem Menschen am wenigsten
// gute Antworten lässt (Fallen stellen), Bauer nicht einstellen.
export function tbReply(fen, rng = Math.random) {
  const p = probe(fen);
  if (p.result !== 'draw') return bestMove(fen, { rng });
  const mat = materialOf(fen);
  const me = fen.split(' ')[1];
  if (!mat || mat.strong !== me) return bestMove(fen, { rng });
  const cands = scoreMoves(fen).filter((m) => m.result === 'draw');
  let best = null, bestScore = Infinity;
  for (const m of cands) {
    const c = new Chess(fen);
    c.move({ from: m.from, to: m.to, promotion: m.promo });
    const after = c.fen();
    const mm = materialOf(after);
    if (!mm) continue; // Bauer/Figur geht verloren oder Umwandlung in K gegen K
    let replies;
    try { replies = scoreMoves(after); } catch { continue; }
    if (!replies.length) continue; // Patt: lieber vermeiden
    // weniger gute Antworten = schwerer für den Menschen; bei Gleichstand Zufall
    const score = replies.filter((r) => r.result !== 'loss').length + rng() * 0.5;
    if (score < bestScore) { bestScore = score; best = m; }
  }
  if (!best) return bestMove(fen, { rng });
  return best.promo ? { from: best.from, to: best.to, promo: best.promo } : { from: best.from, to: best.to };
}

// Sterne für Matt-Lektionen nach Zugzahl; optimal = kürzester Weg laut Tabelle (nur tb), sonst feste Grenzen
export function mateStars(lesson, moves, optimal) {
  if (moves > lesson.limit) return 0;
  const [s3, s2] = lesson.stars || [optimal + 2, optimal + 8];
  return moves <= s3 ? 3 : moves <= s2 ? 2 : 1;
}

// Hilfe kostet Sterne: 0 Tipps = 3, 1 = 2, mehr = 1
export const helpStars = (hints) => (hints <= 0 ? 3 : hints === 1 ? 2 : 1);

/**
 * Ziel erreicht? Nach jedem Zug (des Menschen oder des Computers) aufrufen.
 * st = { lesson, fen, user: 'w'|'b', moves (Züge des Menschen), promoted (Mensch hat umgewandelt), lastBy: 'user'|'cpu',
 *        rep: Anzahl Wiederholungen der Stellung, start: { optimal } }
 * → { done: false } | { done: true, ok: true|false, reason: '…' }
 */
export function checkGoal(st) {
  const { lesson, fen, user } = st;
  const c = new Chess(fen);
  const opp = user === 'w' ? 'b' : 'w';
  const mat = materialOfFen(fen);
  const lead = mat[user] - mat[opp];
  const myPawns = mat[user + 'p'];
  const oppPawns = mat[opp + 'p'];
  const toMove = c.turn();
  if (c.isCheckmate()) {
    if (toMove === opp) return lesson.goal === 'mate' || lesson.goal === 'promote' ? { done: true, ok: true, reason: 'Schachmatt!' } : { done: true, ok: true, reason: 'Du setzt sogar matt!' };
    return { done: true, ok: false, reason: 'Du bist matt.' };
  }
  const stalemate = c.isStalemate();
  const drawish = stalemate || c.isInsufficientMaterial() || (st.rep || 0) >= 3;
  if (lesson.goal === 'hold') {
    if (stalemate) return { done: true, ok: true, reason: 'Patt – Remis gehalten!' };
    if (oppPawns === 0 && lead >= 0) return { done: true, ok: true, reason: 'Kein Bauer mehr übrig – Remis gehalten!' };
    if (drawish) return { done: true, ok: true, reason: 'Remis – gut verteidigt!' };
    if (lesson.engine === 'tb') {
      // die Tabelle entscheidet (eine frisch umgewandelte Dame, die man schlagen kann, ist noch Remis)
      const p = tbProbe(fen);
      const cpuWins = p && (st.lastBy === 'user' ? p.result === 'win' : p.result === 'loss');
      if (cpuWins || (!p && lead <= -5)) return { done: true, ok: false, reason: st.lastBy === 'user' ? 'Jetzt gewinnt der Computer – der Zug war ein Fehler.' : 'Der Bauer ist durchgekommen.', mistake: st.lastBy === 'user' };
    } else if (lead <= -4) return { done: true, ok: false, reason: oppPawns === 0 ? 'Der Bauer ist durchgekommen.' : 'Zu viel Material verloren.' };
    if (st.moves >= lesson.holdMoves && st.lastBy === 'cpu') return { done: true, ok: true, reason: `${lesson.holdMoves} Züge gehalten – Remis!` };
    return { done: false };
  }
  // Gewinn-Lektionen
  if (drawish) return { done: true, ok: false, reason: stalemate ? 'Patt – nur Remis.' : (st.rep || 0) >= 3 ? 'Dreimal dieselbe Stellung – Remis.' : 'Zu wenig Material – Remis.' };
  if (lesson.goal === 'mate') {
    if (mat[user] < (lesson.id === 'kbbk' ? 6 : 5)) return { done: true, ok: false, reason: 'Figur verloren – jetzt reicht es nicht mehr zum Matt.' };
    if (st.moves >= lesson.limit && st.lastBy === 'user') return { done: true, ok: false, reason: `Kein Matt in ${lesson.limit} Zügen.` };
    if (lesson.engine === 'tb') {
      const p = tbProbe(fen);
      if (p && p.result === 'draw') return { done: true, ok: false, reason: 'Jetzt ist es nur noch Remis.', mistake: true };
    }
    return { done: false };
  }
  // goal 'promote'
  if (lesson.engine === 'tb') {
    const p = tbProbe(fen);
    if (st.promoted) {
      // nach der Umwandlung: Gewinn muss bleiben (Gegner am Zug → für ihn verloren)
      if (!p || p.result === 'draw') return { done: true, ok: false, reason: 'Umgewandelt, aber die neue Figur geht verloren.', mistake: true };
      return { done: true, ok: true, reason: 'Umgewandelt – das gewinnt!' };
    }
    if (!p || p.result === 'draw') return { done: true, ok: false, reason: oppPawns || myPawns ? 'Jetzt ist es nur noch Remis.' : 'Bauer verloren – Remis.', mistake: true };
    return { done: false };
  }
  // bot: Durchbruch, Lucena
  if (oppPawns === 0 && mat[opp] >= 9 && lead < 4 && !st.promoted) return { done: true, ok: false, reason: 'Der Gegner hat zuerst umgewandelt.' };
  if (st.promoted && lead >= 4) return { done: true, ok: true, reason: 'Umgewandelt – das gewinnt!' };
  if (!st.promoted && myPawns === 0) return { done: true, ok: false, reason: 'Kein Bauer mehr – das gewinnt nicht mehr.' };
  if (st.moves >= lesson.limit && st.lastBy === 'user') return { done: true, ok: false, reason: `Keine Umwandlung in ${lesson.limit} Zügen.` };
  return { done: false };
}
