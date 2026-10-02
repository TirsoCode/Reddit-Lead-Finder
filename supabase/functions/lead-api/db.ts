import pg from 'pg';
// Los tipos vienen aparte porque los exports con nombre de `pg` no se pueden
// detectar estáticamente (ver abajo). `import type` desaparece al compilar, así
// que `Pool` puede ser a la vez el tipo de una conexión y el valor del
// constructor.
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { env } from './env.ts';
import { createLogger } from './logger.ts';

const log = createLogger('db');

// `pg` es CommonJS y Deno no admite `import { Pool } from 'pg'`: los exports con
// nombre de un módulo CJS no se pueden detectar estáticamente (en Node sí, por
// detección automática). Se importa el módulo y se saca lo que hace falta.
const { Pool } = pg;

/**
 * Acceso a datos sobre el PostgreSQL de Supabase desde una Edge Function.
 *
 * Igual que en `server/db.ts`, la app no habla con Supabase por REST: se
 * conecta directamente a Postgres con el rol `postgres` de la connection string.
 * Ese rol ignora RLS, que es justo lo que queremos, porque todas las consultas
 * salen de esta función y filtran por `user_id` en el propio SQL.
 *
 * A diferencia del servidor de Node, el pool es muy pequeño por defecto: cada
 * invocación es una instancia nueva y el plan gratuito de Supabase limita las
 * conexiones simultáneas. `POOL_MAX` lo ajusta si hace falta.
 *
 * No hay `pool.end()` a petición: el runtime reutiliza el worker entre llamadas y
 * cerrar el pool lo deja muerto para siempre. Las conexiones ociosas se sueltan
 * solas gracias a `idleTimeoutMillis`.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: env.POOL_MAX,
  // Las instancias viven poco: soltar pronto las conexiones oientas es lo que
  // evita agotar el cupo del proyecto.
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error: Error) => {
  log.error('Error inesperado en el pool de PostgreSQL', error);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  client: Pool | PoolClient = pool,
): Promise<T[]> {
  const result = await client.query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  client: Pool | PoolClient = pool,
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

/** Ejecuta SQL con varias sentencias seguidas. */
export async function exec(sql: string, client: Pool | PoolClient = pool): Promise<void> {
  await client.query(sql);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
