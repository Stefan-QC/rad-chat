// Draait de migraties en SQL-tests op een tijdelijke lokale Postgres (geen Supabase-project nodig).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const only = process.argv.slice(2);
const port = 54000 + Math.floor(Math.random() * 900);
const dataDir = mkdtempSync(join(tmpdir(), 'radchat-pg-'));

const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
const read = (dir, name) => readFileSync(join(dir, name), 'utf8');
const sorted = (dir, suffix) => readdirSync(dir).filter(name => name.endsWith(suffix)).sort();

let failed = 0;
let passed = 0;

async function main() {
  await server.initialise();
  await server.start();
  const client = new pg.Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();
  client.on('notice', notice => {
    if (notice.message.startsWith('ok - ')) passed++;
    console.log('  ' + notice.message);
  });

  await client.query(read(here, 'bootstrap.sql'));
  await client.query(read(here, 'helpers.sql'));
  for (const file of sorted(migrationsDir, '.sql')) {
    await client.query(read(migrationsDir, file));
    console.log(`migration applied: ${file}`);
  }

  for (const file of sorted(here, '.test.sql')) {
    if (only.length && !only.some(name => file.includes(name))) continue;
    console.log(`\n${file}`);
    try {
      await client.query('begin');
      await client.query(read(here, file));
    } catch (error) {
      failed++;
      console.log(`  ✗ ${error.message}`);
    } finally {
      await client.query('rollback');
    }
  }
  await client.end();
}

try {
  await main();
} catch (error) {
  failed++;
  console.error(error);
} finally {
  await server.stop().catch(() => undefined);
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\n${passed} checks passed, ${failed} test file(s) failed`);
process.exit(failed ? 1 : 0);
