// Alle Node-Tests nacheinander; Exit-Code 1, wenn einer rot ist.
// Aufruf: npm test            (alles, inkl. Zufalls-Schwarm 10 000 Partien je Spiel und Regelvariante)
//         npm test -- --schnell  (ohne Schwarm)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const quick = process.argv.includes('--schnell');
const files = ['words.test.mjs', 'crypto.test.mjs', 'relaychannel.test.mjs', 'muehle.test.mjs', 'dame.test.mjs', 'table.test.mjs'];
if (!quick) files.push('muehle.swarm.test.mjs', 'dame.swarm.test.mjs');
let bad = 0;
const t0 = Date.now();
for (const f of files) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.trim().split('\n');
  const fails = lines.filter((l) => l.includes('❌'));
  if (r.status !== 0) { bad++; console.log(out); }
  console.log(`${r.status === 0 ? '✓' : '✗'} ${f}  (${((Date.now() - t) / 1000).toFixed(1)} s, ${lines.filter((l) => l.includes('✅')).length} ✅, ${fails.length} ❌)`);
}
console.log(bad ? `\n${bad} Testdatei(en) rot` : `\nAlle Node-Tests grün (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(bad ? 1 : 0);
