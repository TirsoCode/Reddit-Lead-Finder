import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('db');

/**
 * Acceso a datos sobre el PostgreSQL de Supabase.
 *
 * La app no habla con Supabase por REST: se conecta directamente a Postgres con
 * el rol `postgres` de la connection string (Project Settings → Database). Ese
 * rol ignora RLS, que es justo lo que queremos aquí, porque todas las consultas
 * salen de la API de Express y filtran por `user_id` en el propio SQL.
 *
 * La conexión es siempre TLS salvo contra `localhost`, para que el string de
 * conexión sea el mismo en local y en producción sin tocar nada.
 */
const isLocalHost = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocalHost ? undefined : { rejectUnauthorized: false },
  max: env.isProd ? 10 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
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

/**
 * Ejecuta SQL con varias sentencias seguidas (migraciones). Pasa el cliente de
 * una transacción si la quieres dentro de ella: con el pool por defecto la
 * sentencia iría por otra conexión y el `rollback` no la revertiría.
 */
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

export async function closePool(): Promise<void> {
  await pool.end();
}
