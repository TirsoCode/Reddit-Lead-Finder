import { cx, relevanceTone } from '../lib/format';

interface ScoreBadgeProps {
  score: number | null;
  size?: 'sm' | 'md';
}

/**
 * Puntuación de relevancia. Va a la izquierda de cada tarjeta y debe pasar
 * desapercibida: número pequeño, sin bordes ni sombras.
 */
export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const pending = score === null;

  return (
    <div
      className={cx(
        'flex shrink-0 flex-col items-center justify-center rounded-lg font-display font-semibold tabular-nums',
        pending && 'opacity-60',
        size === 'sm' ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-[15px]',
        relevanceTone(score),
      )}
      title={pending ? 'Sin puntuar todavía' : `Relevancia ${score} de 100`}
    >
      {pending ? '—' : score}
    </div>
  );
}
