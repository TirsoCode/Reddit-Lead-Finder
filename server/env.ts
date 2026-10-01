import 'dotenv/config';
import { z } from 'zod';

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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intish(3000),
  APP_URL: z.string().default('http://localhost:3000'),

  /**
   * Dos drivers posibles:
   *   postgresql://…  → PostgreSQL normal (Supabase, docker, Railway…)
   *   pglite://carpeta → PGlite, el mismo PostgreSQL en WASM dentro del proceso.
   *                      Para desarrollo local sin instalar nada.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PGLITE_DATA_DIR: z.string().optional(),

  SUPABASE_URL: z.string().default('http://localhost:54321'),
  SUPABASE_ANON_KEY: z.string().default('local-dev-anon-key'),

  // Modo de autenticación local (solo desarrollo). Con DEV_AUTH=true la app trae
  // su propio registro/login por email y no necesita Supabase. En producción
  // se usa Supabase (email + Google OAuth) y esta opción se ignora.
  DEV_AUTH: boolish(false),
  DEV_AUTH_SECRET: z
    .string()
    .default('redditleads-dev-secret-no-usar-en-produccion')
    .pipe(z.string().min(16, 'DEV_AUTH_SECRET debe tener al menos 16 caracteres')),

  REDDIT_CLIENT_ID: z.string().min(1, 'REDDIT_CLIENT_ID es obligatoria'),
  REDDIT_CLIENT_SECRET: z.string().min(1, 'REDDIT_CLIENT_SECRET es obligatoria'),
  REDDIT_USER_AGENT: z.string().default('web:reddit-leads:1.0.0'),
  REDDIT_MAX_SUBREDDITS: intish(3),
  REDDIT_WINDOW_HOURS: intish(48),

  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY es obligatoria'),
  OPENROUTER_MODEL: z.string().default('google/gemini-2.5-flash-lite'),
  OPENROUTER_SCORING_MODEL: z.string().optional(),
  OPENROUTER_SITE_URL: z.string().optional(),
  OPENROUTER_APP_NAME: z.string().default('RedditLeads'),

  CRON_SCHEDULE: z.string().default('0 8,20 * * *'),
  CRON_ENABLED: boolish(true),

  SCAN_MAX_POSTS: intish(60),
  SCAN_MAX_REPLIES: intish(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  · ${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');
  console.error(
    `\n[config] Faltan o son inválidas variables de entorno:\n${issues}\n\n` +
      'Copia .env.example a .env y complétalo.\n',
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  scoringModel: raw.OPENROUTER_SCORING_MODEL || raw.OPENROUTER_MODEL,
} as const;

export type Env = typeof env;

/**
 * Las claves de ejemplo empiezan por `pon-`. Con ellas el arranque funciona
 * (para no bloquear el desarrollo local) pero cualquier llamada a la IA o a
 * Reddit falla con un 401, así que avisamos por consola desde el principio.
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
  // Con DEV_AUTH la autenticación la sirve el propio backend, así que Supabase
  // no es necesario y no debe aparecer como algo que falta.
  const supabaseReady = usingSupabaseAuth()
    ? raw.SUPABASE_URL.startsWith('https://') && !isPlaceholderSecret(raw.SUPABASE_ANON_KEY)
    : true;

  return [
    {
      name: 'openrouter',
      ready: !isPlaceholderSecret(raw.OPENROUTER_API_KEY),
      detail: `IA · ${raw.OPENROUTER_MODEL}`,
    },
    {
      name: 'reddit',
      ready: !isPlaceholderSecret(raw.REDDIT_CLIENT_ID) && !isPlaceholderSecret(raw.REDDIT_CLIENT_SECRET),
      detail: `API oficial · ${raw.REDDIT_WINDOW_HOURS} h de ventana`,
    },
    {
      name: 'supabase',
      ready: supabaseReady,
      detail: usingSupabaseAuth() ? 'Autenticación activa' : 'Usando el login local (DEV_AUTH)',
    },
  ];
}

function usingSupabaseAuth(): boolean {
  return !raw.DEV_AUTH;
}
