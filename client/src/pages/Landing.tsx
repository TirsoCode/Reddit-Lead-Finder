import { useState, type FormEvent } from 'react';
import { IconCheck, IconComment, IconLink, IconReddit, IconSearch, IconSparkle, IconUpvote } from '../components/icons';
import { LogoMark } from '../components/Logo';

interface LandingProps {
  onAuth: () => void;
}

const STEPS = [
  {
    icon: IconLink,
    title: 'Pegas la URL de tu producto',
    body: 'No hay que configurar nada. La app la lee y entiende qué vendes y qué problema resuelves.',
  },
  {
    icon: IconSparkle,
    title: 'La IA deduce a quién le duele',
    body: 'Genera las palabras clave y los subreddits donde esa persona pregunta soluciones.',
  },
  {
    icon: IconSearch,
    title: 'Busca en Reddit lo que se ha escrito',
    body: 'Recorre las conversaciones recientes de todo Reddit y se queda con las que encajan.',
  },
  {
    icon: IconUpvote,
    title: 'Cada post, puntuado del 1 al 100',
    body: 'Sabes de un vistazo cuáles vale la pena. Arriba son clientes reales, abajo es ruido.',
  },
  {
    icon: IconComment,
    title: 'Te escribe la respuesta en español',
    body: 'Copias, pegas y publicas. RedditLeads nunca publica por ti: la respuesta es tuya.',
  },
];

const FAQS = [
  {
    q: '¿Tengo que registrarme en Reddit?',
    a: 'No. La búsqueda usa la API oficial de Reddit, así que no te pedimos tu contraseña ni publicamos nada en tu nombre.',
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
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 shadow-sm">
              <IconReddit className="h-[18px] w-[18px] text-white" />
            </span>
            <span className="font-display text-[15px] font-bold tracking-tight text-ink">
              Reply<span className="text-brand-500">Hey</span>
            </span>
          </span>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#que-es" className="text-sm text-ink-muted transition hover:text-ink">
              Qué es
            </a>
            <a href="#como" className="text-sm text-ink-muted transition hover:text-ink">
              Cómo funciona
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
              Encuentra leads con intención
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>

          <p className="mt-4 text-sm text-ink-soft">Sin tarjeta. Solo tu email y la URL de tu producto.</p>
        </div>
      </section>

      {/* ---------- Qué es, con dibujo de Reddit ---------- */}
      <section id="que-es" className="bg-[#FFF9F4]">
        <div className="mx-auto grid max-w-[1120px] items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              Lo que pasa por Reddit
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              Millones de personas escriben cada día el problema que tienen. El problema es que
              están enterradas en comunidades que no son las tuyas, con palabras que no se te ocurren.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              RedditLeads lee esas conversaciones y te las trae ordenadas por lo útil que sea.
              Esto es un post real de la app:
            </p>

            <ul className="mt-8 space-y-3.5">
              {[
                'Posts de las últimas 48 horas, nada de contenido viejo',
                'Puntuados de 1 a 100 según lo bien que encajen contigo',
                'Con la respuesta en español ya redactada para copiar',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-[15px] text-ink-soft">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                    <IconCheck className="h-3 w-3" strokeWidth={2.6} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <PostPreview />
        </div>
      </section>

      {/* ---------- Línea del tiempo ---------- */}
      <section id="como" className="border-t border-surface-line">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
          <div className="max-w-xl">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
              Qué hace, paso a paso
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              De una URL a una lista de conversaciones en las que puedes responder hoy mismo.
            </p>
          </div>

          <ol className="relative mt-14">
            <span className="absolute left-[15px] top-2 hidden h-[calc(100%-2rem)] w-px bg-surface-line sm:block" />
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <li key={step.title} className="relative flex gap-5 pb-9 last:pb-0 sm:gap-7">
                  <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-surface-line bg-white text-ink">
                    <StepIcon className="h-4 w-4" />
                  </span>
                  <div className="pt-0.5">
                    <h3 className="font-display text-[17px] font-semibold tracking-tight text-ink">
                      <span className="mr-2 text-brand-600">{String(index + 1).padStart(2, '0')}</span>
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-ink-muted">
                      {step.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ---------- Preguntas frecuentes ---------- */}
      <section id="faq" className="border-t border-[#F2E4D8] bg-[#FFF9F4]">
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
            Crear cuenta gratis
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

/** Dibujo de un post de Reddit tal y como lo muestra la app. */
function PostPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-brand-50 to-transparent" />
      <div className="relative space-y-3">
        <article className="card flex gap-4 p-4">
          <div className="grid h-12 w-9 shrink-0 place-items-center rounded-md bg-brand-50 font-display text-[15px] font-bold text-brand-600">
            94
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold text-ink">
              ¿Cómo organizáis vuestro histórico de pedidos?
            </h3>
            <p className="mt-1 text-xs text-ink-faint">r/Shopify · hace 4 h · 23 comentarios</p>
            <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
              Estoy montando mi tienda y me está costando encontrar un sitio donde ver los pedidos…
            </p>
          </div>
        </article>

        <article className="card flex gap-4 p-4">
          <div className="grid h-12 w-9 shrink-0 place-items-center rounded-md bg-surface-muted font-display text-[15px] font-bold text-ink-faint">
            71
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold text-ink">
              ¿Alguien tiene una alternativa a Shopify para empezar?
            </h3>
            <p className="mt-1 text-xs text-ink-faint">r/ecommerce · hace 9 h · 41 comentarios</p>
            <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
              Busco algo sencillo para las primeras ventas, no quiero complicarme con plugins…
            </p>
          </div>
        </article>

        <div className="card ml-13 border-brand-100 bg-brand-50/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            Respuesta sugerida
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            Yo pasé por ese mismo problema al montar mi tienda y al final…
          </p>
        </div>
      </div>
    </div>
  );
}
