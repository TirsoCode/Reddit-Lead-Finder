/**
 * Lanza la búsqueda para un usuario concreto (útil para depurar).
 *   npm run scan -- <usuario-uuid>
 *   npm run scan -- <usuario-uuid> reanalyze
 */
import { pool } from '../db.js';
import { createLogger } from '../logger.js';
import { ensureProfile } from '../repositories/profile.js';
import { analyzeUserProduct, runScan } from '../services/pipeline.js';

const log = createLogger('scan-cli');

async function main(): Promise<void> {
  const [userId, command = 'scan'] = process.argv.slice(2);

  if (!userId) {
    console.error('Uso: npm run scan -- <usuario-uuid> [reanalyze]');
    process.exit(1);
  }

  const profile = await ensureProfile(userId);

  if (command === 'reanalyze') {
    if (!profile.product_url) throw new Error('El perfil no tiene URL de producto');
    const { profile: updated } = await analyzeUserProduct(userId, profile.product_url);
    log.info('Keywords regeneradas', { keywords: updated.keywords, subreddits: updated.subreddits });
  }

  const result = await runScan(userId, 'manual');
  log.info('Resultado', result);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    log.error('Falló la búsqueda', error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
