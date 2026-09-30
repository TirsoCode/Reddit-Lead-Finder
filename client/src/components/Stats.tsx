import { cx } from '../lib/format';
import { Spinner } from './ui';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}

export function StatCard({ label, value, hint, accent = false }: StatCardProps) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      <p
        className={cx(
          'mt-1.5 font-display text-3xl font-bold tracking-tight',
          accent ? 'text-brand-500' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
}

export function ProgressBar({ value, max = 100, className }: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-muted', className)}>
      <div
        className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
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
