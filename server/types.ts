export type Tone = 'conversational' | 'professional' | 'friendly';

export type AnalysisStatus = 'idle' | 'pending' | 'ready' | 'error';

export type LeadStatus = 'new' | 'saved' | 'replied' | 'dismissed';

export type RunTrigger = 'manual' | 'cron' | 'api';

export type RunStatus = 'running' | 'success' | 'error';

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
  analysis: ProductAnalysis | null;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  analyzed_at: Date | null;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProductAnalysis {
  product_name: string;
  summary: string;
  problem: string;
  audience: string;
  keywords: string[];
  subreddits: string[];
  search_queries: string[];
}

export interface Lead {
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

export interface ScanRun {
  id: string;
  user_id: string;
  trigger: RunTrigger;
  status: RunStatus;
  started_at: Date;
  finished_at: Date | null;
  posts_fetched: number;
  posts_new: number;
  replies_generated: number;
  error: string | null;
}

/** Un tramo de relevancia, para el histograma del panel. */
export type RelevanceBucketKey = 'low' | 'mid' | 'good' | 'high';

export interface RelevanceBucket {
  key: RelevanceBucketKey;
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
  /** Posts con relevancia 60 o más. */
  highScore: number;
  /** Posts del periodo sin respuesta generada. */
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
  /** Recuento por estado de todo el histórico: alimenta el embudo. */
  byStatus: Record<LeadStatus, number>;
  /** Instante del post más reciente, o `null` si aún no hay ninguno. */
  lastPostAt: Date | null;
  byDay: Array<{ day: string; count: number; averageRelevance: number | null }>;

  /** Días del periodo aplicado y su inicio (día local del usuario). */
  days: number;
  periodStart: string;
  period: PeriodStats;
  /** Periodo inmediatamente anterior, para comparar. */
  previous: { total: number; averageRelevance: number | null };
  /** Histograma de relevancia del periodo. */
  relevance: RelevanceBucket[];
  /** Posts por hora del día, en la zona horaria del usuario (0–23). */
  byHour: Array<{ hour: number; count: number }>;
  subreddits: SubredditStat[];
  keywords: KeywordStat[];
  /** Días consecutivos con al menos un post nuevo. */
  streak: number;
  /** Última ejecución de búsqueda, para el panel de actividad. */
  lastRun: {
    status: RunStatus;
    started_at: Date;
    posts_new: number;
    posts_fetched: number;
    error: string | null;
  } | null;
  /**
   * El periodo no tiene ningún post, así que los histogramas muestran el
   * histórico completo. El cliente lo dice para que no parezca un error.
   */
  activityFallback: boolean;
}

export interface RedditPost {
  redditId: string;
  title: string;
  body: string | null;
  subreddit: string;
  author: string | null;
  permalink: string;
  url: string;
  upvotes: number;
  numComments: number;
  postedAt: Date | null;
}
