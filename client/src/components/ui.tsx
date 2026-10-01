import { cx } from '../lib/format';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      role="status"
      aria-label="Cargando"
    />
  );
}

export function FullPageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-muted dark:text-neutral-400">
      <Spinner className="h-6 w-6 text-brand-500" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="card flex animate-pulse items-center gap-4 p-4">
          <div className="h-11 w-11 rounded-lg bg-surface-muted dark:bg-neutral-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-surface-muted dark:bg-neutral-800" />
            <div className="h-3 w-1/3 rounded bg-surface-subtle dark:bg-neutral-800/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-line bg-surface-subtle px-6 py-16 text-center dark:border-neutral-800 dark:bg-neutral-900">
      {icon ? <div className="mb-3 text-ink-faint dark:text-neutral-500">{icon}</div> : null}
      <h3 className="font-display text-base font-semibold text-ink dark:text-neutral-100">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-muted dark:text-neutral-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-200">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted dark:text-neutral-400">
      <Spinner className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
