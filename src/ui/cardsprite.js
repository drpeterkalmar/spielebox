// Kartenbilder aus den Atlanten (Technik n9, Audit #1): wo eine Karte im Atlas liegt und wie man sie zeichnet –
// in SVG als verschachteltes <svg> mit viewBox auf den Kartenausschnitt (beschneidet von selbst), in HTML als
// Hintergrund mit Prozent-Lage (passt bei jeder Elementgröße). Ohne Atlas (?atlas=0) die Einzeldatei wie bisher.
// Rein (kein DOM) – geprüft in tests/node/cardsprite.test.mjs.
import { ATLAS } from './cardatlas.js';
import { urlFlag } from './flags.js';

export const useAtlas = () => urlFlag('atlas', true);
// Handy-Bildschirme (ab 1,5 dppx): doppelt aufgelöste Karten
export const hiDpi = () => typeof devicePixelRatio === 'number' && devicePixelRatio >= 1.5;

export const singleUrl = (deck, card, hi) => `assets/cards/${deck}/${card}${hi ? '@2x' : ''}.webp`;
export const atlasUrl = (deck, group, hi) => `assets/cards/atlas/${deck}-${group}${hi ? '@2x' : ''}.webp`;

// Lage der Karte: { href, x, y, w, h, W, H } (Pixel im Atlas) oder null (unbekannt → Einzeldatei)
export function atlasCell(deck, card, hi) {
  const m = ATLAS[deck] && ATLAS[deck][hi ? '2x' : '1x'];
  const e = m && m.cards[card];
  if (!e) return null;
  const [g, x, y] = e, [W, H] = m.files[g];
  return { href: atlasUrl(deck, g, hi), x, y, w: m.size[0], h: m.size[1], W, H };
}

// SVG: Attribute des äußeren <svg> (Ausschnitt) und des inneren <image> (ganzer Atlas) für ein Rechteck in Brett-Einheiten
export function svgSprite(c, x, y, w, h) {
  return {
    outer: { x, y, width: w, height: h, viewBox: `${c.x} ${c.y} ${c.w} ${c.h}`, preserveAspectRatio: 'none', class: 'card-face' },
    inner: { href: c.href, width: c.W, height: c.H }
  };
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;
// HTML: Hintergrund-Stil. Prozent-Lage p = x / (W − w): Punkt p% des Bildes liegt auf p% des Elements.
// aspect-ratio hält die Kartenform, auch wenn CSS nur die Breite setzt (das Platzhalter-Bild ist 1×1).
export function spriteStyle(c) {
  const px = c.W > c.w ? r4((c.x / (c.W - c.w)) * 100) : 0, py = c.H > c.h ? r4((c.y / (c.H - c.h)) * 100) : 0;
  return `background-image:url("${c.href}");background-repeat:no-repeat;background-size:${r4((c.W / c.w) * 100)}% ${r4((c.H / c.h) * 100)}%;` +
    `background-position:${px}% ${py}%;aspect-ratio:${c.w} / ${c.h}`;
}

// durchsichtiges 1×1-GIF als src für <img>-Kartenbildchen mit Atlas-Hintergrund (Selektoren wie img[data-card] bleiben)
export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Attribute für ein HTML-<img> einer Karte: mit Atlas { src: BLANK, style }, sonst { src: Einzeldatei }
export function cardImgAttrs(deck, card, hi) {
  const c = useAtlas() ? atlasCell(deck, card, hi) : null;
  return c ? { src: BLANK, style: spriteStyle(c) } : { src: singleUrl(deck, card, hi) };
}

// alle Atlas-Dateien (Vorabladen/Service-Worker)
export function atlasFiles(hi) {
  const out = [];
  for (const deck of Object.keys(ATLAS)) for (const g of Object.keys(ATLAS[deck][hi ? '2x' : '1x'].files)) out.push(atlasUrl(deck, g, hi));
  return out;
}
