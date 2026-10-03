import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { HttpError } from '../errors.js';
import {
  countLeads,
  deleteByStatus,
  deleteLead,
  getLead,
  listLeads,
  setStatus,
  setStatusBulk,
} from '../repositories/leads.js';
import { recentRuns } from '../repositories/runs.js';
import { pendingReplyCount, refreshReply } from '../services/pipeline.js';
import type { LeadStatus } from '../types.js';

const STATUSES: ReadonlySet<string> = new Set([
  'new',
  'saved',
  'replied',
  'dismissed',
  'all',
]);

/** Los ids viajan como `uuid[]`: se filtran los que no lo son para que el error sea del 400. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const leadsRouter = Router();

/**
 * Vacía una pila entera de golpe. Solo se permite `dismissed`: es la única
 * acción destructiva que tiene sentido ("descarté 200 posts, sácame de aquí").
 */
leadsRouter.delete('/', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status !== 'dismissed') {
      throw HttpError.badRequest('Solo se pueden borrar los posts descartados');
    }
    const deleted = await deleteByStatus(auth.userId, 'dismissed');
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

/** Aplica un estado a varios posts de una vez (acciones en bloque del panel). */
leadsRouter.post('/bulk', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const body = req.body as { ids?: unknown; status?: unknown };
    const status = body.status;
    if (typeof status !== 'string' || !STATUSES.has(status) || status === 'all') {
      throw HttpError.badRequest('Estado no válido');
    }
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      throw HttpError.badRequest('No hay posts seleccionados');
    }

    const ids = body.ids
      .filter((id): id is string => typeof id === 'string' && UUID.test(id))
      .slice(0, 100);

    const updated = await setStatusBulk(auth.userId, ids, status as LeadStatus);
    res.json({ updated });
  } catch (error) {
    next(error);
  }
});

leadsRouter.get('/', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const query = req.query;

    const status = typeof query.status === 'string' ? query.status : 'all';
    if (!STATUSES.has(status)) throw HttpError.badRequest('Filtro de estado no válido');

    const sortRaw = typeof query.sort === 'string' ? query.sort : 'relevance';
    const sort = (['relevance', 'new', 'upvotes', 'comments'] as const).includes(
      sortRaw as 'relevance',
    )
      ? (sortRaw as 'relevance' | 'new' | 'upvotes' | 'comments')
      : 'relevance';

    const minRelevance =
      typeof query.minRelevance === 'string' && query.minRelevance !== ''
        ? Number.parseInt(query.minRelevance, 10)
        : undefined;

    const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '25'), 10) || 25));
    const offset = Math.max(0, Number.parseInt(String(query.offset ?? '0'), 10) || 0);
    const search = typeof query.search === 'string' ? query.search : undefined;
    const subreddit = typeof query.subreddit === 'string' ? query.subreddit.trim() : undefined;

    const filters = {
      status: status as LeadStatus | 'all',
      minRelevance: Number.isFinite(minRelevance) ? minRelevance : undefined,
      search,
      subreddit,
      sort,
    };

    const [leads, total] = await Promise.all([
      listLeads(auth.userId, { ...filters, limit, offset }),
      countLeads(auth.userId, filters),
    ]);

    res.json({ leads, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

leadsRouter.get('/:id', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const lead = await getLead(auth.userId, String(req.params.id));
    if (!lead) throw HttpError.notFound('Ese post no existe o ya no está en tu bandeja');
    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

leadsRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const status = (req.body as { status?: string }).status;
    if (!status || !STATUSES.has(status) || status === 'all') {
      throw HttpError.badRequest('Estado no válido');
    }

    const lead = await setStatus(auth.userId, String(req.params.id), status as LeadStatus);
    if (!lead) throw HttpError.notFound('Ese post no existe');
    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

leadsRouter.delete('/:id', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const deleted = await deleteLead(auth.userId, String(req.params.id));
    if (!deleted) throw HttpError.notFound('Ese post no existe');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/** Genera (o regenera) la respuesta sugerida de un post. */
leadsRouter.post('/:id/reply', async (req, res, next) => {
  try {
    const auth = await requireAuth(req);
    const lead = await refreshReply(auth.userId, String(req.params.id));
    res.json({ lead });
  } catch (error) {
    next(error);
  }
});
