import { cx } from '../lib/format';

/**
 * Icono oficial de Reddit (Snoo), tomado tal cual del repo:
 * `client/public/reddit-icon.png`.
 *
 * Sustituye a la marca dibujada a mano (el ping de sonar). Es la misma imagen en
 * la barra lateral, el acceso, la cabecera y el pie de la portada, de modo que
 * el icono que ve el usuario es siempre el mismo.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/reddit-icon.png"
      alt=""
      aria-hidden="true"
      className={cx('shrink-0 rounded-[22%] object-contain', className)}
    />
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
      <LogoMark className="h-8 w-8" />
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
