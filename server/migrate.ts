import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, exec, query, withTransaction } from './db.js';
import { createLogger } from './logger.js';

const log = createLogger('migrate');
const here = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio, válida tanto en `tsx server/` como en `dist/server/`. */
const ROOT_DIR = join(here, '..');

/** Las migraciones viven aquí, con el prefijo de timestamp que usa la CLI. */
async function findMigrationsDir(): Promise<string> {
  const candidates = [
    join(ROOT_DIR, 'supabase', 'migrations'),
    join(process.cwd(), 'supabase', 'migrations'),
  ];

  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate);
      if (entries.some((entry) => entry.endsWith('.sql'))) return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('No se encontró la carpeta supabase/migrations con archivos .sql');
}

async function main(): Promise<void> {
  const dir = await findMigrationsDir();
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();

  if (files.length === 0) {
    throw new Error(`No hay migraciones en ${dir}`);
  }

  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8');
    log.info(`Aplicando ${file}…`);

    // Una transacción por migración: si una falla no deja la anterior a medias.
    // La migración va por el mismo cliente que la transacción, si no el
    // `rollback` no revertiría nada.
    await withTransaction(async (client) => {
      await exec(sql, client);
    });

    log.info(`  ${file} aplicada`);
  }

  const tables = await query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name in ('profiles','leads','scan_runs')
     order by table_name`,
  );

  const found = tables.map((row) => row.table_name);
  const missing = ['leads', 'profiles', 'scan_runs'].filter((table) => !found.includes(table));

  if (missing.length > 0) {
    throw new Error(`La migración no creó estas tablas: ${missing.join(', ')}`);
  }

  log.info('Esquema correcto:', found.join(', '));
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    log.error('Fallo la migración', error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
