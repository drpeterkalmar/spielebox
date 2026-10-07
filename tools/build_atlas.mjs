// Kartenblätter als Atlas (n9, Audit #1): je Blatt und Auflösung 2 WebP-Atlanten statt 84 bzw. 168 Einzelbildern.
// Quelle sind die eingecheckten Einzelkarten assets/cards/{de,fr}/*.webp (Herkunft und Lizenz: assets/cards/SOURCES.md);
// sie bleiben im Repo (Rückfall ?atlas=0, Lobby-Bildchen). Ausgabe:
//   assets/cards/atlas/<blatt>-<gruppe>.webp (1×) und …@2x.webp, src/ui/cardatlas.js (Lage jeder Karte)
// Aufruf: node tools/build_atlas.mjs [--check]   (--check: nur prüfen, ob Atlas und Manifest zu den Karten passen)
// Braucht cwebp/dwebp (libwebp, z. B. brew install webp) – dieselbe Bibliothek, mit der die Einzelkarten gebaut sind.
// Neu kodieren ohne sichtbaren Verlust: Jede Karte beginnt auf dem 16-px-Blockraster (wie in ihrer Einzeldatei), und
// als Eingabe dient die Karte mit einfach verdoppelter Farbebene (dwebp -nofancy) – cwebp mittelt sie beim Kodieren
// wieder auf genau die gespeicherte Farbebene zurück. Verglichen wird mit der normal entpackten Einzeldatei (so zeigt
// sie der Browser): PSNR je Karte, vormultipliziert, in voller und in halber Größe (Karten erscheinen auf dem Tisch
// kleiner als ihre Datei). Qualität: von unten probiert, genommen wird die erste Stufe, bei der jede Karte besteht.
// AVIF: bewusst nicht – im Browser bräuchte jede Karte eine Format-Weiche, und avifenc wäre eine weitere Abhängigkeit.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECKS, groupCards, packGrid, cellOrigin, blitExtrude, crop, psnr, half, parsePAM, writePAM, manifestModule } from './atlas_lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'cards', 'atlas');
const MANIFEST = join(ROOT, 'src', 'ui', 'cardatlas.js');
const CHECK = process.argv.includes('--check');
// Schwellen (dB): schlechteste Karte in halber Größe, Mittel aller Karten in voller Größe. Gemessen 07.10.: die
// Bildkarten (Bube/Dame, fein gezeichnet) sind die schwierigsten; 40 dB gilt gemeinhin als nicht unterscheidbar.
const MIN_HALF = 39.5, MIN_MEAN = 42;
const QUALITIES = [78, 80, 82, 84, 86, 88, 90, 92, 95];
// Gutter = Ausrichtung = 16 px: Karten auf dem WebP-Blockraster, Rand reicht für Mipmaps bis 1/16
const RES = { '1x': { suffix: '', gutter: 16, align: 16 }, '2x': { suffix: '@2x', gutter: 16, align: 16 } };

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`${cmd} fehlt (brew install webp): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const decode = (file, plain = false) => parsePAM(run('dwebp', ['-quiet', ...(plain ? ['-nofancy'] : []), '-pam', file, '-o', '-']));

function buildOne(deck, res, group, tmp) {
  const R = RES[res];
  const cards = groupCards(deck, group);
  const srcFile = (c) => join(ROOT, 'assets', 'cards', deck, `${c}${R.suffix}.webp`);
  const imgs = cards.map((c) => decode(srcFile(c)));   // Vergleich: wie der Browser entpackt
  const { w: cw, h: ch } = imgs[0];
  for (const [i, im] of imgs.entries()) if (im.w !== cw || im.h !== ch) throw new Error(`${cards[i]}: ${im.w}×${im.h} statt ${cw}×${ch}`);
  const grid = packGrid(cards.length, cw, ch, { gutter: R.gutter, align: R.align, prefer: DECKS[deck].cols[group] });
  const atlas = new Uint8Array(grid.W * grid.H * 4);   // leere Zellen bleiben durchsichtig
  const pos = {};
  cards.forEach((c, i) => {
    const [x, y] = cellOrigin(i, grid);
    blitExtrude(atlas, grid.W, grid.H, decode(srcFile(c), true).data, cw, ch, x, y, R.gutter);
    pos[c] = [group, x, y];
  });
  const file = join(OUT, `${deck}-${group}${R.suffix}.webp`);
  const report = { res, file: file.slice(ROOT.length + 1), grid: `${grid.cols}×${grid.rows}`, W: grid.W, H: grid.H, cards: cards.length };
  const singles = cards.reduce((n, c) => n + statSync(srcFile(c)).size, 0);
  // Prüfen: vorhandenen Atlas gegen die Einzelkarten vergleichen
  const score = (path) => {
    const back = decode(path);
    if (back.w !== grid.W || back.h !== grid.H) return { ok: false, db: 0, mean: 0, max: 255, worst: 'Größe' };
    let worst = { db: Infinity, max: 0, worst: '' }, sum = 0;
    imgs.forEach((im, i) => {
      const [x, y] = cellOrigin(i, grid);
      const c = crop(back.data, grid.W, x, y, cw, ch);
      sum += Math.min(99, psnr(c, im.data).db);
      const p = psnr(half(c, cw, ch), half(im.data, cw, ch));
      if (p.db < worst.db) worst = { ...p, worst: cards[i] };
    });
    const mean = sum / imgs.length;
    return { ...worst, mean, ok: worst.db >= MIN_HALF && mean >= MIN_MEAN };
  };
  if (CHECK) {
    if (!existsSync(file)) return { ...report, ok: false, why: 'fehlt', pos, size: [cw, ch], dims: [grid.W, grid.H] };
    const s = score(file);
    return { ...report, ...s, bytes: statSync(file).size, singles, pos, size: [cw, ch], dims: [grid.W, grid.H] };
  }
  const pam = join(tmp, `${deck}-${group}${R.suffix}.pam`);
  writeFileSync(pam, writePAM(grid.W, grid.H, atlas));
  let chosen = null;
  for (const q of QUALITIES) {
    const out = join(tmp, `q${q}.webp`);
    run('cwebp', ['-quiet', '-q', String(q), '-alpha_q', '90', '-m', '6', pam, '-o', out]);
    const s = score(out);
    if (s.ok) { chosen = { q, out, ...s, bytes: statSync(out).size }; break; }
  }
  if (!chosen) throw new Error(`${report.file}: auch mit Qualität ${QUALITIES.at(-1)} nicht pixelnah`);
  writeFileSync(file, readFileSync(chosen.out));
  return { ...report, ...chosen, out: undefined, singles, pos, size: [cw, ch], dims: [grid.W, grid.H] };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'sb-atlas-'));
  const manifest = {};
  const rows = [];
  try {
    for (const deck of Object.keys(DECKS)) {
      manifest[deck] = {};
      for (const res of Object.keys(RES)) {
        const m = manifest[deck][res] = { size: null, files: {}, cards: {} };
        for (const group of Object.keys(DECKS[deck].groups)) {
          const r = buildOne(deck, res, group, tmp);
          m.size = r.size;
          m.files[group] = r.dims;
          Object.assign(m.cards, r.pos);
          rows.push(r);
        }
      }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const kb = (b) => (b / 1024).toFixed(0) + ' KB';
  for (const r of rows) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.file}  ${r.grid} = ${r.W}×${r.H}, ${r.cards} Karten` +
      (r.bytes ? `, ${kb(r.bytes)} (einzeln ${kb(r.singles)})` : '') + (r.q ? `, q ${r.q}` : '') +
      (r.db !== undefined ? `, Mittel ${r.mean.toFixed(1)} dB, schlechteste Karte ${r.worst} (halbe Größe) ${r.db.toFixed(1)} dB` : '') + (r.why ? ` – ${r.why}` : ''));
  }
  for (const res of Object.keys(RES)) {
    const rs = rows.filter((r) => r.res === res);
    const a = rs.reduce((n, r) => n + (r.bytes || 0), 0), s = rs.reduce((n, r) => n + (r.singles || 0), 0);
    console.log(`${res}: Atlanten ${kb(a)} in ${rs.length} Dateien statt ${kb(s)} in ${rs.reduce((n, r) => n + r.cards, 0)} Einzeldateien (${a <= s ? '−' : '+'}${kb(Math.abs(s - a))})`);
  }
  const mod = manifestModule(manifest);
  if (CHECK) {
    const same = existsSync(MANIFEST) && readFileSync(MANIFEST, 'utf8') === mod;
    console.log(same ? '✓ src/ui/cardatlas.js passt' : '✗ src/ui/cardatlas.js passt nicht – node tools/build_atlas.mjs ausführen');
    process.exit(same && rows.every((r) => r.ok) ? 0 : 1);
  }
  writeFileSync(MANIFEST, mod);
  console.log('geschrieben: src/ui/cardatlas.js');
}

main();
