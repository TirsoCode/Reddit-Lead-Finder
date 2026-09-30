import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { HttpError } from '../errors.js';
import { ensureProfile, setTimezone, setTone } from '../repositories/profile.js';
import { recentRuns } from '../repositories/runs.js';
import { analyzeUserProduct, generateReplies, pendingReplyCount, runScan } from '../services/pipeline.js';
import { topScoredLeads } from '../repositories/leads.js';
import type { Tone } from '../types.js';

export const profileRouter = Router();

const toneSchema = z.enum(['conversational', 'professional', 'friendly']);
const timezoneSchema = z.string().min(1).max(64).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('es', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Zona horaria no válida' },
);

const urlSchema = z
  .string()
  .trim()
  .min(4, 'Introduce la URL de tu producto')
  .max(500, 'La URL es demasiado larga');

profileRouter.get('/', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const profile = await ensureProfile(auth.userId);
    const [runs, pendingReplies] = await Promise.all([
      recentRuns(auth.userId, 5),
      pendingReplyCount(auth.userId),
    ]);

    res.json({
      profile: {
        ...profile,
        created_at: undefined,
        updated_at: undefined,
      },
      runs,
      pendingReplies,
    });
  } catch (error) {
    next(error);
  }
});

/** Guarda la URL, analiza la web y regenera las keywords. */
profileRouter.put('/', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const body = z
      .object({ product_url: urlSchema })
      .safeParse(req.body ?? {});

    if (!body.success) {
      throw HttpError.badRequest('Revisa la URL de tu producto', body.error.flatten().fieldErrors);
    }

    const { profile } = await analyzeUserProduct(auth.userId, body.data.product_url);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

profileRouter.patch('/', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const body = z
      .object({
        tone: toneSchema.optional(),
        timezone: timezoneSchema.optional(),
      })
      .safeParse(req.body ?? {});

    if (!body.success) throw HttpError.badRequest('Datos de perfil no válidos');
    if (!body.data.tone && !body.data.timezone) {
      throw HttpError.badRequest('No hay nada que actualizar');
    }

    await ensureProfile(auth.userId);
    let profile = await ensureProfile(auth.userId);

    if (body.data.tone) profile = await setTone(auth.userId, body.data.tone as Tone);
    if (body.data.timezone) profile = await setTimezone(auth.userId, body.data.timezone);

    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

/** Lanza la búsqueda manualmente (el cron ya corre 2 veces al día). */
profileRouter.post('/scan', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const result = await runScan(auth.userId, 'manual');
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

/** Genera las respuestas sugeridas que faltan (hasta 10). */
profileRouter.post('/replies', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const profile = await ensureProfile(auth.userId);
    const pending = await topScoredLeads(auth.userId, 10);
    const generated = await generateReplies(profile, pending);
    res.json({ generated });
  } catch (error) {
    next(error);
  }
});
