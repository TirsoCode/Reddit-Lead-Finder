import { z } from 'zod';

/**
 * Configuración de la función de Supabase (runtime Deno).
 *
 * Es el equivalente de `server/env.ts` para el despliegue en la nube. Se lee de
 * `Deno.env` (los secretos se suben con `supabase secrets set`) y no de un
 * fichero `.env`, porque en Edge Functions no hay sistema de ficheros.
 *
 * Diferencias con la versión de Node:
 * - `NODE_ENV` es `production` siempre: esto solo se ejecuta en la nube.
 * - `POOL_MAX` es bajo por defecto (2). Supabase limita las conexiones
 *   simultáneas del plan gratuito y cada instancia abriría las suyas.
 * - Se añaden `CRON_SECRET`, `ALLOWED_ORIGINS` y el presupuesto de tiempo de la
 *   tanda, que solo tienen sentido en este despliegue.
 */

/** Convierte "true"/"1"/"yes" en boolean. */
const boolish = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return defaultValue;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const intish = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt((value ?? '').trim(), 10);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    })
    .pipe(z.number().int().positive());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  APP_URL: z.string().default('https://reddit-lead-finder-ecru.vercel.app'),

  /**
   * Connection string del PostgreSQL de Supabase (Project Settings → Database).
   * Es el único origen de datos: no hay base de datos local alternativa.
   */
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL es obligatoria')
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL debe ser una URI postgresql:// de Supabase',
    ),

  // Supabase Auth (email + Google OAuth). El servidor usa la anon key para
  // validar los JWT; el cliente usa la misma clave para iniciar sesión.
  SUPABASE_URL: z.string().url('SUPABASE_URL debe ser una URL válida'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY es obligatoria'),

  /**
   * Orígenes a los que se permite llamar a la API. La función vive en
   * `*.supabase.co` y el frontend en `*.vercel.app`, así que sin CORS el
   * navegador bloquearía todas las peticiones.
   */
  ALLOWED_ORIGINS: z.string().default('https://reddit-lead-finder-ecru.vercel.app'),

  REDDIT_ENABLED: boolish(false),
  REDDIT_CLIENT_ID: z.string().min(1, 'REDDIT_CLIENT_ID es obligatoria'),
  REDDIT_CLIENT_SECRET: z.string().min(1, 'REDDIT_CLIENT_SECRET es obligatoria'),
  REDDIT_USER_AGENT: z.string().default('web:reddit-leads:1.0.0'),
  REDDIT_MAX_SUBREDDITS: intish(3),
  REDDIT_WINDOW_HOURS: intish(48),

  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY es obligatoria'),
  OPENROUTER_MODEL: z.string().default('qwen/qwen3.8-27b:free'),
  OPENROUTER_SCORING_MODEL: z.string().optional(),
  /**
   * Modelos de reserva, en orden de preferencia y separados por comas.
   *
   * Los modelos `:free` de OpenRouter no tienen servicio garantizado: cuando su
   * proveedor se satura devuelven 429, y a veces un 200 con el cuerpo vacío.
   * `services/ai.ts` va bajando por esta lista hasta que uno conteste, y a
   * continuación añade los que descubra en el catálogo, así que basta con que
   * haya más de uno.
   */
  OPENROUTER_FALLBACK_MODELS: z
    .string()
    .default(
      [
        'google/gemma-4-31b-it:free',
        'dots-studio/dots-3-note-preview:free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'google/gemma-4-26b-a4b-it:free',
        'inclusionai/ling-3.0-flash-sante:free',
        'liquid/lfm-2.5-2.6b:free',
      ].join(','),
    ),
  OPENROUTER_SITE_URL: z.string().optional(),
  OPENROUTER_APP_NAME: z.string().default('RedditLeads'),

  /**
   * Horas que se conserva el catálogo de modelos gratuitos antes de volver a
   * descargarlo de OpenRouter. La respuesta pesa casi 800 kB y las invocaciones
   * de Edge Functions arrancan en frío, así que se guarda en la base de datos
   * (`services/aiModels.ts`).
   */
  AI_CATALOGUE_TTL_HOURS: intish(6),

  /**
   * La búsqueda programada la dispara `pg_cron` llamando a `POST /api/cron`.
   * Aquí solo queda el secreto que valida esa llamada; `CRON_SCHEDULE` lo usa
   * el propio Postgres, no el código.
   */
  CRON_SECRET: z.string().min(1, 'CRON_SECRET es obligatoria'),
  CRON_BATCH_USERS: intish(5),
  /**
   * Una invocación de Edge Functions dura 150 s como máximo. La tanda para
   * antes de ese tiempo y deja el resto para la siguiente invocación.
   */
  SCAN_TIME_BUDGET_MS: intish(105_000),

  SCAN_MAX_POSTS: intish(60),
  SCAN_MAX_REPLIES: intish(10),
  POOL_MAX: intish(2),
});

const parsed = schema.safeParse(Deno.env.toObject());

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  · ${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');
  // No hay `process.exit` en Deno: si la configuración falta, la función no
  // puede ni arrancar. Se lanza para que la invocación devuelva 500 de inmediato.
  throw new Error(`[config] Faltan o son inválidas variables de entorno:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: true,
  scoringModel: raw.OPENROUTER_SCORING_MODEL || raw.OPENROUTER_MODEL,
  /** `OPENROUTER_FALLBACK_MODELS` ya limpio: sin espacios ni entradas vacías. */
  fallbackModels: raw.OPENROUTER_FALLBACK_MODELS.split(',')
    .map((model) => model.trim())
    .filter(Boolean),
  /** Orígenes permitidos, ya normalizados y sin la barra final. */
  allowedOrigins: raw.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
} as const;

export type Env = typeof env;

/**
 * Las claves de ejemplo empiezan por `pon-`. Con ellas la función arranca
 * (para no bloquear una demostración) pero cualquier llamada a la IA o a Reddit
 * falla con un 401, así que avisamos por consola desde el principio.
 */
const PLACEHOLDER_PREFIX = 'pon-';

export function isPlaceholderSecret(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith(PLACEHOLDER_PREFIX) ||
    trimmed.startsWith('tu_') ||
    trimmed === 'changeme' ||
    trimmed.length === 0
  );
}

/** Resumen de qué servicios externos están configurados de verdad. */
export function describeIntegrations(): Array<{ name: string; ready: boolean; detail: string }> {
  return [
    {
      name: 'supabase',
      ready:
        raw.SUPABASE_URL.startsWith('https://') &&
        !isPlaceholderSecret(raw.SUPABASE_ANON_KEY) &&
        !isPlaceholderSecret(raw.DATABASE_URL),
      detail: 'Base de datos y autenticación',
    },
    {
      name: 'openrouter',
      ready: !isPlaceholderSecret(raw.OPENROUTER_API_KEY),
      detail: `IA · ${raw.OPENROUTER_MODEL}`,
    },
    {
      name: 'reddit',
      ready:
        raw.REDDIT_ENABLED &&
        !isPlaceholderSecret(raw.REDDIT_CLIENT_ID) &&
        !isPlaceholderSecret(raw.REDDIT_CLIENT_SECRET),
      detail: raw.REDDIT_ENABLED
        ? `API oficial · ${raw.REDDIT_WINDOW_HOURS} h de ventana`
        : 'API oficial · deshabilitada temporalmente',
    },
  ];
}
