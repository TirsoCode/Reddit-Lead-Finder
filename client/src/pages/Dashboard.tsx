import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Lead, type LeadStatus, type Profile, type ScanRun, type Stats, type StatsRange } from '../lib/api';
import { downloadFile, timestampedFilename, toCsv } from '../lib/download';
import {
  computeDelta,
  copyToClipboard,
  formatCount,
  formatPercent,
  readPreference,
  STORAGE_KEYS,
  timeAgo,
  writePreference,
} from '../lib/format';
import { Funnel, HourHistogram, RelevanceDistribution } from '../components/charts';
import {
  GoalsCard,
  HealthPanel,
  KeywordPerformance,
  QuickActions,
  StackStatus,
  SubredditPerformance,
  type HealthNote,
} from '../components/dashboard-panels';
import { PostCard } from '../components/PostCard';
import { ScanButton, StatCard } from '../components/Stats';
import { TrendChart, type ChartMetric } from '../components/TrendChart';
import {
  CardSkeleton,
  EmptyState,
  ErrorNote,
  SectionCard,
  Segmented,
  SuccessNote,
  Toggle,
} from '../components/ui';
import { IconClock, IconFlame, IconLink, IconSparkle } from '../components/icons';

interface DashboardProps {
  profile: Profile | null;
  runs: ScanRun[];
  onProfileChange: () => Promise<void>;
  onOpenLeads: () => void;
}

const RANGES: Array<{ value: StatsRange; label: string; hint: string }> = [
  { value: 7, label: '7 días', hint: 'Solo esta semana' },
  { value: 30, label: '30 días', hint: 'El mes pasado' },
  { value: 90, label: '90 días', hint: 'El trimestre' },
];

const LEADS_PERIOD: Record<StatsRange, number> = { 7: 6, 30: 10, 90: 16 };

const TOP_SORTS: Array<{ value: string; label: string }> = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'new', label: 'Recientes' },
  { value: 'upvotes', label: 'Votados' },
  { value: 'comments', label: 'Comentados' },
];

const MIN_SCORE_OPTIONS = [
  { value: 0, label: 'Cualquiera' },
  { value: 40, label: '40+' },
  { value: 60, label: '60+' },
  { value: 80, label: '80+' },
];

export function Dashboard({ profile, runs, onProfileChange, onOpenLeads }: DashboardProps) {
  const [range, setRange] = useState<StatsRange>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [topLeads, setTopLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filtros de las mejores oportunidades.
  const [topSort, setTopSort] = useState('relevance');
  const [topMin, setTopMin] = useState(0);
  const [topLimit, setTopLimit] = useState(5);

  // Preferencias del panel.
  const [metric, setMetric] = useState<ChartMetric>(() =>
    readPreference<ChartMetric>(STORAGE_KEYS.chartMetric, 'count'),
  );
  const [compact, setCompact] = useState<boolean>(() => readPreference(STORAGE_KEYS.density, false));

  const needsSetup = !profile?.product_url || profile?.analysis_status !== 'ready';

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ stats: nextStats }, { leads }] = await Promise.all([
        api.getStats(range),
        api.getLeads({
          status: 'new',
          sort: topSort,
          minRelevance: topMin > 0 ? topMin : undefined,
          limit: LEADS_PERIOD[range],
        }),
      ]);
      setStats(nextStats);
      setTopLeads(leads);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [range, topSort, topMin]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Solo las cifras, sin tocar la lista: al guardar un post la tarjeta se queda
   * a la vista (con su etiqueta "Guardado") pero los KPIs tienen que cuadrarse.
   */
  const refreshStats = useCallback(async () => {
    try {
      const { stats: next } = await api.getStats(range);
      setStats(next);
    } catch {
      // Un refresco fallido no puede fastidiar la acción que lo disparó.
    }
  }, [range]);

  function setChartMetric(next: ChartMetric) {
    setMetric(next);
    writePreference(STORAGE_KEYS.chartMetric, next);
  }

  function setDensity(next: boolean) {
    setCompact(next);
    writePreference(STORAGE_KEYS.density, next);
  }

  // PostCard no captura los rechazos: sin esto el usuario no ve ningún aviso.
  function reportActionError(caught: unknown, fallback: string): void {
    setNotice(null);
    setSuccess(null);
    setError(caught instanceof ApiError ? caught.message : fallback);
  }

  async function handleScan() {
    setScanning(true);
    setNotice(null);
    setSuccess(null);
    setError(null);
    try {
      const { result } = await api.scanNow();
      if (result.status === 'error') {
        setError(result.error ?? 'La búsqueda no pudo completarse');
      } else if (result.newPosts === 0) {
        setNotice('No hay posts nuevos: ya tenías todo lo relevante de las últimas horas.');
      } else {
        setSuccess(
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

  async function handleGenerateAll() {
    setGenerating(true);
    setNotice(null);
    setSuccess(null);
    setError(null);
    try {
      const { generated } = await api.generatePendingReplies();
      setSuccess(
        generated === 0
          ? 'No había respuestas pendientes de redactar.'
          : `${generated} ${generated === 1 ? 'respuesta redactada' : 'respuestas redactadas'}.`,
      );
      await Promise.all([load(), onProfileChange()]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudieron redactar las respuestas');
    } finally {
      setGenerating(false);
    }
  }

  async function handlePurge() {
    setPurging(true);
    setNotice(null);
    setSuccess(null);
    try {
      const { deleted } = await api.deleteDismissed();
      setSuccess(
        deleted === 0
          ? 'No había nada descartado que borrar.'
          : `${deleted} ${deleted === 1 ? 'post descartado borrado' : 'posts descartados borrados'} de tu bandeja.`,
      );
      await Promise.all([load(), onProfileChange()]);
    } catch (caught) {
      reportActionError(caught, 'No se pudieron borrar los descartados');
    } finally {
      setPurging(false);
    }
  }

  /** Exporta lo que hay ahora mismo en la bandeja, no solo lo que se ve. */
  async function handleExport() {
    setExporting(true);
    setNotice(null);
    setSuccess(null);
    setError(null);
    try {
      const leads = await api.getAllLeads({ status: 'all', sort: 'new' });
      if (leads.length === 0) {
        setNotice('Todavía no hay posts que exportar.');
        return;
      }

      const csv = toCsv(
        ['titulo', 'subreddit', 'autor', 'relevancia', 'por_que', 'upvotes', 'comentarios', 'publicado', 'estado', 'url', 'respuesta'],
        leads.map((lead) => [
          lead.title,
          `r/${lead.subreddit}`,
          lead.author,
          lead.relevance,
          lead.relevance_reason,
          lead.upvotes,
          lead.num_comments,
          lead.posted_at,
          lead.status,
          lead.url ?? lead.permalink,
          lead.reply,
        ]),
      );

      downloadFile(timestampedFilename('leads', 'csv'), csv, 'text/csv');
      setSuccess(`${leads.length} ${leads.length === 1 ? 'post exportado' : 'posts exportados'} a CSV.`);
    } catch (caught) {
      reportActionError(caught, 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  /** Un resumen en texto para pegar en un correo o en un informe. */
  async function handleCopySummary() {
    if (!stats || !profile) return;
    setNotice(null);
    setSuccess(null);

    const [topSubreddit] = [...stats.subreddits].sort((a, b) => b.count - a.count);
    const lines = [
      `Resumen de RedditLeads · ${profile.product_name ?? 'mi producto'}`,
      `Últimos ${stats.days} días: ${stats.period.total} posts encontrados, ${
        stats.period.highScore
      } con relevancia 60 o más (media ${stats.period.averageRelevance ?? '—'}).`,
      `En total llevo ${stats.total} posts: ${stats.byStatus.new} sin tocar, ${stats.byStatus.saved} guardados y ${stats.byStatus.replied} respondidos.`,
      topSubreddit
        ? `El público aparece sobre todo en r/${topSubreddit.subreddit} (${
            topSubreddit.count
          } posts, relevancia media ${topSubreddit.averageRelevance ?? '—'}).`
        : '',
      stats.streak > 0
        ? `Llevo ${stats.streak} ${stats.streak === 1 ? 'día' : 'días'} seguidos con posts nuevos.`
        : '',
    ].filter(Boolean);

    const ok = await copyToClipboard(lines.join('\n'));
    if (ok) setSuccess('Resumen copiado al portapapeles.');
    else setError('El navegador no dejó copiar. Cópialo a mano desde la página.');
  }

  async function handleGenerateReply(leadId: string) {
    try {
      const { lead } = await api.generateReply(leadId);
      setTopLeads((current) => current.map((item) => (item.id === leadId ? { ...item, reply: lead.reply } : item)));
    } catch (caught) {
      reportActionError(caught, 'No se pudo generar la respuesta');
    }
  }

  async function handleStatusChange(leadId: string, status: LeadStatus) {
    try {
      const { lead } = await api.setLeadStatus(leadId, status);
      setTopLeads((current) =>
        current.map((item) => (item.id === leadId ? lead : item)).filter((item) => item.status !== 'dismissed'),
      );
      void refreshStats();
    } catch (caught) {
      reportActionError(caught, 'No se pudo cambiar el estado del post');
    }
  }

  async function handleDismiss(leadId: string) {
    try {
      await api.setLeadStatus(leadId, 'dismissed');
      setTopLeads((current) => current.filter((lead) => lead.id !== leadId));
      void refreshStats();
    } catch (caught) {
      reportActionError(caught, 'No se pudo descartar el post');
    }
  }

  // Atajos: R recarga, S busca, E exporta. Se ignoran mientras se escribe.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;

      const key = event.key.toLowerCase();
      if (key === 'r') void load();
      else if (key === 's' && !scanning && !needsSetup) void handleScan();
      else if (key === 'e' && !exporting) void handleExport();
      else return;

      event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [load, scanning, exporting, needsSetup]);

  const notes = useMemo(() => buildHealthNotes({ profile, stats, runs }), [profile, stats, runs]);

  const visibleLeads = topLeads.slice(0, topLimit);
  const totalTrend = stats?.byDay.reduce((sum, day) => sum + day.count, 0) ?? 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
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

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Periodo del panel"
            value={range}
            onChange={setRange}
            options={RANGES.map(({ value, label, hint }) => ({ value, label, hint }))}
          />
          {!needsSetup && <ScanButton onClick={handleScan} loading={scanning} />}
        </div>
      </header>

      {needsSetup && <SetupCallToAction profile={profile} />}

      <HealthPanel notes={notes} onScan={handleScan} scanning={scanning} />

      {notice ? (
        <p className="rounded-lg border border-surface-line dark:border-neutral-800 bg-surface-subtle dark:bg-neutral-900 px-4 py-3 text-sm text-ink-soft dark:text-neutral-300">
          {notice}
        </p>
      ) : null}
      {success ? <SuccessNote message={success} /> : null}
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
              compact={compact}
              label="Posts en el periodo"
              value={formatCount(stats?.period.total ?? 0)}
              hint={`${stats?.period.highScore ?? 0} con relevancia 60 o más`}
              accent={(stats?.period.total ?? 0) > 0}
              delta={computeDelta(stats?.period.total ?? 0, stats?.previous.total ?? 0)}
              spark={stats?.byDay.map((day) => day.count)}
            />
            <StatCard
              compact={compact}
              label="Relevancia media"
              value={stats?.period.averageRelevance ?? '—'}
              hint={`${stats?.period.highScore ?? 0} oportunidades de ${stats?.period.total ?? 0}`}
              delta={computeDelta(stats?.period.averageRelevance ?? 0, stats?.previous.averageRelevance ?? 0, 1)}
              spark={stats?.byDay.map((day) => day.averageRelevance ?? 0)}
              sparkScale100
            />
            <StatCard
              compact={compact}
              label="Guardados y respondidos"
              value={formatCount((stats?.byStatus.saved ?? 0) + (stats?.byStatus.replied ?? 0))}
              hint={`${formatPercent(
                (stats?.byStatus.saved ?? 0) + (stats?.byStatus.replied ?? 0),
                stats?.total ?? 0,
              )} de tu bandeja`}
            />
            <StatCard
              compact={compact}
              label="Respondidos"
              value={formatCount(stats?.byStatus.replied ?? 0)}
              hint={`${stats?.period.pendingReplies ?? 0} sin respuesta en el periodo`}
              accent={(stats?.byStatus.replied ?? 0) > 0}
            />
          </>
        )}
      </section>

      {/* Gráfica */}
      <SectionCard
        title="Evolución"
        description={
          metric === 'count'
            ? `Posts encontrados cada día. ${formatCount(totalTrend)} en total en el periodo.`
            : 'Media de relevancia de los posts de cada día.'
        }
        action={
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Segmented
              size="sm"
              label="Métrica de la gráfica"
              value={metric}
              onChange={setChartMetric}
              options={[
                { value: 'count', label: 'Posts' },
                { value: 'relevance', label: 'Relevancia' },
              ]}
            />
            <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <Toggle checked={compact} onChange={setDensity} label="Compacto" hint="Menos aire en las tarjetas" />
            </div>
          </div>
        }
      >
        {loading ? (
          <div className="h-[190px] animate-pulse rounded-lg bg-surface-subtle dark:bg-neutral-900" />
        ) : (
          <TrendChart data={stats?.byDay ?? []} metric={metric} />
        )}
      </SectionCard>

      {/* `min-w-0` en las dos columnas: sin eso las tarjetas fijan el ancho mínimo
          de la rejilla y en móvil aparece scroll horizontal. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Analítica */}
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard title="Embudo" description="Qué pasa con los posts después de encontrarlos.">
              <Funnel byStatus={stats?.byStatus ?? { new: 0, saved: 0, replied: 0, dismissed: 0 }} />
            </SectionCard>

            <SectionCard
              title="Distribución de relevancia"
              description={`Cómo se reparten los ${formatCount(stats?.period.total ?? 0)} posts del periodo.`}
            >
              <RelevanceDistribution
                buckets={stats?.relevance ?? []}
                total={stats?.period.total ?? 0}
              />
            </SectionCard>
          </div>

          <SectionCard
            title="A qué horas llegan los posts"
            description="En tu propia zona horaria. Útil para cuándo volver a mirar la bandeja."
          >
            <HourHistogram data={stats?.byHour ?? []} />
          </SectionCard>

          {/* Mejores leads */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">
                  Mejores oportunidades
                </h2>
                <p className="mt-1 text-[13px] text-ink-muted dark:text-neutral-400">
                  Los posts sin tocar que más encajan contigo, con la respuesta ya redactada.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={topSort}
                  onChange={(event) => setTopSort(event.target.value)}
                  aria-label="Ordenar oportunidades por"
                  title="Ordenar por"
                  className="input w-auto py-2 pr-8 text-[13px]"
                >
                  {TOP_SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={topMin}
                  onChange={(event) => setTopMin(Number(event.target.value))}
                  aria-label="Relevancia mínima"
                  title="Relevancia mínima"
                  className="input w-auto py-2 pr-8 text-[13px]"
                >
                  {MIN_SCORE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Relevancia {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onOpenLeads}
                  className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Ver todos
                </button>
              </div>
            </div>

            {loading ? (
              <CardSkeleton rows={3} />
            ) : visibleLeads.length === 0 ? (
              <EmptyState
                icon={<IconSparkle className="h-7 w-7" />}
                title={needsSetup ? 'Configura tu producto para empezar' : 'No hay nada por aquí'}
                description={
                  needsSetup
                    ? 'En cuanto analyses tu web, la app buscará en Reddit por ti.'
                    : topMin > 0
                      ? 'Ningún post sin tocar llega a esa relevancia. Baja el filtro para ver más.'
                      : 'No encontramos nada relevante en las últimas horas. Vuelve tras la próxima búsqueda automática.'
                }
                action={
                  topMin > 0 ? (
                    <button type="button" onClick={() => setTopMin(0)} className="btn-secondary">
                      Quitar filtro
                    </button>
                  ) : needsSetup ? null : (
                    <ScanButton onClick={handleScan} loading={scanning} />
                  )
                }
              />
            ) : (
              <div className="space-y-2">
                {visibleLeads.map((lead) => (
                  <PostCard
                    key={lead.id}
                    lead={lead}
                    compact={compact}
                    onGenerateReply={handleGenerateReply}
                    onStatusChange={handleStatusChange}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            )}

            {topLeads.length > topLimit ? (
              <button
                type="button"
                onClick={() => setTopLimit((value) => value + 5)}
                className="btn-secondary w-full"
              >
                Ver {Math.min(5, topLeads.length - topLimit)} más
              </button>
            ) : topLeads.length > 5 ? (
              <button type="button" onClick={() => setTopLimit(5)} className="btn-ghost w-full">
                Ver menos
              </button>
            ) : null}
          </section>

          {/* Comunidades y palabras clave */}
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard
              title="Dónde aparece tu público"
              description="Comunidades por volumen y por ajuste."
            >
              <SubredditPerformance
                subreddits={stats?.subreddits ?? []}
                fallback={stats?.activityFallback ?? false}
              />
            </SectionCard>

            <SectionCard
              title="Qué palabras funcionan"
              description="Keywords del perfil que aparecen en los posts del periodo."
            >
              <KeywordPerformance
                keywords={stats?.keywords ?? []}
                fallback={stats?.activityFallback ?? false}
              />
            </SectionCard>
          </div>
        </div>

        {/* Lateral */}
        <aside className="min-w-0 space-y-4">
          <SectionCard title="Acciones rápidas" description="Lo habitual, en un clic." dense>
            <QuickActions
              scanning={scanning}
              generating={generating}
              exporting={exporting}
              pendingReplies={stats?.period.pendingReplies ?? 0}
              summaryReady={Boolean(stats && profile)}
              onScan={handleScan}
              onGenerate={handleGenerateAll}
              onExport={handleExport}
              onCopySummary={handleCopySummary}
            />
            <p className="mt-3 text-xs text-ink-faint dark:text-neutral-500">
              Atajos: <Kbd>R</Kbd> recargar, <Kbd>S</Kbd> buscar, <Kbd>E</Kbd> exportar.
            </p>
          </SectionCard>

          <NextRunCard stats={stats} runs={runs} />

          <SectionCard title="Tu pila" description="El reparto de lo que tienes guardado." dense>
            <StackStatus stats={stats} onPurge={handlePurge} purging={purging} />
          </SectionCard>

          <SectionCard title="Tus metas" description="Ajusta el ritmo que te sirve." dense>
            <GoalsCard stats={stats} />
          </SectionCard>

          {stats && stats.streak > 0 && (
            <div className="card flex items-start gap-3 p-5">
              <IconFlame className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <div>
                <p className="font-display text-sm font-semibold text-ink dark:text-neutral-100">
                  {stats.streak} {stats.streak === 1 ? 'día seguido' : 'días seguidos'} con posts nuevos
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
                  Lo último se vio {timeAgo(stats.lastPostAt)}. Mantén el ritmo: la búsqueda
                  automática sigue funcionando sola.
                </p>
              </div>
            </div>
          )}

          {profile?.problem && (
            <div className="card p-5">
              <h3 className="font-display text-sm font-semibold text-ink dark:text-neutral-100">
                Tu problema, en una frase
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
                {profile.problem}
              </p>
              {profile.audience && (
                <>
                  <h3 className="mt-5 font-display text-sm font-semibold text-ink dark:text-neutral-100">
                    Cliente ideal
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
                    {profile.audience}
                  </p>
                </>
              )}
              <Link
                to="/perfil"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
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

/** Cuenta atrás hasta la próxima tanda automática y el resumen de la última. */
function NextRunCard({ stats, runs }: { stats: Stats | null; runs: ScanRun[] }) {
  const next = useMemo(() => nextScheduledRun(), []);
  const [now, setNow] = useState(() => Date.now());

  // La cuenta atrás se rehace cada medio minuto: no hace falta más precisión.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, next.getTime() - now);
  const lastRun = stats?.lastRun ?? runs[0] ?? null;

  return (
    <SectionCard title="Búsqueda automática" dense>
      <div className="flex items-start gap-3">
        <IconClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint dark:text-neutral-500" />
        <div className="min-w-0 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
          <p>
            La app busca dos veces al día (08:00 y 20:00 UTC, repartidas en dos horas). La próxima
            tanda entra en{' '}
            <span className="font-medium text-ink-soft dark:text-neutral-200">{formatCountdown(remaining)}</span>.
          </p>
          {lastRun ? (
            <p className="mt-2">
              Última: {lastRun.posts_new} nuevos de {lastRun.posts_fetched} revisados,{' '}
              {timeAgo(lastRun.started_at)}.
              {lastRun.error ? (
                <span className="block text-brand-700 dark:text-brand-400">{lastRun.error}</span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2">Todavía no se ha hecho ninguna búsqueda.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-surface-line bg-surface-subtle px-1 py-0.5 font-sans text-[11px] font-medium text-ink-muted dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {children}
    </kbd>
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
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-5 dark:border-brand-500/40 dark:bg-brand-500/15">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-brand-900 dark:text-brand-200">
            {status === 'pending' ? 'Analizando tu producto…' : 'Empieza con tu URL'}
          </h2>
          <p className="mt-1 text-sm text-brand-800 dark:text-brand-300">{message}</p>
        </div>
        <Link to="/perfil" className="btn-primary">
          Configurar producto
        </Link>
      </div>
    </div>
  );
}

/**
 * Los avisos que merecen atención antes de mirar ninguna métrica. Todos son
 * avisos: la app sigue funcionando, solo hay que saber qué mirar.
 */
function buildHealthNotes({
  profile,
  stats,
  runs,
}: {
  profile: Profile | null;
  stats: Stats | null;
  runs: ScanRun[];
}): HealthNote[] {
  const notes: HealthNote[] = [];

  if (profile?.analysis_status === 'error') {
    notes.push({
      id: 'analysis',
      tone: 'warning',
      title: 'El análisis de tu web falló',
      detail: profile.analysis_error ?? 'Vuelve a introducir la URL para reintentarlo.',
      action: { label: 'Reintentar', to: '/perfil' },
    });
  }

  const lastRun = stats?.lastRun ?? runs[0] ?? null;
  if (lastRun?.status === 'error') {
    notes.push({
      id: 'last-run',
      tone: 'warning',
      title: 'La última búsqueda falló',
      detail: lastRun.error ?? 'La app no pudo completarla. Puedes relanzarla a mano.',
    });
  }

  if (stats && stats.period.pendingReplies >= 10) {
    notes.push({
      id: 'pending',
      tone: 'info',
      title: `${stats.period.pendingReplies} posts sin respuesta redactada`,
      detail: 'Los más relevantes ya la tienen; estos se pueden responder cuando tengas tiempo.',
      action: { label: 'Ver los más relevantes', to: '/leads?orden=relevancia' },
    });
  }

  if (stats && stats.total > 0 && stats.byStatus.saved + stats.byStatus.replied === 0) {
    notes.push({
      id: 'no-action',
      tone: 'info',
      title: 'Todavía no has guardado nada',
      detail: 'Marca los que te interesen para no perderlos y seguir la pista.',
      action: { label: 'Ir a los leads', to: '/leads' },
    });
  }

  if (lastRun && stats && stats.total > 0) {
    const daysSince = Math.floor((Date.now() - new Date(lastRun.started_at).getTime()) / 86_400_000);
    if (daysSince >= 3) {
      notes.push({
        id: 'stale',
        tone: 'warning',
        title: `La búsqueda automática lleva ${daysSince} días sin pasar`,
        detail: 'Si no entra nada, revisa las claves de Reddit y de la IA en tu despliegue.',
        action: { label: 'Ver perfil', to: '/perfil' },
      });
    }
  }

  return notes;
}

/**
 * La app busca a las 08:00 y 20:00 UTC, en tandas cada 10 minutos dentro de
 * dos horas (ver `supabase/migrations/20260101000001_edge_cron.sql`). Aquí solo
 * se calcula el siguiente hito para la cuenta atrás del panel.
 */
function nextScheduledRun(from = new Date()): Date {
  const utcHours = [8, 9, 20, 21];
  const minutes = [0, 10, 20, 30, 40, 50];

  const candidates: Date[] = [];
  for (const dayOffset of [0, 1]) {
    for (const hour of utcHours) {
      for (const minute of minutes) {
        const slot = new Date(from);
        slot.setUTCDate(slot.getUTCDate() + dayOffset);
        slot.setUTCHours(hour, minute, 0, 0);
        if (slot.getTime() > from.getTime()) candidates.push(slot);
      }
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? new Date(from.getTime() + 3_600_000);
}

/** "3 h 24 min", "12 min" o "ahora mismo": el formato que se lee de un vistazo. */
function formatCountdown(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)} d ${hours % 24} h`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
