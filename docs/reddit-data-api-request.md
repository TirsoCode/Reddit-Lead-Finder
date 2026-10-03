# Solicitud de acceso al Reddit Data API

Reddit canceló el acceso self-service en diciembre de 2025. Crear una app `script` en
`reddit.com/prefs/apps` ya no devuelve credenciales, solo un aviso que remite a la
[Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy).
Sin esta aprobación no hay forma legítima de obtener posts, y el scraping está
prohibido por la misma política.

## Antes de rellenar: dos registros distintos

| Registro | Qué da | Dónde |
|---|---|---|
| Perfil de developer / app | Solo la etiqueta de bot. Nada de credenciales | `developers.reddit.com` |
| Solicitud de acceso al Data API | El `client_id` y el `secret` | Formulario de acceso al Data API |

Llena el segundo. Si haces el primero y crees que ya tienes acceso, pierdes una tarde: el
portal marca la app como *Registered* y aun así `/prefs/apps` sigue rechazando.

## Qué formulario te corresponde

Depende de una sola cosa: si esto lo monetizas. La política distingue el uso no comercial
(formulario de acceso al Data API) del comercial (acuerdo por escrito aparte).

- Si el producto es gratis para el usuario y no monetizas de ninguna forma, entra por el
  formulario no comercial. Hoy `especificaciones.md` dice que la app «es completamente
  gratuita», así que esa es la vía.
- Si monetizas o piensas hacerlo, entra por el comercial. Y si ahora no monetizas pero
  quieres monetizar en seis meses, dilo en la solicitud.

Declara la verdad en los dos casos. Reddit revisa con personas y con modelos de lenguaje, y
falsear el uso del producto es de las pocas cosas que te cierra la puerta de forma
permanente. En `r/redditdev` hay quien cuenta que le rechazaron la solicitud comercial dos
veces con respuestas genéricas y sin decir qué faltaba.

## Datos concretos del proyecto

Están medidos en el código, no son suposiciones:

| Dato | Valor |
|---|---|
| Tipo de app | Web app (SaaS), multiusuario, registro abierto |
| Autenticación | Email + Google OAuth, cada usuario con su propia cuenta |
| Ámbito del acceso | Solo lectura de listados y búsqueda pública |
| Operaciones contra Reddit | 1 POST (intercambio de token) y todo lo demás GET |
| Votan, publican o mandan DMs | No, en ningún caso |
| Endpoints usados | `/api/v1/access_token`, `/search`, `/r/{subreddit}/search` |
| Peticiones por escaneo | 9 (6 búsquedas globales + hasta 3 por subreddit) |
| Escaneos por usuario y día | 2 automáticos, más los que el usuario lance a mano |
| Peticiones diarias con 100 usuarios | ~1.800 |
| Límite que se pide | El nivel gratuito, 100 consultas/min por `client_id` |
| Ritmo real en el código | 80/min (`server/services/reddit.ts`, `MIN_INTERVAL_MS = 750`) |
| Datos guardados | Título, cuerpo, subreddit, autor, permalink, upvotes, comentarios y fecha |
| Datos no guardados | Nada de DMs, votos, correos ni perfiles más allá del nombre de autor |

Sobre la IA: los posts se puntúan y se redacta una respuesta sugerida con OpenRouter, pero
solo usando datos públicos del post. El modelo no entrena con ellos. La respuesta nunca se
publica sola, el usuario la copia a mano. El producto es un generador de borradores, no un
bot que autopublica.

## Borrador de la descripción

> RedditLeads is a web app where a small business owner pastes the URL of their own product.
> The app reads that public web page, works out what the product does, and searches Reddit's
> public listings for posts where people describe that same problem. Each post gets a
> relevance score from 1 to 100 and the app drafts a reply in the poster's language, which the
> user copies by hand if they decide to post it.
>
> The integration is strictly read-only. It issues one token exchange and then only GETs. It
> never votes, never submits a link or comment, never sends a private message, and never reads
> anything behind a login. We do not store user data or use any of it to train models.
>
> The app is free for end users. Searches run on a schedule: about 9 requests per scan, two
> scans per user per day, so roughly 1,800 requests a day at 100 users. That is well inside the
> free tier, and our client self-throttles to 80 requests per minute.
>
> Users can see the keyword list the app derived from their own site, change it, delete it, and
> see every post that came back. We do not mask the app's identity and we are not requesting
> multiple clients for this use case.

## Si te la rechazan

Es lo que más pasa, sobre todo en la vía comercial. Orden de intentos:

1. Reenvía el caso indicando el motivo concreto que te dieron.
2. Pide que te tramiten la vía no comercial mientras el producto siga siendo gratis.
3. Plan B técnico: hay fuentes de conversación con API abierta y sin aprobación previa
   (Hacker News vía Algolia, Stack Exchange, Bluesky). Cambiar de fuente es trabajo de un
   día, porque `services/reddit.ts` está aislado detrás de una única función `search()`.

Lo que no es una opción: raspar con proxies rotando, registrar varias cuentas para sumar
cupones de peticiones o enmascarar el User-Agent. La política lo prohíbe de forma expresa
(must not circumvent or exceed access limits, sin registrar cuentas múltiples para el mismo
caso) y el resultado habitual no es un 429, es un bloqueo permanente.