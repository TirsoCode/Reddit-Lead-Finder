import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Profile, type ScanRun, type Tone } from '../lib/api';
import { cx, formatDateTime, timeAgo, TONE_DESCRIPTIONS, TONE_LABELS } from '../lib/format';
import { Spinner } from '../components/ui';
import { IconCheck, IconRefresh, IconSparkle } from '../components/icons';

interface ProfilePageProps {
  profile: Profile | null;
  runs: ScanRun[];
  onProfileChange: () => Promise<void>;
}

const TONES: Tone[] = ['conversational', 'professional', 'friendly'];

export function ProfilePage({ profile, runs, onProfileChange }: ProfilePageProps) {
  const [urlInput, setUrlInput] = useState(profile?.product_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setUrlInput(profile?.product_url ?? '');
  }, [profile?.product_url]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.saveProductUrl(urlInput.trim());
      await onProfileChange();
      setSuccess('Web analizada. Tus keywords ya están listas.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo analizar la web');
    } finally {
      setSaving(false);
    }
  }

  async function handleToneChange(tone: Tone) {
    setError(null);
    try {
      await api.updateProfile({ tone });
      await onProfileChange();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo guardar el tono');
    }
  }

  async function handleScan() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { result } = await api.scanNow();
      if (result.status === 'error') {
        setError(result.error ?? 'La búsqueda no pudo completarse');
      } else {
        setSuccess(
          `Búsqueda terminada: ${result.fetched} revisados, ${result.newPosts} nuevos, ${result.scored} puntuados.`,
        );
      }
      await onProfileChange();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'La búsqueda falló');
    } finally {
      setSaving(false);
    }
  }

  const analyzing = profile?.analysis_status === 'pending';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-white sm:text-[28px]">Perfil</h1>
        <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
          Tu producto, tu tono y las keywords que la app usa para buscarte clientes.
        </p>
      </header>

      {/* Producto */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">Tu producto</h2>
        <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
          Pega la URL de tu web o negocio. La app la lee, entiende qué vendes y genera sola las
          keywords y los subreddits donde buscar.
        </p>

        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="product-url" className="label">
            URL del producto
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="product-url"
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder="https://miproteo.com"
              className="input flex-1"
              required
              inputMode="url"
              disabled={saving}
            />
            <button type="submit" disabled={saving || !urlInput.trim()} className="btn-primary sm:w-auto">
              {saving ? <Spinner className="h-4 w-4" /> : <IconSparkle className="h-4 w-4" />}
              {analyzing ? 'Analizando…' : profile?.product_url ? 'Volver a analizar' : 'Analizar web'}
            </button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-brand-50 dark:bg-brand-500/15 px-3.5 py-2.5 text-sm text-brand-800 dark:text-brand-300">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-3.5 py-2.5 text-sm text-emerald-800 dark:text-emerald-300">{success}</p>
        ) : null}

        {profile?.analysis_status === 'error' && profile.analysis_error ? (
          <p className="mt-3 text-sm text-brand-700 dark:text-brand-400">
            Último error: {profile.analysis_error}
          </p>
        ) : null}

        {profile?.product_summary ? (
          <div className="mt-6 space-y-4 border-t border-surface-line dark:border-neutral-800 pt-5">
            <SummaryBlock label="Qué es" value={profile.product_summary} />
            {profile.problem ? <SummaryBlock label="Problema que resuelve" value={profile.problem} /> : null}
            {profile.audience ? <SummaryBlock label="Cliente ideal" value={profile.audience} /> : null}
          </div>
        ) : null}
      </section>

      {/* Tono */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">Tono de las respuestas</h2>
        <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
          Elige cómo quieres que suenen las respuestas sugeridas en español. Puedes regenerarlas
          cuando quieras.
        </p>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {TONES.map((tone) => {
            const selected = profile?.tone === tone;
            return (
              <button
                key={tone}
                type="button"
                onClick={() => void handleToneChange(tone)}
                disabled={saving}
                className={cx(
                  'focus-ring rounded-xl border p-4 text-left transition',
                  selected
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-surface-line bg-white hover:border-ink-faint/60 hover:bg-surface-subtle',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={cx(
                      'font-display text-sm font-semibold',
                      selected ? 'text-brand-800 dark:text-brand-300' : 'text-ink dark:text-neutral-100',
                    )}
                  >
                    {TONE_LABELS[tone]}
                  </span>
                  {selected ? <IconCheck className="h-4 w-4 text-brand-600 dark:text-brand-400" /> : null}
                </span>
                <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
                  {TONE_DESCRIPTIONS[tone]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Keywords */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">
              Keywords y comunidades
            </h2>
            <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
              Generadas automáticamente a partir de tu web. No hace falta que las edites.
            </p>
          </div>
          {profile?.analyzed_at ? (
            <span className="text-xs text-ink-faint dark:text-neutral-500">Actualizado {timeAgo(profile.analyzed_at)}</span>
          ) : null}
        </div>

        {!profile?.keywords?.length ? (
          <p className="mt-6 rounded-lg bg-surface-subtle dark:bg-neutral-900 px-4 py-6 text-center text-sm text-ink-muted dark:text-neutral-400">
            Aún no hay keywords. Analiza tu web para generarlas.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            <KeywordGroup
              title="Keywords de búsqueda"
              items={profile.keywords}
              tone="brand"
              hint="Frases que la gente escribe cuando tiene tu problema"
            />
            <KeywordGroup
              title="Subreddits"
              items={profile.subreddits.map((subreddit) => `r/${subreddit.replace(/^\/?r\//, '')}`)}
              tone="neutral"
              hint="Comunidades donde buscar posts complementarios"
            />
            {profile.search_queries.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-ink-soft dark:text-neutral-300">Búsquedas en Reddit</h3>
                <ul className="mt-3 space-y-2">
                  {profile.search_queries.map((query) => (
                    <li
                      key={query}
                      className="overflow-x-auto whitespace-nowrap rounded-lg bg-surface-subtle dark:bg-neutral-900 px-3 py-2 font-mono text-[12.5px] text-ink-muted dark:text-neutral-400"
                    >
                      {query}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Historial */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink dark:text-neutral-100">Historial de búsquedas</h2>
            <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
              La app busca dos veces al día por ti. También puedes lanzarla cuando quieras.
            </p>
          </div>
          <button
            type="button"
            onClick={handleScan}
            disabled={saving || !profile?.product_url}
            className="btn-secondary"
          >
            {saving ? <Spinner className="h-4 w-4" /> : <IconRefresh className="h-4 w-4" />}
            Buscar ahora
          </button>
        </div>

        {runs.length === 0 ? (
          <p className="mt-6 rounded-lg bg-surface-subtle dark:bg-neutral-900 px-4 py-6 text-center text-sm text-ink-muted dark:text-neutral-400">
            Todavía no se ha hecho ninguna búsqueda.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-surface-line">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex items-center gap-2.5">
                  <StatusDot status={run.status} />
                  <div>
                    <p className="text-sm font-medium text-ink dark:text-neutral-100">
                      {run.posts_new} nuevos de {run.posts_fetched} revisados
                    </p>
                    <p className="text-xs text-ink-faint dark:text-neutral-500">
                      {formatDateTime(run.started_at)} ·{' '}
                      {run.trigger === 'cron' ? 'Automática' : 'Manual'} ·{' '}
                      {run.replies_generated} respuestas
                    </p>
                  </div>
                </div>
                {run.error ? (
                  <span className="text-xs text-brand-700 dark:text-brand-400">{run.error}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-ink-soft dark:text-neutral-300">{label}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted dark:text-neutral-400">{value}</p>
    </div>
  );
}

function KeywordGroup({
  title,
  items,
  tone,
  hint,
}: {
  title: string;
  items: string[];
  tone: 'brand' | 'neutral';
  hint?: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-ink-soft dark:text-neutral-300">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-ink-faint dark:text-neutral-500">{hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className={cx(
              'pill',
              tone === 'brand'
                ? 'bg-brand-50 text-brand-700'
                : 'bg-surface-muted text-ink-soft',
            )}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ScanRun['status'] }) {
  const color =
    status === 'success'
      ? 'bg-emerald-500'
      : status === 'error'
        ? 'bg-brand-500'
        : 'bg-ink-faint';
  return <span className={cx('h-2 w-2 rounded-full', color)} />;
}
