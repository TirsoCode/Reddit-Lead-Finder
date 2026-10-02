-- ============================================================================
--  Catálogo de modelos de IA
--
--  El plan gratuito de OpenRouter no es un catálogo fijo: cada semana quitan
--  modelos que se quedan sin capacidad y añaden otros nuevos. Si la lista
--  estuviera en el código, habría que revisarla a mano cada poco tiempo, y en
--  cuanto uno de los modelos guardados desapareciera la app se quedaría sin IA
--  aunque hubiera diez libres disponibles.
--
--  Así que la lista se descubre sola: `services/aiModels.ts` pregunta a
--  OpenRouter qué hay ahora mismo y guarda el resultado aquí. Como la respuesta
--  pesa casi 800 kB y las invocaciones de Edge Functions arrancan en frío
--  constantemente, guardarla evita repetir esa descarga en cada petición.
--
--  Una sola fila (lo exige la clave primaria forzada a 1): es una caché, no un
--  histórico. `refreshed_at` dice si hay que volver a preguntar.
-- ============================================================================

create table if not exists public.ai_model_catalogue (
  -- Una única fila: el catálogo entero cabe en `models`.
  id           int     primary key default 1 check (id = 1),
  -- Lista de modelos libres, ya filtrada. Ver `services/aiModels.ts` para la
  -- forma exacta de cada objeto.
  models       jsonb   not null default '[]'::jsonb,
  -- Lo que ha hecho cada modelo hasta ahora: { "modelo": { ok, fail, until } }.
  -- Es lo que decide el orden en que se prueban, y se guarda en la base de
  -- datos porque las Edge Functions arrancan en frío y si no, cada arranque
  -- volvería a pagar los mismos fallos.
  scores       jsonb   not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

comment on table public.ai_model_catalogue is
  'Caché del catálogo de modelos gratuitos de OpenRouter, y contadores de aciertos y fallos. Los refresca services/aiModels.ts.';

-- Se activa RLS sin ninguna política, igual que las demás tablas: desde el
-- navegador no se lee nada. Solo la API, que entra con el rol `postgres`, ve
-- esta tabla.
alter table public.ai_model_catalogue enable row level security;
