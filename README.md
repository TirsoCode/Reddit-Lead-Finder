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
| Backend | Node, Express, TypeScript, Zod |
| Base de datos | PostgreSQL de Supabase |
| Autenticación | Supabase (email + Google OAuth) |
| IA | OpenRouter (análisis, puntuación y redacción) |
| Reddit | API oficial de Reddit (OAuth) |
| Automatización | node-cron (08:00 y 20:00 UTC) |

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

### 2. Reddit — app de script

1. En [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) pulsa **create another app**.
2. Tipo **script**. Reddit muestra un *client id* corto y un *secret*.
3. El *User-Agent* es obligatorio y debe tener esta forma: `web:reddit-leads:1.0.0 (by /u/TU_USUARIO)`.

### 3. OpenRouter — IA

Crea una clave en [openrouter.ai/keys](https://openrouter.ai/keys) y ponla en `OPENROUTER_API_KEY`.
El modelo por defecto es `google/gemini-2.5-flash-lite`, pero puedes cambiarlo con
`OPENROUTER_MODEL` (y `OPENROUTER_SCORING_MODEL` si quieres uno más potente solo para puntuar y
redactar).

**Cómo se comprueba que está conectada:** entra en **Perfil → Conexión con la IA** y pulsa
*Comprobar ahora*. La web llama de verdad a OpenRouter (no solo mira que la variable exista) y te
dice si la clave responde, si le falta o si se quedó sin cuota. Sin clave real, el arranque del
servidor avisa por consola y el análisis de la web falla con un mensaje claro en vez de un error
genérico.

### 4. Variables de entorno

Copia `.env.example` a `.env` y rellénalo. Lo imprescindible es `DATABASE_URL`, `SUPABASE_URL` y
`SUPABASE_ANON_KEY`; con eso la app arranca y funciona.

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
| `npm run scan` | Fuerza una búsqueda para un usuario |
| `npm run cron` | Ejecuta el ciclo automático una vez |

## Estructura

```
client/            Frontend React
  src/pages/       Landing, AuthPage, Dashboard, LeadsPage, ProfilePage
  src/components/  Sidebar, PostCard, Stats, TrendChart, iconos…
  src/lib/         api.ts (cliente HTTP), auth.ts, format.ts
server/
  routes/          /api/profile, /api/leads, /api/stats, /api/ai, /api/health
  services/        pipeline, analyze, reddit, scoring, replies, scheduler
  repositories/    acceso a datos (profiles, leads, scan_runs)
  db.ts            pool de PostgreSQL y helpers de consulta
supabase/
  migrations/      esquema, un archivo por migración (formato CLI de Supabase)
  config.toml      configuración de la CLI de Supabase
```

## Seguridad

- Toda la autenticación y los datos pasan por la API de Express; el cliente no habla nunca
  directamente con la base de datos.
- Las tablas tienen RLS activado **sin políticas**: desde el navegador no se puede leer nada. La
  API llega con el rol `postgres` de la connection string, que ignora RLS, y filtra cada consulta
  por `user_id` en el SQL.
- La *anon key* es la única clave que llega al navegador. La *service role* no se usa ni se
  comparte.
- El scraper bloquea URLs privadas y locales (protección SSRF).
- Las claves viven solo en variables de entorno. `.env` está en `.gitignore`; sube solo
  `.env.example`.

## Pendiente de decidir

- Nombre definitivo y logotipo (ahora *RedditLeads*).
- Modelo de OpenRouter definitivo.
- Límites de uso por usuario.
- Política de privacidad.
