# Schreibt sw.js neu: Precache-Liste aller App-Dateien + Inhalts-Hash als Version (Cache-Busting),
# dazu src/build.js (Version in der App). Nach jeder Änderung an App-Dateien: python3 tools/update_sw.py
import hashlib, os, subprocess
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
# Karten: nur die doppelt aufgelösten vorab laden (Handys); 1× lädt ein Desktop bei Bedarf
files = [f for f in files if not (f.startswith('assets/cards/') and f.endswith('.webp') and '@2x' not in f)]
h = hashlib.sha256()
for f in files:
    if f == 'src/build.js': continue  # enthält selbst die Version
    h.update(f.encode()); h.update(open(os.path.join(ROOT, f), 'rb').read())
ver = h.hexdigest()[:10]
tpl = open(os.path.join(ROOT, 'tools', 'sw.template.js')).read()
out = tpl.replace('__VERSION__', ver).replace('__ASSETS__', ',\n  '.join("'" + f + "'" for f in files))
open(os.path.join(ROOT, 'sw.js'), 'w').write(out)
open(os.path.join(ROOT, 'src', 'build.js'), 'w').write(f"export const BUILD = '{ver}';\n")
size = sum(os.path.getsize(os.path.join(ROOT, f)) for f in files)
print('sw.js Version', ver, len(files), 'Dateien', round(size / 1e6, 2), 'MB')
if skipped: print('nicht im Git-Index (nicht vorab geladen):', ', '.join(skipped[:12]) + (' …' if len(skipped) > 12 else ''))
