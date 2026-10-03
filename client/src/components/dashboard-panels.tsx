import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KeywordStat, LeadStatus, Stats, SubredditStat } from '../lib/api';
import {
  cx,
  formatCount,
  formatPercent,
  readPreference,
  relevanceTone,
  STORAGE_KEYS,
  writePreference,
} from '../lib/format';
import { ProgressBar } from './Stats';
import { Segmented, Toggle } from './ui';
import {
  IconAlert,
  IconBolt,
  IconCopy,
  IconDownload,
  IconRefresh,
  IconSparkle,
  IconTrash,
} from './icons';

// --- Avisos de salud -------------------------------------------------------

export interface HealthNote {
  id: string;
  tone: 'warning' | 'info';
  title: string;
  detail: string;
  action?: { label: string; to: string };
}

interface HealthPanelProps {
  notes: HealthNote[];
  onScan: () => void;
  scanning: boolean;
}

/**
 * Lo que el usuario debería mirar antes de nada: la búsqueda que falló, la web
 * sin analizar, las respuestas pendientes. Nada de esto bloquea la app, así
 * que son avisos, no errores.
 */
export function HealthPanel({ notes, onScan, scanning }: HealthPanelProps) {
  if (notes.length === 0) return null;

  const warnings = notes.filter((note) => note.tone === 'warning');

  return (
    <div
      className={cx(
        'rounded-xl border p-4',
        warnings.length > 0
          ? 'border-brand-100 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10'
          : 'border-surface-line bg-surface-subtle dark:border-neutral-800 dark:bg-neutral-900',
      )}
    >
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2.5">
              <IconAlert
                className={cx(
                  'mt-0.5 h-4 w-4 shrink-0',
                  note.tone === 'warning'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-ink-faint dark:text-neutral-500',
                )}
              />
              <div className="min-w-0">
                <p
                  className={cx(
                    'text-[13px] font-medium',
                    note.tone === 'warning'
                      ? 'text-brand-900 dark:text-brand-100'
                      : 'text-ink dark:text-neutral-100',
                  )}
                >
                  {note.title}
                </p>
                <p
                  className={cx(
                    'mt-0.5 text-[13px] leading-relaxed',
                    note.tone === 'warning'
                      ? 'text-brand-800 dark:text-brand-300'
                      : 'text-ink-muted dark:text-neutral-400',
                  )}
                >
                  {note.detail}
                </p>
              </div>
            </div>

            {note.action ? (
              <Link
                to={note.action.to}
                className="shrink-0 text-[13px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300"
              >
                {note.action.label}
              </Link>
            ) : note.id === 'last-run' ? (
              <button
                type="button"
                onClick={onScan}
                disabled={scanning}
                className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
              >
                <IconRefresh className={cx('h-3.5 w-3.5', scanning && 'animate-spin')} />
                Reintentar
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Acciones rápidas ------------------------------------------------------

interface QuickActionsProps {
  scanning: boolean;
  generating: boolean;
  exporting: boolean;
  pendingReplies: number;
  summaryReady: boolean;
  onScan: () => void;
  onGenerate: () => void;
  onExport: () => void;
  onCopySummary: () => void;
}

/** Lo que el usuario quiere hacer de verdad, en un sitio y con dos clics. */
export function QuickActions({
  scanning,
  generating,
  exporting,
  pendingReplies,
  summaryReady,
  onScan,
  onGenerate,
  onExport,
  onCopySummary,
}: QuickActionsProps) {
  const actions = [
    {
      key: 'scan',
      label: scanning ? 'Buscando…' : 'Buscar ahora',
      hint: 'Atajo: S',
      icon: IconBolt,
      busy: scanning,
      disabled: scanning,
      onClick: onScan,
      primary: true,
    },
    {
      key: 'replies',
      label: generating
        ? 'Generando…'
        : pendingReplies > 0
          ? `Generar ${pendingReplies} respuestas`
          : 'Respuestas al día',
      hint: 'Redacta las que faltan',
      icon: IconSparkle,
      busy: generating,
      disabled: generating || pendingReplies === 0,
      onClick: onGenerate,
      primary: false,
    },
    {
      key: 'export',
      label: exporting ? 'Preparando…' : 'Exportar CSV',
      hint: 'Tus leads en una hoja de cálculo',
      icon: IconDownload,
      busy: exporting,
      disabled: exporting,
      onClick: onExport,
      primary: false,
    },
    {
      key: 'summary',
      label: 'Copiar resumen',
      hint: 'Para pegar en un correo o informe',
      icon: IconCopy,
      busy: false,
      disabled: !summaryReady,
      onClick: onCopySummary,
      primary: false,
    },
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.hint}
          className={action.primary ? 'btn-primary justify-start' : 'btn-secondary justify-start'}
        >
          <action.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

// --- Metas -----------------------------------------------------------------

export interface Goals {
  /** Posts nuevos por semana que el usuario quiere tener delante. */
  weeklyPosts: number;
  /** Respuestas escritas en total: el estado "respondido" es histórico. */
  totalReplies: number;
  /** Relevancia mínima para contar un post como "bueno". */
  minRelevance: number;
}

const DEFAULT_GOALS: Goals = { weeklyPosts: 10, totalReplies: 5, minRelevance: 60 };

interface GoalsCardProps {
  stats: Stats | null;
}

/**
 * Metas del usuario, guardadas en su navegador (no hay tabla para ellas: es una
 * preferencia personal, no parte del producto). Los posts de la semana salen
 * del histórico diario; los relevantes y las respuestas, del periodo elegido.
 */
export function GoalsCard({ stats }: GoalsCardProps) {
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [editing, setEditing] = useState(false);

  // Se lee tras el primer pintado: `localStorage` no existe en el servidor.
  useEffect(() => {
    const stored = readPreference<Partial<Goals>>(STORAGE_KEYS.goals, {});
    setGoals({ ...DEFAULT_GOALS, ...stored });
  }, []);

  function update<K extends keyof Goals>(key: K, value: Goals[K]) {
    const next = { ...goals, [key]: value };
    setGoals(next);
    writePreference(STORAGE_KEYS.goals, next);
  }

  const postsThisWeek = useMemo(() => sumLastDays(stats?.byDay ?? [], 7), [stats?.byDay]);
  const weeklyRatio = goals.weeklyPosts > 0 ? postsThisWeek / goals.weeklyPosts : 0;
  const periodTotal = stats?.period.total ?? 0;
  const relevantRatio =
    periodTotal > 0 ? (stats?.period.highScore ?? 0) / Math.max(1, periodTotal) / (goals.minRelevance / 100) : 0;
  const replies = stats?.byStatus.replied ?? 0;
  const repliesRatio = goals.totalReplies > 0 ? replies / goals.totalReplies : 0;

  return (
    <div className="space-y-4">
      <GoalRow
        label="Posts esta semana"
        value={`${formatCount(postsThisWeek)} de ${formatCount(goals.weeklyPosts)}`}
        ratio={weeklyRatio}
        tone={weeklyRatio >= 1 ? 'emerald' : 'brand'}
      />
      <GoalRow
        label={`Relevancia ${goals.minRelevance}+ en el periodo`}
        value={`${formatCount(stats?.period.highScore ?? 0)} de ${formatCount(periodTotal)}`}
        ratio={relevantRatio}
        tone="brand"
      />
      <GoalRow
        label="Respuestas escritas"
        value={`${formatCount(replies)} de ${formatCount(goals.totalReplies)}`}
        ratio={repliesRatio}
        tone={repliesRatio >= 1 ? 'emerald' : 'brand'}
      />

      <Toggle
        checked={editing}
        onChange={setEditing}
        label="Ajustar mis metas"
        hint="Se guardan en este navegador"
      />

      {editing ? (
        <div className="space-y-3 rounded-lg bg-surface-subtle p-3 dark:bg-neutral-950">
          <NumberField
            label="Posts por semana"
            value={goals.weeklyPosts}
            min={1}
            max={200}
            onChange={(value) => update('weeklyPosts', value)}
          />
          <NumberField
            label="Respuestas escritas en total"
            value={goals.totalReplies}
            min={1}
            max={200}
            onChange={(value) => update('totalReplies', value)}
          />
          <div>
            <span className="text-[13px] text-ink-soft dark:text-neutral-300">Relevancia mínima</span>
            <Segmented
              className="mt-1.5"
              label="Relevancia mínima"
              size="sm"
              value={goals.minRelevance}
              onChange={(value) => update('minRelevance', value)}
            options={[
              { value: 40, label: '40+' },
              { value: 60, label: '60+' },
              { value: 80, label: '80+' },
            ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GoalRow({
  label,
  value,
  ratio,
  tone,
}: {
  label: string;
  value: string;
  ratio: number;
  tone: 'brand' | 'emerald';
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-soft dark:text-neutral-300">{label}</span>
        <span className="tabular-nums text-ink-muted dark:text-neutral-400">{value}</span>
      </div>
      <ProgressBar className="mt-1.5" value={Math.min(1, ratio)} max={1} tone={tone} />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[13px] text-ink-soft dark:text-neutral-300">{label}</span>
      <input
        type="number"
        className="input mt-1 py-2"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
        }}
      />
    </label>
  );
}

// --- Comunidades -----------------------------------------------------------

type SubredditMetric = 'count' | 'relevance';

interface SubredditPerformanceProps {
  subreddits: SubredditStat[];
  fallback?: boolean;
}

/** Dónde aparece el público y qué tan bien encaja en cada comunidad. */
export function SubredditPerformance({ subreddits, fallback = false }: SubredditPerformanceProps) {
  const [metric, setMetric] = useState<SubredditMetric>('count');

  if (subreddits.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted dark:text-neutral-400">
        Aún no hay posts de los que sacar conclusiones.
      </p>
    );
  }

  const rows =
    metric === 'count'
      ? subreddits
      : [...subreddits].sort(
          (a, b) => (b.averageRelevance ?? 0) - (a.averageRelevance ?? 0) || b.count - a.count,
        );

  const maxCount = Math.max(...rows.map((row) => row.count));
  const best = rows.reduce((top, row) =>
    (row.averageRelevance ?? 0) > (top?.averageRelevance ?? 0) ? row : top,
  rows[0]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint dark:text-neutral-500">
          {fallback ? 'Sin actividad en el periodo: histórico completo.' : `${subreddits.length} comunidades`}
        </p>
        <Segmented
          size="sm"
          label="Ordenar comunidades por"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'count', label: 'Volumen' },
            { value: 'relevance', label: 'Relevancia' },
          ]}
        />
      </div>

      <ul className="space-y-3">
        {rows.map((row) => {
          return (
            <li key={row.subreddit} className="group/sr">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <Link
                  to={`/leads?comunidad=${encodeURIComponent(row.subreddit)}`}
                  className="truncate font-medium text-ink-soft hover:text-brand-600 hover:underline dark:text-neutral-300 dark:hover:text-brand-400"
                  title={`Ver posts de r/${row.subreddit}`}
                >
                  r/{row.subreddit}
                </Link>
                <span className="flex shrink-0 items-center gap-2 tabular-nums text-ink-muted dark:text-neutral-400">
                  <span
                    className={cx('pill px-1.5 py-0.5 text-[11px]', relevanceTone(row.averageRelevance))}
                    title="Relevancia media"
                  >
                    {row.averageRelevance ?? '—'}
                  </span>
                  <span>{formatCount(row.count)}</span>
                </span>
              </div>

              <ProgressBar className="mt-1.5" value={row.count} max={maxCount} />

              <p className="mt-1 text-xs text-ink-faint dark:text-neutral-500">
                {row.highScore > 0
                  ? `${formatCount(row.highScore)} ${row.highScore === 1 ? 'post' : 'posts'} de 60 o más`
                  : 'Ningún post de 60 o más'}
              </p>
            </li>
          );
        })}
      </ul>

      {best && best.averageRelevance !== null && best.averageRelevance > 0 ? (
        <p className="mt-4 text-xs text-ink-muted dark:text-neutral-400">
          Tu mejor ajuste está en{' '}
          <span className="font-medium text-ink-soft dark:text-neutral-200">r/{best.subreddit}</span>,
          con una relevancia media de {best.averageRelevance}.
        </p>
      ) : null}
    </div>
  );
}

// --- Palabras clave --------------------------------------------------------

interface KeywordPerformanceProps {
  keywords: KeywordStat[];
  fallback?: boolean;
}

/** Cuántos posts del periodo mencionan cada keyword del perfil. */
export function KeywordPerformance({ keywords, fallback = false }: KeywordPerformanceProps) {
  if (keywords.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted dark:text-neutral-400">
        Las keywords se generan al analizar tu web.
      </p>
    );
  }

  const sorted = [...keywords].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((item) => item.count));
  const hits = sorted.filter((item) => item.count > 0).length;

  return (
    <div>
      {fallback ? (
        <p className="mb-3 text-xs text-ink-faint dark:text-neutral-500">
          Sin actividad en el periodo: histórico completo.
        </p>
      ) : null}
      <p className="text-xs text-ink-faint dark:text-neutral-500">
        {hits} de {keywords.length} keywords han traído posts
        {hits > 0 ? '. Las que no aparecen, prueba a quitarlas del perfil.' : ' todavía.'}
      </p>

      <ul className="mt-4 space-y-2.5">
        {sorted.map((item) => (
          <li key={item.keyword}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span
                className={cx(
                  'truncate',
                  item.count > 0
                    ? 'text-ink-soft dark:text-neutral-200'
                    : 'text-ink-faint line-through dark:text-neutral-600',
                )}
                title={item.keyword}
              >
                {item.keyword}
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted dark:text-neutral-400">
                {item.count === 0 ? 'sin posts' : formatCount(item.count)}
              </span>
            </div>
            <ProgressBar
              className="mt-1.5"
              value={item.count}
              max={max}
              tone={item.count > 0 ? 'brand' : 'neutral'}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Estado de la pila ----------------------------------------------------

interface StackStatusProps {
  stats: Stats | null;
  onPurge: () => void;
  purging: boolean;
}

/** Cuánta hay de cada cosa y un botón para limpiar lo descartado. */
export function StackStatus({ stats, onPurge, purging }: StackStatusProps) {
  const byStatus = stats?.byStatus ?? { new: 0, saved: 0, replied: 0, dismissed: 0 };
  const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);

  const chips: Array<{ status: LeadStatus; label: string; tone: string }> = [
    { status: 'new', label: 'Nuevos', tone: 'bg-surface-muted text-ink-soft dark:bg-neutral-800 dark:text-neutral-300' },
    { status: 'saved', label: 'Guardados', tone: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' },
    { status: 'replied', label: 'Respondidos', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
    { status: 'dismissed', label: 'Descartados', tone: 'bg-surface-subtle text-ink-muted dark:bg-neutral-900 dark:text-neutral-400' },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link key={chip.status} to={`/leads?estado=${chip.status}`} className={cx('pill', chip.tone)}>
            {chip.label}
            <span className="font-semibold tabular-nums">{formatCount(byStatus[chip.status])}</span>
          </Link>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-faint dark:text-neutral-500">
        {total > 0
          ? `${formatPercent(byStatus.saved + byStatus.replied, total)} de lo encontrado ya tiene una acción: guardado o respondido.`
          : 'En cuanto la app busque, aquí verás el reparto de tu pila.'}
      </p>

      {byStatus.dismissed > 0 ? (
        <button
          type="button"
          onClick={onPurge}
          disabled={purging}
          className="btn-ghost mt-3 px-2 py-1 text-xs text-ink-faint hover:text-brand-600 dark:text-neutral-500 dark:hover:text-brand-400"
          title="Borra de la base de datos los posts descartados"
        >
          <IconTrash className="h-3.5 w-3.5" />
          {purging ? 'Vaciando…' : `Vaciar ${formatCount(byStatus.dismissed)} descartados`}
        </button>
      ) : null}
    </div>
  );
}

/** Suma los posts de los últimos `days` días del histórico diario. */
function sumLastDays(byDay: Array<{ count: number }>, days: number): number {
  return byDay.slice(-days).reduce((sum, day) => sum + day.count, 0);
}
