import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { createLogger } from '../logger.js';
import type { Profile, RedditPost } from '../types.js';

const log = createLogger('reddit');

const AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';
const MIN_INTERVAL_MS = 250;
const MAX_RETRIES = 3;

interface Token {
  value: string;
  expiresAt: number;
}

interface ListingChild {
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    body?: string;
    subreddit?: string;
    author?: string;
    permalink?: string;
    url?: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    over_18?: boolean;
    stickied?: boolean;
    removed_by_category?: string | null;
    is_self?: boolean;
  };
  kind?: string;
}

class RedditClient {
  private token: Token | null = null;
  private lastRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();

  /** El token de app aguanta 1 hora; se renueva con margen. */
  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;

    const basic = Buffer.from(
      `${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`,
    ).toString('base64');

    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': env.REDDIT_USER_AGENT,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      log.error('Falló la autenticación con Reddit', detail.slice(0, 300));
      throw HttpError.upstream(
        'Las credenciales de la API de Reddit no son válidas (revisa REDDIT_CLIENT_ID y REDDIT_CLIENT_SECRET).',
      );
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw HttpError.upstream('Reddit no devolvió un token de acceso');

    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 - 60_000,
    };
    return this.token.value;
  }

  /** Serializa las peticiones y respeta el ritmo máximo de la API (~100/min). */
  private async throttle<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - this.lastRequestAt));
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();
      return task();
    });

    this.queue = run.catch(() => undefined);
    return run;
  }

  private async request<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      const token = await this.getToken();
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': env.REDDIT_USER_AGENT,
        },
      });

      if (response.status === 401) {
        this.token = null;
        continue;
      }

      if (response.status === 429) {
        const resetSeconds = Number(response.headers.get('x-ratelimit-reset') ?? '5');
        const waitMs = Math.max(1_000, resetSeconds * 1000);
        log.warn(`Límite de Reddit alcanzado; esperando ${Math.round(waitMs / 1000)}s`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        log.error(`Reddit respondió ${response.status}`, detail.slice(0, 300));
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
          continue;
        }
        throw HttpError.upstream(`La búsqueda en Reddit falló (${response.status}).`);
      }

      return (await response.json()) as T;
    }

    throw HttpError.upstream('La API de Reddit no respondió tras varios intentos.');
  }

  /** Busca posts en todo Reddit (o en un subreddit concreto). */
  async search(
    query: string,
    options: { limit?: number; subreddit?: string } = {},
  ): Promise<RedditPost[]> {
    const path = options.subreddit
      ? `/r/${options.subreddit}/search`
      : '/search';

    const listing = await this.throttle(() =>
      this.request<{ data?: { children?: ListingChild[] } }>(path, {
        q: query,
        sort: 'new',
        limit: options.limit ?? 100,
        t: 'week',
        type: 'link',
        raw_json: 1,
        include_over_18: 'false',
      }),
    );

    return (listing.data?.children ?? [])
      .map((child) => toRedditPost(child))
      .filter((post): post is RedditPost => post !== null);
  }
}

function toRedditPost(child: ListingChild): RedditPost | null {
  const data = child.data;
  if (!data?.id || !data.title || !data.subreddit) return null;
  if (data.over_18 || data.stickied) return null;
  if (data.removed_by_category) return null;

  const permalink = data.permalink ?? '';
  return {
    redditId: data.id,
    title: data.title.slice(0, 500),
    body: (data.selftext || data.body || '').trim() || null,
    subreddit: data.subreddit,
    author: data.author && data.author !== '[deleted]' ? data.author : null,
    permalink,
    url: permalink ? `https://www.reddit.com${permalink}` : (data.url ?? ''),
    upvotes: Math.max(0, Math.round(data.score ?? 0)),
    numComments: Math.max(0, Math.round(data.num_comments ?? 0)),
    postedAt: data.created_utc ? new Date(data.created_utc * 1000) : null,
  };
}

export const reddit = new RedditClient();

/** Si el keyword ya trae comillas o Paréntesis, se respeta tal cual. */
function quoteIfNeeded(value: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return '';
  return /[()]/.test(trimmed) ? trimmed : `"${trimmed}"`;
}

/** Construye las búsquedas globales a partir del perfil del usuario. */
export function buildSearchQueries(profile: Profile, limit = 6): string[] {
  const queries = profile.search_queries
    .map((query) => query.trim())
    .filter((query) => query.length >= 4);

  if (queries.length === 0) {
    const keywords = profile.keywords.filter((keyword) => keyword.trim().length >= 3);
    for (let index = 0; index < keywords.length; index += 2) {
      const group = keywords
        .slice(index, index + 2)
        .map(quoteIfNeeded)
        .filter(Boolean)
        .join(' OR ');
      if (group) queries.push(`${group} (help OR need OR recommend)`);
    }
  }

  return [...new Set(queries)].slice(0, limit);
}

/** Búsqueda complementaria dentro de los subreddits detectados. */
export interface SubredditSearch {
  subreddit: string;
  query: string;
}

export function buildSubredditSearches(profile: Profile): SubredditSearch[] {
  const keywords = profile.keywords.filter((keyword) => keyword.trim().length >= 3).slice(0, 3);
  if (keywords.length === 0) return [];

  const group = keywords.map(quoteIfNeeded).filter(Boolean).join(' OR ');
  if (!group) return [];

  return profile.subreddits
    .map((subreddit) => subreddit.replace(/^\/?r\//i, '').trim())
    .filter(Boolean)
    .slice(0, env.REDDIT_MAX_SUBREDDITS)
    .map((subreddit) => ({ subreddit, query: group }));
}
