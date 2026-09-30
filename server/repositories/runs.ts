import { query, queryOne } from '../db.js';
import type { RunStatus, RunTrigger, ScanRun } from '../types.js';

export async function startRun(userId: string, trigger: RunTrigger): Promise<ScanRun> {
  const row = await queryOne<ScanRun>(
    `insert into public.scan_runs (user_id, trigger, status)
     values ($1, $2, 'running')
     returning *`,
    [userId, trigger],
  );
  if (!row) throw new Error('No se pudo crear la ejecución');
  return row;
}

export async function finishRun(
  runId: string,
  status: RunStatus,
  stats: { postsFetched?: number; postsNew?: number; repliesGenerated?: number; error?: string | null } = {},
): Promise<void> {
  await query(
    `update public.scan_runs
        set status = $2,
            finished_at = now(),
            posts_fetched = coalesce($3, posts_fetched),
            posts_new = coalesce($4, posts_new),
            replies_generated = coalesce($5, replies_generated),
            error = $6
      where id = $1`,
    [
      runId,
      status,
      stats.postsFetched ?? null,
      stats.postsNew ?? null,
      stats.repliesGenerated ?? null,
      stats.error ? stats.error.slice(0, 1000) : null,
    ],
  );
}

export async function lastRun(userId: string): Promise<ScanRun | null> {
  return queryOne<ScanRun>(
    `select * from public.scan_runs where user_id = $1 order by started_at desc limit 1`,
    [userId],
  );
}

export async function recentRuns(userId: string, limit = 5): Promise<ScanRun[]> {
  return query<ScanRun>(
    `select * from public.scan_runs where user_id = $1 order by started_at desc limit $2`,
    [userId, limit],
  );
}

/**
 * ¿Hay una ejecución en curso? Evita que el cron y una búsqueda manual
 * se pisen y gasten cuota de la API de Reddit duplicando inserts.
 */
export async function hasRunInFlight(userId: string, minutes = 30): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `select exists (
       select 1 from public.scan_runs
        where user_id = $1
          and status = 'running'
          and started_at > now() - ($2 || ' minutes')::interval
     ) as exists`,
    [userId, String(minutes)],
  );
  return row?.exists ?? false;
}

/** Marca como fallidas las ejecuciones que quedaron colgadas (reinicio del server). */
export async function reapStaleRuns(): Promise<number> {
  const rows = await query<{ id: string }>(
    `update public.scan_runs
        set status = 'error', finished_at = now(), error = 'Ejecución interrumpida'
      where status = 'running'
        and started_at < now() - interval '1 hour'
      returning id`,
  );
  return rows.length;
}
