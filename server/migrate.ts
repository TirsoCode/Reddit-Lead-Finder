import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool, query } from './db.js';
import { env } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('migrate');
const here = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio, válida tanto en `tsx server/` como en `dist/server/`. */
export const ROOT_DIR = join(here, '..');

/**
 * En modo local (DEV_AUTH) no hay Supabase, así que recreamos la tabla `auth.users`
 * que el esquema espera para la clave ajena. Es una versión mínima: solo guarda
 * el email y el hash scrypt de la contraseña.
 */
const DEV_AUTH_SCHEMA = `
create schema if not exists auth;

create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text,
  created_at    timestamptz not null default now()
);
`;

async function main(): Promise<void> {
  const candidates = [
    join(ROOT_DIR, 'supabase', 'schema.sql'),
    join(process.cwd(), 'supabase', 'schema.sql'),
  ];

  let sql: string | null = null;
  for (const candidate of candidates) {
    try {
      sql = await readFile(candidate, 'utf8');
      break;
    } catch {
      continue;
    }
  }

  if (!sql) {
    throw new Error('No se encontró supabase/schema.sql');
  }

  if (env.DEV_AUTH) {
    log.info('DEV_AUTH activo: creando la tabla mínima auth.users…');
    await db.exec(DEV_AUTH_SCHEMA);
  }

  log.info(`Aplicando esquema (driver: ${db.kind})…`);
  await db.exec(sql);
  log.info('Esquema aplicado correctamente');

  const { rows } = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name in ('profiles','leads','scan_runs')
     order by table_name`,
  );
  log.info('Tablas detectadas', rows.map((row) => row.table_name).join(', '));
  void query;
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    log.error('Fallo la migración', error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
