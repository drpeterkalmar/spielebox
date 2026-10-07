# Schreibt sw.js neu: Precache-Liste aller App-Dateien + Inhalts-Hash als Version (Cache-Busting),
# dazu src/build.js (Version in der App). Nach jeder Änderung an App-Dateien: python3 tools/update_sw.py
# Prüfmodus (CI): python3 tools/update_sw.py --check – rechnet nur nach, schreibt nichts, Exit 1 bei Abweichung.
import hashlib, os, subprocess, sys
CHECK = '--check' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Nur Dateien, die im Git-Index stehen (eingecheckt oder mit git add vorgemerkt): halbfertige Dateien (z. B. neue
# Spiele, an denen noch gearbeitet wird) kämen sonst in die Precache-Liste, fehlten live → Installation scheitert.
# Also: erst `git add <neue Dateien>`, dann dieses Skript.
TRACKED = set(subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split('\n'))
files = ['index.html', 'manifest.webmanifest', 'css/style.css']
for d in ['src', 'lib', 'icons', 'assets']:
    for dp, dn, fn in os.walk(os.path.join(ROOT, d)):
        for f in sorted(fn):
            if f.endswith(('.js', '.png', '.css', '.webp', '.jpg', '.svg')) and not f.startswith('.'):
                files.append(os.path.relpath(os.path.join(dp, f), ROOT))
# JPG-Texturen sind nur Rückfall (die App lädt .webp) → nicht vorab laden
files = sorted(set(f for f in files if not (f.startswith('assets/wood/') and f.endswith('.jpg'))))
skipped = [f for f in files if f not in TRACKED and f != 'src/build.js']
files = [f for f in files if f in TRACKED or f == 'src/build.js']
# Karten (n9): vorab nur die doppelt aufgelösten Atlanten (4 Dateien statt 84 Einzelkarten, tools/build_atlas.mjs).
# Einzelkarten (Rückfall ?atlas=0, Lobby-Bildchen) und 1×-Atlanten lädt die Seite bei Bedarf (Bilder-Cache per Hash).
files = [f for f in files if not (f.startswith('assets/cards/') and f.endswith('.webp')
                                   and not (f.startswith('assets/cards/atlas/') and '@2x' in f))]
# Bilder (assets/): eigener, versionsloser Cache im Service-Worker; Schlüssel = Pfad + Inhalts-Hash je Datei.
# Hash-Liste für alle eingecheckten Bilder (auch die nicht vorab geladenen 1×-Karten und JPG-Rückfälle).
fhash = lambda f: hashlib.sha256(open(os.path.join(ROOT, f), 'rb').read()).hexdigest()[:10]
asset_hash = {f: fhash(f) for f in sorted(t for t in TRACKED if t.startswith('assets/') and t.endswith(('.png', '.webp', '.jpg', '.svg')))}
core = [f for f in files if not f.startswith('assets/')]
pre = [f for f in files if f.startswith('assets/')]
h = hashlib.sha256()
for f in files:
    if f == 'src/build.js': continue  # enthält selbst die Version
    h.update(f.encode()); h.update(open(os.path.join(ROOT, f), 'rb').read())
h.update(repr(sorted(asset_hash.items())).encode())
ver = h.hexdigest()[:10]
tpl = open(os.path.join(ROOT, 'tools', 'sw.template.js')).read()
lst = lambda xs: ',\n  '.join("'" + f + "'" for f in xs)
out = (tpl.replace('__VERSION__', ver).replace('__CORE__', lst(core)).replace('__PRE__', lst(pre))
       .replace('__ASSET_HASH__', ',\n  '.join(f"'{f}': '{x}'" for f, x in asset_hash.items())))
build = f"export const BUILD = '{ver}';\n"
if CHECK:
    bad = [n for n, want in (('sw.js', out), ('src/build.js', build)) if open(os.path.join(ROOT, n)).read() != want]
    if bad:
        print('sw.js/build.js passen nicht zum Inhalt (Version ' + ver + '): ' + ', '.join(bad) + ' – python3 tools/update_sw.py ausführen')
        sys.exit(1)
    print('sw.js Version', ver, 'stimmt')
    sys.exit(0)
open(os.path.join(ROOT, 'sw.js'), 'w').write(out)
open(os.path.join(ROOT, 'src', 'build.js'), 'w').write(build)
size = sum(os.path.getsize(os.path.join(ROOT, f)) for f in files)
print('sw.js Version', ver, len(files), 'Dateien', round(size / 1e6, 2), 'MB', f'(Kern {len(core)}, Bilder vorab {len(pre)} von {len(asset_hash)})')
if skipped: print('nicht im Git-Index (nicht vorab geladen):', ', '.join(skipped[:12]) + (' …' if len(skipped) > 12 else ''))
