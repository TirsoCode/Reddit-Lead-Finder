-- ============================================================================
--  Búsqueda programada desde Postgres
--
--  En el despliegue en Supabase no hay proceso vivo, así que no hay `node-cron`.
--  Quien despierte el escaneo es el propio Postgres: `pg_cron` llama por HTTP a
--  la Edge Function con `pg_net`, y la función se autentica con un secreto que
--  vive en Supabase Vault (nunca en el repositorio).
--
--  Limitaciones que condicionan el diseño (ver `functions/.../scheduler.ts`):
--    · Una invocación de Edge Function dura 150 s como máximo. Por eso la tanda
--      atiende a unos pocos usuarios y corta antes de ese techo.
--    · La tanda se repite cada 10 minutos dentro de dos ventanas al día para que
--      la cola de usuarios llegue a vaciarse.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema extensions;

-- ----------------------------------------------------------------------------
--  Lanzar una tanda
--
--  Devuelve el id de la petición de pg_net. Es "dispara y olvida": pg_net no
--  espera a que termine el escaneo (tarda más que su propio timeout), pero la
--  Edge Function sigue trabajando en el servidor hasta completar la tanda.
-- ----------------------------------------------------------------------------
create or replace function public.invoke_leads_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text;
  request_id bigint;
begin
  select decrypted_secret
    into secret
    from vault.decrypted_secrets
   where name = 'cron_secret';

  if secret is null then
    raise exception
      'Falta el secreto "cron_secret" en Supabase Vault. Créalo con: '
      'select vault.create_secret(''<CRON_SECRET>'', ''cron_secret'', ''Secreto de la API para pg_cron'');';
  end if;

  select net.http_post(
    url := 'https://uuvglaplczoucfmebqqh.supabase.co/functions/v1/lead-api/api/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15_000
  )
  into request_id;

  return request_id;
end;
$$;

comment on function public.invoke_leads_cron() is
  'Llamada por pg_cron a POST /api/cron de la Edge Function. Devuelve el id de la petición de pg_net.';

-- ----------------------------------------------------------------------------
--  Los dos trabajos
--
--  Minutos 0,10,20,30,40,50 de las horas 8-9 (UTC) y 20-21 (UTC): 12 ventanas
--  al día, como las 08:00 y 20:00 del cron de Node pero repartidas para que la
--  cola de usuarios se vacíe sin pasarse del límite de 150 s.
--
--  24 invocaciones al día están muy por debajo de las 500.000 del plan gratuito.
--  Para cambiarlo: `select cron.schedule('leads-tanda', '<expresión>', $$select public.invoke_leads_cron();$$);`
-- ----------------------------------------------------------------------------
select cron.schedule(
  'leads-tanda',
  '0,10,20,30,40,50 8-9,20-21 * * *',
  $$select public.invoke_leads_cron();$$
);

-- ----------------------------------------------------------------------------
--  Comprobación
-- ----------------------------------------------------------------------------
create or replace function public.leads_cron_status()
returns table (job text, activo boolean, expression text)
language sql
security invoker
set search_path = public, extensions
as $$
  select j.jobname, j.active, j.schedule
    from cron.job j
   where j.jobname = 'leads-tanda';
$$;

comment on function public.leads_cron_status() is
  'Estado del trabajo de pg_cron que lanza las tandas de búsqueda. Úsalo para comprobar que sigue activo.';
