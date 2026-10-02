import { env } from '../env.ts';
import { createLogger } from '../logger.ts';
import { listProfilesNeedingScan } from '../repositories/profile.ts';
import { cleanupStaleRuns, runScan } from './pipeline.ts';

const log = createLogger('scheduler');

/**
 * Búsqueda programada en modo serverless.
 *
 * En `server/services/scheduler.ts` esto era un `node-cron` dentro de un proceso
 * vivo. Aquí no hay proceso: una Edge Function nace, hace su trabajo y muere.
 * Por eso el planificador son dos piezas:
 *
 *  1. Esta función `runScheduledBatch()`, que atiende a unos pocos usuarios y
 *     devuelve. `pg_cron` es quien la llama cada 10 minutos.
 *  2. La migración que crea los trabajos de Postgres (08:00 y 20:00 UTC).
 *
 * La tanda se corta antes de `SCAN_TIME_BUDGET_MS` (105 s de los 150 s
 * disponibles): si un usuario se atasca, no se come el resto de la invocación.
 * Quien no haya entrado entra en la tanda siguiente, porque
 * `listProfilesNeedingScan` ordena por antigüedad de la última búsqueda.
 */

export interface BatchProfileResult {
  userId: string;
  ok: boolean;
  fetched?: number;
  newPosts?: number;
  error?: string;
}

export interface ScheduledBatchResult {
  /** Perfiles con la web ya analizada que había pendientes. */
  candidates: number;
  scanned: number;
  ok: number;
  failed: number;
  elapsedMs: number;
  /** `budget` = se agotó el tiempo; `done` = se cubrió la lista entera. */
  stoppedBy: 'budget' | 'done';
  results: BatchProfileResult[];
}

/**
 * Atiende la siguiente tanda de usuarios. Pensada para un solo intento por
 * invocación: si `hasRunInFlight` dice que otro ya está trabajando, se salta.
 */
export async function runScheduledBatch(): Promise<ScheduledBatchResult> {
  const startedAt = Date.now();
  const results: BatchProfileResult[] = [];

  await cleanupStaleRuns();

  const profiles = await listProfilesNeedingScan(env.CRON_BATCH_USERS);
  log.info(`Tanda programada: ${profiles.length} perfiles candidatos`);

  for (const profile of profiles) {
    if (Date.now() - startedAt > env.SCAN_TIME_BUDGET_MS) {
      log.info('Presupuesto de tiempo agotado; el resto espera a la siguiente tanda');
      return {
        candidates: profiles.length,
        scanned: results.length,
        ok: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length,
        elapsedMs: Date.now() - startedAt,
        stoppedBy: 'budget',
        results,
      };
    }

    try {
      const scan = await runScan(profile.id, 'cron');
      results.push({
        userId: profile.id,
        ok: scan.status === 'success',
        fetched: scan.fetched,
        newPosts: scan.newPosts,
        error: scan.error,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Falló la búsqueda programada de ${profile.id}`, message);
      results.push({ userId: profile.id, ok: false, error: message });
    }
  }

  return {
    candidates: profiles.length,
    scanned: results.length,
    ok: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    elapsedMs: Date.now() - startedAt,
    stoppedBy: 'done',
    results,
  };
}
