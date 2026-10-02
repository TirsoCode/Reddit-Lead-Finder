import { z } from 'zod';
import { pool } from './db.ts';
import { describeIntegrations, env } from './env.ts';
import { HttpError } from './errors.ts';
import { createLogger } from './logger.ts';
import { createContext, Router, type RouteContext } from './http/router.ts';
import { requireAuth, requireCronSecret } from './auth.ts';
import {
  countLeads,
  deleteLead,
  getLead,
  listLeads,
  setStatus,
  topScoredLeads,
} from './repositories/leads.ts';
import { ensureProfile, setTimezone, setTone } from './repositories/profile.ts';
import { recentRuns } from './repositories/runs.ts';
import {
  analyzeUserProduct,
  generateReplies,
  getUserStats,
  pendingReplyCount,
  refreshReply,
  runScan,
} from './services/pipeline.ts';
import { checkAiHealth } from './services/ai.ts';
import { runScheduledBatch } from './services/scheduler.ts';
import type { LeadStatus, Tone } from './types.ts';

const log = createLogger('api');

/**
 * Punto de entrada de la API en Supabase Edge Functions.
 *
 * Sustituye a `server/index.ts` (Express). La tabla de rutas es la misma; lo que
 * cambia es el envoltorio: CORS, porque aquí la API vive en `*.supabase.co` y
 * el frontend en `*.vercel.app`, y el recorte del prefijo que antepone la
 * pasarela de Supabase a la ruta.
 */

const STATUSES: ReadonlySet<string> = new Set(['new', 'saved', 'replied', 'dismissed', 'all']);
const MAX_BODY_BYTES = 256 * 1024;

const toneSchema = z.enum(['conversational', 'professional', 'friendly']);
const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
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

const router = new Router();

// --- Salud -----------------------------------------------------------------

router.get('/', ({ json }) =>
  json({
    service: 'reddit-leads-api',
    runtime: 'deno/edge',
    endpoints: ['/api/health', '/api/profile', '/api/leads', '/api/stats', '/api/ai/status'],
  }),
);

router.get('/api/health', async ({ json }) => {
  try {
    await pool.query('select 1');
    return json({
      ok: true,
      env: env.NODE_ENV,
      database: 'supabase',
      auth: 'supabase',
      allowedOrigins: env.allowedOrigins,
      time: new Date().toISOString(),
    });
  } catch (error) {
    log.error('La comprobación de salud falló', error);
    return json({ ok: false, error: 'La base de datos no responde' }, 503);
  }
});

// --- Perfil ----------------------------------------------------------------

router.get('/api/profile', async ({ req, json }) => {
  const auth = await requireAuth(req);
  const profile = await ensureProfile(auth.userId);
  const [runs, pendingReplies] = await Promise.all([
    recentRuns(auth.userId, 5),
    pendingReplyCount(auth.userId),
  ]);

  return json({
    profile: { ...profile, created_at: undefined, updated_at: undefined },
    runs,
    pendingReplies,
  });
});

/** Guarda la URL, analiza la web y regenera las keywords. */
router.put('/api/profile', async ({ req, json }) => {
  const auth = await requireAuth(req);
  const body = z.object({ product_url: urlSchema }).safeParse(await readJson(req));

  if (!body.success) {
    throw HttpError.badRequest('Revisa la URL de tu producto', body.error.flatten().fieldErrors);
  }

  const { profile } = await analyzeUserProduct(auth.userId, body.data.product_url);
  return json({ profile });
});

router.patch('/api/profile', async ({ req, json }) => {
  const auth = await requireAuth(req);
  const body = z
    .object({ tone: toneSchema.optional(), timezone: timezoneSchema.optional() })
    .safeParse(await readJson(req));

  if (!body.success) throw HttpError.badRequest('Datos de perfil no válidos');
  if (!body.data.tone && !body.data.timezone) {
    throw HttpError.badRequest('No hay nada que actualizar');
  }

  let profile = await ensureProfile(auth.userId);
  if (body.data.tone) profile = await setTone(auth.userId, body.data.tone as Tone);
  if (body.data.timezone) profile = await setTimezone(auth.userId, body.data.timezone);

  return json({ profile });
});

/** Lanza la búsqueda manualmente (el cron ya corre 2 veces al día). */
router.post('/api/profile/scan', async ({ req, json }) => {
  const auth = await requireAuth(req);
  const result = await runScan(auth.userId, 'manual');
  return json({ result });
});

/** Genera las respuestas sugeridas que faltan (hasta 10). */
router.post('/api/profile/replies', async ({ req, json }) => {
  const auth = await requireAuth(req);
  const profile = await ensureProfile(auth.userId);
  const pending = await topScoredLeads(auth.userId, 10);
  const generated = await generateReplies(profile, pending);
  return json({ generated });
});

// --- Leads -----------------------------------------------------------------

router.get('/api/leads', async ({ req, url, json }) => {
  const auth = await requireAuth(req);
  const query = url.searchParams;

  const status = query.get('status') ?? 'all';
  if (!STATUSES.has(status)) throw HttpError.badRequest('Filtro de estado no válido');

  const sortRaw = query.get('sort') ?? 'relevance';
  const sort = (['relevance', 'new', 'upvotes', 'comments'] as const).includes(
    sortRaw as 'relevance',
  )
    ? (sortRaw as 'relevance' | 'new' | 'upvotes' | 'comments')
    : 'relevance';

  const minRelevanceRaw = query.get('minRelevance');
  const minRelevance = minRelevanceRaw ? Number.parseInt(minRelevanceRaw, 10) : undefined;

  const limit = Math.min(100, Math.max(1, Number.parseInt(query.get('limit') ?? '25', 10) || 25));
  const offset = Math.max(0, Number.parseInt(query.get('offset') ?? '0', 10) || 0);
  const search = query.get('search') ?? undefined;

  const filters = {
    status: status as LeadStatus | 'all',
    minRelevance: Number.isFinite(minRelevance) ? minRelevance : undefined,
    search,
    sort,
  };

  const [leads, total] = await Promise.all([
    listLeads(auth.userId, { ...filters, limit, offset }),
    countLeads(auth.userId, filters),
  ]);

  return json({ leads, total, limit, offset });
});

router.get('/api/leads/:id', async ({ req, params, json }) => {
  const auth = await requireAuth(req);
  const lead = await getLead(auth.userId, params.id as string);
  if (!lead) throw HttpError.notFound('Ese post no existe o ya no está en tu bandeja');
  return json({ lead });
});

router.patch('/api/leads/:id/status', async ({ req, params, json }) => {
  const auth = await requireAuth(req);
  const body = (await readJson(req)) as { status?: string };
  const status = body.status;

  if (!status || !STATUSES.has(status) || status === 'all') {
    throw HttpError.badRequest('Estado no válido');
  }

  const lead = await setStatus(auth.userId, params.id as string, status as LeadStatus);
  if (!lead) throw HttpError.notFound('Ese post no existe');
  return json({ lead });
});

router.delete('/api/leads/:id', async ({ req, params }) => {
  const auth = await requireAuth(req);
  const deleted = await deleteLead(auth.userId, params.id as string);
  if (!deleted) throw HttpError.notFound('Ese post no existe');
  return new Response(null, { status: 204 });
});

/** Genera (o regenera) la respuesta sugerida de un post. */
router.post('/api/leads/:id/reply', async ({ req, params, json }) => {
  const auth = await requireAuth(req);
  const lead = await refreshReply(auth.userId, params.id as string);
  return json({ lead });
});

// --- Estadísticas ----------------------------------------------------------

router.get('/api/stats', async ({ req, json }) => {
  const auth = await requireAuth(req);
  await ensureProfile(auth.userId);
  const stats = await getUserStats(auth.userId);
  return json({ stats });
});

// --- Estado de la IA -------------------------------------------------------

/**
 * La interfaz lo llama para poder decir "la IA está conectada" (o qué le falta)
 * sin que haya que fallar al analizar una web entera para enterarse.
 */
router.get('/api/ai/status', async ({ req, json }) => {
  await requireAuth(req);
  return json({ ai: await checkAiHealth() });
});

// --- Búsqueda programada ---------------------------------------------------

/**
 * La dispara `pg_cron` con el secreto de `x-cron-secret`. También se puede
 * llamar a mano:
 *
 *   curl -X POST https://<ref>.supabase.co/functions/v1/lead-api/api/cron \
 *        -H "x-cron-secret: <CRON_SECRET>"
 */
const runCron = async ({ req, json }: RouteContext) => {
  requireCronSecret(req);
  const batch = await runScheduledBatch();
  log.info(`Tanda terminada: ${batch.scanned}/${batch.candidates}, ${batch.elapsedMs} ms`);
  return json({ batch });
};

router.post('/api/cron', runCron);
router.get('/api/cron', runCron);

// ---------------------------------------------------------------------------

/** Lee el cuerpo JSON con el mismo límite de 256 kB que tenía Express. */
async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    throw HttpError.badRequest('El cuerpo de la petición es demasiado grande');
  }

  try {
    return await req.json();
  } catch {
    throw HttpError.badRequest('El cuerpo de la petición no es JSON válido');
  }
}

/** Cabeceras de CORS según el origen de la petición. */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-cron-secret',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  // Sin `Access-Control-Allow-Credentials`: la API usa Bearer, no cookies, y esa
  // cabecera es incompatible con un origen comodín.
  if (origin && env.allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

/** El equivalente al middleware de errores de `server/index.ts`. */
function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }

  log.error('Error no controlado', error);
  return Response.json(
    { error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.', code: 'internal_error' },
    { status: 500 },
  );
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function withHeaders(response: Response, origin: string | null): Response {
  for (const [key, value] of Object.entries({ ...corsHeaders(origin), ...SECURITY_HEADERS })) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * La pasarela de Supabase sirve las funciones en
 * `/functions/v1/<nombre-de-la-funcion>` y deja la ruta que hay detrás para la
 * función. Según la versión, lo que llega al handler es la ruta pelada
 * (`/api/health`) o la ruta con el prefijo de la función
 * (`/functions/v1/lead-api/api/health`).
 *
 * En vez de elegir una de las dos, se prueban en orden. Funciona porque el
 * nombre de la función (`lead-api`) no coincide con el primer segmento de
 * ninguna ruta de la API (`/api/...`), así que no hay ambigüedad posible.
 */
const FUNCTION_SLUG = 'lead-api';

function candidatePaths(pathname: string): string[] {
  const candidates = [pathname];
  for (const prefix of [`/functions/v1/${FUNCTION_SLUG}`, `/${FUNCTION_SLUG}`]) {
    if (pathname === prefix) candidates.push('/');
    else if (pathname.startsWith(`${prefix}/`)) candidates.push(pathname.slice(prefix.length));
  }
  return candidates;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  // El preflight no lleva Authorization: se responde antes de enrutar.
  if (req.method === 'OPTIONS') {
    return withHeaders(new Response(null, { status: 204 }), origin);
  }

  const url = new URL(req.url);
  try {
    let matched;
    let lastError: unknown;

    for (const candidate of candidatePaths(url.pathname)) {
      try {
        matched = router.match(req.method, candidate);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!matched) throw lastError;

    const response = await matched.handler(createContext(req, url, matched.params));
    return withHeaders(response, origin);
  } catch (error) {
    return withHeaders(errorResponse(error), origin);
  }
  // OJO: aquí no se cierra el pool de Postgres. El runtime reutiliza el worker
  // entre peticiones, y `pool.end()` es irreversible: la segunda petición se
  // encontraría un pool muerto. Las conexiones sueltas las suelta él solo con
  // `idleTimeoutMillis` (ver `db.ts`).
});

// Aviso en el arranque de una instancia nueva (arranque en frío).
const missingIntegrations = describeIntegrations().filter((item) => !item.ready);
if (missingIntegrations.length > 0) {
  log.warn(
    `Sin configurar: ${missingIntegrations.map((item) => item.name).join(', ')}. ` +
      'La función arranca, pero esas funciones fallarán hasta que pongas las claves reales.',
  );
}
