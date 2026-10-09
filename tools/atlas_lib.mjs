// Reine Hilfsfunktionen für tools/build_atlas.mjs (Kartenblätter als Atlas, n9): PAM lesen/schreiben, Raster planen,
// Karten mit ausgezogenem Rand (Gutter) einsetzen, Bildvergleich (PSNR) und das Manifest src/ui/cardatlas.js.
// Kein Netz, keine Abhängigkeiten – geprüft in tests/node/atlas.test.mjs.

// Blätter und Gruppen: je Blatt 2 Atlanten. Doppeldeutsch: a = die 20 Schnapskarten (A Z K O U), b = 9 8 7
// (nur Mau-Mau) – Schnapsen lädt und entpackt so nur Atlas a. Französisch: a = Pik + Herz, b = Karo + Kreuz
// (52 Karten @2x passen nicht in 4096 px). Reihenfolge = Farbe für Farbe (eine Zeile je Farbe, wo es passt).
export const DECKS = {
  de: {
    suits: ['H', 'S', 'L', 'E'],
    groups: { a: ['A', 'Z', 'K', 'O', 'U'], b: ['9', '8', '7'] },
    name: (suit, rank) => suit + rank,
    cols: { a: 5, b: 3 }
  },
  fr: {
    suits: ['S', 'H', 'D', 'C'],
    ranks: ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'],
    groups: { a: ['S', 'H'], b: ['D', 'C'] },   // hier nach Farben geteilt
    name: (suit, rank) => rank + suit,
    cols: { a: 13, b: 13 }
  }
};

// Kartennamen einer Gruppe in Atlas-Reihenfolge
export function groupCards(deck, group) {
  const D = DECKS[deck];
  if (deck === 'de') return D.suits.flatMap((su) => D.groups[group].map((r) => D.name(su, r)));
  return D.groups[group].flatMap((su) => D.ranks.map((r) => D.name(su, r)));
}

// Raster für n Zellen der Größe cw × ch: Gutter g ringsum je Zelle, Zellabstand auf align gerundet (Mipmap-Stufen
// treffen dieselben Zellgrenzen), Gesamtmaß ≤ maxDim (sicher für Grafikspeicher auf Handys: 4096).
// Wunschspalten (prefer) gelten, wenn sie passen; sonst die Spaltenzahl mit den wenigsten leeren Zellen.
export function packGrid(n, cw, ch, { gutter = 8, align = 16, maxDim = 4096, prefer = 0 } = {}) {
  const up = (v) => Math.ceil(v / align) * align;
  const pw = up(cw + 2 * gutter), ph = up(ch + 2 * gutter);
  const maxCols = Math.floor(maxDim / pw), maxRows = Math.floor(maxDim / ph);
  if (maxCols < 1 || maxRows < 1) throw new Error(`Zelle ${pw}×${ph} größer als ${maxDim}`);
  const fits = (c) => c >= 1 && c <= maxCols && Math.ceil(n / c) <= maxRows;
  let cols = 0;
  if (prefer && fits(Math.min(prefer, n))) cols = Math.min(prefer, n);
  else {
    let best = Infinity;
    for (let c = 1; c <= Math.min(maxCols, n); c++) {
      if (!fits(c)) continue;
      const rows = Math.ceil(n / c), waste = c * rows - n;
      // weniger Leerzellen zuerst, dann möglichst quadratisch
      const score = waste * 1e6 + Math.abs(c * pw - rows * ph);
      if (score < best) { best = score; cols = c; }
    }
  }
  if (!cols) throw new Error(`${n} Zellen passen nicht in ${maxDim} px`);
  const rows = Math.ceil(n / cols);
  return { n, cw, ch, gutter, cols, rows, pw, ph, W: cols * pw, H: rows * ph };
}

// linke obere Ecke der Karte (ohne Gutter) für Zelle i: Zellanfang + Gutter. Mit gutter = align = 16 beginnt jede
// Karte auf dem 16-px-Blockraster von WebP (Makroblöcke) – wie in der Einzeldatei; so verliert das erneute
// Kodieren der schon verlustbehaftet gespeicherten Karte am wenigsten.
export function cellOrigin(i, grid) {
  const col = i % grid.cols, row = Math.floor(i / grid.cols);
  return [col * grid.pw + grid.gutter, row * grid.ph + grid.gutter];
}

// RGBA-Quelle (sw × sh) bei (x, y) in das Ziel (dw breit) kopieren und den Rand g Pixel weit nach außen ziehen
// (Randpixel wiederholt): beim Verkleinern (Mipmaps, bilineares Filtern) mischt sich so nur die eigene Kante ein,
// nie die Nachbarkarte.
export function blitExtrude(dst, dw, dh, src, sw, sh, x, y, g) {
  for (let yy = -g; yy < sh + g; yy++) {
    const ty = y + yy;
    if (ty < 0 || ty >= dh) continue;
    const sy = Math.min(sh - 1, Math.max(0, yy));
    for (let xx = -g; xx < sw + g; xx++) {
      const tx = x + xx;
      if (tx < 0 || tx >= dw) continue;
      const sx = Math.min(sw - 1, Math.max(0, xx));
      const si = (sy * sw + sx) * 4, di = (ty * dw + tx) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
    }
  }
}

// Ausschnitt (x, y, w, h) aus einem RGBA-Bild (Breite W)
export function crop(img, W, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) out.set(img.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
  return out;
}

// PSNR (dB) zweier gleich großer RGBA-Bilder. Farben vormultipliziert mit Alpha (wie der Browser mischt) –
// Farbwerte unsichtbarer Pixel (runde Ecken) zählen so nicht; Alpha zählt als vierter Kanal mit.
// Dazu die größte Einzelabweichung (0–255) für den „pixelnahen“ Vergleich.
export function psnr(a, b) {
  if (a.length !== b.length) throw new Error('ungleiche Größe');
  let se = 0, max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const aa = a[i + 3], ba = b[i + 3];
    for (let k = 0; k < 3; k++) {
      const d = (a[i + k] * aa - b[i + k] * ba) / 255;
      se += d * d;
      const ad = Math.abs(d);
      if (ad > max) max = ad;
    }
    const d = aa - ba;
    se += d * d;
    if (Math.abs(d) > max) max = Math.abs(d);
  }
  const mse = se / a.length;
  return { db: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), max: Math.round(max) };
}

// PAM (P7) lesen – so liefert dwebp -pam das entpackte Bild
export function parsePAM(buf) {
  const end = buf.indexOf('ENDHDR\n');
  if (end < 0 || buf.toString('latin1', 0, 3) !== 'P7\n') throw new Error('kein PAM');
  const head = Object.fromEntries(buf.toString('latin1', 3, end).trim().split('\n').map((l) => l.trim().split(/\s+/)).map(([k, v]) => [k, v]));
  const w = +head.WIDTH, h = +head.HEIGHT, depth = +head.DEPTH;
  const raw = buf.subarray(end + 7, end + 7 + w * h * depth);
  if (raw.length !== w * h * depth) throw new Error('PAM zu kurz');
  if (depth === 4) return { w, h, data: new Uint8Array(raw) };
  const data = new Uint8Array(w * h * 4);   // RGB → RGBA (deckend)
  for (let i = 0, j = 0; i < raw.length; i += depth, j += 4) { data[j] = raw[i]; data[j + 1] = raw[i + 1]; data[j + 2] = raw[i + 2]; data[j + 3] = 255; }
  return { w, h, data };
}

// PAM (RGBA) schreiben – cwebp liest das direkt
export function writePAM(w, h, data) {
  const head = Buffer.from(`P7\nWIDTH ${w}\nHEIGHT ${h}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`, 'latin1');
  return Buffer.concat([head, Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
}

// Manifest als JS-Modul: Blatt → Auflösung → { size: [Kartenbreite, -höhe], files: { Gruppe: [W, H] },
// cards: { Karte: [Gruppe, x, y] } }. Dateien: assets/cards/atlas/<blatt>-<gruppe>[@2x].webp
export function manifestModule(manifest) {
  const lines = [
    '// Kartenatlanten (n9): erzeugt von tools/build_atlas.mjs – nicht von Hand ändern.',
    '// Blatt → Auflösung → size [Kartenbreite, Kartenhöhe in px], files { Gruppe: [Atlasbreite, Atlashöhe] },',
    '// cards { Karte: [Gruppe, x, y] } (linke obere Ecke der Karte im Atlas). Datei: assets/cards/atlas/<blatt>-<gruppe>[@2x].webp',
    'export const ATLAS = {'
  ];
  const decks = Object.keys(manifest);
  decks.forEach((deck, di) => {
    lines.push(`  ${deck}: {`);
    const ress = Object.keys(manifest[deck]);
    ress.forEach((res, ri) => {
      const m = manifest[deck][res];
      lines.push(`    '${res}': {`);
      lines.push(`      size: [${m.size.join(', ')}],`);
      lines.push(`      files: { ${Object.entries(m.files).map(([g, [w, h]]) => `${g}: [${w}, ${h}]`).join(', ')} },`);
      lines.push('      cards: {');
      const ent = Object.entries(m.cards);
      for (let i = 0; i < ent.length; i += 6) {
        lines.push('        ' + ent.slice(i, i + 6).map(([c, [g, x, y]]) => `${/^\d/.test(c) ? `'${c}'` : c}: ['${g}', ${x}, ${y}]`).join(', ') + (i + 6 < ent.length ? ',' : ''));
      }
      lines.push('      }');
      lines.push(`    }${ri < ress.length - 1 ? ',' : ''}`);
    });
    lines.push(`  }${di < decks.length - 1 ? ',' : ''}`);
  });
  lines.push('};', '');
  return lines.join('\n');
}

// RGBA-Bild auf halbe Größe (2×2-Mittel, vormultipliziert) – grobe Näherung dessen, was der Browser zeigt: Karten
// erscheinen auf dem Tisch kleiner als ihre Datei (Handy: 480-px-Karte ≈ 150–250 Gerätepixel breit).
export function half(img, w, h) {
  const W = w >> 1, H = h >> 1, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = ((2 * y + dy) * w + 2 * x + dx) * 4, al = img[i + 3];
      r += img[i] * al; g += img[i + 1] * al; b += img[i + 2] * al; a += al;
    }
    const o = (y * W + x) * 4;
    if (a) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    out[o + 3] = Math.round(a / 4);
  }
  return out;
}
