import { query, queryOne } from '../db.js';
import type { Lead, LeadStatus, RedditPost, Stats, Tone } from '../types.js';

export interface LeadRow {
  id: string;
  user_id: string;
  reddit_id: string;
  title: string;
  body: string | null;
  subreddit: string;
  author: string | null;
  permalink: string | null;
  url: string | null;
  upvotes: number;
  num_comments: number;
  posted_at: Date | null;
  relevance: number | null;
  relevance_reason: string | null;
  reply: string | null;
  reply_tone: Tone | null;
  reply_generated_at: Date | null;
  status: LeadStatus;
  first_seen_at: Date;
  last_seen_at: Date;
  scored_at: Date | null;
  run_id: string | null;
}

/**
 * Inserta los posts encontrados. Los ya conocidos solo se refrescan
 * (upvotes, comentarios y última vez visto); `xmax = 0` delata los insertados.
 */
export async function upsertLeads(
  userId: string,
  runId: string | null,
  posts: RedditPost[],
): Promise<{ inserted: number; touched: number }> {
  if (posts.length === 0) return { inserted: 0, touched: 0 };

  // 12 columnas por fila: el salto de los marcadores debe coincidir con ellas.
  const COLUMNS_PER_ROW = 12;

  const values: unknown[] = [];
  const tuples = posts.map((post, index) => {
    const base = index * COLUMNS_PER_ROW;
    values.push(
      userId,
      post.redditId,
      post.title.slice(0, 500),
      post.body,
      post.subreddit.slice(0, 80),
      post.author,
      post.permalink,
      post.url,
      post.upvotes,
      post.numComments,
      post.postedAt,
      runId,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},
             $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10},
             $${base + 11}, $${base + 12})`;
  });

  const sql = `
    insert into public.leads
      (user_id, reddit_id, title, body, subreddit, author, permalink, url,
       upvotes, num_comments, posted_at, run_id)
    values ${tuples.join(', ')}
    on conflict (user_id, reddit_id) do update
      set upvotes = excluded.upvotes,
          num_comments = excluded.num_comments,
          body = coalesce(excluded.body, public.leads.body),
          last_seen_at = now(),
          -- si estaba descartado y vuelve a aparecer, vuelve a la bandeja
          status = case when public.leads.status = 'dismissed' then 'new' else public.leads.status end
    returning (xmax = 0) as inserted`;

  const rows = await query<{ inserted: boolean }>(sql, values);
  const inserted = rows.filter((row) => row.inserted).length;
  return { inserted, touched: rows.length };
}

export interface ListLeadsOptions {
  status?: LeadStatus | 'all';
  minRelevance?: number;
  search?: string;
  subreddit?: string;
  sort?: 'relevance' | 'new' | 'upvotes' | 'comments';
  limit: number;
  offset: number;
}

/** Los mismos filtros para la lista y para el contador: si no, la paginación miente. */
function buildFilters(
  userId: string,
  options: Omit<ListLeadsOptions, 'limit' | 'offset'>,
): { conditions: string[]; params: unknown[] } {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (options.status && options.status !== 'all') {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }

  if (typeof options.minRelevance === 'number') {
    params.push(options.minRelevance);
    conditions.push(`relevance >= $${params.length}`);
  }

  if (options.search?.trim()) {
    params.push(`%${options.search.trim()}%`);
    conditions.push(`(title ilike $${params.length} or body ilike $${params.length})`);
  }

  if (options.subreddit?.trim()) {
    // Reddit guarda el nombre sin la barra; se acepta `r/SaaS` desde la URL.
    params.push(options.subreddit.trim().replace(/^\/?r\//i, ''));
    conditions.push(`lower(subreddit) = $${params.length}`);
  }

  return { conditions, params };
}

export async function listLeads(userId: string, options: ListLeadsOptions): Promise<Lead[]> {
  const { conditions, params } = buildFilters(userId, options);

  const orderBy = {
    relevance: 'relevance desc nulls last, first_seen_at desc',
    new: 'first_seen_at desc',
    upvotes: 'upvotes desc, first_seen_at desc',
    comments: 'num_comments desc, first_seen_at desc',
  }[options.sort ?? 'relevance'];

  params.push(options.limit, options.offset);

  const rows = await query<LeadRow>(
    `select * from public.leads
      where ${conditions.join(' and ')}
      order by ${orderBy}
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return rows;
}

export async function countLeads(userId: string, options: Omit<ListLeadsOptions, 'limit' | 'offset'>): Promise<number> {
  const { conditions, params } = buildFilters(userId, options);

  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count from public.leads where ${conditions.join(' and ')}`,
    params,
  );
  return Number(row?.count ?? 0);
}

export async function getLead(userId: string, leadId: string): Promise<Lead | null> {
  return queryOne<LeadRow>(`select * from public.leads where id = $1 and user_id = $2`, [
    leadId,
    userId,
  ]);
}

/** Reddit ids ya guardados: evita volver a puntuar lo que ya se conoce. */
export async function existingRedditIds(userId: string, redditIds: string[]): Promise<Set<string>> {
  if (redditIds.length === 0) return new Set();
  const rows = await query<{ reddit_id: string }>(
    `select reddit_id from public.leads where user_id = $1 and reddit_id = any($2::text[])`,
    [userId, redditIds],
  );
  return new Set(rows.map((row) => row.reddit_id));
}

/** Leads recién guardados que todavía no tienen puntuación de relevancia. */
export async function leadsWithoutScore(userId: string, redditIds: string[]): Promise<Lead[]> {
  if (redditIds.length === 0) return [];
  return query<LeadRow>(
    `select * from public.leads
      where user_id = $1
        and relevance is null
        and reddit_id = any($2::text[])
      order by first_seen_at desc`,
    [userId, redditIds],
  );
}

export interface ScoreUpdate {
  redditId: string;
  relevance: number;
  reason?: string | null;
}

export async function saveScores(userId: string, scores: ScoreUpdate[]): Promise<number> {
  if (scores.length === 0) return 0;

  // $1 es user_id, así que los tríos de cada fila empiezan en $2.
  const params: unknown[] = [userId];
  const tuples = scores.map((score, index) => {
    const base = index * 3 + 2;
    params.push(score.redditId, Math.max(1, Math.min(100, Math.round(score.relevance))), score.reason ?? null);
    return `($${base}::text, $${base + 1}::int, $${base + 2}::text)`;
  });

  const rows = await query<{ id: string }>(
    `update public.leads as l
        set relevance = v.relevance,
            relevance_reason = v.relevance_reason,
            scored_at = now()
       from (values ${tuples.join(', ')}) as v(reddit_id, relevance, relevance_reason)
      where l.user_id = $1
        and l.reddit_id = v.reddit_id
      returning l.id`,
    params,
  );
  return rows.length;
}

export async function setReply(
  userId: string,
  leadId: string,
  reply: string,
  tone: Tone,
): Promise<Lead | null> {
  return queryOne<LeadRow>(
    `update public.leads
        set reply = $3,
            reply_tone = $4,
            reply_generated_at = now()
      where id = $1 and user_id = $2
      returning *`,
    [leadId, userId, reply, tone],
  );
}

export async function setStatus(
  userId: string,
  leadId: string,
  status: LeadStatus,
): Promise<Lead | null> {
  return queryOne<LeadRow>(
    `update public.leads set status = $3 where id = $1 and user_id = $2 returning *`,
    [leadId, userId, status],
  );
}

/** Aplica el mismo estado a varios posts de una vez (acciones del panel). */
export async function setStatusBulk(
  userId: string,
  leadIds: string[],
  status: LeadStatus,
): Promise<number> {
  if (leadIds.length === 0) return 0;
  const rows = await query<{ id: string }>(
    `update public.leads
        set status = $3
      where user_id = $1 and id = any($2::uuid[])
      returning id`,
    [userId, leadIds, status],
  );
  return rows.length;
}

/** Borra todos los posts en un estado. Solo se usa con `dismissed`. */
export async function deleteByStatus(userId: string, status: LeadStatus): Promise<number> {
  const rows = await query<{ id: string }>(
    `delete from public.leads where user_id = $1 and status = $2 returning id`,
    [userId, status],
  );
  return rows.length;
}

export async function deleteLead(userId: string, leadId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `delete from public.leads where id = $1 and user_id = $2 returning id`,
    [leadId, userId],
  );
  return row !== null;
}

/** Posts ya puntuados, ordenados por relevancia, para generar respuestas. */
export async function topScoredLeads(userId: string, limit: number): Promise<Lead[]> {
  return query<LeadRow>(
    `select * from public.leads
      where user_id = $1
        and relevance is not null
        and (reply is null or reply = '')
      order by relevance desc nulls last, first_seen_at desc
      limit $2`,
    [userId, limit],
  );
}

export async function countLeadsWithoutReply(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count
       from public.leads
      where user_id = $1 and relevance is not null and (reply is null or reply = '')`,
    [userId],
  );
  return Number(row?.count ?? 0);
}

export interface StatsOptions {
  /** Zona horaria del usuario: las franjas horarias son las suyas, no las de UTC. */
  timezone?: string;
  /** Keywords del perfil: se cuentan los posts del periodo que las mencionan. */
  keywords?: string[];
}

/** Inicio "todo el historial": se usa cuando el periodo elegido está vacío. */
const ALL_TIME = new Date(0);
/** Ventana para contar la racha de días con actividad. */
const STREAK_WINDOW_DAYS = 180;

interface TotalsRow {
  today: string;
  total: string;
  average_relevance: string | null;
  with_reply: string;
  status_new: string;
  status_saved: string;
  status_replied: string;
  status_dismissed: string;
  last_post_at: Date | null;
}

interface WindowRow {
  period_total: string;
  period_relevance: string | null;
  period_high: string;
  period_pending: string;
  period_upvotes: string | null;
  period_comments: string | null;
  previous_total: string;
  previous_relevance: string | null;
}

const TOTALS_SQL = `
  select
    (count(*) filter (where first_seen_at >= $2))::text as today,
    count(*)::text as total,
    avg(relevance)::text as average_relevance,
    (count(*) filter (where reply is not null and reply <> ''))::text as with_reply,
    (count(*) filter (where status = 'new'))::text as status_new,
    (count(*) filter (where status = 'saved'))::text as status_saved,
    (count(*) filter (where status = 'replied'))::text as status_replied,
    (count(*) filter (where status = 'dismissed'))::text as status_dismissed,
    max(first_seen_at) as last_post_at
  from public.leads
  where user_id = $1`;

/** Periodo actual ($2) contra el inmediatamente anterior ($3), en una sola vuelta. */
const WINDOW_SQL = `
  select
    (count(*) filter (where first_seen_at >= $2))::text as period_total,
    (avg(relevance) filter (where first_seen_at >= $2))::text as period_relevance,
    (count(*) filter (where first_seen_at >= $2 and relevance >= 60))::text as period_high,
    (count(*) filter (
      where first_seen_at >= $2 and (reply is null or reply = '')
    ))::text as period_pending,
    (avg(upvotes) filter (where first_seen_at >= $2))::text as period_upvotes,
    (avg(num_comments) filter (where first_seen_at >= $2))::text as period_comments,
    (count(*) filter (where first_seen_at >= $3 and first_seen_at < $2))::text as previous_total,
    (avg(relevance) filter (
      where first_seen_at >= $3 and first_seen_at < $2
    ))::text as previous_relevance
  from public.leads
  where user_id = $1 and first_seen_at >= $3`;

const BY_DAY_SQL = `
  select d::date::text as day,
         count(l.id)::text as count,
         avg(l.relevance)::text as average_relevance
    from generate_series($2::date, $3::date, interval '1 day') as d
    left join public.leads l
      on l.user_id = $1
     and l.first_seen_at >= d
     and l.first_seen_at < d + interval '1 day'
   group by d
   order by d asc`;

/** `$3` es la zona horaria del usuario: el histograma sale en su reloj. */
const BY_HOUR_SQL = `
  select cast(extract(hour from l.first_seen_at at time zone $3) as int) as hour,
         count(*)::text as count
    from public.leads l
   where l.user_id = $1 and l.first_seen_at >= $2
   group by 1
   order by 1`;

const DISTRIBUTION_SQL = `
  select
    (count(*) filter (where relevance is null or relevance < 40))::text as low,
    (count(*) filter (where relevance >= 40 and relevance < 60))::text as mid,
    (count(*) filter (where relevance >= 60 and relevance < 80))::text as good,
    (count(*) filter (where relevance >= 80))::text as high
  from public.leads
  where user_id = $1 and first_seen_at >= $2`;

const SUBREDDIT_SQL = `
  select subreddit,
         count(*)::text as count,
         round(avg(relevance))::text as average_relevance,
         (count(*) filter (where relevance >= 60))::text as high_score
    from public.leads
   where user_id = $1 and first_seen_at >= $2
   group by subreddit
   order by count(*) desc, subreddit asc
   limit 8`;

/**
 * Las keywords ya vienen escapadas (% y _ son comodines de `ilike`), así que el
 * `escape` explícito hace que un producto llamado "under_score" no encuentre
 * cualquier otra cosa.
 */
const KEYWORD_SQL = `
  select k.keyword,
         count(l.id)::text as count
    from unnest($2::text[]) as k(keyword)
    left join public.leads l
      on l.user_id = $1
     and l.first_seen_at >= $3
     and (
       l.title ilike '%' || k.keyword || '%' escape '\\'
       or coalesce(l.body, '') ilike '%' || k.keyword || '%' escape '\\'
     )
   group by k.keyword
   order by count(l.id) desc, k.keyword asc`;

const STREAK_SQL = `
  select d::date::text as day
    from generate_series($2::date, $3::date, interval '1 day') as d
   where exists (
     select 1 from public.leads l
      where l.user_id = $1
        and l.first_seen_at >= d
        and l.first_seen_at < d + interval '1 day')
   order by d desc`;

/** Convierte un número que viene de Postgres como texto, sin inventar ceros. */
function toInt(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Redondea una media que puede venir como texto y convertirla en `null` si falta. */
function toAverage(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * Racha de días seguidos con al menos un post nuevo. Cuenta hasta hoy; si hoy
 * todavía no ha entrado nada, la racha sigue viva porque ayer sí hubo posts.
 */
export function countStreak(dayList: string[], todayStart: Date): number {
  if (dayList.length === 0) return 0;

  const active = new Set(dayList);
  const start = Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), todayStart.getUTCDate());
  const DAY = 86_400_000;

  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  let cursor = active.has(iso(start)) ? start : start - DAY;
  if (!active.has(iso(cursor))) return 0;

  let streak = 0;
  while (active.has(iso(cursor))) {
    streak += 1;
    cursor -= DAY;
  }
  return streak;
}

/**
 * Todo lo que pinta el panel. El periodo se elige en el cliente (`days`) y las
 * comparaciones se calculan aquí contra el periodo inmediatamente anterior,
 * para que el dashboard no tenga que traer dos consultas.
 */
export async function getStats(
  userId: string,
  todayStart: Date,
  days = 30,
  options: StatsOptions = {},
): Promise<Stats> {
  const dayStart = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
  const previousStart = new Date(dayStart.getTime() - days * 86_400_000);
  const streakStart = new Date(todayStart.getTime() - STREAK_WINDOW_DAYS * 86_400_000);
  const timezone = options.timezone || 'UTC';
  const keywords = (options.keywords ?? []).map(escapeLike).filter((keyword) => keyword.trim().length > 0);

  const [totals, window, byDay, byHour, distribution, subreddits, keywordRows, streakDays] =
    await Promise.all([
      queryOne<TotalsRow>(TOTALS_SQL, [userId, todayStart]),
      queryOne<WindowRow>(WINDOW_SQL, [userId, dayStart, previousStart]),
      query<{ day: string; count: string; average_relevance: string | null }>(BY_DAY_SQL, [
        userId,
        dayStart,
        todayStart,
      ]),
      query<{ hour: number; count: string }>(BY_HOUR_SQL, [userId, dayStart, timezone]),
      queryOne<{ low: string; mid: string; good: string; high: string }>(DISTRIBUTION_SQL, [
        userId,
        dayStart,
      ]),
      query<{ subreddit: string; count: string; average_relevance: string | null; high_score: string }>(
        SUBREDDIT_SQL,
        [userId, dayStart],
      ),
      keywords.length > 0
        ? query<{ keyword: string; count: string }>(KEYWORD_SQL, [userId, keywords, dayStart])
        : Promise.resolve([] as Array<{ keyword: string; count: string }>),
      query<{ day: string }>(STREAK_SQL, [userId, streakStart, todayStart]),
    ]);

  const totalCount = toInt(totals?.total);
  const periodTotal = toInt(window?.period_total);
  const periodEmpty = periodTotal === 0 && totalCount > 0;

  // Un periodo corto puede quedarse sin posts: en vez de pintar tarjetas
  // vacías, los histogramas caen al histórico y se avisa con `activityFallback`.
  let hourRows = byHour;
  if (hourRows.length === 0 && periodEmpty) {
    hourRows = await query<{ hour: number; count: string }>(BY_HOUR_SQL, [userId, ALL_TIME, timezone]);
  }
  let subredditRows = subreddits;
  if (subredditRows.length === 0 && periodEmpty) {
    subredditRows = await query<{
      subreddit: string;
      count: string;
      average_relevance: string | null;
      high_score: string;
    }>(SUBREDDIT_SQL, [userId, ALL_TIME]);
  }

  const hours: Stats['byHour'] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    hours.push({ hour, count: toInt(hourRows.find((row) => row.hour === hour)?.count) });
  }

  return {
    today: toInt(totals?.today),
    averageRelevance: toAverage(totals?.average_relevance),
    total: totalCount,
    withReply: toInt(totals?.with_reply),
    byStatus: {
      new: toInt(totals?.status_new),
      saved: toInt(totals?.status_saved),
      replied: toInt(totals?.status_replied),
      dismissed: toInt(totals?.status_dismissed),
    },
    lastPostAt: totals?.last_post_at ?? null,
    byDay: byDay.map((row) => ({
      day: row.day,
      count: toInt(row.count),
      averageRelevance: toAverage(row.average_relevance),
    })),
    days,
    periodStart: dayStart.toISOString(),
    period: {
      total: periodTotal,
      highScore: toInt(window?.period_high),
      pendingReplies: toInt(window?.period_pending),
      averageRelevance: toAverage(window?.period_relevance),
      averageUpvotes: toAverage(window?.period_upvotes),
      averageComments: toAverage(window?.period_comments),
    },
    previous: {
      total: toInt(window?.previous_total),
      averageRelevance: toAverage(window?.previous_relevance),
    },
    relevance: [
      { key: 'low', label: '1–39 · poco relevante', count: toInt(distribution?.low) },
      { key: 'mid', label: '40–59 · interesante', count: toInt(distribution?.mid) },
      { key: 'good', label: '60–79 · buena oportunidad', count: toInt(distribution?.good) },
      { key: 'high', label: '80–100 · prioritaria', count: toInt(distribution?.high) },
    ],
    byHour: hours,
    subreddits: subredditRows.map((row) => ({
      subreddit: row.subreddit,
      count: toInt(row.count),
      averageRelevance: toAverage(row.average_relevance),
      highScore: toInt(row.high_score),
    })),
    keywords: keywordRows
      .map((row) => ({ keyword: row.keyword, count: toInt(row.count) }))
      .slice(0, 12),
    streak: countStreak(streakDays.map((row) => row.day), todayStart),
    lastRun: null,
    activityFallback: periodEmpty,
  };
}

/** `ilike` trata % y _ como comodines: se neutralizan antes de comparar. */
export function escapeLike(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1');
}

