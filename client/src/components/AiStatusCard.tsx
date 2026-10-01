import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AiHealth } from '../lib/api';
import { cx } from '../lib/format';
import { IconCheck, IconClose, IconRefresh, IconSparkle } from './icons';
import { Spinner } from './ui';

/**
 * Estado de la conexión con la IA.
 *
 * Al abrirlo llama a `/api/ai/status`, que hace una petición real a OpenRouter
 * (no solo mira si la variable existe). Así se sabe si la clave vale antes de
 * analizar una web entera y perder el tiempo.
 */
export function AiStatusCard() {
  const [ai, setAi] = useState<AiHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const { ai: next } = await api.getAiStatus();
      setAi(next);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo comprobar la IA');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const tone =
    ai?.status === 'ready'
      ? 'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/15'
      : ai?.status === 'unconfigured'
        ? 'border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15'
        : 'border-brand-500/40 bg-brand-500/10 dark:bg-brand-500/15';

  const headline =
    ai?.status === 'ready'
      ? 'IA conectada'
      : ai?.status === 'unconfigured'
        ? 'IA sin configurar'
        : ai?.status === 'invalid_key'
          ? 'Clave de IA no válida'
          : ai?.status === 'unreachable'
            ? 'OpenRouter no responde'
            : 'IA con errores';

  return (
    <div className="rounded-xl border border-surface-line p-5 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink dark:text-neutral-100">
            <IconSparkle className="h-4 w-4 text-brand-500" />
            Conexión con la IA
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
            OpenRouter lee tu web, puntúa los posts y redacta las respuestas. Esta comprobación
            llama al modelo de verdad.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          className="btn-secondary shrink-0"
        >
          {checking ? <Spinner className="h-4 w-4" /> : <IconRefresh className="h-4 w-4" />}
          {checking ? 'Comprobando…' : 'Comprobar ahora'}
        </button>
      </div>

      {/* Estado */}
      <div className={cx('mt-4 flex items-start gap-3 rounded-lg border p-4', tone)}>
        <span className="mt-0.5 shrink-0">
          {checking ? (
            <Spinner className="h-4 w-4 text-ink-muted dark:text-neutral-400" />
          ) : ai?.status === 'ready' ? (
            <IconCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <IconClose className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink dark:text-neutral-100">
            {checking ? 'Comprobando con el proveedor…' : (error ?? headline)}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft dark:text-neutral-300">
            {error ?? ai?.message}
          </p>
          {ai?.detail && !checking && !error ? (
            <p className="mt-1.5 font-mono text-[11.5px] text-ink-faint dark:text-neutral-500">
              Respuesta del modelo: “{ai.detail}”
            </p>
          ) : null}
        </div>
      </div>

      {/* Modelos en uso */}
      {ai ? (
        <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-subtle px-3 py-2 dark:bg-neutral-900">
            <dt className="text-ink-muted dark:text-neutral-400">Analiza tu web</dt>
            <dd className="truncate font-mono text-[12px] text-ink-soft dark:text-neutral-300">{ai.model}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-subtle px-3 py-2 dark:bg-neutral-900">
            <dt className="text-ink-muted dark:text-neutral-400">Puntúa y redacta</dt>
            <dd className="truncate font-mono text-[12px] text-ink-soft dark:text-neutral-300">{ai.scoringModel}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}