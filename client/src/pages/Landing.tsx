import { useState, type FormEvent } from 'react';
import {
  IconCheck,
  IconClose,
  IconComment,
  IconCopy,
  IconEye,
  IconPencil,
  IconReddit,
  IconSearch,
  IconShield,
} from '../components/icons';
import { LogoMark } from '../components/Logo';
import { copyToClipboard, cx, relevanceTone } from '../lib/format';

interface LandingProps {
  onAuth: () => void;
}

/** Los tres avisos que tranquilizan antes de registrarse. */
const TRUST = [
  {
    icon: IconShield,
    title: 'Tú publicas, siempre',
    body: 'Nada sale de la app sin que tú lo copies y lo pegues. Eres quien decide cuándo, dónde y si respondes.',
  },
  {
    icon: IconEye,
    title: 'Tu cuenta, solo lectura',
    body: 'La búsqueda usa la API oficial de Reddit. Ni tu contraseña ni una sesión prestada: nunca publicamos en tu nombre.',
  },
  {
    icon: IconCheck,
    title: 'Cero duplicados',
    body: 'Cada conversación aparece una sola vez entre barridos, te hayas dado cuenta de ella o no.',
  },
];

interface Step {
  icon: typeof IconSearch;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: IconSearch,
    title: 'Encuentra el hilo',
    body: 'Pegas la URL, la IA deduce qué vendes y a quién le duele, y recorre lo que se ha escrito en Reddit en las últimas 48 horas.',
  },
  {
    icon: IconPencil,
    title: 'Escribe la respuesta',
    body: 'Un borrador en tu tono que contesta la pregunta y cita sus palabras. Lo editas, lo apruebas o lo escribes tú desde cero.',
  },
  {
    icon: IconCopy,
    title: 'La pegas en Reddit',
    body: 'Copias cada borrador a tu propia cuenta, en tu propio navegador, al ritmo que te venga bien. La respuesta siempre es tuya.',
  },
];

/** Fila del mockup del paso 1: los hilos acaban de llegar del barrido. */
const MINI_FEED = [
  { sub: 'r/Shopify', score: 94, title: '¿Cómo organizáis vuestro histórico de pedidos?' },
  { sub: 'r/ecommerce', score: 92, title: '¿Qué herramienta simple para ver pedidos sin ERP?' },
  { sub: 'r/emprendedores', score: 86, title: 'He perdido el rastro de 40 pedidos en un mes…' },
];

/** Mockup del paso 3: la cola aprobada, lista para copiar y pegar. */
const MINI_QUEUE = [
  { sub: 'r/Shopify', title: '¿Cómo organizáis vuestro histórico de pedidos?', status: 'lista' },
  { sub: 'r/emprendedores', title: 'He perdido el rastro de 40 pedidos en un mes…', status: 'cola' },
  { sub: 'r/ecommerce', title: '¿Qué herramienta simple usáis para ver pedidos?', status: 'cola' },
];

/** Demo de la cola: un producto de ejemplo (gestor de pedidos para tiendas). */
interface DemoLead {
  id: string;
  sub: string;
  user: string;
  score: number;
  title: string;
  body: string;
  highlight: string;
  reason: string;
  rules: string;
  draft: string;
}

const DEMO_LEADS: DemoLead[] = [
  {
    id: 'pedidos',
    sub: 'r/Shopify',
    user: 'u/ana_shop',
    score: 94,
    title: '¿Cómo organizáis vuestro histórico de pedidos?',
    body: 'Llevo medio año con la tienda y los pedidos están repartidos entre tres hojas de cálculo. La principal ya se cae con ~40 pedidos. Abierta a pagar por algo sencillo.',
    highlight: 'Abierta a pagar por algo sencillo.',
    reason: 'Dice el problema, la escala y el presupuesto, todo en un solo post.',
    rules: 'r/Shopify permite nombrar un producto en un comentario cuando responde a la pregunta que se hace.',
    draft:
      'Nos pasó lo mismo con unos 40 pedidos: tres hojas y ninguna fiable. Lo que lo resolvió fue una sola lista compartida con una columna de estado, así que los duplicados caen en la misma fila en vez de apilarse. Una tarde de montaje y dos años de paz. Si te sirve te paso la estructura.',
  },
  {
    id: 'rastreo',
    sub: 'r/emprendedores',
    user: 'u/diego_v',
    score: 86,
    title: 'He perdido el rastro de 40 pedidos en un mes. ¿Qué usáis vosotros?',
    body: 'Vendo por Instagram y los directos me dejan los mensajes como pedidos. Me he comido dos envíos equivocados en un mes y ya no sé qué está pendiente de enviar.',
    highlight: 'me he comido dos envíos equivocados en un mes',
    reason: 'Un problema concreto, con coste real, en una comunidad que pregunta por herramientas.',
    rules: 'r/emprendedores deja recomendar herramientas si va en respuesta directa a la pregunta.',
    draft:
      'Nos comíamos envíos igual hasta separar "pedido" de "mensaje": cada pedido pasa a una lista con estado (pendiente, enviado, entregado) y el mensaje se cierra. Basta con una columna. Si quieres te cuento cómo lo montamos en una tarde.',
  },
  {
    id: 'erp',
    sub: 'r/ecommerce',
    user: 'u/merce_d',
    score: 92,
    title: '¿Qué herramienta simple usáis para ver los pedidos sin montar un ERP?',
    body: 'No quiero un ERP para 60 pedidos al mes. Solo necesito ver de un vistazo qué va y qué se ha quedado atascado esta semana.',
    highlight: 'sin montar un ERP',
    reason: 'Pide recomendación explícita y descarta de entrada las soluciones grandes.',
    rules: 'r/ecommerce exige aclarar si tienes relación con lo que recomiendas.',
    draft:
      'Nosotros paramos justo en ese punto: 60 pedidos al mes no justifican un ERP. Lo que funciona es una sola vista con estado por pedido y un aviso cuando lleva más de 48 h parado. Aviso de que lo uso yo, pero te dejo la plantilla si te encaja.',
  },
  {
    id: 'envios',
    sub: 'r/AskSpain',
    user: 'u/lucia_h',
    score: 87,
    title: 'Los que tenéis tienda online, ¿cómo no os volvéis locos con los envíos?',
    body: 'Pregunto en serio: entre transportistas, incidencias y devoluciones llevo un mes trabajando con un cuaderno y se me escapan cosas sin querer.',
    highlight: 'se me escapan cosas sin querer',
    reason: 'Dolor claro y cotidiano, aunque todavía va sin pedir herramienta.',
    rules: 'r/AskSpain no admite autopromoción; solo se puede contar la experiencia propia.',
    draft:
      'Nosotros estábamos igual: cuaderno y tres pestañas. Lo que nos salvó fue tener cada envío con su estado a la vista y un repaso de dos minutos por la mañana. Nada de ERP. Si quieres te digo cómo lo montamos.',
  },
];

const FAQS = [
  {
    q: '¿Tengo que registrarme en Reddit?',
    a: 'No. La búsqueda usa la API oficial de Reddit, así que no te pedimos tu contraseña ni publicamos nada en tu nombre.',
  },
  {
    q: '¿Respeta las normas de cada subreddit?',
    a: 'Sí. Cada lead avisa antes de que respondas de lo que esa comunidad permite: si un subreddit no admite nombrar herramientas, lo verás en la ficha y no te enteras en el ban.',
  },
  {
    q: '¿Publica las respuestas por mí?',
    a: 'Nunca. RedditLeads te escribe la respuesta y tú decides si la publicas. Copiar y pegar en Reddit es cosa tuya, y por diseño.',
  },
  {
    q: '¿Cada cuánto busca?',
    a: 'Dos veces al día, por la mañana y por la tarde. Puedes también lanzar una búsqueda a mano cuando quieras desde el panel.',
  },
  {
    q: '¿Qué nota es un 100?',
    a: 'Un post donde la persona dice, con sus palabras, que tiene tu problema y busca exactamente lo que tú resuelves. Por debajo de 50 lo tratamos como ruido.',
  },
  {
    q: '¿Funciona con productos en español?',
    a: 'Sí. Lee tu web en el idioma que tenga y las respuestas que te propone siempre están en español, listas para escribir en los subreddits.',
  },
  {
    q: '¿Necesito tarjeta de crédito?',
    a: 'No. Se crea la cuenta con un email y ya puedes pegar tu URL.',
  },
  {
    q: '¿Qué pasa si mi producto es una web en inglés?',
    a: 'Funciona igual: la web se lee en el idioma que tenga. Lo único que sale siempre en español son los borradores, porque el subreddit donde vas a publicar es el que decides tú.',
  },
  {
    q: '¿Y si mi producto no encaja en Reddit?',
    a: 'Entonces la cola te lo dirá: los posts que no tienen nada que ver se quedan por debajo de 40 y no te obligan a leerlos. La nota existe justo para eso.',
  },
  {
    q: '¿Cuánto tarda el primer barrido?',
    a: 'Pones tu URL y el primero corre enseguida. A partir de ahí son dos al día, a las 8:00 y a las 20:00, y puedes lanzar uno a mano cuando quieras.',
  },
  {
    q: '¿Puedo editar la respuesta antes de publicarla?',
    a: 'Sí, y deberías. El borrador es un punto de partida: lo editas, lo apruebas o lo escribes entero tú desde cero. RedditLeads no publica nunca por ti.',
  },
  {
    q: '¿Qué pasa si me banean de un subreddit?',
    a: 'La ficha de cada lead lleva las normas de esa comunidad antes de que respondas. Si no admite autopromoción, lo pone y te dice que cuentes solo tu experiencia.',
  },
];

/** Lo que cuesta rastrear el problema a mano, paso a paso. */
const A_MANO = [
  'Abrir Reddit y probar tu producto en el buscador, frase por frase, hasta que algo encaja.',
  'Leer los resultados uno a uno para decidir si son tu cliente o ruido.',
  'Adivinar si aquel subreddit permite nombrar herramientas o te banean.',
  'Escribir la respuesta en frío, sin contexto y sin tiempo.',
  'Volver al día siguiente y acordarte de dónde lo habías dejado.',
];

/** Lo mismo, con la app: el mismo trabajo, pero en cola y ya filtrado. */
const CON_LA_APP = [
  'Dos barridos al día sobre las 48 horas más recientes, sin que tengas que acordarte.',
  'Cada post puntuado del 0 al 100 con la frase exacta que le subió la nota.',
  'Las normas de esa comunidad leídas y resumidas en la propia ficha del lead.',
  'La respuesta escrita en español, en tu tono, lista para copiar y pegar.',
  'Una cola ordenada y sin duplicados entre barridos.',
];

/** Cómo se lee la nota: los cuatro tramos y qué hacer con cada uno. */
const SCORE_BANDS = [
  {
    range: '80–100',
    title: 'Habla de tu problema',
    body: 'Describe tu situación y, de paso, dice que busca algo para resolverla. Estos se responden el mismo día.',
    swatch: 'bg-brand-500',
  },
  {
    range: '60–79',
    title: 'Va de camino',
    body: 'El problema está sobre la mesa pero todavía no pide herramienta. Vale la pena leerlo antes de que se enfríe.',
    swatch: 'bg-brand-300',
  },
  {
    range: '40–59',
    title: 'Ruido',
    body: 'Habla de tu sector, pero no de tu cliente ni de tu problema. Se queda en la cola sin molestarte.',
    swatch: 'bg-surface-muted',
  },
  {
    range: '0–39',
    title: 'Descartado',
    body: 'No tiene nada que ver. RedditLeads lo aparta antes de que llegue a tu lista.',
    swatch: 'bg-surface-subtle',
  },
];

/** El día tipo de quien usa la app, de las 8:00 a las 20:00. */
const DAY = [
  {
    time: '08:00',
    title: 'Llega el barrido de la mañana',
    body: 'RedditLeads recorre lo publicado en las últimas 48 horas, puntúa cada post y deja la cola ordenada.',
  },
  {
    time: '09:00',
    title: 'Abres los que puntúan alto',
    body: 'Lees el lead, decides si quieres responder y copias el borrador a tu propia cuenta de Reddit.',
  },
  {
    time: '12:00',
    title: 'Contestamos a un par de hilos',
    body: 'Diez minutos. Sin想一想 si puedes mencionar tu producto: la ficha te lo dice antes.',
  },
  {
    time: '20:00',
    title: 'Segundo barrido del día',
    body: 'Lo que ha aparecido por la tarde entra en la misma cola, sin repetir lo que ya viste.',
  },
];

/** A quién le viene bien esto, y a quién no. */
const PARA_QUE_SI = [
  'Vendes un producto digital o un servicio a clientes finales, no entre empresas.',
  'Tu cliente habla español y usa Reddit a diario.',
  'Puedes responder con detalle y decir de quién eres sin que suene a anuncio.',
  'Hoy revisas esto a mano y quieres dejar de hacerlo.',
];

const PARA_QUE_NO = [
  'Buscas que la app publique respuestas por ti: no lo hace, y es a propósito.',
  'No vas a leer ninguna respuesta ni tienes tiempo para usar lo que encuentres.',
  'Tu producto no encaja en Reddit y en la cola no va a aparecer nadie.',
];

export function Landing({ onAuth }: LandingProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [productUrl, setProductUrl] = useState('');

  function handleFind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAuth();
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ---------- Cabecera ---------- */}
      <header className="sticky top-0 z-30 border-b border-[#F2E4D8] bg-[#FFF7F0]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
          <span className="flex items-center gap-2.5">
            <LogoMark className="h-7 w-7" />
            <span className="font-display text-[15px] font-bold tracking-tight text-ink">
              Reddit<span className="text-brand-500">Leads</span>
            </span>
          </span>

          <nav className="hidden items-center gap-7 md:flex xl:gap-8">
            <a href="#problema" className="text-sm text-ink-muted transition hover:text-ink">
              El problema
            </a>
            <a href="#como" className="text-sm text-ink-muted transition hover:text-ink">
              Cómo funciona
            </a>
            <a href="#cola" className="text-sm text-ink-muted transition hover:text-ink">
              La cola de hoy
            </a>
            <a href="#nota" className="text-sm text-ink-muted transition hover:text-ink">
              La nota
            </a>
            <a href="#dia" className="text-sm text-ink-muted transition hover:text-ink">
              Un día
            </a>
            <a href="#para-quien" className="text-sm text-ink-muted transition hover:text-ink">
              Para quién es
            </a>
            <a href="#faq" className="text-sm text-ink-muted transition hover:text-ink">
              Preguntas
            </a>
          </nav>

          <div className="flex items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={onAuth}
              className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition hover:text-ink"
            >
              Entrar
            </button>
            <button type="button" onClick={onAuth} className="btn-primary px-4 py-2.5 text-sm">
              Encuentra mi primer lead
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Frase principal ---------- */}
      <section className="relative isolate overflow-hidden bg-[#DCE9F0]">
        {/* fondo: la imagen a todo el ancho */}
        <div aria-hidden="true" className="hero-photo absolute inset-0" />

        {/* velo claro: mantiene el titular legible y funde la foto con la página */}
        <div aria-hidden="true" className="hero-veil absolute inset-0" />

        <div className="relative z-10 mx-auto max-w-[1120px] px-5 pb-[300px] pt-14 text-center sm:px-8 sm:pt-20 sm:pb-[44vh]">
          <h1 className="mx-auto max-w-4xl font-display text-[36px] font-bold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[60px] lg:text-[68px]">
            <span className="block">
              Consigue clientes en Reddit
              <img
                src="/reddit-icon.png"
                alt=""
                aria-hidden="true"
                className="ml-3 inline-block h-[0.82em] w-[0.82em] align-baseline object-contain drop-shadow-[0_8px_20px_rgba(255,69,0,0.35)]"
              />
            </span>
            <span className="block">
              <mark className="box-decoration-clone rounded-[0.16em] bg-[#FFCDBF] px-[0.18em] pb-[0.06em] text-ink">
                gratis y fácil
              </mark>
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-soft sm:text-[18px]">
            RedditLeads lee tu web, encuentra las conversaciones donde alguien tiene tu problema,
            las puntúa del 1 al 100 y te redacta la respuesta en español. Tú solo copias y pegas.
          </p>

          <form
            onSubmit={handleFind}
            className="mx-auto mt-8 flex w-full max-w-[640px] flex-col gap-2 rounded-3xl bg-white p-2 shadow-pop ring-1 ring-black/[0.06] sm:flex-row sm:items-center sm:rounded-full"
          >
            <input
              type="text"
              inputMode="url"
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              placeholder="tuproducto.com"
              aria-label="URL de tu producto"
              className="focus-ring min-w-0 flex-1 rounded-2xl border-0 bg-transparent px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint sm:rounded-full"
            />
            <button
              type="submit"
              className="btn-primary shrink-0 gap-2 whitespace-nowrap rounded-2xl px-5 py-3 text-[15px] font-semibold sm:rounded-full"
            >
              Encuentra mi primer lead
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>

          <p className="mt-4 text-sm text-ink-soft">Sin tarjeta. Solo tu email y la URL de tu producto.</p>
        </div>
      </section>

      {/* ---------- Los tres avisos ---------- */}
      <section id="seguridad" className="border-t border-[#F2E4D8] bg-[#FFF9F4]">
        <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[#F2E4D8] bg-[#F2E4D8] sm:grid-cols-3">
            {TRUST.map((item) => {
              const TrustIcon = item.icon;
              return (
                <div key={item.title} className="bg-white p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <TrustIcon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-[16px] font-semibold tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- El problema: a mano vs. en la cola ---------- */}
      <section id="problema" className="border-t border-surface-line bg-white">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              Rastrear el problema a mano es una faena
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              Nadie se levanta a buscar lo que le duele a su cliente cada día. Se hace de vez en
              cuando, a ratos, y se abandona. Lo que hace RedditLeads es exactamente ese trabajo, cada
              día, sin que tengas que acordarte.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-2 lg:gap-6">
            <article className="rounded-2xl border border-surface-line bg-white p-6 sm:p-7">
              <h3 className="font-display text-[17px] font-bold tracking-tight text-ink-muted">
                A mano
              </h3>
              <ul className="mt-5 space-y-4">
                {A_MANO.map((item, index) => (
                  <li key={item} className="flex gap-3.5 text-[14.5px] leading-relaxed text-ink-muted">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[12px] font-bold text-ink-faint">
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6 shadow-card sm:p-7">
              <h3 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight text-ink">
                <IconReddit className="h-4 w-4 text-brand-500" />
                Con RedditLeads
              </h3>
              <ul className="mt-5 space-y-4">
                {CON_LA_APP.map((item) => (
                  <li key={item} className="flex gap-3.5 text-[14.5px] leading-relaxed text-ink-soft">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-[12px] font-bold text-white">
                      <IconCheck className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- Pasos, con sus maquetas ---------- */}
      <section id="como" className="border-t border-surface-line bg-white">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
          <div className="max-w-xl">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              Qué hace, paso a paso
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              De una URL a una conversación en la que puedes responder hoy mismo.
            </p>
          </div>

          <div className="mt-12 space-y-6">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <article key={step.title} className="overflow-hidden rounded-2xl border border-surface-line bg-white shadow-card">
                  <header className="flex items-center justify-between gap-4 border-b border-surface-line px-5 py-5 sm:px-7">
                    <span className="flex items-center gap-3.5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-white">
                        <StepIcon className="h-[18px] w-[18px]" />
                      </span>
                      <h3 className="font-display text-[19px] font-bold tracking-tight text-ink sm:text-[21px]">
                        {step.title}
                      </h3>
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
                      Paso {index + 1}
                    </span>
                  </header>

                  <div className="grid gap-7 px-5 py-6 sm:px-7 md:grid-cols-2 md:items-center">
                    <p className="text-[15px] leading-relaxed text-ink-muted">{step.body}</p>
                    {index === 0 ? <FeedMockup /> : index === 1 ? <DraftMockup /> : <QueueMockup />}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- La cola de hoy, interactiva ---------- */}
      <section id="cola" className="border-t border-[#F2E4D8] bg-[#FFF9F4]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
          <div className="max-w-3xl">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              La cola de hoy
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              Dos veces al día el barrido vuelve con los posts donde alguien describe el problema que
              resuelves. Cada uno se puntúa del 0 al 100 con la frase que lo ganó, se contrasta con lo
              que esa comunidad permite y llega con la respuesta escrita antes de que lo abras.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              Abre cualquiera de los cuatro de abajo para ver todo eso en un solo lead.
            </p>
          </div>

          <QueueDemo onAuth={onAuth} />
        </div>
      </section>

      {/* ---------- La nota, explicada ---------- */}
      <section id="nota" className="border-t border-[#F2E4D8] bg-white">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              Qué significa la nota
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              La nota no la pone una persona, y no es un adivino: es el resultado de comparar el
              post con lo que realmente vendes. Cada lead te enseña la frase exacta por la que
              subió, para que decidas con criterio y no con fe.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-surface-line bg-surface-line sm:grid-cols-2 lg:grid-cols-4">
            {SCORE_BANDS.map((band) => (
              <div key={band.range} className="bg-white p-6">
                <span className="flex items-center gap-2.5">
                  <span className={cx('h-2.5 w-2.5 rounded-full', band.swatch)} />
                  <span className="font-display text-[15px] font-bold tracking-tight text-ink">
                    {band.range}
                  </span>
                </span>
                <h3 className="mt-4 font-display text-[15.5px] font-semibold tracking-tight text-ink">
                  {band.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{band.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[14px] text-ink-faint">
            Por debajo de 50 lo tratamos como ruido, así que no te roba tiempo ni te llena la cola.
          </p>
        </div>
      </section>

      {/* ---------- Un día con la app ---------- */}
      <section id="dia" className="border-t border-[#F2E4D8] bg-[#FFF9F4]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              Un día con la app
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              Son dos barridos al día. Tú solo abres la cola, lees los que puntúan alto y decides a
              quién quieres responder.
            </p>
          </div>

          <ol className="mt-12 space-y-0">
            {DAY.map((moment, index) => (
              <li key={moment.time} className="relative flex gap-5 pb-8 last:pb-0 sm:gap-7">
                {index < DAY.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[19px] top-10 h-full w-px bg-[#F2E4D8] sm:left-[23px]"
                  />
                ) : null}
                <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white sm:h-12 sm:w-12 sm:text-[12px]">
                  {moment.time}
                </span>
                <div className="pt-0.5">
                  <h3 className="font-display text-[17px] font-bold tracking-tight text-ink sm:text-[18px]">
                    {moment.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
                    {moment.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Para quién es ---------- */}
      <section id="para-quien" className="border-t border-surface-line bg-white">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              Para quién es, y para quién no
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              Preferimos que sepas si esto te sirve antes de que te registres.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-2 lg:gap-6">
            <article className="rounded-2xl border border-surface-line bg-white p-6 sm:p-7">
              <h3 className="flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight text-ink">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <IconCheck className="h-4 w-4" />
                </span>
                Te sirve si…
              </h3>
              <ul className="mt-6 space-y-4">
                {PARA_QUE_SI.map((item) => (
                  <li key={item} className="flex gap-3.5 text-[14.5px] leading-relaxed text-ink-soft">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-surface-line bg-surface-subtle p-6 sm:p-7">
              <h3 className="flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight text-ink">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-muted text-ink-faint">
                  <IconClose className="h-4 w-4" />
                </span>
                No te sirve si…
              </h3>
              <ul className="mt-6 space-y-4">
                {PARA_QUE_NO.map((item) => (
                  <li key={item} className="flex gap-3.5 text-[14.5px] leading-relaxed text-ink-muted">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- Preguntas frecuentes ---------- */}
      <section id="faq" className="border-t border-[#F2E4D8] bg-white">
        <div className="mx-auto max-w-[820px] px-5 py-20 sm:px-8">
          <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
            Preguntas frecuentes
          </h2>

          <div className="mt-10 divide-y divide-surface-line border-y border-surface-line">
            {FAQS.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : index)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left"
                  >
                    <span className="font-display text-[16px] font-semibold tracking-tight text-ink">
                      {faq.q}
                    </span>
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center text-ink-faint transition-transform ${
                        open ? 'rotate-45' : ''
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                    </span>
                  </button>
                  {open ? (
                    <p className="animate-fade-up pb-5 pr-10 text-[15px] leading-relaxed text-ink-muted">
                      {faq.a}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Cierre ---------- */}
      <section className="border-t border-[#F2E4D8] bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF1E6_100%)]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-8">
          <h2 className="mx-auto max-w-2xl font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[34px]">
            Empieza a leer lo que se dice de tu problema
          </h2>
          <button type="button" onClick={onAuth} className="btn-primary mt-8 px-6 py-3">
            Encuentra mi primer lead
          </button>
        </div>
      </section>

      <footer className="border-t border-surface-line">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row sm:px-8">
          <span className="flex items-center gap-2 text-sm text-ink-faint">
            <LogoMark className="h-6 w-6" />
            RedditLeads
          </span>
          <p className="text-xs text-ink-faint">
            No afiliado con Reddit. Respuestas en español para que publiques tú.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================================
   Maquetas de los tres pasos
   ============================================================================ */

/** Paso 1: los hilos recién encontrados, con su nota. */
function FeedMockup() {
  return (
    <div className="rounded-xl border border-surface-line bg-white p-3">
      <p className="px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Barrido · 8:00
      </p>
      <ul className="space-y-2">
        {MINI_FEED.map((row) => (
          <li key={row.sub} className="flex items-start gap-3 rounded-lg bg-surface-subtle px-3 py-2.5">
            <span
              className={cx(
                'grid h-6 w-7 shrink-0 place-items-center rounded-md text-[11px] font-bold',
                relevanceTone(row.score),
              )}
            >
              {row.score}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-ink-muted">{row.sub}</span>
              <span className="block truncate text-[13px] text-ink">{row.title}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Paso 2: el borrador escribiéndose. */
function DraftMockup() {
  return (
    <div className="rounded-xl border border-surface-line bg-white p-4">
      <p className="text-[12px] text-ink-faint">Borrador · r/Shopify</p>
      <p className="mt-2.5 text-[14px] leading-relaxed text-ink-soft">
        Nos pasó igual con unos 40 pedidos. Lo que lo resolvió fue una sola lista compartida, con una
        columna de estado
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse bg-brand-500"
        />
      </p>
    </div>
  );
}

/** Paso 3: la cola aprobada, con su estado. */
function QueueMockup() {
  return (
    <div className="space-y-2">
      {MINI_QUEUE.map((row) => {
        const ready = row.status === 'lista';
        return (
          <div
            key={row.sub}
            className="flex items-center gap-3 rounded-xl border border-surface-line bg-white px-3.5 py-3"
          >
            <IconReddit className="h-4 w-4 shrink-0 text-brand-500" />
            <p className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
              <span className="font-semibold text-ink">{row.sub}</span> “{row.title}”
            </p>
            <span
              className={cx(
                'flex shrink-0 items-center gap-1.5 text-[12px] font-medium',
                ready ? 'text-emerald-700' : 'text-ink-faint',
              )}
            >
              <span
                className={cx('h-1.5 w-1.5 rounded-full', ready ? 'bg-emerald-500' : 'bg-ink-faint')}
              />
              {row.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
   Demo interactiva: la cola de hoy
   ============================================================================ */

function QueueDemo({ onAuth }: LandingProps) {
  const [activeId, setActiveId] = useState(DEMO_LEADS[0].id);
  const [copied, setCopied] = useState(false);
  const lead = DEMO_LEADS.find((item) => item.id === activeId) ?? DEMO_LEADS[0];

  async function handleCopy() {
    const ok = await copyToClipboard(lead.draft);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-[#F2E4D8] bg-white shadow-pop">
      <div className="flex items-center justify-between gap-4 border-b border-surface-line px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          La cola de hoy
        </p>
        <p className="text-xs text-ink-faint">Barrido de las 8:00 · 4 de 12</p>
      </div>

      <div className="grid lg:grid-cols-[330px_1fr]">
        {/* Lista */}
        <div className="border-b border-surface-line lg:border-b-0 lg:border-r">
          <ul className="divide-y divide-surface-line">
            {DEMO_LEADS.map((item) => {
              const active = item.id === lead.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    aria-pressed={active}
                    className={cx(
                      'focus-ring flex w-full items-start gap-3 border-l-[3px] px-5 py-4 text-left transition',
                      active ? 'border-brand-500 bg-brand-50/70' : 'border-transparent hover:bg-surface-subtle',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                          <IconReddit className="h-3.5 w-3.5 text-brand-500" />
                          {item.sub}
                        </span>
                        <span
                          className={cx(
                            'grid h-5 w-7 shrink-0 place-items-center rounded-md text-[11px] font-bold',
                            relevanceTone(item.score),
                          )}
                        >
                          {item.score}
                        </span>
                      </span>
                      <span className="mt-1.5 line-clamp-2 block text-[14px] leading-snug text-ink-soft">
                        {item.title}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-surface-line px-5 py-3.5 text-xs text-ink-faint">
            4 leads nuevos · el próximo barrido llega a las 20:00.
          </p>
        </div>

        {/* Detalle del lead seleccionado */}
        <div key={lead.id} className="animate-fade-up p-5 sm:p-7">
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            <IconReddit className="h-4 w-4 text-brand-500" />
            <span className="font-semibold text-ink">{lead.sub}</span>
            <span className="text-ink-faint">·</span>
            <span>{lead.user}</span>
          </p>

          <h3 className="mt-3 font-display text-[20px] font-bold leading-snug tracking-tight text-ink sm:text-[22px]">
            {lead.title}
          </h3>

          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            <Highlighted text={lead.body} highlight={lead.highlight} />
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-muted p-4">
              <p className="text-[12px] font-semibold text-ink-faint">
                Puntuado {lead.score}/100 porque
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{lead.reason}</p>
            </div>
            <div className="rounded-xl bg-surface-muted p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-faint">
                <IconShield className="h-3.5 w-3.5" />
                Normas, léelas primero
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{lead.rules}</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-surface-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                <IconComment className="h-4 w-4 text-ink-faint" />
                Respuesta pública, lista
              </p>
              <span className="text-[12px] text-ink-faint">Tuya para editar</span>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{lead.draft}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleCopy} className="btn-secondary px-3.5 py-2">
                {copied ? 'Copiada ✓' : 'Copiar respuesta'}
              </button>
              <button type="button" onClick={onAuth} className="btn-primary px-3.5 py-2">
                Quiero esto para mi producto
              </button>
              <span className="text-[12px] text-ink-faint">La pegas tú, en tu Reddit.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Subraya la frase que hizo que el post se ganara su nota. */
function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const at = text.indexOf(highlight);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="box-decoration-clone rounded bg-brand-100/70 px-0.5 text-ink">{highlight}</mark>
      {text.slice(at + highlight.length)}
    </>
  );
}
