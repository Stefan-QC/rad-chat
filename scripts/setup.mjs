// Richt RAD Chat in met één commando: pakketten installeren, Python-omgeving maken, de app bouwen en een certificaat aanmaken.
//   npm run setup               (daarna: npm start)
//   npm run setup -- --firewall (opent ook poort 3000 in de Windows-firewall; vereist een admin-terminal)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';
const API_DIR = join(ROOT, 'backend', 'api');
const VENV_PYTHON = join(API_DIR, '.venv', WINDOWS ? 'Scripts' : 'bin', WINDOWS ? 'python.exe' : 'python');

/** Eén stap van de installatie, met een duidelijke melding als het misgaat. */
class Step {
  constructor(title, action) {
    this.title = title;
    this.action = action;
  }

  run(number, total) {
    console.log(`\n[${number}/${total}] ${this.title}`);
    this.action();
  }
}

/** npm draait via Node zelf, zodat er op Windows geen shell nodig is. */
function npm(args) {
  const script = process.env.npm_execpath;
  if (!script) throw new Error('Start this script with "npm run setup".');
  run(process.execPath, [script, ...args]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: ROOT, ...options });
  if (result.status !== 0) throw new Error(`"${command} ${args.join(' ')}" failed`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? `${result.stdout}${result.stderr}`.trim() : null;
}

/** Zoekt een Python van minstens 3.11. */
function findPython() {
  const candidates = WINDOWS ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
  for (const [command, prefix] of candidates) {
    const version = capture(command, [...prefix, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])']);
    const [major, minor] = (version ?? '').split('.').map(Number);
    if (major === 3 && minor >= 11) return [command, prefix];
  }
  throw new Error('Python 3.11 or newer was not found. Install it from python.org and run this again.');
}

const steps = [
  new Step('Checking Node.js', () => {
    if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node.js 18 or newer is required.');
    console.log(`Node ${process.versions.node}`);
  }),
  new Step('Creating the .env file', () => {
    const env = join(ROOT, '.env');
    if (existsSync(env)) return console.log('.env exists already, keeping it.');
    copyFileSync(join(ROOT, '.env.example'), env);
    console.log('.env created. Open it and fill in SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY, then run this again.');
  }),
  new Step('Installing the frontend packages', () => npm(['--prefix', 'frontend', 'install'])),
  new Step('Creating the Python environment for the API', () => {
    if (!existsSync(VENV_PYTHON)) {
      const [command, prefix] = findPython();
      run(command, [...prefix, '-m', 'venv', join(API_DIR, '.venv')]);
    }
    run(VENV_PYTHON, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', join(API_DIR, 'requirements-dev.txt')]);
  }),
  new Step('Building the app', () => npm(['--prefix', 'frontend', 'run', 'build'])),
  new Step('Creating the https certificate (needed for voice on other computers)', () => {
    try {
      run(process.execPath, [join(ROOT, 'scripts', 'generate-cert.mjs')]);
    } catch {
      console.log('Skipped: openssl was not found. The app still works over http; voice then only works on this computer.');
    }
  }),
  new Step('Windows firewall (only with --firewall)', () => {
    if (!process.argv.includes('--firewall')) return console.log('Skipped. Others cannot connect? Run "npm run setup -- --firewall" in an admin terminal.');
    if (!WINDOWS) return console.log('Not Windows, nothing to do.');
    run('netsh', ['advfirewall', 'firewall', 'add', 'rule', 'name=RAD Chat', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=3000', 'profile=private,domain']);
  }),
];

try {
  steps.forEach((step, index) => step.run(index + 1, steps.length));
  console.log('\nDone. Start everything with:  npm start');
} catch (error) {
  console.error(`\nSetup stopped: ${error.message}`);
  process.exit(1);
}
