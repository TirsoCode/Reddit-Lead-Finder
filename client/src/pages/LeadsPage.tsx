import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Lead, type LeadStatus } from '../lib/api';
import { cx } from '../lib/format';
import { PostCard } from '../components/PostCard';
import { ScanButton } from '../components/Stats';
import { CardSkeleton, EmptyState, ErrorNote } from '../components/ui';
import { IconLeads, IconSearch, IconSparkle } from '../components/icons';

interface LeadsPageProps {
  pendingReplies: number;
  onProfileChange: () => Promise<void>;
}

const PAGE_SIZE = 20;

const FILTERS: Array<{ value: LeadStatus | 'all'; label: string }> = [
  { value: 'new', label: 'Nuevos' },
  { value: 'saved', label: 'Guardados' },
  { value: 'replied', label: 'Respondidos' },
  { value: 'all', label: 'Todos' },
];

const SORTS: Array<{ value: string; label: string }> = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'new', label: 'Más recientes' },
  { value: 'upvotes', label: 'Más votados' },
  { value: 'comments', label: 'Más comentados' },
];

const MIN_SCORE_OPTIONS = [
  { value: 0, label: 'Cualquiera' },
  { value: 40, label: '40+' },
  { value: 60, label: '60+' },
  { value: 80, label: '80+' },
];

export function LeadsPage({ pendingReplies, onProfileChange }: LeadsPageProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<LeadStatus | 'all'>('new');
  const [sort, setSort] = useState('relevance');
  const [minRelevance, setMinRelevance] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // La búsqueda del servidor se aplica con un pequeño retardo.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getLeads({
        status,
        sort,
        search: search || undefined,
        minRelevance: minRelevance > 0 ? minRelevance : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setLeads(response.leads);
      setTotal(response.total);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudieron cargar los leads');
    } finally {
      setLoading(false);
    }
  }, [status, sort, search, minRelevance, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [status, sort, minRelevance]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Al borrar o descartar un post, la última página puede quedarse vacía.
  useEffect(() => {
    if (!loading && leads.length === 0 && page > 0) setPage((value) => value - 1);
  }, [loading, leads.length, page]);

  const rangeLabel = useMemo(() => {
    if (total === 0) return '0 posts';
    const from = page * PAGE_SIZE + 1;
    const to = Math.min(total, (page + 1) * PAGE_SIZE);
    return `${from}–${to} de ${total}`;
  }, [page, total]);

  async function handleScan() {
    setScanning(true);
    setNotice(null);
    setError(null);
    try {
      const { result } = await api.scanNow();
      if (result.status === 'error') {
        setError(result.error ?? 'La búsqueda no pudo completarse');
      } else {
        setNotice(
          result.newPosts === 0
            ? 'Sin posts nuevos. La búsqueda automática se encarga dos veces al día.'
            : `${result.newPosts} ${
                result.newPosts === 1 ? 'post nuevo' : 'posts nuevos'
              } añadidos a tu bandeja.`,
        );
      }
      await Promise.all([load(), onProfileChange()]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'La búsqueda falló');
    } finally {
      setScanning(false);
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    setNotice(null);
    try {
      const { generated } = await api.generatePendingReplies();
      setNotice(
        generated === 0
          ? 'No hay respuestas pendientes de generar.'
          : `${generated} ${generated === 1 ? 'respuesta generada' : 'respuestas generadas'}.`,
      );
      await Promise.all([load(), onProfileChange()]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudieron generar respuestas');
    } finally {
      setGeneratingAll(false);
    }
  }

  function patchLead(leadId: string, changes: Partial<Lead>) {
    setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, ...changes } : lead)));
  }

  // PostCard no captura los errores: si la petición falla hay que avisar aquí,
  // o el rechazo se queda sin manejar y el usuario no ve nada.
  function reportActionError(caught: unknown, fallback: string): void {
    setNotice(null);
    setError(caught instanceof ApiError ? caught.message : fallback);
  }

  async function handleGenerateReply(leadId: string) {
    try {
      const { lead } = await api.generateReply(leadId);
      patchLead(leadId, lead);
    } catch (caught) {
      reportActionError(caught, 'No se pudo generar la respuesta');
    }
  }

  async function handleStatusChange(leadId: string, nextStatus: LeadStatus) {
    try {
      const { lead } = await api.setLeadStatus(leadId, nextStatus);
      setLeads((current) =>
        current
          .map((item) => (item.id === leadId ? lead : item))
          .filter((item) => item.status !== 'dismissed'),
      );
      void onProfileChange();
    } catch (caught) {
      reportActionError(caught, 'No se pudo cambiar el estado del post');
    }
  }

  async function handleDismiss(leadId: string) {
    try {
      await api.setLeadStatus(leadId, 'dismissed');
      setLeads((current) => current.filter((lead) => lead.id !== leadId));
      setTotal((value) => Math.max(0, value - 1));
    } catch (caught) {
      reportActionError(caught, 'No se pudo descartar el post');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-white sm:text-[28px]">
            Leads
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-neutral-400">
            Posts de Reddit donde tu producto puede encajar, con la respuesta ya escrita en español.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingReplies > 0 && (
            <button
              type="button"
              onClick={handleGenerateAll}
              disabled={generatingAll}
              className="btn-secondary"
            >
              <IconSparkle className="h-4 w-4" />
              {generatingAll ? 'Generando…' : `Generar ${pendingReplies} respuestas`}
            </button>
          )}
          <ScanButton onClick={handleScan} loading={scanning} />
        </div>
      </header>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-lg bg-surface-muted dark:bg-neutral-800 p-0.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={cx(
                'focus-ring rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition',
                status === filter.value
                  ? 'bg-white text-ink shadow-card dark:bg-neutral-700 dark:text-white'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint dark:text-neutral-500" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por título o texto…"
            aria-label="Buscar leads"
            className="input py-2 pl-9"
          />
        </div>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Ordenar por"
          className="input w-auto py-2 pr-8"
        >
          {/* Los options necesitan fondo explícito en modo oscuro */}
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={minRelevance}
          onChange={(event) => setMinRelevance(Number(event.target.value))}
          aria-label="Relevancia mínima"
          className="input w-auto py-2 pr-8"
        >
          {MIN_SCORE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Relevancia {option.label}
            </option>
          ))}
        </select>
      </div>

      {notice ? (
        <p className="rounded-lg border border-surface-line dark:border-neutral-800 bg-surface-subtle dark:bg-neutral-900 px-4 py-3 text-sm text-ink-soft dark:text-neutral-300">
          {notice}
        </p>
      ) : null}
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      <p className="text-xs text-ink-faint dark:text-neutral-500">{loading ? 'Cargando…' : rangeLabel}</p>

      {loading ? (
        <CardSkeleton rows={5} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={<IconLeads className="h-7 w-7" />}
          title={search ? 'Ningún post coincide' : 'Aquí aparecerán tus leads'}
          description={
            search
              ? 'Prueba con otras palabras o quita los filtros.'
              : 'Cada 12 horas buscamos en Reddit por ti. También puedes lanzar una búsqueda ahora mismo.'
          }
          action={
            search ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setStatus('all');
                  setMinRelevance(0);
                }}
                className="btn-secondary"
              >
                Quitar filtros
              </button>
            ) : (
              <ScanButton onClick={handleScan} loading={scanning} />
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <PostCard
              key={lead.id}
              lead={lead}
              onGenerateReply={handleGenerateReply}
              onStatusChange={handleStatusChange}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={page === 0}
            className="btn-secondary"
          >
            Anteriores
          </button>
          <span className="text-sm text-ink-muted dark:text-neutral-400">
            Página {page + 1} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
            disabled={page >= totalPages - 1}
            className="btn-secondary"
          >
            Siguientes
          </button>
        </nav>
      )}
    </div>
  );
}
