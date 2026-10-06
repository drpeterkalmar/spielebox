// Kriegsschiffe in der Draufsicht (n8, 06.10.2026): eine Typ-Tabelle → Rumpf, Deck, Türme, Aufbauten, Bug-/Heckwelle.
// Reine Geometrie ohne DOM (Node-Test prüft Maße und Grenzen): Alles in Feld-Einheiten, das Schiff liegt waagrecht in
// 0 … len × 0 … 1, Heck links (x klein), Bug rechts. Die Ansicht dreht/spiegelt das per transform (dir 'v', Fahrtrichtung)
// und legt die Teile einmal je Typ, Länge, Detailstufe und Zustand als <g> in die gemeinsamen Defs (Zeichnen = <use>).
// Stil: zeitlos-klassisch wie im Brettspiel (Zweiter Weltkrieg), keine Flaggen, Hoheitszeichen oder Symbole realer Staaten.
// Vorher (Deko n7): Kapsel rect rx = halbe Breite mit Stahl-Verlauf, Deck-Linie, je Feld ein Kreis als Turm (Ø 0,26 Feld).
export const PAD = 0.14;     // Abstand Rumpf ↔ Feldrand (wie bisher), Schaukeln eingerechnet
export const EDGE = 0.04;    // Bug-/Heckwelle und Rauch bleiben mindestens so weit vom Feldrand weg

// Typ-Tabelle: hw = halbe Rumpfbreite, bow/stern = Länge von Bug-Spitze bzw. Heck-Rundung (Feld), stern: Heckform,
// deck: Deckfarbe, rock: Schaukeln (Grad, Versatz in Feld), parts: Aufbauten je Länge (t = Lage 0 Heck … 1 Bug)
export const TYPES = {
  traeger: {
    name: 'Flugzeugträger', hw: 0.3, bow: 1.0, stern: 0.25, sternForm: 'transom', deck: '#6b6e6a', hull: '#7a838b',
    rock: { deg: 0.5, d: 0.016 }
  },
  schlacht: {
    name: 'Schlachtschiff', hw: 0.33, bow: 1.25, stern: 0.5, sternForm: 'round', deck: '#b8a07a', hull: '#7c868f', planks: true,
    rock: { deg: 0.5, d: 0.016 }
  },
  kreuzer: {
    name: 'Kreuzer', hw: 0.27, bow: 1.1, stern: 0.4, sternForm: 'round', deck: '#a4adb4', hull: '#78838c',
    rock: { deg: 0.8, d: 0.02 }
  },
  zerstoerer: {
    name: 'Zerstörer', hw: 0.23, bow: 0.95, stern: 0.3, sternForm: 'transom', deck: '#a9b2b9', hull: '#76818a',
    rock: { deg: 1.2, d: 0.022 }
  },
  uboot: {
    name: 'U-Boot', hw: 0.19, bow: 0.55, stern: 0.7, sternForm: 'cigar', deck: '#48505a', hull: '#3b424b',
    rock: { deg: 1.0, d: 0.018 }
  },
  schnell: {
    name: 'Schnellboot', hw: 0.25, bow: 1.15, stern: 0.08, sternForm: 'transom', deck: '#c3cacf', hull: '#808b94',
    rock: { deg: 1.5, d: 0.022 }
  }
};
// Wrack: liegt schief (feste Schräglage, höchstens tilt Grad – lange breite Rümpfe weniger, damit nichts über den
// Rand ragt) und schaukelt nur träge
export const WRECK = { tilt: 2.2, deg: 0.3, d: 0.01 };
export const MIN_EDGE = 0.13;   // Rumpf ↔ Feldrand mindestens (Schaukeln und Schräglage eingerechnet)

const NAME_TO_TYPE = { 'Flugzeugträger': 'traeger', 'Schlachtschiff': 'schlacht', 'Kreuzer': 'kreuzer', 'Zerstörer': 'zerstoerer', 'U-Boot': 'uboot', 'Schnellboot': 'schnell' };
export const typeOf = (name, len) => NAME_TO_TYPE[name] || (len >= 5 ? 'schlacht' : len === 4 ? 'kreuzer' : len === 3 ? 'zerstoerer' : 'schnell');

const f = (v) => (Math.round(v * 1000) / 1000).toString();

// Halbe Breite an der Stelle x (Heck x0 … Bug x1)
function widthAt(T, x, x0, x1, hw = T.hw) {
  const xs = x0 + T.stern, xb = x1 - T.bow;
  if (x >= xb) {
    const t = Math.min(1, (x - xb) / T.bow);
    // U-Boot: runder Bug (Ellipse); sonst spitz zulaufend (Ogive), ganz vorn eine feine Spitze
    return T.sternForm === 'cigar' ? hw * Math.sqrt(Math.max(0, 1 - t * t)) : hw * Math.pow(1 - t * t, 0.75) * (1 - 0.15 * t);
  }
  if (x <= xs) {
    const t = Math.min(1, (xs - x) / T.stern);
    if (T.sternForm === 'transom') return hw * (1 - 0.18 * t * t);        // gerades Spiegelheck
    if (T.sternForm === 'cigar') return hw * Math.sqrt(Math.max(0, 1 - t * t)) ;
    return hw * Math.sqrt(Math.max(0, 1 - 0.82 * t * t));                  // abgerundetes Heck
  }
  return hw;
}

// Umriss als Punktliste (oben vom Heck zum Bug, unten zurück) und als Pfad
export function outline(type, len, inset = 0) {
  const T = TYPES[type];
  const x0 = PAD + 0.02 + inset * 1.2, x1 = len - PAD - 0.02 - inset * 2.2, hw = T.hw - inset;
  const N = 28, top = [], bot = [];
  for (let k = 0; k <= N; k++) {
    // Stützstellen dichter an Bug und Heck
    const u = k / N, x = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const w = widthAt(T, x, x0, x1, hw);
    top.push([x, 0.5 - w]); bot.push([x, 0.5 + w]);
  }
  const pts = top.concat(bot.reverse());
  const d = 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
  return { d, pts, x0, x1, hw };
}

// Bug- und Heckwelle (offene Linien) + Punkte für den Grenztest
export function wake(type, len) {
  const T = TYPES[type];
  const { x0, x1, hw } = outline(type, len);
  const s = type === 'schnell' ? 1.6 : type === 'uboot' ? 0.7 : 1;
  const yb = Math.min(hw + 0.05 * s, 0.36);
  const bow = `M${f(x1 + 0.015)} .5Q${f(x1 - 0.18)} ${f(0.5 - hw * 0.75)} ${f(x1 - 0.55)} ${f(0.5 - yb)}M${f(x1 + 0.015)} .5Q${f(x1 - 0.18)} ${f(0.5 + hw * 0.75)} ${f(x1 - 0.55)} ${f(0.5 + yb)}`;
  const xe = Math.max(EDGE + 0.02, x0 - 0.1 * s);
  const ws = T.sternForm === 'cigar' ? hw * 0.35 : hw * 0.8;
  const stern = `M${f(x0)} ${f(0.5 - ws)}Q${f(x0 - 0.04)} .5 ${f(x0)} ${f(0.5 + ws)}M${f(x0 + 0.02)} ${f(0.5 - ws * 0.6)}L${f(xe)} ${f(0.5 - ws * 1.05)}M${f(x0 + 0.02)} ${f(0.5 + ws * 0.6)}L${f(xe)} ${f(0.5 + ws * 1.05)}`;
  const foam = { cx: f((x0 + xe) / 2 + 0.01), rx: f(Math.max(0.02, (x0 - xe) / 2 + 0.02)), ry: f(ws * 0.9) };
  const pts = [[x1 + 0.015, 0.5], [x1 - 0.55, 0.5 - yb], [x1 - 0.55, 0.5 + yb], [xe, 0.5 - ws * 1.05], [xe, 0.5 + ws * 1.05]];
  return { bow, stern, foam, pts, s };
}

// ---------- Aufbauten ----------
const C = { gun: '#8b959d', gunD: '#4a535b', line: '#2f3a43', light: 'rgba(255,255,255,.35)', bridge: '#c5ccd2', funnel: '#59636c', top: '#1f2429', win: '#2b343c' };
const W = { gun: '#463a33', gunD: '#1c1512', line: '#1a120e', light: 'rgba(255,190,150,.14)', bridge: '#62513f', funnel: '#2f2622', top: '#0e0b0a', win: '#120e0c' };

// Geschützturm bei (x, .5), Rohre zur Seite dir (+1 Bug, −1 Heck), n Rohre; simple = nur Punkt
function turret(x, r, n, dir, P, simple) {
  if (simple) return `<circle class="tu" cx="${f(x)}" cy=".5" r="${f(r * 0.85)}" fill="${P.gunD}"/>`;
  let o = '';
  const len = r * (n >= 3 ? 2.3 : 2.1), gap = r * (n >= 3 ? 0.42 : n === 2 ? 0.5 : 0);
  for (let k = 0; k < n; k++) {
    const y = 0.5 + (k - (n - 1) / 2) * gap;
    o += `<path d="M${f(x)} ${f(y)}H${f(x + dir * (r * 0.5 + len))}" stroke="${P.gunD}" stroke-width="${f(r * 0.24)}" stroke-linecap="round"/>`;
  }
  // Turm: vorn rund, hinten flach (Panzerung), heller Rand oben
  const b = x - dir * r * 0.85;
  o += `<path d="M${f(b)} ${f(0.5 - r * 0.8)}L${f(x)} ${f(0.5 - r)}A${f(r)} ${f(r)} 0 0 ${dir > 0 ? 1 : 0} ${f(x)} ${f(0.5 + r)}L${f(b)} ${f(0.5 + r * 0.8)}Z" class="tu" fill="${P.gun}" stroke="${P.line}" stroke-width="${f(r * 0.14)}"/>`;
  o += `<circle cx="${f(x - dir * r * 0.15)}" cy="${f(0.5 - r * 0.25)}" r="${f(r * 0.28)}" fill="${P.light}"/>`;
  return o;
}
const rect = (x, y, w, h, rx, fill, P, sw = 0.014) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}" stroke="${P.line}" stroke-width="${f(sw)}"/>`;
function funnel(x, rx, ry, P, simple) {
  if (simple) return `<ellipse cx="${f(x)}" cy=".5" rx="${f(rx)}" ry="${f(ry)}" fill="${P.funnel}"/>`;
  return `<ellipse cx="${f(x)}" cy=".5" rx="${f(rx)}" ry="${f(ry)}" fill="${P.funnel}" stroke="${P.line}" stroke-width=".014"/><ellipse cx="${f(x + rx * 0.08)}" cy=".5" rx="${f(rx * 0.62)}" ry="${f(ry * 0.6)}" fill="${P.top}"/>`;
}
// Brücke: zwei Stufen, vorne Fensterband
function bridge(x, l, w, P, simple) {
  if (simple) return `<rect x="${f(x - l / 2)}" y="${f(0.5 - w / 2)}" width="${f(l)}" height="${f(w)}" rx="${f(w * 0.25)}" fill="${P.bridge}"/>`;
  return rect(x - l / 2, 0.5 - w / 2, l, w, w * 0.22, P.bridge, P) +
    rect(x - l * 0.05, 0.5 - w * 0.34, l * 0.5, w * 0.68, w * 0.2, P.bridge, P) +
    `<path d="M${f(x + l * 0.42)} ${f(0.5 - w * 0.28)}V${f(0.5 + w * 0.28)}" stroke="${P.win}" stroke-width="${f(w * 0.12)}" stroke-linecap="round"/>`;
}
// kleines Flugzeug von oben (Rumpf, Flügel, Leitwerk), Nase in Richtung +x
const plane = (x, y, s, rot, col) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${f(s)})"><path d="M-.5 0H.55M-.08 -.55L.02 -.55L.12 0L.02 .55L-.08 .55L0 0Z M-.5 -.2H-.38V.2H-.5Z" fill="${col}" stroke="${col}" stroke-width=".09" stroke-linejoin="round"/></g>`;

// Deck-Teile je Typ (ohne Rumpf); wreck = verkohlt, simple = Mini-Karte (nur Silhouette + Punkte)
export function details(type, len, { wreck = false, simple = false } = {}) {
  const T = TYPES[type];
  const P = wreck ? W : C;
  const o = outline(type, len), x0 = o.x0, x1 = o.x1, L = x1 - x0;
  const at = (t) => x0 + L * t;
  const deck = outline(type, len, type === 'traeger' ? 0.018 : 0.035);
  let s = `<path d="${deck.d}" fill="${wreck ? '#5e4c3f' : T.deck}"/>`;
  if (T.planks && !simple) {
    // Planken (nur im geraden Mittelteil, längs)
    const a = x0 + T.stern, b = x1 - T.bow * 0.75;
    for (let k = -3; k <= 3; k++) s += `<path d="M${f(a)} ${f(0.5 + k * 0.07)}H${f(b)}" stroke="${wreck ? 'rgba(0,0,0,.25)' : 'rgba(90,60,30,.22)'}" stroke-width=".008"/>`;
  }
  if (!simple && type !== 'traeger') s += `<path d="M${f(x0 + 0.08)} .5H${f(x1 - 0.12)}" stroke="${wreck ? 'rgba(0,0,0,.25)' : 'rgba(40,50,60,.18)'}" stroke-width=".012"/>`;
  const big = len >= 5;
  switch (type) {
    case 'schlacht': {
      const r = big ? 0.14 : 0.13;
      const pos = big ? [[0.82, 1], [0.71, 1], [0.26, -1], [0.155, -1]] : [[0.8, 1], [0.67, 1], [0.2, -1]];
      for (const [t, dir] of pos) s += turret(at(t), r, 3, dir, P, simple);
      s += funnel(at(big ? 0.44 : 0.42), 0.15, 0.14, P, simple);
      s += bridge(at(big ? 0.56 : 0.545), 0.4, 0.36, P, simple);
      if (!simple) s += rect(at(big ? 0.35 : 0.32) - 0.1, 0.37, 0.2, 0.26, 0.05, P.bridge, P);
      break;
    }
    case 'kreuzer': {
      for (const [t, dir] of [[0.8, 1], [0.7, 1], [0.17, -1]]) s += turret(at(t), 0.105, 2, dir, P, simple);
      s += bridge(at(0.585), 0.32, 0.3, P, simple);
      s += funnel(at(0.465), 0.1, 0.1, P, simple) + funnel(at(0.38), 0.1, 0.1, P, simple);
      if (!simple) s += rect(at(0.28) - 0.08, 0.4, 0.16, 0.2, 0.04, P.bridge, P);
      break;
    }
    case 'zerstoerer': {
      s += turret(at(0.8), 0.088, 1, 1, P, simple) + turret(at(0.14), 0.088, 1, -1, P, simple);
      s += bridge(at(0.655), 0.26, 0.26, P, simple);
      s += funnel(at(0.525), 0.085, 0.085, P, simple);
      if (!simple) {
        // Torpedorohre: zwei Dreiergruppen, schräg zur Seite
        for (const [t, a] of [[0.38, 18], [0.27, -18]]) {
          s += `<g transform="translate(${f(at(t))} .5) rotate(${a})">` + [-0.045, 0, 0.045].map((y) => `<path d="M-.13 ${y}H.13" stroke="${P.gunD}" stroke-width=".028" stroke-linecap="round"/>`).join('') + '</g>';
        }
      }
      break;
    }
    case 'uboot': {
      // Turm (Segel) mittig, Deckgeschütz vorn, Lukenlinie; flach im Wasser
      const sx = at(0.55);
      s += `<path d="M${f(sx - 0.2)} .5Q${f(sx - 0.18)} ${f(0.5 - 0.09)} ${f(sx)} ${f(0.5 - 0.09)}L${f(sx + 0.12)} ${f(0.5 - 0.07)}Q${f(sx + 0.19)} .5 ${f(sx + 0.12)} ${f(0.5 + 0.07)}L${f(sx)} ${f(0.5 + 0.09)}Q${f(sx - 0.18)} ${f(0.5 + 0.09)} ${f(sx - 0.2)} .5Z" fill="${wreck ? '#2b2420' : '#5b646d'}" stroke="${P.line}" stroke-width=".014"/>`;
      if (!simple) {
        s += `<path d="M${f(sx - 0.02)} .5H${f(sx + 0.07)}" stroke="${P.top}" stroke-width=".02" stroke-linecap="round"/>`;
        if (len >= 3) s += turret(at(0.76), 0.045, 1, 1, P, false);
        // überspült: Wasserfilm über Bug und Heck, helle Wellenkämme
        s += `<path d="${o.d}" fill="#2a6f9e" opacity=".32"/>`;
        s += `<path d="M${f(x0 + 0.1)} ${f(0.5 - T.hw * 0.4)}q.06 -.03 .12 0M${f(x1 - 0.32)} ${f(0.5 + T.hw * 0.45)}q.06 -.03 .12 0" stroke="rgba(255,255,255,.4)" stroke-width=".014" fill="none" stroke-linecap="round"/>`;
      }
      break;
    }
    case 'schnell': {
      // Kanzel (Glas), kleines Geschütz vorn, Torpedorohre längs an den Seiten
      const cx = at(0.4);
      s += `<path d="M${f(cx - 0.13)} ${f(0.5 - 0.12)}H${f(cx + 0.06)}Q${f(cx + 0.18)} .5 ${f(cx + 0.06)} ${f(0.5 + 0.12)}H${f(cx - 0.13)}Z" fill="${P.bridge}" stroke="${P.line}" stroke-width=".014"/>`;
      if (!simple) {
        s += `<path d="M${f(cx + 0.03)} ${f(0.5 - 0.07)}Q${f(cx + 0.11)} .5 ${f(cx + 0.03)} ${f(0.5 + 0.07)}" stroke="${wreck ? '#1a1412' : '#3d6f93'}" stroke-width=".03" fill="none" stroke-linecap="round"/>`;
        s += turret(at(0.74), 0.045, 1, 1, P, false);
        for (const y of [-0.155, 0.155]) s += `<path d="M${f(at(0.12))} ${f(0.5 + y)}H${f(at(0.38))}" stroke="${P.gunD}" stroke-width=".035" stroke-linecap="round"/>`;
      }
      break;
    }
    case 'traeger': {
      // Flugdeck: Mittellinie, Randlinien, Aufzüge; Insel an Steuerbord; Flugzeuge achtern geparkt
      if (!simple) {
        s += `<path d="M${f(x0 + 0.1)} .5H${f(x1 - 0.5)}" stroke="${wreck ? 'rgba(255,200,160,.18)' : 'rgba(255,255,255,.75)'}" stroke-width=".016" stroke-dasharray=".09 .07"/>`;
        s += `<path d="M${f(x0 + 0.08)} ${f(0.5 - 0.19)}H${f(x1 - 0.7)}M${f(x0 + 0.08)} ${f(0.5 + 0.19)}H${f(x1 - 0.7)}" stroke="${wreck ? 'rgba(0,0,0,.25)' : 'rgba(255,238,170,.5)'}" stroke-width=".01"/>`;
        for (const t of [0.3, 0.62]) s += `<rect x="${f(at(t) - 0.08)}" y="${f(0.5 - 0.08)}" width=".16" height=".16" fill="none" stroke="${wreck ? 'rgba(0,0,0,.3)' : 'rgba(30,30,30,.45)'}" stroke-width=".012"/>`;
        const pc = wreck ? '#2a221f' : '#d6dade';
        s += plane(at(0.09), 0.5 - 0.11, 0.19, 8, pc) + plane(at(0.09), 0.5 + 0.11, 0.19, -8, pc) + plane(at(0.2), 0.5, 0.19, 0, pc);
      }
      const ix = at(0.56);
      s += rect(ix - 0.22, 0.5 + 0.15, 0.44, 0.15, 0.045, P.bridge, P) + funnel(ix - 0.07, 0.07, 0.045, P, simple).replace(/cy="\.5"/g, `cy="${f(0.5 + 0.225)}"`);
      if (!simple) s += `<path d="M${f(ix + 0.12)} ${f(0.5 + 0.18)}V${f(0.5 + 0.27)}" stroke="${P.win}" stroke-width=".02" stroke-linecap="round"/>`;
      break;
    }
  }
  if (wreck && !simple) {
    // verkohlt: Rußflecken, Risse, Teile überspült (Heck tiefer im Wasser)
    s += `<ellipse cx="${f(at(0.35))}" cy=".46" rx="${f(L * 0.12)}" ry="${f(T.hw * 0.6)}" fill="rgba(10,6,4,.45)"/><ellipse cx="${f(at(0.72))}" cy=".54" rx="${f(L * 0.08)}" ry="${f(T.hw * 0.5)}" fill="rgba(10,6,4,.4)"/>`;
    s += `<path d="M${f(at(0.48))} ${f(0.5 - T.hw * 0.9)}l.04 ${f(T.hw * 0.5)}l-.03 ${f(T.hw * 0.4)}l.04 ${f(T.hw * 0.6)}" stroke="#120c09" stroke-width=".018" fill="none"/>`;
    // Heck tiefer im Wasser: Wasserfilm mit welliger Kante, auf den Rumpf beschnitten
    const cid = `sv-c-${type}${len}`, e = at(0.24);
    // Krängung: die tiefe Seite dunkler, halb unter Wasser
    s += `<path clip-path="url(#${cid})" d="M${f(x0 - 0.05)} ${f(0.5 + T.hw * 0.45)}H${f(x1 + 0.05)}V1H${f(x0 - 0.05)}Z" fill="#1f557a" opacity=".45"/>`;
    s += `<clipPath id="${cid}"><path d="${o.d}"/></clipPath><path clip-path="url(#${cid})" d="M${f(x0 - 0.05)} 0H${f(e)}Q${f(e + 0.06)} .2 ${f(e - 0.02)} .38T${f(e + 0.03)} .62T${f(e)} 1H${f(x0 - 0.05)}Z" fill="#2a6f9e" opacity=".62"/>`;
    s += `<path d="M${f(at(0.08))} ${f(0.5 - T.hw * 0.5)}q.05 -.025 .1 0M${f(at(0.12))} ${f(0.5 + T.hw * 0.4)}q.05 -.025 .1 0" stroke="rgba(255,255,255,.35)" stroke-width=".014" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

// Rumpf-Randlicht (Bordwand hell oben, dunkel unten) – nur große Stufe
export function hullShade(type, len) {
  const o = outline(type, len);
  return `<path d="${o.d}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width=".02" transform="translate(0 -.012)"/>`;
}

// Schräglage eines Wracks (Grad): so viel, wie der Rand zulässt (Mittelteil volle Breite, weit weg von der Drehachse)
export function wreckTilt(type, len) {
  const T = TYPES[type], { x0, x1 } = outline(type, len);
  const reach = Math.max(len / 2 - (x0 + T.stern), x1 - T.bow - len / 2);
  const room = 0.5 - MIN_EDGE - T.hw - WRECK.d - 0.004;
  const deg = Math.asin(Math.max(0, Math.min(1, room / Math.max(reach, 0.01)))) * 180 / Math.PI - WRECK.deg;
  return Math.max(0, Math.min(WRECK.tilt, Math.round(deg * 10) / 10));
}

// Glutnester und Rauch für ein Wrack (Stufe 2), in Schiffs-Einheiten
export function embers(type, len) {
  const { x0, x1 } = outline(type, len), L = x1 - x0;
  return [0.3, 0.62].map((t, k) => ({ x: x0 + L * t, y: 0.5 + (k ? 0.05 : -0.04) }));
}

// Schaukeln je Schiff (fest aus Sitz und Index, die Flotte wippt nicht im Gleichtakt): Dauer des Nachrollens 1,3–1,7 s,
// Phase (Versatz in der Dünung) und Richtung der ersten Neigung
export function rhythm(k, seat = 0) {
  let h = (k + 1) * 2654435761 + (seat + 3) * 40503;
  h = (h ^ (h >>> 13)) >>> 0;
  return { dur: 1.3 + (h % 400) / 1000, phase: ((h >>> 12) % 1000) / 1000, sign: (h >>> 22) & 1 ? 1 : -1 };
}
