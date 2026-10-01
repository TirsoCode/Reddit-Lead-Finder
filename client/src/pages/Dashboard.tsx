import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Lead, type Profile, type Stats } from '../lib/api';
import { timeAgo } from '../lib/format';
import { PostCard } from '../components/PostCard';
import { ScanButton, StatCard, ProgressBar } from '../components/Stats';
import { TrendChart } from '../components/TrendChart';
import { CardSkeleton, EmptyState, ErrorNote, InlineSpinner } from '../components/ui';
import { IconLink, IconSparkle } from '../components/icons';

interface DashboardProps {
  profile: Profile | null;
  onProfileChange: () => Promise<void>;
  onOpenLeads: () => void;
}

export function Dashboard({ profile, onProfileChange, onOpenLeads }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [topLeads, setTopLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ stats: nextStats }, { leads }] = await Promise.all([
        api.getStats(),
        api.getLeads({ status: 'new', sort: 'relevance', limit: 5 }),
      ]);
      setStats(nextStats);
      setTopLeads(leads);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleScan() {
    setScanning(true);
    setNotice(null);
    setError(null);
    try {
      const { result } = await api.scanNow();
      if (result.status === 'error') {
        setError(result.error ?? 'La búsqueda no pudo completarse');
      } else if (result.newPosts === 0) {
        setNotice('No hay posts nuevos: ya tenías todo lo relevante de las últimas horas.');
      } else {
        setNotice(
          `${result.newPosts} ${
            result.newPosts === 1 ? 'post nuevo encontrado' : 'posts nuevos encontrados'
          }. Ya están en tu bandeja.`,
        );
      }
      await Promise.all([load(), onProfileChange()]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'La búsqueda falló');
    } finally {
      setScanning(false);
    }
  }

  async function refreshLead(leadId: string, reply?: Lead['reply']) {
    setTopLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, ...(reply !== undefined ? { reply } : {}) } : lead)),
    );
  }

  // PostCard no captura los rechazos: sin esto el usuario no ve ningún aviso.
  function reportActionError(caught: unknown, fallback: string): void {
    setNotice(null);
    setError(caught instanceof ApiError ? caught.message : fallback);
  }

  async function handleGenerateReply(leadId: string) {
    try {
      const { lead } = await api.generateReply(leadId);
      await refreshLead(leadId, lead.reply);
    } catch (caught) {
      reportActionError(caught, 'No se pudo generar la respuesta');
    }
  }

  async function handleStatusChange(leadId: string, status: Lead['status']) {
    try {
      const { lead } = await api.setLeadStatus(leadId, status);
      setTopLeads((current) =>
        current
          .map((item) => (item.id === leadId ? lead : item))
          .filter((item) => item.status !== 'dismissed'),
      );
    } catch (caught) {
      reportActionError(caught, 'No se pudo cambiar el estado del post');
    }
  }

  async function handleDismiss(leadId: string) {
    try {
      await api.setLeadStatus(leadId, 'dismissed');
      setTopLeads((current) => current.filter((lead) => lead.id !== leadId));
    } catch (caught) {
      reportActionError(caught, 'No se pudo descartar el post');
    }
  }

  const needsSetup = !profile?.product_url || profile?.analysis_status !== 'ready';

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-white sm:text-[28px]">
            Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
            {profile?.product_name ? (
              <>
                Analizando <span className="font-medium text-ink-soft dark:text-neutral-300">{profile.product_name}</span>
                {profile.analyzed_at ? ` · keywords listas ${timeAgo(profile.analyzed_at)}` : ''}
              </>
            ) : (
              'Pega la URL de tu producto para empezar a encontrar clientes.'
            )}
          </p>
        </div>

        {!needsSetup && (
          <ScanButton onClick={handleScan} loading={scanning} />
        )}
      </header>

      {needsSetup && <SetupCallToAction profile={profile} />}

      {notice ? (
        <p className="rounded-lg border border-surface-line dark:border-neutral-800 bg-surface-subtle dark:bg-neutral-900 px-4 py-3 text-sm text-ink-soft dark:text-neutral-300">
          {notice}
        </p>
      ) : null}

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      {/* Estadísticas */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card h-[122px] animate-pulse bg-surface-subtle dark:bg-neutral-900" />
          ))
        ) : (
          <>
            <StatCard
              label="Posts encontrados hoy"
              value={stats?.today ?? 0}
              hint="Desde las 00:00 de tu zona horaria"
              accent={(stats?.today ?? 0) > 0}
            />
            <StatCard
              label="Relevancia media"
              value={stats?.averageRelevance ?? '—'}
              hint="Media de las puntuaciones, 1 a 100"
            />
            <StatCard
              label="Total encontrado"
              value={stats?.total ?? 0}
              hint="Desde que empezaste a usar la app"
            />
            <StatCard
              label="Con respuesta lista"
              value={stats?.withReply ?? 0}
              hint={`${Math.max(0, (stats?.total ?? 0) - (stats?.withReply ?? 0))} sin respuesta todavía`}
            />
          </>
        )}
      </section>

      {/* Gráfica */}
      <section className="card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">
            Evolución de posts por día
          </h2>
          <span className="text-xs text-ink-faint dark:text-neutral-500">Últimos 30 días</span>
        </div>
        {loading ? (
          <div className="h-[190px] animate-pulse rounded-lg bg-surface-subtle dark:bg-neutral-900" />
        ) : (
          <TrendChart data={stats?.byDay ?? []} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Mejores leads */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">
              Mejores oportunidades
            </h2>
            <button
              type="button"
              onClick={onOpenLeads}
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Ver todos
            </button>
          </div>

          {loading ? (
            <CardSkeleton rows={3} />
          ) : topLeads.length === 0 ? (
            <EmptyState
              icon={<IconSparkle className="h-7 w-7" />}
              title={needsSetup ? 'Configura tu producto para empezar' : 'Todavía no hay posts'}
              description={
                needsSetup
                  ? 'En cuanto analyzes tu web, la app buscará en Reddit por ti.'
                  : 'No encontramos nada relevante en las últimas horas. Vuelve tras la próxima búsqueda automática.'
              }
            />
          ) : (
            <div className="space-y-2">
              {topLeads.map((lead) => (
                <PostCard
                  key={lead.id}
                  lead={lead}
                  onGenerateReply={handleGenerateReply}
                  onStatusChange={handleStatusChange}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          )}
        </section>

        {/* Lateral */}
        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="font-display text-sm font-semibold text-ink dark:text-neutral-100">Búsqueda automática</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
              La app busca dos veces al día, todos los días. Los posts nuevos aparecen aquí cuando
              entras, sin avisos ni correos.
            </p>
            <p className="mt-3 text-xs text-ink-faint dark:text-neutral-500">Próximas ejecuciones: 08:00 y 20:00 (UTC)</p>
          </div>

          {stats && stats.topSubreddits.length > 0 && (
            <div className="card p-5">
              <h3 className="font-display text-sm font-semibold text-ink dark:text-neutral-100">Dónde aparece tu público</h3>
              <ul className="mt-4 space-y-3">
                {stats.topSubreddits.map((entry) => (
                  <li key={entry.subreddit}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium text-ink-soft dark:text-neutral-300">r/{entry.subreddit}</span>
                      <span className="text-ink-faint dark:text-neutral-500">{entry.count}</span>
                    </div>
                    <ProgressBar
                      className="mt-1.5"
                      value={entry.count}
                      max={stats.topSubreddits[0]?.count ?? 1}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile?.problem && (
            <div className="card p-5">
              <h3 className="font-display text-sm font-semibold text-ink dark:text-neutral-100">Tu problema, en una frase</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">{profile.problem}</p>
              {profile.audience && (
                <>
                  <h3 className="mt-5 font-display text-sm font-semibold text-ink dark:text-neutral-100">Cliente ideal</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">{profile.audience}</p>
                </>
              )}
              <Link
                to="/perfil"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                <IconLink className="h-3.5 w-3.5" />
                Ver keywords
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SetupCallToAction({ profile }: { profile: Profile | null }) {
  const status = profile?.analysis_status;
  const message = {
    idle: 'Pega la URL de tu producto en el perfil y la app hará el resto.',
    pending: 'Estamos analizando tu web. Esto tarda unos segundos…',
    error: profile?.analysis_error ?? 'No se pudo analizar tu web. Prueba a revisarla en el perfil.',
    ready: '',
  }[status ?? 'idle'];

  return (
    <div className="rounded-xl border border-brand-100 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/15 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-brand-900 dark:text-brand-200">
            {status === 'pending' ? 'Analizando tu producto…' : 'Empieza con tu URL'}
          </h2>
          <p className="mt-1 text-sm text-brand-800 dark:text-brand-300">{message}</p>
        </div>
        <Link to="/perfil" className="btn-primary">
          {status === 'pending' ? <InlineSpinner label="Procesando" /> : 'Configurar producto'}
        </Link>
      </div>
    </div>
  );
}
