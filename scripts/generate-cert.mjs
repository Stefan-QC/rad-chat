// Maakt een zelfondertekend certificaat voor https, nodig voor de microfoon op andere computers dan localhost.
// Gebruik: npm run cert   (vereist openssl; dat zit bij Git for Windows, macOS en Linux)
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'certs');
if (existsSync(join(dir, 'cert.pem')) && !process.argv.includes('--force')) {
  console.log('certs/cert.pem exists already. Use "npm run cert -- --force" to replace it.');
  process.exit(0);
}
mkdirSync(dir, { recursive: true });

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter(a => a && a.family === 'IPv4' && !a.internal)
  .map(a => `IP:${a.address}`);
const san = ['DNS:localhost', 'IP:127.0.0.1', ...addresses].join(',');

try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
    '-subj', '/CN=RAD Chat', '-addext', `subjectAltName=${san}`,
  ], { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  console.log(`Certificate created in certs/ for: ${san}`);
  console.log('Restart the server. Everyone has to accept the browser warning once.');
} catch {
  console.error('openssl was not found. Install it (it comes with Git for Windows) and run this again.');
  process.exit(1);
}
