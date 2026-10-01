import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { checkAiHealth } from '../services/ai.js';

export const aiRouter = Router();

/**
 * Estado de la conexión con la IA. La interfaz lo llama para poder decir
 * "la IA está conectada" (o qué le falta) sin que haya que fallar al analizar
 * una web entera para enterarse.
 */
aiRouter.get('/status', async (req, res, next) => {
  try {
    await requireAuth(req);
    res.json({ ai: await checkAiHealth() });
  } catch (error) {
    next(error);
  }
});