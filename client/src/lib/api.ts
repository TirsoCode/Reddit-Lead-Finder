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

export interface Stats {
  today: number;
  averageRelevance: number | null;
  total: number;
  withReply: number;
  byDay: Array<{ day: string; count: number; averageRelevance: number | null }>;
  topSubreddits: Array<{ subreddit: string; count: number }>;
}

// --- Endpoints -------------------------------------------------------------

export interface ProfileResponse {
  profile: Profile;
  runs: ScanRun[];
  pendingReplies: number;
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

  getLeads: (params: {
    status?: string;
    sort?: string;
    search?: string;
    minRelevance?: number;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return request<{ leads: Lead[]; total: number; limit: number; offset: number }>(
      `/leads?${query.toString()}`,
    );
  },

  setLeadStatus: (leadId: string, status: LeadStatus) =>
    request<{ lead: Lead }>(`/leads/${leadId}/status`, { method: 'PATCH', body: { status } }),

  generateReply: (leadId: string) =>
    request<{ lead: Lead }>(`/leads/${leadId}/reply`, { method: 'POST' }),

  deleteLead: (leadId: string) => request<void>(`/leads/${leadId}`, { method: 'DELETE' }),

  getStats: () => request<{ stats: Stats }>('/stats'),
};
