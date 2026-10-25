// Draait de pytest-tests van de Python-API met de virtuele omgeving uit `npm run setup`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'api');
const windows = process.platform === 'win32';
const python = join(apiDir, '.venv', windows ? 'Scripts' : 'bin', windows ? 'python.exe' : 'python');

if (!existsSync(python)) {
  console.error('Python environment not found. Run "npm run setup" first.');
  process.exit(1);
}
process.exit(spawnSync(python, ['-m', 'pytest', '-q'], { cwd: apiDir, stdio: 'inherit' }).status ?? 1);
