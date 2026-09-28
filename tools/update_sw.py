# Schreibt sw.js neu: Precache-Liste aller App-Dateien + Inhalts-Hash als Version (Cache-Busting),
# dazu src/build.js (Version in der App). Nach jeder Änderung an App-Dateien: python3 tools/update_sw.py
import hashlib, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = ['index.html', 'manifest.webmanifest', 'css/style.css']
for d in ['src', 'lib', 'icons', 'assets']:
    for dp, dn, fn in os.walk(os.path.join(ROOT, d)):
        for f in sorted(fn):
            if f.endswith(('.js', '.png', '.css', '.webp', '.jpg', '.svg')) and not f.startswith('.'):
                files.append(os.path.relpath(os.path.join(dp, f), ROOT))
# JPG-Texturen sind nur Rückfall (die App lädt .webp) → nicht vorab laden
files = sorted(set(f for f in files if not (f.startswith('assets/wood/') and f.endswith('.jpg'))))
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
