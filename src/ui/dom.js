// Kleine DOM-Helfer: Elemente bauen, Hinweise (Toasts), Blätter (Dialoge von unten).
import { ToastQueue, TOAST_MS } from './toastqueue.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'data') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

let toastBox = null;
let toastQ = null;
const toastListeners = new Set();
// Meldungen nacheinander aus einer Warteschlange, jede mindestens 5 s (bis 29.09.: 2600 ms, alle übereinander;
// Peter 29.09.: „Meldungen länger anzeigen“), Antippen schließt. Siehe toastqueue.js.
export function toast(text, ms = TOAST_MS) {
  if (!toastQ) {
    toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(toastBox);
    toastQ = new ToastQueue({
      show(item) {
        item.el = h('button', { class: 'toast', text: item.text, title: 'Antippen schließt', on: { click: () => toastQ.close(item) } });
        toastBox.appendChild(item.el);
      },
      hide(item) {
        const el = item.el;
        if (!el) return;
        el.classList.add('out');
        setTimeout(() => el.remove(), 380);
      }
    });
  }
  for (const fn of toastListeners) { try { fn(text); } catch { /* egal */ } }
  return toastQ.push(String(text), ms);
}

// Mitlesen (Ereignis-Liste am Tisch)
export function onToast(fn) {
  toastListeners.add(fn);
  return () => toastListeners.delete(fn);
}

// Blatt von unten (Handy) bzw. mittig (quer/Desktop); schließt per Hintergrund, ✕ oder Zurück
export function sheet(title, ...content) {
  const close = () => {
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 180);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', { text: title }),
      h('button', { class: 'icon-btn', 'aria-label': 'Schließen', text: '✕', on: { click: close } })),
    h('div', { class: 'sheet-body' }, ...content));
  // Hintergrund schließt – aber nicht der Klick des Tipps, der das Blatt gerade geöffnet hat (Tipp aufs Brett)
  const born = Date.now();
  const wrap = h('div', { class: 'sheet-wrap', on: { click: (e) => { if (e.target === wrap && Date.now() - born > 350) close(); } } }, box);
  document.body.appendChild(wrap);
  document.addEventListener('keydown', onKey);
  return { close, box, body: box.querySelector('.sheet-body') };
}

export function relTime(ms) {
  const d = Math.max(0, Date.now() - ms) / 1000;
  if (d < 60) return 'gerade eben';
  if (d < 3600) return `vor ${Math.round(d / 60)} Min.`;
  if (d < 86400) return `vor ${Math.round(d / 3600)} Std.`;
  return `vor ${Math.round(d / 86400)} Tagen`;
}
