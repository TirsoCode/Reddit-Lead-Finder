import { cx } from '../lib/format';

/**
 * Marca de la aplicación: un ping de sonar.
 *
 * El punto rojo es el origen del pulso, las dos ondas son el escaneo y el punto
 * blanco apoyado en la onda exterior es el lead detectado. No usa el snoo de
 * Reddit a propósito: esa marca es de Reddit y el pie de la portada ya dice
 * "No afiliado con Reddit".
 *
 * Las formas están calculadas sobre un viewBox de 32 para que el mismo trazado
 * sirva para el favicon (`client/public/favicon.svg`) y para el componente.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#171717" />
      <g stroke="#E63946" strokeWidth={2.5} strokeLinecap="round">
        <path d="M11 12.5a7 7 0 0 1 7 7" />
        <path d="M11 5.5a14.5 14.5 0 0 1 14.5 14.5" />
      </g>
      <circle cx="11" cy="19.5" r="3.4" fill="#E63946" />
      <circle cx="21.3" cy="9.7" r="2" fill="#FFFFFF" />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Invierte los colores para fondos oscuros. */
  inverted?: boolean;
}

/** Marca + nombre, tal cual aparece en la barra lateral, el acceso y el pie. */
export function Logo({ className, inverted = false }: LogoProps) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span
        className={cx(
          'font-display text-[17px] font-bold tracking-tight',
          inverted ? 'text-white' : 'text-ink',
        )}
      >
        Reddit<span className="text-brand-500">Leads</span>
      </span>
    </span>
  );
}
