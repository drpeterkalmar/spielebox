// Warteschlange für Meldungen: immer nur eine sichtbar, jede mindestens `ms` lang (Standard 5 s), Antippen schließt
// sie und holt die nächste. Gleiche Meldungen, die schon warten oder gerade stehen, kommen nicht doppelt.
// Ohne DOM (show/hide als Rückrufe, Timer austauschbar) → läuft in Node-Tests.
export const TOAST_MS = 5000;   // bis 29.09.: 2600 (Peter 29.09.: „Meldungen länger anzeigen“)
export const TOAST_MAX = 6;     // mehr wartende Meldungen: die ältesten wartenden fallen weg

export class ToastQueue {
  constructor({ show, hide, timers = globalThis, ms = TOAST_MS } = {}) {
    this.show = show;          // show(item) → zeigt item.text
    this.hide = hide;          // hide(item)
    this.timers = timers;
    this.ms = ms;
    this.wait = [];
    this.cur = null;
    this.timer = null;
  }

  push(text, ms = this.ms) {
    if ((this.cur && this.cur.text === text) || this.wait.some((w) => w.text === text)) return null;
    const item = { text, ms: Math.max(ms, 0) };
    this.wait.push(item);
    while (this.wait.length > TOAST_MAX) this.wait.shift();
    if (!this.cur) this._next();
    return item;
  }

  // Antippen / Zeit um: aktuelle Meldung weg, nächste zeigen
  close(item = this.cur) {
    if (!item || item !== this.cur) return;
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.cur = null;
    this.hide && this.hide(item);
    this._next();
  }

  _next() {
    const item = this.wait.shift();
    if (!item) return;
    this.cur = item;
    this.show && this.show(item);
    this.timer = this.timers.setTimeout(() => this.close(item), item.ms);
  }

  get pending() { return this.wait.length; }
}
