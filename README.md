# RedditLeads

Pega la URL de tu producto y la app encuentra en Reddit a las personas que tienen tu problema,
puntúa cada conversación del 1 al 100 y te escribe la respuesta en español lista para copiar.

No publica nada por ti: la respuesta siempre la escribes y la pegas tú.

---

## Cómo funciona

1. **Pegas la URL** de tu producto.
2. **La IA la lee** y deduce qué vendes, qué problema resuelves y a quién le duele.
3. **Genera palabras clave y subreddits**, y busca las conversaciones de las últimas 48 horas.
4. **Puntúa cada post del 1 al 100** según lo bien que encaje contigo.
5. **Redacta la respuesta en español** con el tono que hayas elegido.
6. Se repite **dos veces al día** automáticamente, o cuando quieras a mano.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Backend (local) | Node, Express, TypeScript, Zod |
| Backend (nube) | Supabase Edge Functions (Deno), Zod |
| Base de datos | PostgreSQL de Supabase |
| Autenticación | Supabase (email + Google OAuth) |
| IA | OpenRouter (análisis, puntuación y redacción) |
| Reddit | API oficial de Reddit (OAuth) |
| Automatización | `pg_cron` + `pg_net` (08:00-10:00 y 20:00-22:00 UTC) |

El backend tiene **dos implementaciones del mismo código**, y no es un descuido:

- `server/` es la versión de **Node + Express**. Sirve para desarrollo local
  (`npm run dev`) y para desplegar en cualquier hosting con proceso vivo.
- `supabase/functions/` es la versión de **Deno** para Supabase Edge Functions.
  Es la que se usa en producción: sale gratis y da 150 s por invocación.

Los dos copian la misma lógica (`repositories/`, `services/`). **Cuando cambies
uno, cambia el otro**: los ficheros que se portan tal cual solo se diferencian en
las extensiones de los imports (`.js` → `.ts`). Los que cambian de verdad son
`env.ts`, `db.ts`, `auth.ts`, `services/scheduler.ts`, `services/scraper.ts`
(cheerio → linkedom) y el `index.ts` de entrada.

---

## Arranque rápido

La app necesita un proyecto de Supabase (gratis) para la base de datos y el login. Reddit y
OpenRouter son opcionales: sin ellos la app funciona y solo avisa de que el análisis con IA y la
búsqueda de posts no responden.

```bash
git clone https://github.com/TirsoCode/Reddit-Lead-Finder.git
cd Reddit-Lead-Finder
npm install
cp .env.example .env      # rellena las credenciales de Supabase (ver más abajo)
npm run db:migrate        # crea las tablas
npm run dev
```

Abre **http://localhost:5173** y crea una cuenta.

Si prefieres gestionar el esquema con la CLI de Supabase en vez de con el script:

```bash
npx supabase login
npm run db:link -- --project-ref TU_PROJECT_REF
npm run db:push
```

## Configuración real (producción)

### 1. Supabase — base de datos y login

1. Crea un proyecto en [supabase.com](https://supabase.com) y guarda la contraseña de la base de
   datos (la que eliges al crearlo).
2. Aplica el esquema, que crea las tablas `profiles`, `leads` y `scan_runs` con sus índices, RLS y
   el trigger que crea el perfil al registrarse:
   ```bash
   # con la connection string en .env
   npm run db:migrate

   # o con la CLI
   npx supabase login
   npm run db:link -- --project-ref TU_PROJECT_REF
   npm run db:push
   ```
   El SQL está en [`supabase/migrations/`](supabase/migrations); también puedes pegarlo a mano en
   el **SQL Editor**.
3. En **Project Settings → Database**, copia la *connection string* en modo **URI** (no la del
   pooler) para `DATABASE_URL`.
4. En **Project Settings → API**, copia la URL y la clave *anon / public* para `SUPABASE_URL` y
   `SUPABASE_ANON_KEY`. No necesitas la *service role*: la API se conecta a PostgreSQL con el rol
   `postgres` de la connection string.
5. En **Authentication → Providers**, activa **Email** y **Google OAuth**.
   Para Google, mete el client id y el secret que te dé Google Cloud Console y añade
   `http://localhost:5173` y tu dominio a las URLs de redirección permitidas.

### 2. Reddit — acceso al Data API (requiere aprobación)

**Esto ya no se puede hacer por cuenta propia.** Desde diciembre de 2025 Reddit canceló el acceso
self-service: entrar en [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) y pulsar
*create another app* devuelve el aviso de la
[Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
en lugar de credenciales.

Ojo con la trampa: hay **dos registros distintos** y solo uno da credenciales.

| Registro | Qué te da |
|---|---|
| Registro de app / perfil en `developers.reddit.com` | La etiqueta de bot. **Sin** client id ni secret |
| Solicitud de acceso al Data API | El `client id` y el `secret` que necesita `services/reddit.ts` |

Según la misma política, el uso **no comercial** se pide con el formulario de acceso al Data API,
pero el **comercial** exige un acuerdo por escrito aparte, y este producto es comercial. En los
foros de `r/redditdev` hay quien cuenta que le rechazaron la solicitud comercial varias veces con
respuestas genéricas, así que conviene tener un plan B.

El nivel gratuito que existe sigue siendo de 100 consultas/min por cliente OAuth, pero **no es
self-service**: requiere la aprobación de antes. Cuando llegue, `services/reddit.ts` va a 80/min.

Tampoco se puede sustituir por scraping: la política prohíbe expresamente el scraping sin
aprobación, y en la práctica `old.reddit.com` manda a `/login` a los visitantes anónimos y en
`www.reddit.com` los resultados se pintan con JavaScript.

Mientras tanto, la app **arranca y funciona**: el perfil se analiza y las replied se generan, solo
que no entra ningún post de Reddit. En **Perfil → Conexión con la IA** te dirá si Reddit está
listo o no.

### 3. OpenRouter — IA

Crea una clave en [openrouter.ai/keys](https://openrouter.ai/keys) y ponla en `OPENROUTER_API_KEY`.
El modelo por defecto es `qwen/qwen3.8-27b:free`, pero puedes cambiarlo con
`OPENROUTER_MODEL` (y `OPENROUTER_SCORING_MODEL` si quieres uno más potente solo para puntuar y
redactar). El modelo `free` no cuesta nada, pero cuando está saturado OpenRouter devuelve un 429;
el reintento y el mensaje de aviso ya están previstos en `services/ai.ts`.

**Cómo se comprueba que está conectada:** entra en **Perfil → Conexión con la IA** y pulsa
*Comprobar ahora*. La web llama de verdad a OpenRouter (no solo mira que la variable exista) y te
dice si la clave responde, si le falta o si se quedó sin cuota. Sin clave real, el arranque del
servidor avisa por consola y el análisis de la web falla con un mensaje claro en vez de un error
genérico.

### 4. Variables de entorno

Copia `.env.example` a `.env` y rellénalo. Lo imprescindible es `DATABASE_URL`, `SUPABASE_URL` y
`SUPABASE_ANON_KEY`; con eso la app arranca y funciona.

---

## Despliegue en la nube (Supabase)

Todo lo que hay por debajo está probado contra el proyecto real
`uuvglaplczoucfmebqqh` (región `eu-west-1`). Cuesta 0 €.

```
Frontend   →  Vercel                        https://reddit-lead-finder-ecru.vercel.app
API        →  Supabase Edge Functions       https://<ref>.supabase.co/functions/v1/lead-api
Datos+Auth →  Supabase (PostgreSQL + Auth)
Cron       →  pg_cron, dentro del PostgreSQL
```

Se eligió Supabase y no Vercel para la API porque el plan Hobby de Vercel limita
las funciones a 60 s por ejecución y es **solo de uso no comercial**, mientras
que las Edge Functions dan 150 s y 500.000 invocaciones al mes sin letra
pequeña. El único peaje es que el runtime es Deno, no Node.

### 1. Base de datos y esquema

```bash
npx supabase login
npm run db:link -- --project-ref uuvglaplczoucfmebqqh
npm run db:push          # crea tablas, RLS, trigger y el cron
```

### 2. Configurar la autenticación

En **Authentication → URL Configuration**:

| Campo | Valor |
|---|---|
| Site URL | `https://reddit-lead-finder-ecru.vercel.app` |
| Redirect URLs | esa misma + `http://localhost:5173` |

Mientras no haya SMTP configurado, deja **Confirm email = OFF**
(`mailer_autoconfirm`) para poder registrarse sin correo. Cuando metas SMTP,
vuelve a activarlo.

### 3. Desplegar la API

```bash
# Secretos de la función (nunca en el repo)
npx supabase secrets set \
  --project-ref uuvglaplczoucfmebqqh \
  DATABASE_URL="postgresql://postgres:...@db.uuvglaplczoucfmebqqh.supabase.co:5432/postgres" \
  SUPABASE_URL="https://uuvglaplczoucfmebqqh.supabase.co" \
  SUPABASE_ANON_KEY="eyJ..." \
  OPENROUTER_API_KEY="sk-or-v1-..." \
  REDDIT_CLIENT_ID="..." \
  REDDIT_CLIENT_SECRET="..." \
  REDDIT_USER_AGENT="web:reddit-leads:1.0.0 (by /u/TU_USUARIO)" \
  CRON_SECRET="$(openssl rand -hex 24)" \
  ALLOWED_ORIGINS="https://reddit-lead-finder-ecru.vercel.app,http://localhost:5173"

npx supabase functions deploy lead-api --project-ref uuvglaplczoucfmebqqh
```

`CRON_SECRET` es el mismo valor que después hay que meter en Supabase Vault.

### 4. Programar la búsqueda automática

`pg_cron` es quien llama a la Edge Function. El secreto va en **Vault**, ni en el
código ni en la migración:

```sql
select vault.create_secret(
  '<el mismo CRON_SECRET de arriba>',
  'cron_secret',
  'Secreto de la API para pg_cron'
);
```

Comprobar que el trabajo existe, y dispararlo a mano:

```sql
select * from public.leads_cron_status();
```

```bash
curl -X POST "https://uuvglaplczoucfmebqqh.supabase.co/functions/v1/lead-api/api/cron" \
  -H "x-cron-secret: $CRON_SECRET"
```

### 5. Frontend en Vercel

```bash
vercel env add VITE_API_URL            production   # https://<ref>.supabase.co/functions/v1/lead-api
vercel env add VITE_SUPABASE_URL       production   # https://<ref>.supabase.co
vercel env add VITE_SUPABASE_ANON_KEY  production
vercel deploy --prod
```

### 6. Puesta en marcha: Reddit y Google

Hasta que se metan estas dos claves la web funciona, pero **sin datos**:

| Falta | Qué pasa | Cómo se arregla |
|---|---|---|
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | No entra ningún post. El perfil sí se analiza. | Hace falta la aprobación del Data API (ver paso 2): rellena los dos valores cuando Reddit la conceda |
| Google OAuth | Solo se puede entrar con email | Authentication → Providers → Google, con el client id y secret de Google Cloud |

---

## Los límites, dichos claro

| Límite | Valor | Qué implica |
|---|---|---|
| Duración de una invocación | 150 s | Una tanda no puede atender a todo el mundo de golpe. `services/scheduler.ts` corta a los 105 s y `pg_cron` vuelve a llamar cada 10 minutos para el siguiente grupo. |
| Invocaciones | 500.000/mes | 24 al día de cron más el uso normal de la web. Sobradísimo. |
| Conexiones a PostgreSQL | 2 por instancia (`POOL_MAX`) | El plan gratis limita las simultáneas; se sube con `POOL_MAX` si hace falta. |
| Memoria | 256 MB | Suficiente: el trabajo es entrada/salida contra APIs externas. |
| Salida a ports 25/587 | Bloqueada | Irrelevante: aquí todo es HTTPS por el 443. |

---

## Tema claro y oscuro

La web viene con los dos modos. El botón de sol/luna está en la barra lateral, en la cabecera móvil
y en la portada. La primera visita respeta el tema del sistema operativo y, cuando eliges uno a mano,
se recuerda en el navegador (`localStorage`). No hay parpadeo al cargar: la clase se aplica antes de
montar React.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API (3000) + frontend (5173) a la vez, con recarga en caliente |
| `npm run dev:server` / `npm run dev:client` | Por separado |
| `npm run build` | Compila cliente y servidor |
| `npm start` | Arranca la build en producción (el Express sirve también el frontend) |
| `npm run typecheck` | TypeScript estricto en servidor y cliente |
| `npm run db:migrate` | Aplica las migraciones de `supabase/migrations/` en orden |
| `npm run db:link` | Enlaza la carpeta con tu proyecto de Supabase (CLI) |
| `npm run db:push` | Sube las migraciones pendientes con la CLI |
| `npm run db:status` | Lista las migraciones y las que faltan aplicar |
| `npm run fn:deploy` | Sube la Edge Function `lead-api` |
| `npm run fn:list` | Lista las funciones desplegadas |
| `npm run scan` | Fuerza una búsqueda para un usuario |
| `npm run cron` | Ejecuta el ciclo automático una vez |

## Estructura

```
client/            Frontend React
  src/pages/       Landing, AuthPage, Dashboard, LeadsPage, ProfilePage
  src/components/  Sidebar, PostCard, Stats, TrendChart, iconos…
  src/lib/         api.ts (cliente HTTP), auth.ts, format.ts
server/            Backend de Node + Express (desarrollo local y hosting con proceso)
  routes/          /api/profile, /api/leads, /api/stats, /api/ai, /api/health
  services/        pipeline, analyze, reddit, scoring, replies, scheduler
  repositories/    acceso a datos (profiles, leads, scan_runs)
  db.ts            pool de PostgreSQL y helpers de consulta
supabase/
  migrations/      esquema, un archivo por migración (formato CLI de Supabase)
  config.toml      configuración de la CLI de Supabase
  functions/       Backend de Deno para Supabase Edge Functions (producción)
    lead-api/      equivalente de server/ con el runtime de Deno
      index.ts     Deno.serve: CORS, rutas y manejo de errores
      http/        enrutador propio (sustituye a Express)
      services/    la misma lógica que server/services
      repositories/
```

## Seguridad

- Toda la autenticación y los datos pasan por la API; el cliente no habla nunca
  directamente con la base de datos.
- Las tablas tienen RLS activado **sin políticas**: desde el navegador no se puede leer nada. La
  API llega con el rol `postgres` de la connection string, que ignora RLS, y filtra cada consulta
  por `user_id` en el SQL.
- La *anon key* es la única clave que llega al navegador. La *service role* no se usa ni se
  comparte.
- El scraper bloquea URLs privadas y locales (protección SSRF).
- El endpoint del cron se protege con un secreto en la cabecera `x-cron-secret`, comparado en
  tiempo constante, y guardado en Supabase Vault.
- La función solo responde con cabeceras de CORS a los orígenes de `ALLOWED_ORIGINS`.
- Las claves viven solo en variables de entorno. `.env` está en `.gitignore`; sube solo
  `.env.example`.

## Pendiente de decidir

- Nombre definitivo y logotipo (ahora *RedditLeads*).
- Modelo de OpenRouter definitivo.
- Límites de uso por usuario.
- Política de privacidad.
