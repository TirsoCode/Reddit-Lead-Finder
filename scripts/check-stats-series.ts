/**
 * generate_series + getStats: el where de today_start y el relleno de días.
 * npx tsx scripts/check-stats-series.ts
 */
import { db, pool, query, queryOne } from '../server/db.js';
import { getStats } from '../server/repositories/leads.js';
import { startOfDayInTimezone } from '../server/time.js';

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
      timezone text not null default 'UTC',
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
    `insert into auth.users (email) values ('s@x.com') returning id`,
  );
  if (!user) throw new Error('no user');
  await query(`insert into public.profiles (id) values ($1)`, [user.id]);

  // Un lead de hoy y otro de hace 40 días (fuera de la ventana de 30).
  await query(
    `insert into public.leads (user_id, reddit_id, title, subreddit, relevance, first_seen_at)
     values
       ($1, 'hoy',  'Hoy',  'tech', 80, now()),
       ($1, 'viejo', 'Viejo', 'tech', 40, now() - interval '40 day')`,
    [user.id],
  );

  console.log('startOfDay UTC     :', startOfDayInTimezone('UTC').toISOString());
  console.log('startOfDay Madrid  :', startOfDayInTimezone('Europe/Madrid').toISOString());
  console.log('startOfDay Kiritimati:', startOfDayInTimezone('Pacific/Kiritimati').toISOString());
  console.log('startOfDay invalida:', startOfDayInTimezone('Marte/Olympus').toISOString(), '(debe caer a UTC)');

  const today = startOfDayInTimezone('UTC');
  const stats = await getStats(user.id, today);

  console.log('\ntotal (debe ser 2, incluye el lead viejo):', stats.total);
  console.log('today (debe ser 1):', stats.today);
  console.log('byDay longitud (debe ser 30):', stats.byDay.length);
  console.log('byDay[0]:', stats.byDay[0], '| byDay[29]:', stats.byDay[29]);
  const conDatos = stats.byDay.filter((d) => d.count > 0);
  console.log('días con datos:', conDatos.length, '(debe ser 1, solo el de hoy)');
  console.log('averageRelevance:', stats.averageRelevance, '(media de 80 y 40 = 60)');
  console.log('topSubreddits:', stats.topSubreddits);

  const madrid = await getStats(user.id, startOfDayInTimezone('Europe/Madrid'));
  console.log('\ntoday con zona Madrid:', madrid.today, '(0 o 1 según la hora local)');

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
