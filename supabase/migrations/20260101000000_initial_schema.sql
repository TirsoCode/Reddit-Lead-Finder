-- ---------------------------------------------------------------------------
-- RedditLeads — esquema inicial (PostgreSQL / Supabase)
--
-- El cliente nunca habla con estas tablas: solo usa Supabase Auth. Todo el
-- acceso a datos sale de la API de Express, que se conecta con el rol `postgres`
-- de la connection string (ese rol ignora RLS) y filtra por `user_id` en el SQL.
-- Por eso RLS queda activado sin políticas: si alguien se cuela con la anon
-- key, no ve ni una fila.
--
-- Aplica este archivo con `npm run db:migrate`, o con la CLI de Supabase:
--   supabase link --project-ref TU_REF
--   supabase db push
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- profiles: configuración de cada usuario
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  product_url       text,
  product_name      text,
  -- Tono de las respuestas sugeridas
  tone              text not null default 'conversational'
                    check (tone in ('conversational', 'professional', 'friendly')),
  -- Resultado del análisis de la web
  product_summary   text,
  problem           text,
  audience          text,
  keywords          text[] not null default '{}',
  subreddits        text[] not null default '{}',
  search_queries    text[] not null default '{}',
  analysis          jsonb,
  analysis_status   text not null default 'idle'
                    check (analysis_status in ('idle', 'pending', 'ready', 'error')),
  analysis_error    text,
  analyzed_at       timestamptz,
  timezone          text not null default 'UTC',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Configuración y keywords derivadas de la URL del producto.';

-- --------------------------------------------------------------------------
-- leads: posts de Reddit encontrados para un usuario
-- --------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  reddit_id          text not null,
  title              text not null,
  body               text,
  subreddit          text not null,
  author             text,
  permalink          text,
  url                text,
  upvotes            integer not null default 0,
  num_comments       integer not null default 0,
  posted_at          timestamptz,
  -- Puntuación de relevancia calculada por IA (1-100)
  relevance          integer check (relevance between 1 and 100),
  relevance_reason   text,
  -- Respuesta sugerida, siempre en español
  reply              text,
  reply_tone         text,
  reply_generated_at timestamptz,
  -- Estado gestionado por el usuario
  status             text not null default 'new'
                     check (status in ('new', 'saved', 'replied', 'dismissed')),
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  scored_at          timestamptz,
  run_id             uuid,
  unique (user_id, reddit_id)
);

comment on table public.leads is 'Posts de Reddit con posible cliente para el producto del usuario.';

create index if not exists leads_user_first_seen_idx
  on public.leads (user_id, first_seen_at desc);
create index if not exists leads_user_relevance_idx
  on public.leads (user_id, relevance desc nulls last);
create index if not exists leads_user_status_idx
  on public.leads (user_id, status);

-- --------------------------------------------------------------------------
-- scan_runs: historial de ejecuciones de búsqueda
-- --------------------------------------------------------------------------
create table if not exists public.scan_runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  trigger           text not null default 'manual'
                    check (trigger in ('manual', 'cron', 'api')),
  status            text not null default 'running'
                    check (status in ('running', 'success', 'error')),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  posts_fetched     integer not null default 0,
  posts_new         integer not null default 0,
  replies_generated integer not null default 0,
  error             text
);

create index if not exists scan_runs_user_started_idx
  on public.scan_runs (user_id, started_at desc);

-- --------------------------------------------------------------------------
-- Seguridad: solo el backend (service role) accede a estos datos
-- --------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.leads    enable row level security;
alter table public.scan_runs enable row level security;

-- --------------------------------------------------------------------------
-- Creación automática del perfil al registrarse
-- --------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
