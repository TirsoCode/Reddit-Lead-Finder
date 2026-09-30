import cron from 'node-cron';
import { env } from '../env.js';
import { createLogger } from '../logger.js';
import { listActiveProfiles } from '../repositories/profile.js';
import { cleanupStaleRuns, runScan } from './pipeline.js';

const log = createLogger('scheduler');

/** Usuarios por tanda: Reddit tolera mejor ráfagas pequeñas y espaciadas. */
const BATCH_SIZE = 2;
const DELAY_BETWEEN_USERS_MS = 4_000;
const DELAY_BETWEEN_BATCHES_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

async function scanAllUsers(trigger: 'cron'): Promise<void> {
  if (running) {
    log.warn('La búsqueda programada anterior sigue en curso; se omite esta tanda');
    return;
  }

  running = true;
  try {
    await cleanupStaleRuns();

    const profiles = await listActiveProfiles();
    log.info(`Búsqueda programada para ${profiles.length} perfiles`);

    for (let index = 0; index < profiles.length; index += BATCH_SIZE) {
      const batch = profiles.slice(index, index + BATCH_SIZE);

      for (const profile of batch) {
        try {
          await runScan(profile.id, trigger);
        } catch (error) {
          log.error(`Falló la búsqueda programada de ${profile.id}`, error);
        }
        if (index + BATCH_SIZE < profiles.length) await sleep(DELAY_BETWEEN_USERS_MS);
      }

      if (index + BATCH_SIZE < profiles.length) await sleep(DELAY_BETWEEN_BATCHES_MS);
    }

    log.info('Búsqueda programada terminada');
  } finally {
    running = false;
  }
}

let task: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  if (!env.CRON_ENABLED) {
    log.info('Búsqueda automática desactivada (CRON_ENABLED=false)');
    return;
  }

  if (!cron.validate(env.CRON_SCHEDULE)) {
    log.error(`CRON_SCHEDULE no es válida: "${env.CRON_SCHEDULE}". Se omite la búsqueda automática.`);
    return;
  }

  task = cron.schedule(env.CRON_SCHEDULE, () => void scanAllUsers('cron'), {
    timezone: 'UTC',
  });

  log.info(`Búsqueda automática activa (${env.CRON_SCHEDULE} UTC, 2 ejecuciones diarias)`);
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
}

/** Permite lanzar la tanda manualmente (endpoint de admin o pruebas). */
export async function runScheduledScanNow(): Promise<void> {
  await scanAllUsers('cron');
}

export function isScanRunning(): boolean {
  return running;
}
