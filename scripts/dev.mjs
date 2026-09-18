/**
 * Startet API und Oberfläche gemeinsam für die Entwicklung.
 *
 * Der Vite-Server unter http://localhost:5173 reicht alle /api-Anfragen an den
 * Node-Server auf Port 4000 weiter (siehe web/vite.config.ts).
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const tasks = [
  ['server', ['run', 'dev', '--workspace', 'server']],
  ['web', ['run', 'dev', '--workspace', 'web']],
];

const children = tasks.map(([name, args]) => {
  const child = spawn(npm, args, { cwd: rootDir, stdio: 'inherit', shell: false });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[dev] ${name} beendet mit Code ${code}`);
    shutdown();
  });
  return child;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
