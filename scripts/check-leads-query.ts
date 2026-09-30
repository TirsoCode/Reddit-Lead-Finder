/**
 * Comprueba listLeads: numeración de parámetros, orden y que los filtros no
 * se pisen entre sí. npx tsx scripts/check-leads-query.ts
 */
import { db, pool, query, queryOne } from '../server/db.js';
import { countLeads, listLeads, saveScores } from '../server/repositories/leads.js';

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

  const a = await queryOne<{ id: string }>(`insert into auth.users (email) values ('a@x.com') returning id`);
  const b = await queryOne<{ id: string }>(`insert into auth.users (email) values ('b@x.com') returning id`);
  if (!a || !b) throw new Error('no users');
  await query(`insert into public.profiles (id) values ($1), ($2)`, [a.id, b.id]);

  await query(
    `insert into public.leads (user_id, reddit_id, title, body, subreddit, upvotes, num_comments, relevance, status, first_seen_at)
     values
       ($1, 'r1', 'Zapata_SIZE guide', 'sobre tacitacion', 'skate', 10, 5, 90, 'new',  now() - interval '1 day'),
       ($1, 'r2', ' Ayuda',              'busco algo',     'saude', 20, 1, 20, 'saved', now() - interval '2 day'),
       ($1, 'r3', 'SIN PUNTUAR',         'nada',           'tech',  5,  9, null, 'new',  now() - interval '3 day'),
       ($2, 'r9', 'De otro usuario',     'ajeno',          'tech',  1,  1, 10, 'new',  now())`,
    [a.id, b.id],
  );

  const show = async (label: string, options: Parameters<typeof listLeads>[1]) => {
    const leads = await listLeads(a.id, options);
    const total = await countLeads(a.id, { ...options, limit: undefined, offset: undefined } as never);
    console.log(
      `${label}\n   total=${total} ids=[${leads.map((l) => `${l.reddit_id}:${l.relevance ?? '-'}`).join(', ')}]`,
    );
  };

  await show('1) todos, orden relevancia:', { limit: 25, offset: 0, sort: 'relevance' });
  await show('2) status=new:', { limit: 25, offset: 0, status: 'new' });
  await show('3) busqueda "size" (debe respetar el plural):', { limit: 25, offset: 0, search: 'size' });
  await show('4) busqueda + status + minRelevance:', {
    limit: 25,
    offset: 0,
    search: 'a',
    status: 'new',
    minRelevance: 50,
  });
  await show('5) paginacion limit=2 offset=1:', { limit: 2, offset: 1, sort: 'new' });

  console.log('6) saveScores con 3 ids:');
  console.log(
    '   actualizadas =',
    await saveScores(a.id, [
      { redditId: 'r1', relevance: 77, reason: 'uno' },
      { redditId: 'r2', relevance: 5, reason: 'dos' },
      { redditId: 'r3', relevance: 55, reason: 'tres' },
    ]),
  );
  const scored = await query<{ reddit_id: string; relevance: number }>(
    `select reddit_id, relevance from public.leads where user_id = $1 order by reddit_id`,
    [a.id],
  );
  console.log('   ', scored, '(esperado r1=77 r2=5 r3=55)');

  console.log('7) saveScores con relevance fuera de rango (0 y 500):');
  await saveScores(a.id, [
    { redditId: 'r1', relevance: 0 },
    { redditId: 'r2', relevance: 500 },
  ]);
  const clamped = await query<{ reddit_id: string; relevance: number }>(
    `select reddit_id, relevance from public.leads where user_id = $1 and relevance is not null order by reddit_id`,
    [a.id],
  );
  console.log('   ', clamped, '(esperado r1=1 r2=100)');

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
