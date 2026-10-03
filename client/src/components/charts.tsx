import { formatCount, formatPercent } from '../lib/format';
import { IconArrowLeft } from './icons';

interface SparklineProps {
  values: number[];
  /** `true` cuando la serie es una media (0–100) y no un recuento. */
  scale100?: boolean;
  className?: string;
  label?: string;
}

/**
 * Minigráfica de una serie corta. SVG a medida como la del panel principal:
 * sin dependencias y con el peso visual justo para acompañar a un KPI.
 */
export function Sparkline({ values, scale100 = false, className, label }: SparklineProps) {
  if (values.length < 2) {
    // Con un solo punto no hay línea que dibujar: se reserva el hueco para que
    // la tarjeta no cambie de alto al llegar el segundo dato.
    return <div className={className ? `h-8 ${className}` : 'h-8'} aria-hidden="true" />;
  }

  const width = 100;
  const height = 32;
  const max = scale100 ? 100 : Math.max(1, ...values);

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - (Math.min(value, max) / max) * (height - 4) - 2;
    return { x, y };
  });

  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const area = `M ${first?.x} ${height} ${points
    .map((point) => `L ${point.x} ${point.y}`)
    .join(' ')} L ${last?.x} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className ?? 'h-8 w-full'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <path d={area} fill="currentColor" opacity={0.1} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface FunnelProps {
  byStatus: Record<string, number>;
}

/**
 * Embudo de todo el histórico: cuántos posts se encontraron, cuántos acabaron
 * en guardados o respondidos y cuántos llegaron a respuesta escrita.
 */
export function Funnel({ byStatus }: FunnelProps) {
  const found = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
  const acted = (byStatus.saved ?? 0) + (byStatus.replied ?? 0);
  const replied = byStatus.replied ?? 0;

  if (found === 0) {
    return <p className="text-[13px] text-ink-muted dark:text-neutral-400">Todavía no hay posts.</p>;
  }

  const steps = [
    { label: 'Posts encontrados', value: found, ratio: 1 },
    {
      label: 'Guardados o respondidos',
      value: acted,
      ratio: acted / found,
      fromPrevious: found === 0 ? 0 : acted / found,
    },
    {
      label: 'Respondidos en Reddit',
      value: replied,
      ratio: replied / found,
      fromPrevious: acted === 0 ? 0 : replied / acted,
    },
  ];

  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-soft dark:text-neutral-300">{step.label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-ink dark:text-neutral-100">
              {formatCount(step.value)}
            </span>
          </div>

          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-neutral-800">
            <div
              className={
                index === 0
                  ? 'h-full rounded-full bg-brand-500 transition-[width] duration-500'
                  : 'h-full rounded-full bg-brand-300 transition-[width] duration-500 dark:bg-brand-500/70'
              }
              style={{ width: `${Math.max(step.ratio * 100, step.value > 0 ? 2 : 0)}%` }}
            />
          </div>

          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint dark:text-neutral-500">
            {index > 0 ? (
              <>
                <IconArrowLeft className="h-3 w-3" />
                {formatPercent(step.value, index === 2 ? acted : found)} del paso anterior
              </>
            ) : (
              `${formatCount(byStatus.new ?? 0)} sin tocar y ${formatCount(byStatus.dismissed ?? 0)} descartados`
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}

interface DistributionProps {
  buckets: Array<{ key: string; label: string; count: number }>;
  total: number;
}

/** Reparto de los posts del periodo por tramos de relevancia. */
export function RelevanceDistribution({ buckets, total }: DistributionProps) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const tones: Record<string, string> = {
    low: 'bg-surface-line dark:bg-neutral-700',
    mid: 'bg-brand-200 dark:bg-brand-500/40',
    good: 'bg-brand-400 dark:bg-brand-500/70',
    high: 'bg-brand-500',
  };

  return (
    <ul className="space-y-3">
      {buckets.map((bucket) => (
        <li key={bucket.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink-soft dark:text-neutral-300">{bucket.label}</span>
            <span className="shrink-0 tabular-nums text-ink-muted dark:text-neutral-400">
              {formatCount(bucket.count)}
              <span className="ml-1.5 text-ink-faint dark:text-neutral-500">
                {formatPercent(bucket.count, total)}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-neutral-800">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${tones[bucket.key] ?? tones.mid}`}
              style={{ width: `${Math.max((bucket.count / max) * 100, bucket.count > 0 ? 2 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface HourHistogramProps {
  data: Array<{ hour: number; count: number }>;
}

/**
 * A qué horas aparecen los posts en el reloj del usuario. Sirve para saber
 * cuándo tiene sentido estar encima a esa hora.
 */
export function HourHistogram({ data }: HourHistogramProps) {
  const max = Math.max(1, ...data.map((slot) => slot.count));
  const peak = data.reduce((best, slot) => (slot.count > best.count ? slot : best), data[0]);

  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Posts por hora del día">
        {data.map((slot) => {
          const heightPercent = (slot.count / max) * 100;
          const isPeak = peak !== undefined && slot.hour === peak.hour && slot.count > 0;
          return (
            <div
              key={slot.hour}
              className={
                isPeak
                  ? 'min-h-[2px] flex-1 rounded-sm bg-brand-500 transition-[height] duration-500'
                  : 'min-h-[2px] flex-1 rounded-sm bg-brand-200 transition-[height] duration-500 dark:bg-neutral-700'
              }
              style={{ height: `${Math.max(heightPercent, slot.count > 0 ? 3 : 1)}%` }}
              title={`${String(slot.hour).padStart(2, '0')}:00 – ${formatCount(slot.count)} ${
                slot.count === 1 ? 'post' : 'posts'
              }`}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-ink-faint dark:text-neutral-500">
        {[0, 6, 12, 18, 23].map((hour) => (
          <span key={hour}>{String(hour).padStart(2, '0')}</span>
        ))}
      </div>

      {peak && peak.count > 0 ? (
        <p className="mt-3 text-xs text-ink-muted dark:text-neutral-400">
          Tus posts aparecen sobre todo a las{' '}
          <span className="font-medium text-ink-soft dark:text-neutral-200">
            {String(peak.hour).padStart(2, '0')}:00
          </span>
          , con {formatCount(peak.count)} {peak.count === 1 ? 'post' : 'posts'}.
        </p>
      ) : null}
    </div>
  );
}
