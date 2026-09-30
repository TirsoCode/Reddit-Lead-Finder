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

export interface Stats {
  today: number;
  averageRelevance: number | null;
  total: number;
  withReply: number;
  byDay: Array<{ day: string; count: number; averageRelevance: number | null }>;
  topSubreddits: Array<{ subreddit: string; count: number }>;
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
