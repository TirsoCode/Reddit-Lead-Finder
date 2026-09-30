/**
 * Lanza la búsqueda para todos los perfiles activos.
 *   npm run cron          → una tanda ahora
 *   CRON=true npm run cron → se queda escuchando con el plan configurado
 */
import cron from 'node-cron';
import { env } from '../env.js';
import { pool } from '../db.js';
import { createLogger } from '../logger.js';
import { listActiveProfiles } from '../repositories/profile.js';
import { runScan } from '../services/pipeline.js';
import { cleanupStaleRuns } from '../services/pipeline.js';

const log = createLogger('cron-cli');

async function main(): Promise<void> {
  await cleanupStaleRuns();
  const profiles = await listActiveProfiles(500);
  log.info(`${profiles.length} perfiles activos`);

  let ok = 0;
  let failed = 0;

  for (const profile of profiles) {
    try {
      const result = await runScan(profile.id, 'cron');
      if (result.status === 'success') ok += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      log.error(`Perfil ${profile.id}`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }

  log.info(`Terminado: ${ok} correctos, ${failed} con errores`);

  if (env.CRON_ENABLED && process.env.CRON === 'true') {
    if (!cron.validate(env.CRON_SCHEDULE)) throw new Error('CRON_SCHEDULE no es válida');
    cron.schedule(env.CRON_SCHEDULE, () => void main().catch((error) => log.error(error)), {
      timezone: 'UTC',
    });
    log.info(`Plan activo: ${env.CRON_SCHEDULE} UTC`);
    return; // el pool queda vivo
  }

  await pool.end();
}

main()
  .then(() => {
    if (process.env.CRON !== 'true') process.exit(0);
  })
  .catch(async (error) => {
    log.error('Falló el cron', error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
