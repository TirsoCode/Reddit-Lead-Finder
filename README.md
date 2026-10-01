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
| Base de datos | PostgreSQL (Supabase) · PGlite en desarrollo local |
| Autenticación | Supabase (email + Google OAuth) · login local en desarrollo |
| IA | OpenRouter (análisis, puntuación y redacción) |
| Reddit | API oficial de Reddit (OAuth) |
| Automatización | node-cron (08:00 y 20:00 UTC) |

---

## Arranque rápido (sin configurar nada)

Para probarlo en local **no necesitas Supabase, ni Reddit, ni OpenRouter**. La base de datos es
[PGlite](https://pglite.dev) (el mismo PostgreSQL compilado a WASM, dentro del proceso) y el
registro/login lo sirve el propio backend.

```bash
git clone https://github.com/TirsoCode/Reddit-Lead-Finder.git
cd Reddit-Lead-Finder
npm install
cp .env.example .env      # ya viene relleno para el modo local
npm run db:migrate
npm run dev
```

Abre **http://localhost:5173** y crea una cuenta con cualquier email.

> En este modo el análisis con IA y la búsqueda en Reddit no funcionan hasta que metas tus
> claves de OpenRouter y Reddit en `.env`. El resto de la app (perfil, leads, respuestas,
> estadísticas) sí responde con normalidad.

## Configuración real (producción)

### 1. Supabase — base de datos y login

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql).
   Crea las tablas `profiles`, `leads` y `scan_runs` con sus índices y RLS.
3. En **Project Settings → API**, copia la *connection string* (URI, no la pooler) y las claves
   *anon* y *service role*.
4. En **Authentication → Providers**, activa **Email** y **Google OAuth**.
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

Copia `.env.example` a `.env` y rellénalo. En producción deja siempre `DEV_AUTH=false` para que la
autenticación la lleve Supabase.

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
| `npm run db:migrate` | Aplica `supabase/schema.sql` |
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
  db.ts            doble driver: PostgreSQL o PGlite
supabase/schema.sql
```

## Seguridad

- Toda la autenticación y los datos pasan por la API de Express; el cliente no habla nunca
  directamente con la base de datos.
- Las tablas tienen RLS activado **sin políticas**: desde el navegador no se puede leer nada.
- El scraper bloquea URLs privadas y locales (protección SSRF).
- Las claves viven solo en variables de entorno. `.env` está en `.gitignore`; sube solo
  `.env.example`.

## Pendiente de decidir

- Nombre definitivo y logotipo (ahora *RedditLeads*).
- Modelo de OpenRouter definitivo.
- Límites de uso por usuario.
- Política de privacidad.
