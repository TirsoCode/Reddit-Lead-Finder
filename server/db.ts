import { Pool, type QueryResultRow } from 'pg';
import { env } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('db');

/**
 * La app habla siempre con PostgreSQL. Hay dos formas de conectarse:
 *
 *   postgresql://…  → PostgreSQL real (Supabase, Railway, docker local…)
 *   pglite://carpeta → PGlite, el mismo PostgreSQL compilado a WASM. Se usa para
 *                      desarrollo local cuando no hay un servidor disponible:
 *                      arranca en el proceso, sin instalar nada y sin permisos.
 */
export type DriverKind = 'postgres' | 'pglite';

export interface Driver {
  kind: DriverKind;
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  /** Ejecuta SQL con varias sentencias seguidas (migraciones). */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type PGliteInstance = {
  query<T = QueryResultRow>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: PGliteInstance) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function createPglite(): Driver {
  // Import diferido: en producción nunca se carga el binario de PGlite.
  const modulePath = '@electric-sql/pglite';
  const dir = env.DATABASE_URL.replace(/^pglite:\/\//, '') || '.redditleads';
  let instancePromise: Promise<PGliteInstance> | null = null;

  const getInstance = async (): Promise<PGliteInstance> => {
    instancePromise ??= (async () => {
      const [{ PGlite }, { pgcrypto }] = await Promise.all([
        import(modulePath),
        import('@electric-sql/pglite/contrib/pgcrypto'),
      ]);
      // pgcrypto no viene de serie en PGlite y el esquema la necesita.
      return new PGlite({ dataDir: dir, extensions: { pgcrypto } }) as unknown as PGliteInstance;
    })();
    return instancePromise;
  };

  const driver: Driver = {
    kind: 'pglite',
    async query(text, params = []) {
      const instance = await getInstance();
      return instance.query(text, [...params]);
    },
    async exec(sql) {
      const instance = await getInstance();
      await instance.exec(sql);
    },
    async transaction(fn) {
      const instance = await getInstance();
      return instance.transaction(async (tx) => {
        const transactional: Driver = {
          kind: 'pglite',
          query: (text, params = []) => tx.query(text, [...params]),
          exec: async (sql) => {
            await tx.exec(sql);
          },
          transaction: async (inner) => tx.transaction((innerTx) =>
            inner({
              kind: 'pglite',
              query: (text, params = []) => innerTx.query(text, [...params]),
              exec: async (sql) => {
                await innerTx.exec(sql);
              },
              transaction: async () => {
                throw new Error('No se admiten transacciones anidadas');
              },
              close: async () => undefined,
            }),
          ),
          close: async () => undefined,
        };
        return fn(transactional);
      });
    },
    async close() {
      if (!instancePromise) return;
      const instance = await instancePromise;
      await instance.close();
      instancePromise = null;
    },
  };

  return driver;
}

function createPostgres(): Driver {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl:
      env.isProd || env.DATABASE_URL.includes('supabase.co')
        ? { rejectUnauthorized: false }
        : undefined,
    max: env.isProd ? 10 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (error) => {
    log.error('Error inesperado en el pool de PostgreSQL', error);
  });

  return {
    kind: 'postgres',
    query: async (text, params = []) => pool.query(text, params as unknown[]),
    async exec(sql) {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({
          kind: 'postgres',
          query: (text, params = []) => client.query(text, params as unknown[]),
          exec: async (sql) => {
            await client.query(sql);
          },
          transaction: async () => {
            throw new Error('No se admiten transacciones anidadas');
          },
          close: async () => undefined,
        });
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export const db: Driver = env.DATABASE_URL.startsWith('pglite://') ? createPglite() : createPostgres();

/** Conexión compatible con `pg` para el resto del código. */
export const pool = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ) => db.query<T>(text, params),
  end: () => db.close(),
};

export type Queryable = Pick<Driver, 'query'>;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  db: Queryable = pool,
): Promise<T[]> {
  const result = await db.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  db: Queryable = pool,
): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: Driver) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
