import { useEffect, useRef, useState } from 'react';
import type { Lead, LeadStatus } from '../lib/api';
import {
  compactNumber,
  copyToClipboard,
  cx,
  timeAgo,
  TONE_LABELS,
} from '../lib/format';
import { ScoreBadge } from './ScoreBadge';
import {
  IconBookmark,
  IconCheck,
  IconComment,
  IconCopy,
  IconExternal,
  IconSparkle,
  IconTrash,
  IconUpvote,
} from './icons';
import { Spinner } from './ui';

interface PostCardProps {
  lead: Lead;
  onGenerateReply: (leadId: string) => Promise<void>;
  onStatusChange: (leadId: string, status: LeadStatus) => Promise<void>;
  onDismiss: (leadId: string) => Promise<void>;
  generating?: boolean;
}

export function PostCard({
  lead,
  onGenerateReply,
  onStatusChange,
  onDismiss,
  generating = false,
}: PostCardProps) {
  const [replyOpen, setReplyOpen] = useState(Boolean(lead.reply));
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<LeadStatus | 'reply' | 'dismiss' | null>(null);
  const timer = useRef<number | null>(null);

  // Si la respuesta llega desde la IA, se muestra sin que haya que abrirla.
  useEffect(() => {
    if (lead.reply) setReplyOpen(true);
  }, [lead.reply]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function handleCopy() {
    if (!lead.reply) return;
    const ok = await copyToClipboard(lead.reply);
    if (!ok) return;
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerateReply() {
    setBusy('reply');
    try {
      await onGenerateReply(lead.id);
      setReplyOpen(true);
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus(status: LeadStatus) {
    setBusy(status);
    try {
      await onStatusChange(lead.id, status);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="card group p-4 transition hover:border-ink-faint/60 dark:hover:border-neutral-600">
      <div className="flex gap-4">
        <ScoreBadge score={lead.relevance} />

        <div className="min-w-0 flex-1">
          {/* Cabecera: título + enlace directo a Reddit */}
          <a
            href={lead.url ?? lead.permalink ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring group/link inline-flex items-start gap-1.5 rounded-sm"
          >
            <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-ink group-hover/link:text-brand-600 dark:text-neutral-100 dark:group-hover/link:text-brand-400">
              {lead.title}
            </h3>
            <IconExternal className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover/link:opacity-100 dark:text-neutral-500" />
          </a>

          {/* Metadatos */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted dark:text-neutral-400">
            <span className="font-medium text-ink-soft dark:text-neutral-300">r/{lead.subreddit}</span>
            <span className="inline-flex items-center gap-1">
              <IconUpvote className="h-3.5 w-3.5" />
              {compactNumber(lead.upvotes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <IconComment className="h-3.5 w-3.5" />
              {compactNumber(lead.num_comments)}
            </span>
            <span>· {timeAgo(lead.posted_at ?? lead.first_seen_at)}</span>
            {lead.status !== 'new' && (
              <span
                className={cx(
                  'pill',
                  lead.status === 'saved' && 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
                  lead.status === 'replied' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
                  lead.status === 'dismissed' && 'bg-surface-muted text-ink-muted dark:bg-neutral-800 dark:text-neutral-400',
                )}
              >
                {lead.status === 'saved' ? 'Guardado' : lead.status === 'replied' ? 'Respondido' : 'Descartado'}
              </span>
            )}
          </div>

          {lead.relevance_reason && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted dark:text-neutral-400">
              <span className="font-medium text-ink-soft dark:text-neutral-300">Por qué: </span>
              {lead.relevance_reason}
            </p>
          )}

          {/* Respuesta sugerida */}
          <div className="mt-3">
            {lead.reply ? (
              <>
                <button
                  type="button"
                  onClick={() => setReplyOpen((open) => !open)}
                  aria-expanded={replyOpen}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-brand-700 dark:text-brand-400"
                >
                  <IconSparkle className="h-3.5 w-3.5" />
                  {replyOpen ? 'Ocultar respuesta sugerida' : 'Ver respuesta sugerida'}
                  {lead.reply_tone ? (
                    <span className="font-normal text-ink-faint dark:text-neutral-500">
                      · {TONE_LABELS[lead.reply_tone] ?? ''}
                    </span>
                  ) : null}
                </button>

                {replyOpen && (
                  <div className="mt-2 rounded-lg border border-surface-line bg-surface-subtle p-3.5 dark:border-neutral-800 dark:bg-neutral-950">
                    <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft dark:text-neutral-300">
                      {lead.reply}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={handleCopy} className="btn-primary px-3 py-1.5 text-xs">
                        {copied ? (
                          <IconCheck className="h-3.5 w-3.5" />
                        ) : (
                          <IconCopy className="h-3.5 w-3.5" />
                        )}
                        {copied ? 'Copiado' : 'Copiar respuesta'}
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerateReply}
                        disabled={busy !== null}
                        className="btn-secondary px-3 py-1.5 text-xs"
                      >
                        {busy === 'reply' ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <IconSparkle className="h-3.5 w-3.5" />
                        )}
                        Regenerar
                      </button>

                      <a
                        href={lead.url ?? lead.permalink ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        Abrir post
                      </a>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleGenerateReply}
                disabled={busy !== null || generating || lead.relevance === null}
                className="btn-secondary px-3 py-1.5 text-xs"
                title={lead.relevance === null ? 'Primero se puntúa el post' : undefined}
              >
                {busy === 'reply' || generating ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <IconSparkle className="h-3.5 w-3.5" />
                )}
                Generar respuesta
              </button>
            )}
          </div>

          {/* Acciones de gestión */}
          <div className="mt-3 flex items-center gap-1 border-t border-surface-line pt-2.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => handleStatus(lead.status === 'saved' ? 'new' : 'saved')}
              disabled={busy !== null}
              className={cx(
                'btn-ghost px-2 py-1 text-xs',
                lead.status === 'saved' && 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
              )}
              title={lead.status === 'saved' ? 'Quitar de guardados' : 'Guardar'}
            >
              {busy === 'saved' ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <IconBookmark className="h-3.5 w-3.5" />
              )}
              {lead.status === 'saved' ? 'Guardado' : 'Guardar'}
            </button>

            {lead.status !== 'replied' && (
              <button
                type="button"
                onClick={() => handleStatus('replied')}
                disabled={busy !== null}
                className="btn-ghost px-2 py-1 text-xs"
                title="Marcar como respondido en Reddit"
              >
                {busy === 'replied' ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <IconCheck className="h-3.5 w-3.5" />
                )}
                Respondido
              </button>
            )}

            <button
              type="button"
              onClick={() => handleStatus('dismissed')}
              disabled={busy !== null || lead.status === 'dismissed'}
              className="btn-ghost px-2 py-1 text-xs"
            >
              Descartar
            </button>

            <button
              type="button"
              onClick={() => {
                setBusy('dismiss');
                void onDismiss(lead.id).finally(() => setBusy(null));
              }}
              disabled={busy !== null}
              aria-label="Eliminar post"
              className="btn-ghost ml-auto px-2 py-1 text-xs text-ink-faint hover:text-brand-600 dark:text-neutral-500 dark:hover:text-brand-400"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
