import { cx } from '../lib/format';
import { IconCheck } from './icons';

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

/** Aviso neutro de que una operación salió bien. */
export function SuccessNote({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
      <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nombre del grupo para lectores de pantalla; también el título emergente. */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Grupo de opciones excluyentes. Se usa para el periodo, el orden o la
 * densidad: son pocas opciones y caben en una fila, mejor que un `select`.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('flex rounded-lg bg-surface-muted p-0.5 dark:bg-neutral-800', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cx(
              'focus-ring rounded-[7px] font-medium transition',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
              selected
                ? 'bg-white text-ink shadow-card dark:bg-neutral-700 dark:text-white'
                : 'text-ink-muted hover:text-ink dark:text-neutral-400 dark:hover:text-neutral-200',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}

/** Interruptor para las preferencias que no merecen una pantalla (densidad, etc.). */
export function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={hint}
      onClick={() => onChange(!checked)}
      className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left"
    >
      <span>
        <span className="block text-[13px] font-medium text-ink-soft dark:text-neutral-200">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-faint dark:text-neutral-500">{hint}</span> : null}
      </span>
      <span
        className={cx(
          'relative h-5 w-9 shrink-0 rounded-full transition',
          checked ? 'bg-brand-500' : 'bg-surface-line dark:bg-neutral-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

interface SectionCardProps {
  title: string;
  description?: string;
  /** Zona derecha de la cabecera: filtros, enlaces, botones. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Con `dense` la tarjeta pierde el relleno vertical: para listas largas. */
  dense?: boolean;
}

/** Tarjeta con cabecera: el patrón de bloque repetido en todo el panel. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  dense = false,
}: SectionCardProps) {
  return (
    <section className={cx('card', className)}>
      <div
        className={cx(
          'flex flex-wrap items-start justify-between gap-3',
          dense ? 'px-5 pt-4' : 'p-5 pb-0',
        )}
      >
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className={dense ? 'px-5 pb-5 pt-4' : 'p-5'}>{children}</div>
    </section>
  );
}

interface BarRowProps {
  label: string;
  /** 0–1. Los valores fuera de rango se recortan solos. */
  ratio: number;
  value: string;
  hint?: string;
  tone?: 'brand' | 'neutral' | 'emerald';
}

/** Fila con etiqueta, barra y cifra: la unidad de los histogramas del panel. */
export function BarRow({ label, ratio, value, hint, tone = 'brand' }: BarRowProps) {
  const percent = Math.max(0, Math.min(100, ratio * 100));
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="truncate text-ink-soft dark:text-neutral-300">{label}</span>
        <span className="shrink-0 tabular-nums text-ink-muted dark:text-neutral-400">
          {value}
          {hint ? <span className="ml-1.5 text-ink-faint dark:text-neutral-500">{hint}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-neutral-800">
        <div
          className={cx(
            'h-full rounded-full transition-[width] duration-500',
            tone === 'brand' && 'bg-brand-500',
            tone === 'neutral' && 'bg-ink-faint dark:bg-neutral-600',
            tone === 'emerald' && 'bg-emerald-500',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </li>
  );
}

/** Etiqueta de "sin datos" para los módulos que dependen del periodo elegido. */
export function WidgetEmpty({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-surface-subtle px-4 py-6 text-center text-[13px] text-ink-muted dark:bg-neutral-950 dark:text-neutral-400">
      {message}
    </p>
  );
}
