# Reddit Lead Finder — Especificaciones Completas del Proyecto

## Qué es

Una aplicación web donde cualquier persona pega la URL de su producto o negocio, y la app automáticamente analiza esa web, genera keywords relevantes, busca en Reddit posts donde la gente tiene el problema que ese producto resuelve, les asigna una puntuación de relevancia del 1 al 100, y sugiere una respuesta en español lista para copiar y pegar. Todo sin que el usuario tenga que hacer nada más que pegar su URL.

---

## Para quién es

Para cualquier persona que tenga un producto, servicio o proyecto y quiera encontrar clientes potenciales en Reddit. Cualquiera puede registrarse y usarla. No hay invitaciones ni acceso restringido. Es completamente gratuita.

---

## Cómo funciona el flujo principal

1. El usuario se registra o inicia sesión
2. Pega la URL de su producto o negocio
3. La app analiza la web automáticamente: lee el contenido, entiende qué vende, quién lo compra y qué problema resuelve
4. Genera keywords y subreddits relevantes automáticamente
5. Busca en todo Reddit posts que coincidan con esas keywords
6. Muestra los resultados con puntuación de relevancia
7. Para cada post, genera una respuesta sugerida en español
8. La app repite la búsqueda 2 veces al día sola, sin que el usuario haga nada

---

## Funcionalidades detalladas

### Análisis de la web del usuario
- La app recibe una URL y hace scraping del contenido
- Usa la IA para entender: qué es el producto, qué problema resuelve, quién es el cliente ideal
- A partir de eso genera automáticamente una lista de keywords y subreddits donde buscar
- El usuario puede ver las keywords generadas pero no necesita tocarlas

### Búsqueda en Reddit
- Busca en todo Reddit, sin limitarse a subreddits específicos
- Usa las keywords generadas para encontrar posts relevantes
- Filtra por posts recientes (últimas 24-48h preferiblemente)
- Recupera: título, contenido del post, subreddit, autor, upvotes, número de comentarios, link directo

### Puntuación de relevancia
- Cada post recibe una puntuación del 1 al 100
- La puntuación la calcula la IA según qué tan bien encaja el post con el problema que resuelve el producto
- Se muestra como número discreto a la izquierda de cada tarjeta, sin ser el elemento más llamativo

### Respuestas sugeridas
- Cada post tiene una respuesta sugerida generada por IA
- Siempre en español
- El usuario puede elegir el tono desde su perfil: natural y conversacional, profesional y directo, o amigable e informal
- La respuesta está lista para copiar y pegar directamente en Reddit
- No se publica automáticamente, siempre decide el usuario

### Búsqueda automática
- La app lanza búsquedas 2 veces al día de forma automática para todos los usuarios activos
- Los resultados aparecen directamente en la app cuando el usuario la abre
- No hay notificaciones por email ni push, simplemente los posts están ahí al entrar

### Dashboard con estadísticas
- Número de posts encontrados hoy
- Relevancia media de los posts encontrados
- Total de posts encontrados desde que empezó a usar la app
- Gráfica simple de evolución de posts por día
- Periodo de 7, 30 o 90 días: todas las cifras y las gráficas se recalculan
- Comparativa con el periodo anterior (subida o bajada) en cada cifra clave
- Embudo: cuántos posts se encontraron, se guardaron o respondieron
- Distribución de relevancia en cuatro tramos y horas del día en las que más posts llegan
- Comunidades y keywords que mejor funcionan, con enlace a los posts de cada una
- Avisos de salud: análisis fallido, última búsqueda con error, búsqueda que no pasa
- Cuenta atrás hasta la próxima búsqueda automática y resumen de la última
- Metas propias del usuario (posts por semana, respuestas escritas) guardadas en su navegador
- Exportar todos los leads a CSV y copiar un resumen en texto para informes
- Acciones rápidas (buscar, generar respuestas, exportar) y atajos de teclado: R, S y E
- Filtros de las mejores oportunidades: orden, relevancia mínima y cuántas se ven
- Densidad compacta para listas largas

### Registro y autenticación
- Registro con email y contraseña
- Login con Google (OAuth)
- Gestión completa con Supabase

### Perfil de usuario
- URL del producto (editable)
- Tono preferido para las respuestas sugeridas: conversacional, profesional o amigable
- Keywords generadas (visibles, no obligatorio editarlas)

---

## Diseño

### Estilo general
Moderno, limpio y minimalista pero con personalidad. Sin dark mode. Fondo blanco, acentos en rojo. Aspecto profesional pero accesible, no frío ni corporativo.

### Colores
- Principal: rojo (tipo #E63946 o similar)
- Fondo: blanco puro
- Texto: gris oscuro casi negro
- Acentos secundarios: gris claro para bordes y fondos de tarjetas

### Layout
- Sidebar fija a la izquierda con el menú de navegación
- Contenido principal a la derecha ocupando el resto del espacio
- Prioridad total en escritorio, móvil secundario

### Tipografía
- Títulos y headings: fuente con personalidad (ej: Sora, Plus Jakarta Sans o similar)
- Texto de cuerpo y UI: fuente limpia y legible (ej: Inter)

### Tarjetas de posts
- Compactas, para ver muchas a la vez en pantalla
- Contienen: puntuación a la izquierda (discreta), título del post, subreddit, upvotes, número de comentarios, respuesta sugerida colapsada o visible debajo
- Sin imágenes ni elementos decorativos innecesarios

### Sidebar
- Logo / nombre de la app arriba
- Navegación: Dashboard, Leads (posts encontrados), Perfil
- Limpia, sin saturar

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Frontend | React + Tailwind CSS |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL |
| Autenticación | Supabase (email + Google OAuth) |
| IA (análisis y respuestas) | OpenRouter API |
| Búsqueda en Reddit | Reddit API oficial |
| Tareas automáticas (cron) | Node-cron (2 ejecuciones diarias) |
| Hosting frontend | Vercel (plan gratuito) |
| Hosting backend | Railway (plan gratuito) |

---

## Pendiente de definir
- Nombre de la app y logo
- Modelo exacto de IA a usar en OpenRouter
- Límites de uso por usuario (número de URLs, número de posts diarios, etc.)
- Política de datos y privacidad

