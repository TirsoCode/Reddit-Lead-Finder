/**
 * Prueba aislada de `upsertLeads` contra PGlite, sin tocar la app.
 * Ejecutar con: npx tsx scripts/check-upsert.ts
 */
import { db, pool, query, queryOne } from '../server/db.js';
import { upsertLeads } from '../server/repositories/leads.js';
import type { RedditPost } from '../server/types.js';

function post(n: number): RedditPost {
  return {
    redditId: `t3_post${n}`,
    title: `Titulo ${n}`,
    body: `Cuerpo ${n}`,
    subreddit: 'subreddit',
    author: `autor${n}`,
    permalink: `/r/subreddit/comments/${n}/x/`,
    url: `https://www.reddit.com/r/subreddit/comments/${n}/x/`,
    upvotes: n,
    numComments: n,
    postedAt: new Date(),
  };
}

async function main() {
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text,
      created_at timestamptz not null default now()
    );
    create table if not exists public.profiles (
      id uuid primary key references auth.users (id) on delete cascade,
      tone text not null default 'conversational',
      updated_at timestamptz not null default now()
    );
    create table if not exists public.leads (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      reddit_id text not null,
      title text not null,
      body text,
      subreddit text not null,
      author text,
      permalink text,
      url text,
      upvotes integer not null default 0,
      num_comments integer not null default 0,
      posted_at timestamptz,
      relevance integer,
      relevance_reason text,
      reply text,
      reply_tone text,
      reply_generated_at timestamptz,
      status text not null default 'new',
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      scored_at timestamptz,
      run_id uuid,
      unique (user_id, reddit_id)
    );
  `);

  const user = await queryOne<{ id: string }>(
    `insert into auth.users (email) values ('test@x.com') returning id`,
  );
  if (!user) throw new Error('no user');
  await query(`insert into public.profiles (id) values ($1)`, [user.id]);

  for (const count of [1, 2, 3]) {
    const posts = Array.from({ length: count }, (_, i) => post(i + 1));
    try {
      const result = await upsertLeads(user.id, null, posts);
      console.log(`  count=${count} -> OK`, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  count=${count} -> FALLO: ${message.split('\n')[0]}`);
    }
  }

  const rows = await query<{ reddit_id: string; title: string; author: string }>(
    `select reddit_id, title, author from public.leads order by reddit_id`,
  );
  console.log('  filas guardadas:', rows);

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
