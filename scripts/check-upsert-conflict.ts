/**
 * Verifica el refresh de una fila existente (on conflict) y el estado 'dismissed'.
 * npx tsx scripts/check-upsert-conflict.ts
 */
import { db, pool, query, queryOne } from '../server/db.js';
import { upsertLeads } from '../server/repositories/leads.js';
import type { RedditPost } from '../server/types.js';

function post(n: number, upvotes: number): RedditPost {
  return {
    redditId: `t3_p${n}`,
    title: `Titulo ${n}`,
    body: null,
    subreddit: 'sub',
    author: null,
    permalink: null,
    url: null,
    upvotes,
    numComments: 3,
    postedAt: null,
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
    `insert into auth.users (email) values ('c@x.com') returning id`,
  );
  if (!user) throw new Error('no user');
  await query(`insert into public.profiles (id) values ($1)`, [user.id]);

  console.log('1) insertar 2 posts:', await upsertLeads(user.id, null, [post(1, 10), post(2, 20)]));

  await query(`update public.leads set status = 'dismissed' where reddit_id = 't3_p1'`);

  console.log(
    '2) repetir con upvotes distintos:',
    await upsertLeads(user.id, null, [post(1, 99), post(2, 40)]),
  );

  const rows = await query<{ reddit_id: string; upvotes: number; status: string }>(
    `select reddit_id, upvotes, status from public.leads order by reddit_id`,
  );
  console.log('3) estado final:');
  for (const row of rows) {
    console.log(`   ${row.reddit_id}: upvotes=${row.upvotes} (esperado ${row.reddit_id === 't3_p1' ? 99 : 40}), status=${row.status}`);
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
