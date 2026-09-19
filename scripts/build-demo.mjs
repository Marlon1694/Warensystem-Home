/**
 * Baut die Browser-Demo und fügt sie zu einer einzigen HTML-Seite zusammen.
 *
 * Die Demo läuft ohne Server: ein Speicher im Browser beantwortet die Aufrufe
 * an /api (siehe web/src/demo/mock-server.ts). Gedacht zum Ausprobieren und
 * Herzeigen – die echten Daten liegen beim Betrieb auf dem eigenen Server.
 *
 *   node scripts/build-demo.mjs [Zieldatei]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(rootDir, 'web');
const buildDir = join(webDir, 'dist-demo');

const target = resolve(process.argv[2] ?? join(rootDir, 'dist-demo', 'warensystem-demo.html'));

console.log('[demo] Baue Oberfläche …');
execFileSync('npx', ['vite', 'build', '--config', 'vite.demo.config.ts'], {
  cwd: webDir,
  stdio: 'inherit',
});

const css = readFileSync(join(buildDir, 'app.css'), 'utf8');
const js = readFileSync(join(buildDir, 'app.js'), 'utf8');

/**
 * Die Seite wird eingebettet ausgeliefert und bringt deshalb kein eigenes
 * Grundgerüst mit. Die umgebende Seite setzt bereits Randabstände für Notch
 * und Home-Indikator; die App verzichtet hier auf ihre eigenen, damit sie
 * nicht doppelt gezählt werden. Die feste Navigationsleiste hängt am unteren
 * Bildschirmrand und braucht ihren Abstand weiterhin selbst.
 */
const embedStyles = `
:root {
  --safe-top: 0px;
  --safe-left: 0px;
  --safe-right: 0px;
  --safe-bottom: 0px;
}

html, body { height: 100%; }
.app { min-height: 100%; }
.nav { padding-bottom: env(safe-area-inset-bottom, 0px); }

.demo-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 16px;
  background: var(--brand-tint);
  color: var(--brand);
  font-family: var(--font);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  border-bottom: 1px solid var(--line);
}

.demo-note span {
  font-weight: 400;
  color: var(--ink-secondary);
}
`;

const page = `<title>Warensystem Home</title>
<style>
${css}
${embedStyles}
</style>

<p class="demo-note">
  Demo mit Beispieldaten
  <span>Änderungen bleiben nur bis zum Neuladen erhalten.</span>
</p>

<div id="root"></div>

<script type="module">
${js}
</script>
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, page, 'utf8');

const kb = (Buffer.byteLength(page, 'utf8') / 1024).toFixed(0);
console.log(`[demo] ${target} geschrieben (${kb} kB)`);
