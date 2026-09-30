import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { ensureProfile } from '../repositories/profile.js';
import { getUserStats } from '../services/pipeline.js';

export const statsRouter = Router();

statsRouter.get('/', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    await ensureProfile(auth.userId);
    const stats = await getUserStats(auth.userId);
    res.json({ stats });
  } catch (error) {
    next(error);
  }
});
