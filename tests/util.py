# Test-Helfer (Vorlage: Bandenkick/Stuntbahn): eingebauter HTTP-Server (Thread, endet mit dem Skript),
# Playwright mit Pixel-7-Emulation hoch/quer bzw. Desktop, Fehler-Sammlung, Screenshots.
# Regel: nie zwei Browser gleichzeitig (8 GB RAM) – mehrere Kontexte in EINEM Browser sind ok.
import os, sys, time, json, threading, socket, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
PIXEL7_HOCH = dict(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True, user_agent=UA)
PIXEL7_QUER = dict(viewport={"width": 915, "height": 412}, device_scale_factor=2.625, is_mobile=True, has_touch=True, user_agent=UA)
DESKTOP = dict(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
# Pixel 7 quer im Chrome-Tab (Adress- und Statusleiste sichtbar): nur ~350 px Höhe
PIXEL7_QUER_TAB = dict(viewport={"width": 915, "height": 350}, device_scale_factor=2.625, is_mobile=True, has_touch=True, user_agent=UA)
DEVICES = {'hoch': PIXEL7_HOCH, 'quer': PIXEL7_QUER, 'desktop': DESKTOP, 'quer_tab': PIXEL7_QUER_TAB}
# GPU statt SwiftShader (Skill-Vorgabe). WebRTC-Test auf EINEM Mac mit ProtonVPN: Chrome nimmt ohne Kamera/Mikro-
# Berechtigung nur die Standardroute (VPN-Schnittstelle utun) – darüber erreichen sich zwei Kontexte nicht einmal
# innerhalb derselben Seite. Mit erteilter (Schein-)Berechtigung nutzt Chrome alle Schnittstellen inkl. LAN/Loopback.
# Die App selbst braucht keine Kamera; das betrifft nur den Testaufbau (Page(..., rtc_all=True)).
ARGS = ["--use-angle=metal", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
        "--disable-features=WebRtcHideLocalIpsWithMdns", "--allow-loopback-in-peer-connection",
        "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def guess_type(self, path):
        if str(path).endswith('.webmanifest'): return 'application/manifest+json'
        if str(path).endswith('.mjs') or str(path).endswith('.js'): return 'text/javascript'
        return super().guess_type(path)


class BigQueueServer(ThreadingHTTPServer):
    request_queue_size = 128   # Standard 5 → Verbindungsabbrüche bei vielen parallelen Modulen
    daemon_threads = True


class Server:
    def __init__(self, root=ROOT):
        self.root = root
    def __enter__(self):
        s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
        self.httpd = BigQueueServer(('127.0.0.1', port), functools.partial(Quiet, directory=self.root))
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True); self.t.start()
        self.base = f'http://127.0.0.1:{port}/'
        return self
    def __exit__(self, *a):
        self.httpd.shutdown(); self.httpd.server_close()


class Page:
    """Ein Kontext + eine Seite mit Fehlersammlung."""
    def __init__(self, browser, base, device='hoch', name='A', rtc_all=False):
        self.base = base
        self.name = name
        self.device = device
        self.ctx = browser.new_context(**DEVICES[device], **({'permissions': ['camera', 'microphone']} if rtc_all else {}))
        self.pg = self.ctx.new_page()
        self.errors = []; self.console = []; self.warnings = []
        self.pg.on("pageerror", lambda e: self.errors.append("PAGEERROR " + str(e)))
        self.pg.on("requestfailed", lambda r: (self.warnings if 'ERR_ABORTED' in str(r.failure) else self.errors).append("REQFAIL " + r.url + " " + str(r.failure)))
        def on_console(m):
            self.console.append(m.type + ": " + m.text)
            # Relay-Warnungen von Trystero (öffentliche Relays, Rate-Limits) sind keine App-Fehler
            if m.type == "error": self.errors.append("CONSOLE " + m.text)
        self.pg.on("console", on_console)

    def open(self, q='?nosw', hash_='', timeout=60000):
        t0 = time.time()
        self.pg.goto(self.base + 'index.html' + q + hash_)
        self.pg.wait_for_function("window.__box && window.__box.ready", timeout=timeout)
        self.boot_s = time.time() - t0
        return self

    def ev(self, js, arg=None):
        return self.pg.evaluate(js, arg) if arg is not None else self.pg.evaluate(js)

    def state(self):
        return self.ev("__box.state()")

    def shot(self, name, sub=''):
        d = os.path.join(ROOT, 'tests', 'shots', sub) if sub else os.path.join(ROOT, 'tests', 'shots')
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, f'{name}.jpg' if sub == 'final' else f'{name}.png')
        self.pg.screenshot(path=p, **({'type': 'jpeg', 'quality': 84} if sub == 'final' else {}))
        return p

    def tap_xy(self, x, y):
        try:
            self.pg.touchscreen.tap(x, y)
        except Exception:
            self.pg.mouse.click(x, y)
        time.sleep(0.12)

    def tap(self, sel, timeout=20000):
        el = self.pg.locator(sel).first
        el.wait_for(state='visible', timeout=timeout)
        el.scroll_into_view_if_needed()
        box = el.bounding_box()
        self.tap_xy(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)

    def tap_target(self, i):
        x, y = self.ev(f"__box.target({i})")
        self.tap_xy(x, y)

    # Trystero meldet das Schließen des Datenkanals als console.error, wenn die GEGENSEITE neu lädt
    # oder den Tisch verlässt – erwartet und kein App-Fehler
    BENIGN = ('Trystero peer error: OperationError: User-Initiated Abort',)
    # Chrome loggt gescheiterte WebSocket-Verbindungen zu öffentlichen Relays selbst als console.error
    # (VPN-/Relay-Aussetzer); die App verbindet neu → als Netz-Ereignis zählen, nicht als App-Fehler
    NETWORK = ("WebSocket connection to 'wss://",)

    def net_events(self):
        return [e for e in self.errors if any(b in e for b in self.NETWORK)]

    def app_errors(self):
        errs = [e for e in self.errors if not any(b in e for b in self.BENIGN + self.NETWORK)]
        return errs + ['JSERR ' + e for e in self.ev("__box.errors()")]

    def small_buttons(self):
        # sichtbare Knöpfe < 48 px oder außerhalb des Bildes (Chips 44 px hoch sind Vorschläge, ≥ 48 breit)
        return self.ev("""() => { const out=[]; const W=innerWidth,H=innerHeight;
          for (const b of document.querySelectorAll('button')) { const r=b.getBoundingClientRect(); const st=getComputedStyle(b);
            if (!r.width || st.display==='none' || st.visibility==='hidden' || b.offsetParent===null) continue;
            if (b.closest('.lobby') || b.closest('.sheet')) { /* scrollbare Bereiche: nur Größe prüfen */ }
            else if (r.left < -1 || r.top < -1 || r.right > W+1 || r.bottom > H+1) { out.push({t:(b.textContent||'').trim().slice(0,24), x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height), why:'außerhalb'}); continue; }
            const minH = b.classList.contains('chip') ? 43.5 : 47.5;
            if (r.width < 47.5 || r.height < minH) out.push({t:(b.textContent||'').trim().slice(0,24), w:Math.round(r.width), h:Math.round(r.height), why:'klein'}); }
          return out; }""")

    def board_check(self):
        # Brett ganz sichtbar (innerhalb des Viewports) und Touch-Ziele groß genug
        return self.ev("""() => { const m = __box.metrics(); const W = innerWidth, H = innerHeight;
          const svg = document.querySelector('svg.board'); const ctm = svg.getScreenCTM(); const vb = svg.viewBox.baseVal;
          const x0 = ctm.e + vb.x * ctm.a, y0 = ctm.f + vb.y * ctm.d, x1 = x0 + vb.width * ctm.a, y1 = y0 + vb.height * ctm.d;
          return { minTargetPx: m.minTargetPx, x0, y0, x1, y1, W, H, inside: x0 >= -1 && y0 >= -1 && x1 <= W + 1 && y1 <= H + 1, sizePx: x1 - x0 }; }""")

    def metrics(self):
        return self.ev("__box.metrics()")

    def close(self):
        try: self.ctx.close()
        except Exception: pass


def launch(pw):
    return pw.chromium.launch(args=ARGS)


class Checker:
    def __init__(self):
        self.fails = []
    def ok(self, cond, msg):
        print(('  ✅ ' if cond else '  ❌ ') + msg, flush=True)
        if not cond: self.fails.append(msg)
        return cond
