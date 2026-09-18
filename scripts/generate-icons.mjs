/**
 * Erzeugt die PNG-Symbole der PWA aus den SVG-Vorlagen in web/public.
 *
 * iOS verlangt für "Zum Home-Bildschirm" ein PNG – SVG-Symbole ignoriert Safari.
 * Die erzeugten Dateien liegen im Repository, das Skript wird also nur
 * gebraucht, wenn sich das Symbol ändert:
 *
 *   npx --yes @resvg/resvg-js@2 --help >/dev/null   # lädt den Renderer
 *   node scripts/generate-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public');

const TARGETS = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512 },
  { svg: 'icon.svg', out: 'apple-touch-icon.png', size: 180 },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
];

const { Resvg } = await import('@resvg/resvg-js');

for (const target of TARGETS) {
  const svg = readFileSync(join(publicDir, target.svg), 'utf8');
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: target.size } });
  writeFileSync(join(publicDir, target.out), renderer.render().asPng());
  console.log(`[icons] ${target.out} (${target.size}px)`);
}
