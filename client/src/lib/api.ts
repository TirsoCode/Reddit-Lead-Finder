import { getAccessToken } from './auth';

/**
 * Base de la API. Vacía = mismo origen (app única servida por Express).
 * Se define con VITE_API_URL solo al separar el frontend y el backend.
 */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Peticiones internas que no necesitan sesión (health check). */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous = false, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(anonymous ? {} : await authHeaders()),
        ...(headers as Record<string, string> | undefined),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Inténtalo de nuevo.');
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; code?: string }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? 'Algo ha ido mal. Inténtalo de nuevo.',
      payload?.code,
    );
  }

  return payload as T;
}

// --- Tipos compartidos con el servidor -------------------------------------

export type Tone = 'conversational' | 'professional' | 'friendly';
export type LeadStatus = 'new' | 'saved' | 'replied' | 'dismissed';
export type AnalysisStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface Profile {
  id: string;
  product_url: string | null;
  product_name: string | null;
  tone: Tone;
  product_summary: string | null;
  problem: string | null;
  audience: string | null;
  keywords: string[];
  subreddits: string[];
  search_queries: string[];
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  analyzed_at: string | null;
  timezone: string;
}

export interface Lead {
  id: string;
  reddit_id: string;
  title: string;
  body: string | null;
  subreddit: string;
  author: string | null;
  permalink: string | null;
  url: string | null;
  upvotes: number;
  num_comments: number;
  posted_at: string | null;
  relevance: number | null;
  relevance_reason: string | null;
  reply: string | null;
  reply_tone: Tone | null;
  status: LeadStatus;
  first_seen_at: string;
  last_seen_at: string;
  scored_at: string | null;
}

export interface ScanRun {
  id: string;
  trigger: 'manual' | 'cron' | 'api';
  status: 'running' | 'success' | 'error';
  started_at: string;
  finished_at: string | null;
  posts_fetched: number;
  posts_new: number;
  replies_generated: number;
  error: string | null;
}

/** Periodos que ofrece el panel. El servidor recorta a 1–365. */
export type StatsRange = 7 | 30 | 90;

/** Un tramo de relevancia, para el histograma del panel. */
export interface RelevanceBucket {
  key: 'low' | 'mid' | 'good' | 'high';
  label: string;
  count: number;
}

/** Rendimiento de una comunidad en el periodo elegido. */
export interface SubredditStat {
  subreddit: string;
  count: number;
  averageRelevance: number | null;
  highScore: number;
}

/** Cuántos posts del periodo mencionan una keyword del perfil. */
export interface KeywordStat {
  keyword: string;
  count: number;
}

/** Cifras del periodo elegido (7, 30 o 90 días). */
export interface PeriodStats {
  total: number;
  highScore: number;
  pendingReplies: number;
  averageRelevance: number | null;
  averageUpvotes: number | null;
  averageComments: number | null;
}

export interface Stats {
  today: number;
  averageRelevance: number | null;
  total: number;
  withReply: number;
  byStatus: Record<LeadStatus, number>;
  lastPostAt: string | null;
  byDay: Array<{ day: string; count: number; averageRelevance: number | null }>;
  days: number;
  periodStart: string;
  period: PeriodStats;
  previous: { total: number; averageRelevance: number | null };
  relevance: RelevanceBucket[];
  byHour: Array<{ hour: number; count: number }>;
  subreddits: SubredditStat[];
  keywords: KeywordStat[];
  streak: number;
  lastRun: {
    status: ScanRun['status'];
    started_at: string;
    posts_new: number;
    posts_fetched: number;
    error: string | null;
  } | null;
  /** Los histogramas muestran el histórico porque el periodo no tiene posts. */
  activityFallback: boolean;
}

// --- Endpoints -------------------------------------------------------------

export interface ProfileResponse {
  profile: Profile;
  runs: ScanRun[];
  pendingReplies: number;
}

export interface LeadQuery {
  status?: string;
  sort?: string;
  search?: string;
  minRelevance?: number;
  /** Nombre de la comunidad, con o sin la `r/` delante. */
  subreddit?: string;
  limit?: number;
  offset?: number;
}

export const api = {
  getProfile: () => request<ProfileResponse>('/profile'),

  saveProductUrl: (productUrl: string) =>
    request<{ profile: Profile }>('/profile', {
      method: 'PUT',
      body: { product_url: productUrl },
    }),

  updateProfile: (updates: { tone?: Tone; timezone?: string }) =>
    request<{ profile: Profile }>('/profile', { method: 'PATCH', body: updates }),

  scanNow: () =>
    request<{
      result: {
        status: 'success' | 'error';
        fetched: number;
        newPosts: number;
        scored: number;
        replies: number;
        error?: string;
      };
    }>('/profile/scan', { method: 'POST' }),

  generatePendingReplies: () =>
    request<{ generated: number }>('/profile/replies', { method: 'POST' }),

  getLeads: (params: LeadQuery) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return request<{ leads: Lead[]; total: number; limit: number; offset: number }>(
      `/leads?${query.toString()}`,
    );
  },

  /**
   * Todas las páginas de un filtro, seguidas y en orden. El servidor limita a
   * 100 por página, así que el bucle para en cuanto se cubren los `total`.
   */
  getAllLeads: async (params: Omit<LeadQuery, 'limit' | 'offset'>): Promise<Lead[]> => {
    const pageSize = 100;
    const collected: Lead[] = [];
    let total = 0;

    for (let offset = 0; ; offset += pageSize) {
      const page = await api.getLeads({ ...params, limit: pageSize, offset });
      collected.push(...page.leads);
      total = page.total;
      // Sin resultados o con menos de una página completa, no hay más que pedir.
      if (page.leads.length === 0 || collected.length >= total) break;
    }

    return collected;
  },

  setLeadStatus: (leadId: string, status: LeadStatus) =>
    request<{ lead: Lead }>(`/leads/${leadId}/status`, { method: 'PATCH', body: { status } }),

  /** Aplica un estado a varios posts de una vez (el servidor acepta hasta 100). */
  setLeadsStatus: (leadIds: string[], status: LeadStatus) =>
    request<{ updated: number }>('/leads/bulk', { method: 'POST', body: { ids: leadIds, status } }),

  /** Vacía la pila de descartados de una sola vez. */
  deleteDismissed: () => request<{ deleted: number }>('/leads?status=dismissed', { method: 'DELETE' }),

  generateReply: (leadId: string) =>
    request<{ lead: Lead }>(`/leads/${leadId}/reply`, { method: 'POST' }),

  deleteLead: (leadId: string) => request<void>(`/leads/${leadId}`, { method: 'DELETE' }),

  getStats: (days: StatsRange = 30) => request<{ stats: Stats }>(`/stats?days=${days}`),
};
