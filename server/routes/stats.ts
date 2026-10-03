import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { ensureProfile } from '../repositories/profile.js';
import { getUserStats } from '../services/pipeline.js';

/** Periodos que ofrece el panel. Cualquier otro valor se recorta a este rango. */
const MIN_DAYS = 1;
const MAX_DAYS = 365;

export const statsRouter = Router();

/** `?days=7|30|90`: los días que abarca el panel. Por defecto, 30. */
function parseDays(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? '30'), 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, parsed));
}

statsRouter.get('/', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    await ensureProfile(auth.userId);
    const stats = await getUserStats(auth.userId, parseDays(req.query.days));
    res.json({ stats });
  } catch (error) {
    next(error);
  }
});
