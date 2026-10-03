import { env } from '../env.ts';
import { createLogger } from '../logger.ts';
import {
  countLeadsWithoutReply,
  getLead,
  getStats,
  leadsWithoutScore,
  listLeads,
  saveScores,
  setReply,
  topScoredLeads,
  upsertLeads,
} from '../repositories/leads.ts';
import {
  ensureProfile,
  markAnalysisFailed,
  markAnalysisPending,
  saveAnalysis,
  setProductUrl,
} from '../repositories/profile.ts';
import { finishRun, hasRunInFlight, lastRun, reapStaleRuns, startRun } from '../repositories/runs.ts';
import { HttpError } from '../errors.ts';
import { startOfDayInTimezone } from '../time.ts';
import type { Lead, Profile, RunTrigger, Stats } from '../types.ts';
import { analyzeProduct } from './analyze.ts';
import { generateReply } from './replies.ts';
import { buildSearchQueries, buildSubredditSearches, reddit } from './reddit.ts';
import { scoreLeads } from './scoring.ts';
import { normalizeUrl } from './scraper.ts';

const log = createLogger('pipeline');

const SCORE_BATCH_SIZE = 12;
const REPLY_CONCURRENCY = 3;

/** Ejecuta N tareas a la vez sin reventar los límites de la IA. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });

  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Análisis de la web
// ---------------------------------------------------------------------------

export interface AnalyzeOutcome {
  profile: Profile;
}

/** Analiza la URL del producto y guarda keywords y subreddits en el perfil. */
export async function analyzeUserProduct(userId: string, url: string): Promise<AnalyzeOutcome> {
  await ensureProfile(userId);
  const normalized = normalizeUrl(url);
  await setProductUrl(userId, normalized);
  await markAnalysisPending(userId);

  try {
    const { analysis } = await analyzeProduct(normalized);
    const profile = await saveAnalysis(userId, analysis);
    log.info(`Perfil ${userId} analizado: ${analysis.keywords.length} keywords`);
    return { profile };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    await markAnalysisFailed(userId, message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Búsqueda de posts
// ---------------------------------------------------------------------------

function dedupePosts<T extends { redditId: string }>(posts: T[]): T[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.redditId)) return false;
    seen.add(post.redditId);
    return true;
  });
}

export interface ScanResult {
  runId: string;
  status: 'success' | 'error';
  fetched: number;
  newPosts: number;
  scored: number;
  replies: number;
  error?: string;
}

/**
 * Busca posts en Reddit, los guarda, los puntúa y genera las primeras
 * respuestas sugeridas. Es el mismo flujo para el botón manual y para el cron.
 */
export async function runScan(userId: string, trigger: RunTrigger): Promise<ScanResult> {
  const profile = await ensureProfile(userId);

  // Errores de negocio: llegan al cliente con su mensaje (400/409) en vez de
  // caer en el middleware genérico y mostrarse como "error inesperado".
  if (!profile.product_url) {
    throw HttpError.badRequest('Configura primero la URL de tu producto');
  }
  if (profile.analysis_status !== 'ready') {
    throw HttpError.conflict('El análisis de tu web no está listo todavía');
  }

  if (await hasRunInFlight(userId)) {
    throw HttpError.conflict('Ya hay una búsqueda en curso. Espera a que termine.');
  }

  const run = await startRun(userId, trigger);
  const windowMs = env.REDDIT_WINDOW_HOURS * 3_600_000;
  const cutoff = Date.now() - windowMs;

  let fetched = 0;
  let inserted = 0;
  let scored = 0;
  let replies = 0;

  try {
    // 1. Recolectar candidatos de varias fuentes.
    const queries = buildSearchQueries(profile);
    const subredditSearches = buildSubredditSearches(profile);

    const results = await Promise.allSettled([
      ...queries.map((query) => reddit.search(query, { limit: 50 })),
      ...subredditSearches.map(({ subreddit, query }) => reddit.search(query, { subreddit, limit: 25 })),
    ]);

    const candidates = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      log.warn(`La búsqueda "${index + 1}" falló: ${String(result.reason)}`);
      return [];
    });

    const posts = dedupePosts(candidates)
      .filter((post) => (post.postedAt ? post.postedAt.getTime() >= cutoff : true))
      .filter((post) => !isExcludedSubreddit(post.subreddit))
      .slice(0, env.SCAN_MAX_POSTS);

    fetched = posts.length;
    log.info(`[${trigger}] ${fetched} posts candidatos para ${userId}`);

    // 2. Guardar los nuevos (los ya conocidos solo se refrescan).
    const upserted = await upsertLeads(userId, run.id, posts);
    inserted = upserted.inserted;

    // 3. Puntuar solo lo que aún no tiene puntuación.
    const fresh = await leadsWithoutScore(
      userId,
      posts.map((post) => post.redditId),
    );

    if (fresh.length > 0) {
      const batches: Lead[][] = [];
      for (let index = 0; index < fresh.length; index += SCORE_BATCH_SIZE) {
        batches.push(fresh.slice(index, index + SCORE_BATCH_SIZE));
      }

      const batchResults = await mapWithConcurrency(batches, 2, async (batch) => {
        try {
          return await scoreLeads(profile, batch);
        } catch (error) {
          log.warn('No se pudo puntuar un lote', error);
          return [];
        }
      });

      scored = await saveScores(
        userId,
        batchResults.flat().map((score) => ({
          redditId: score.redditId,
          relevance: score.relevance,
          reason: score.reason,
        })),
      );
    }

    // 4. Respuestas sugeridas para los mejores posts pendientes de respuesta.
    const pending = await topScoredLeads(userId, env.SCAN_MAX_REPLIES);
    replies = await generateReplies(profile, pending);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    log.error(`[${trigger}] Falló la búsqueda de ${userId}`, error);
    await finishRun(run.id, 'error', {
      postsFetched: fetched,
      postsNew: inserted,
      repliesGenerated: replies,
      error: message,
    });
    return { runId: run.id, status: 'error', fetched, newPosts: inserted, scored, replies, error: message };
  }

  await finishRun(run.id, 'success', {
    postsFetched: fetched,
    postsNew: inserted,
    repliesGenerated: replies,
  });

  log.info(
    `[${trigger}] ${userId}: ${fetched} candidatos, ${inserted} nuevos, ${scored} puntuados, ${replies} respuestas`,
  );

  return { runId: run.id, status: 'success', fetched, newPosts: inserted, scored, replies };
}

const EXCLUDED_SUBREDDITS = new Set([
  'pics',
  'videos',
  'gifs',
  'aww',
  'funny',
  'pcmasterrace',
  'wallstreetbets',
  'relationships',
  'askmen',
  'todayilearned',
]);

function isExcludedSubreddit(subreddit: string): boolean {
  const name = subreddit.toLowerCase().replace(/^\/?r\//, '');
  return EXCLUDED_SUBREDDITS.has(name);
}

/** Genera y guarda respuestas sugeridas (con un límite de concurrencia). */
export async function generateReplies(profile: Profile, leads: Lead[]): Promise<number> {
  if (leads.length === 0) return 0;
  let done = 0;

  await mapWithConcurrency(leads, REPLY_CONCURRENCY, async (lead) => {
    try {
      const reply = await generateReply(profile, lead);
      await setReply(profile.id, lead.id, reply, profile.tone);
      done += 1;
    } catch (error) {
      log.warn(`No se pudo generar respuesta para ${lead.reddit_id}`, error);
    }
  });

  return done;
}

/** Regenera la respuesta de un lead con el tono actual del perfil. */
export async function refreshReply(userId: string, leadId: string): Promise<Lead> {
  const profile = await ensureProfile(userId);
  const lead = await getLead(userId, leadId);
  if (!lead) throw HttpError.notFound('Ese post no existe o ya no está en tu bandeja');

  const reply = await generateReply(profile, lead);
  const updated = await setReply(userId, leadId, reply, profile.tone);
  if (!updated) throw HttpError.notFound('Ese post ya no está en tu bandeja');
  return updated;
}

export async function getUserStats(userId: string, days = 30): Promise<Stats> {
  const profile = await ensureProfile(userId);
  const today = startOfDayInTimezone(profile.timezone || 'UTC');

  const [stats, run] = await Promise.all([
    getStats(userId, today, days, {
      timezone: safeTimezone(profile.timezone),
      keywords: profile.keywords ?? [],
    }),
    lastRun(userId),
  ]);

  if (!run) return stats;

  return {
    ...stats,
    lastRun: {
      status: run.status,
      started_at: run.started_at,
      posts_new: run.posts_new,
      posts_fetched: run.posts_fetched,
      error: run.error,
    },
  };
}

/**
 * `at time zone` lanza error si el nombre de la zona no existe en Postgres, así
 * que se comprueba antes. El perfil ya valida la zona al guardarse, pero un
 * cambio de versión del catálogo no debería tumbar el panel entero.
 */
function safeTimezone(timezone: string | null): string {
  if (!timezone) return 'UTC';
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

export async function pendingReplyCount(userId: string): Promise<number> {
  return countLeadsWithoutReply(userId);
}

export async function cleanupStaleRuns(): Promise<number> {
  const reaped = await reapStaleRuns();
  if (reaped > 0) log.warn(`${reaped} ejecuciones interrumpidas marcadas como fallidas`);
  return reaped;
}

export { listLeads };
