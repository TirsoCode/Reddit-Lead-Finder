import { cx, type Delta } from '../lib/format';
import { Sparkline } from './charts';
import { Spinner } from './ui';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
  /** Variación frente al periodo anterior. Sin periodo anterior, `null`. */
  delta?: Delta | null;
  /** Serie para la minigráfica; normalmente los posts por día del periodo. */
  spark?: number[];
  /** `true` cuando la serie es una media 0–100 y no un recuento. */
  sparkScale100?: boolean;
  /** Abrevia la tarjeta para que quepan más en el panel. */
  compact?: boolean;
}

export function StatCard({
  label,
  value,
  hint,
  accent = false,
  delta = null,
  spark,
  sparkScale100 = false,
  compact = false,
}: StatCardProps) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-ink-muted dark:text-neutral-400">{label}</p>
        {delta ? (
          <span
            className={cx(
              'shrink-0 text-xs font-medium tabular-nums',
              delta.direction === 'up' && 'text-emerald-600 dark:text-emerald-400',
              delta.direction === 'down' && 'text-brand-600 dark:text-brand-400',
              delta.direction === 'flat' && 'text-ink-faint dark:text-neutral-500',
            )}
            title="Frente al periodo anterior"
          >
            {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '='} {delta.label}
          </span>
        ) : null}
      </div>

      <p
        className={cx(
          'mt-1.5 font-display font-bold tracking-tight tabular-nums',
          compact ? 'text-2xl' : 'text-3xl',
          accent ? 'text-brand-500' : 'text-ink dark:text-white',
        )}
      >
        {value}
      </p>

      {hint ? <p className="mt-1 text-xs text-ink-faint dark:text-neutral-500">{hint}</p> : null}

      {spark && spark.length > 0 ? (
        <div
          className={cx(
            'mt-3 text-brand-500',
            compact ? 'text-ink-faint dark:text-neutral-600' : 'text-brand-400',
          )}
        >
          <Sparkline
            values={spark}
            scale100={sparkScale100}
            label={`Evolución de ${label.toLowerCase()}`}
          />
        </div>
      ) : null}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  tone?: 'brand' | 'emerald';
}

export function ProgressBar({ value, max = 100, className, tone = 'brand' }: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-neutral-800', className)}>
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-500',
          tone === 'brand' ? 'bg-brand-500' : 'bg-emerald-500',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

interface ScanButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  label?: string;
}

export function ScanButton({ onClick, loading, disabled, label = 'Buscar ahora' }: ScanButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="btn-secondary"
      title="La búsqueda automática ya se ejecuta 2 veces al día"
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {loading ? 'Buscando…' : label}
    </button>
  );
}
