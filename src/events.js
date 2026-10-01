// Spielereignisse eines Zugs für das Banner am Brett und die Ereignis-Liste („Was ist passiert?“).
// Nur öffentliche Dinge (was alle am Tisch sehen), nie verdeckte Karten. Ohne DOM → läuft in Node-Tests.
// big = wichtig genug für das Banner (gezeigt, wenn es jemand anderes war; siehe tablescreen.js).
import { SUIT_NAMES as SN_SUITS } from './games/schnapsen/engine.js';
import { inCheck } from './games/schach/engine.js';
import { applySteps } from './games/backgammon/engine.js';
import { bankReveal } from './tempo.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const DE_NAMES = { A: 'Daus', Z: 'Zehner', K: 'König', O: 'Ober', U: 'Unter' };
const deCardName = (c) => (c ? `${SN_SUITS[c[0]]}-${DE_NAMES[c[1]]}` : '?');

// ctx: { game, move, by, prevGs, gs, d (Zugtext), name(seat), you(seat) → true, wenn der Spieler an diesem Gerät }
export function moveEvents({ game, move, by, prevGs, gs, d = '', name = (s) => `Spieler ${s + 1}`, you = () => false }) {
  if (!move || !gs) return [];
  const out = [];
  // er = 3. Person („Computer sagt 40 an“), du = 2. Person („Du sagst 40 an“)
  const ev = (seat, er, du, big = true) => out.push({ seat, big, text: you(seat) ? `Du ${du}` : `${name(seat)} ${er}` });
  const note = (seat, text, big = false) => out.push({ seat, big, text });
  try {
    switch (game) {
      case 'schnapsen': {
        if (move.type === 'ansagen') {
          const pts = move.suit === gs.atout ? 40 : 20;
          ev(by, `sagt ${pts} an (${SN_SUITS[move.suit]})`, `sagst ${pts} an (${SN_SUITS[move.suit]})`);
        } else if (move.type === 'tauschen') ev(by, 'tauscht den Atout-Unter', 'tauschst den Atout-Unter');
        else if (move.type === 'zudrehen') ev(by, 'dreht zu', 'drehst zu');
        else if (move.type === 'ausmelden') ev(by, 'meldet sich aus', 'meldest dich aus');
        else if (move.type === 'play' && prevGs && prevGs.trick && prevGs.trick.length === 1 && gs.lastTrick) {
          const w = gs.lastTrick.winner;
          const cards = gs.lastTrick.cards.map((x) => deCardName(x.card)).join(', ');
          note(w, you(w) ? `Dein Stich (${cards})` : `Stich für ${name(w)} (${cards})`);
        }
        if (gs.spiel && prevGs && prevGs.phase === 'play' && gs.phase !== 'play') {
          const sp = gs.spiel;
          const pts = plural(sp.points, 'Punkt', 'Punkte');
          note(sp.winner, you(sp.winner) ? `Du gewinnst das Spiel: ${pts} (${sp.reason})` : `${name(sp.winner)} gewinnt das Spiel: ${pts} (${sp.reason})`, true);
        }
        break;
      }
      case 'schach': {
        if (/O-O/.test(d)) ev(by, 'macht die Rochade', 'machst die Rochade', false);
        if (move.promo) ev(by, 'wandelt einen Bauern um', 'wandelst einen Bauern um');
        if (/#/.test(d)) note(by, 'Schachmatt!', true);
        else if (inCheck(gs)) note(by, you(1 - by) ? 'Schach! Dein König wird angegriffen' : 'Schach!', true);
        else if (/x/.test(d)) ev(by, `schlägt (${d})`, `schlägst (${d})`, false);
        break;
      }
      case 'muehle':
        if (move.remove !== undefined) note(by, you(by) ? 'Mühle – du nimmst einen Stein' : `Mühle – ${name(by)} nimmt einen Stein`, true);
        break;
      case 'dame': {
        if (move.puste !== undefined) { ev(by, 'pustet einen Stein weg', 'pustest einen Stein weg'); break; }
        const n = (move.cap || []).length;
        if (n) ev(by, `schlägt ${plural(n, 'Stein', 'Steine')}`, `schlägst ${plural(n, 'Stein', 'Steine')}`, true);
        const to = move.path && move.path[move.path.length - 1];
        if (prevGs && to !== undefined && Math.abs(prevGs.board[move.from]) === 1 && Math.abs(gs.board[to]) === 2) ev(by, 'bekommt eine Dame', 'bekommst eine Dame');
        break;
      }
      case 'backgammon': {
        if (move.type === 'roll' && gs.dice) {
          const [a, b] = gs.dice;
          if (a === b) note(by, you(by) ? `Pasch! Du würfelst ${a} × ${a}` : `Pasch! ${name(by)} würfelt ${a} × ${a}`, true);
          else ev(by, `würfelt ${a} und ${b}`, `würfelst ${a} und ${b}`, false);
        } else if (move.type === 'double') ev(by, `verdoppelt auf ${prevGs ? prevGs.cube.value * 2 : '?'}`, `verdoppelst auf ${prevGs ? prevGs.cube.value * 2 : '?'}`);
        else if (move.type === 'take') ev(by, 'nimmt an', 'nimmst an');
        else if (move.type === 'drop') ev(by, 'gibt auf', 'gibst auf');
        else if (move.type === 'play') {
          if (!move.steps.length) ev(by, 'kann nicht ziehen', 'kannst nicht ziehen');
          else if (prevGs && prevGs.phase === 'move') {
            const hits = applySteps(prevGs, move.steps).hits || 0;
            if (hits) ev(by, `schlägt ${hits === 1 ? 'einen Stein' : hits + ' Steine'} auf die Bar`, `schlägst ${hits === 1 ? 'einen Stein' : hits + ' Steine'} auf die Bar`);
          }
        }
        break;
      }
      case 'blackjack': {
        if (bankReveal(prevGs, gs, move)) {
          const lr = gs.lastRound;
          const bank = lr.bankBJ ? 'Bank hat Black Jack' : `Bank hat ${lr.bankTotal}${lr.bankBust ? ' – überkauft' : ''}`;
          const mine = [];
          for (let p = 0; p < (lr.hands || []).length; p++) {
            if (!you(p) || !lr.hands[p].length) continue;
            const w = lr.delta ? lr.delta[p] : 0;
            mine.push(`du ${w > 0 ? 'gewinnst' : w < 0 ? 'verlierst' : 'spielst unentschieden'}${w ? ` ${String(Math.abs(w)).replace('.', ',')}` : ''}`);
          }
          note(lr.bank, mine.length ? `${bank} – ${mine.join(', ')}` : bank, true);
        } else if (move.type === 'double') ev(by, 'verdoppelt', 'verdoppelst', false);
        else if (move.type === 'split') ev(by, 'teilt', 'teilst', false);
        break;
      }
      case 'ludo': {
        if (move.type === 'roll' && gs.lastRoll && gs.lastRoll.seat === by) {
          const v = gs.lastRoll.value, why = gs.lastRoll.reason;
          if (why) ev(by, `würfelt ${v} – ${why}`, `würfelst ${v} – ${why}`, false);
          else ev(by, v === 6 ? 'würfelt eine 6' : `würfelt ${v}`, v === 6 ? 'würfelst eine 6' : `würfelst ${v}`, false);
        } else if (move.type === 'move' && gs.last) {
          const l = gs.last, c = l.capture;
          if (c) note(by, you(c.seat) ? `${name(by)} schlägt deine Figur!` : you(by) ? `Du schlägst ${name(c.seat)}!` : `${name(by)} schlägt ${name(c.seat)}!`, true);
          if (l.from < 0) ev(by, 'kommt raus', 'kommst raus', false);
          else if (l.to >= 40 && l.from < 40) ev(by, 'bringt eine Figur ins Ziel', 'bringst eine Figur ins Ziel', false);
        }
        break;
      }
      case 'paare': {
        const l = gs.last;
        if (l && l.match && l.seat === by && l.b === move.flip) {
          const NAMES = ['Hund', 'Katze', 'Maus', 'Hase', 'Fuchs', 'Bär', 'Panda', 'Koala', 'Tiger', 'Löwe', 'Kuh', 'Schwein', 'Frosch', 'Affe', 'Huhn', 'Pinguin', 'Eule', 'Schildkröte'];
          note(by, you(by) ? `Paar! ${NAMES[l.motif]}` : `${name(by)} findet ein Paar: ${NAMES[l.motif]}!`, true);
        }
        break;
      }
      case 'reversi': {
        if (move.pass) { note(by, you(by) ? 'Du musst passen' : `${name(by)} muss passen`, true); break; }
        const l = gs.last;
        if (!l || l.i !== move.i) break;
        const n = (l.flipped || []).length;
        if ([0, 7, 56, 63].includes(move.i)) ev(by, `nimmt eine Ecke (dreht ${plural(n, 'Stein', 'Steine')} um)`, `nimmst eine Ecke (drehst ${plural(n, 'Stein', 'Steine')} um)`, true);
        else if (n >= 5) ev(by, `dreht ${n} Steine um`, `drehst ${n} Steine um`, false);
        break;
      }
      case 'wuerfel': {
        if (move.type === 'roll' && gs.dice && gs.dice.every((x) => x === gs.dice[0])) note(by, you(by) ? `Fünferpasch! Du würfelst 5 × ${gs.dice[0]}` : `Fünferpasch! ${name(by)} würfelt 5 × ${gs.dice[0]}`, true);
        else if (move.type === 'score' && d) note(by, `${you(by) ? 'Du' : name(by)} – ${d}`, !you(by) && /Fünferpasch|Große Straße|Full House|extra|Extra/.test(d));
        break;
      }
      case 'maumau': {
        const l = gs.last;
        if (!l || l.seat !== by) break;
        const SN = { H: 'Herz', S: 'Schellen', L: 'Laub', E: 'Eichel' };
        if (l.type === 'play') {
          if (l.wish) ev(by, `wünscht sich ${SN[l.wish]}`, `wünschst dir ${SN[l.wish]}`);
          if (l.penalty) note(by, you(gs.turn) ? `${name(by)} legt eine 7 – du musst ${l.penalty} ziehen oder kontern!` : `${you(by) ? 'Du legst' : name(by) + ' legt'} eine 7 – ${name(gs.turn)} muss ${l.penalty} ziehen`, you(gs.turn));
          if (l.skipped !== undefined) note(by, you(l.skipped) ? `${name(by)} legt ein Daus – du setzt aus` : `${name(l.skipped)} setzt aus`, you(l.skipped));
          if (l.mau) ev(by, 'sagt „Mau!“', 'sagst „Mau!“');
          if (l.mauMissed) note(by, you(by) ? 'Du hast „Mau“ vergessen – 2 Strafkarten' : `${name(by)} hat „Mau“ vergessen – 2 Strafkarten`, true);
        } else if (l.type === 'draw') {
          if (l.strafe) ev(by, `zieht ${l.n || l.strafe} Strafkarten`, `ziehst ${l.n || l.strafe} Strafkarten`, false);
          else ev(by, 'zieht eine Karte', 'ziehst eine Karte', false);
        }
        break;
      }
      case 'schiffe': {
        if (move.type === 'place') { ev(by, 'hat die Flotte aufgestellt', 'hast deine Flotte aufgestellt', false); break; }
        const l = gs.last;
        if (move.type !== 'shot' || !l || l.i !== move.i) break;
        const cell = 'ABCDEFGHIJ'[Math.floor(move.i / 10)] + (move.i % 10 + 1);
        const opp = 1 - by;
        if (l.sunk !== null && l.sunk !== undefined) {
          note(by, you(by) ? `Versenkt! (${cell})` : you(opp) ? `${name(by)} versenkt dein Schiff (${cell})!` : `${name(by)} versenkt ein Schiff (${cell})`, true);
        } else if (l.hit) note(by, you(by) ? `Treffer auf ${cell}!` : you(opp) ? `${name(by)} trifft dein Schiff auf ${cell}!` : `${name(by)} trifft auf ${cell}`, true);
        else note(by, you(by) ? `${cell}: Wasser` : `${name(by)} schießt auf ${cell} – Wasser`, false);
        break;
      }
      case 'halma':
        if (move.path && move.path.length >= 3) ev(by, `springt ${move.path.length}-mal`, `springst ${move.path.length}-mal`, false);
        break;
    }
  } catch { /* Ereignisse sind nur Zugabe – nie das Spiel stören */ }
  return out;
}
