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

  const values: unknown[] = [];
  const tuples = posts.map((post, index) => {
    const base = index * 10;
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
  sort?: 'relevance' | 'new' | 'upvotes' | 'comments';
  limit: number;
  offset: number;
}

export async function listLeads(userId: string, options: ListLeadsOptions): Promise<Lead[]> {
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

  const params: unknown[] = [userId];
  const tuples = scores.map((score, index) => {
    const base = index * 3 + 1;
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

export async function getStats(
  userId: string,
  todayStart: Date,
  days = 30,
): Promise<Stats> {
  const dayStart = new Date(todayStart.getTime() - (days - 1) * 86_400_000);

  const totals = await queryOne<{
    today: string;
    total: string;
    average_relevance: string | null;
    with_reply: string;
  }>(
    `select
       count(*) filter (where first_seen_at >= $2)::text as today,
       count(*)::text as total,
       avg(relevance)::text as average_relevance,
       count(*) filter (where reply is not null and reply <> '')::text as with_reply
     from public.leads
     where user_id = $1`,
    [userId, todayStart],
  );

  const byDay = await query<{ day: string; count: string; average_relevance: string | null }>(
    `select d::date::text as day,
            count(l.id)::text as count,
            avg(l.relevance)::text as average_relevance
       from generate_series($2::date, $3::date, interval '1 day') as d
       left join public.leads l
         on l.user_id = $1
        and l.first_seen_at >= d
        and l.first_seen_at < d + interval '1 day'
      group by d
      order by d asc`,
    [userId, dayStart, todayStart],
  );

  const topSubreddits = await query<{ subreddit: string; count: string }>(
    `select subreddit, count(*)::text as count
       from public.leads
      where user_id = $1
      group by subreddit
      order by count(*) desc, subreddit asc
      limit 8`,
    [userId],
  );

  return {
    today: Number(totals?.today ?? 0),
    averageRelevance:
      totals?.average_relevance === null || totals?.average_relevance === undefined
        ? null
        : Math.round(Number(totals.average_relevance)),
    total: Number(totals?.total ?? 0),
    withReply: Number(totals?.with_reply ?? 0),
    byDay: byDay.map((row) => ({
      day: row.day,
      count: Number(row.count),
      averageRelevance:
        row.average_relevance === null ? null : Math.round(Number(row.average_relevance)),
    })),
    topSubreddits: topSubreddits.map((row) => ({
      subreddit: row.subreddit,
      count: Number(row.count),
    })),
  };
}
