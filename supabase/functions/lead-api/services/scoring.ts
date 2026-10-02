import { z } from 'zod';
import { env } from '../env.ts';
import { createLogger } from '../logger.ts';
import type { Lead, Profile } from '../types.ts';
import { chatJson, type ChatMessage } from './ai.ts';

const log = createLogger('scoring');

const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        reddit_id: z.string(),
        relevance: z.number().min(1).max(100),
        reason: z.string().max(240).optional().default(''),
      }),
    )
    .max(40),
});

const SYSTEM_PROMPT = `Eres un clasificador de oportunidades de venta en Reddit.

Recibes el producto/servicio de un usuario y posts de Reddit. Tu trabajo es puntuar
del 1 al 100 cuánto encaja cada post con el PERFIL DE CLIENTE IDEAL de ese producto,
es decir, con la probabilidad de que quien escribió necesite la solución que el
producto vende.

Escala:
- 1-20: no encaja en absoluto (noticias, debates, juegos, temas sin relación).
- 21-45: encaja lejanamente, la persona habla del sector pero no busca solución.
- 46-70: probable, menciona el problema o una difficulty relacionada y podría
  buscar una herramienta.
- 71-85: encaja bien, pide ayuda o recomienda algo para el problema exacto.
- 86-100: oportunidad excelente, pide explícitamente una solución de este tipo
  ("necesito una app para...", "alternativa a...", "¿qué me recomendáis para...?").

Reglas:
- El texto va en español, incluido el motivo.
- Motivo de máximo 15 palabras: por qué puntúa así. Sin comillas ni preámbulo.
- Puntúa según lo que la persona pide, no según lo que la empresa vende.
- No inventes keywords del producto: el contexto ya lo incluye.`;

export interface ScoredPost {
  redditId: string;
  relevance: number;
  reason: string;
}

function buildContext(profile: Profile): string {
  return [
    `PRODUCTO: ${profile.product_name ?? 'Sin nombre'}`,
    profile.product_summary ? `QUÉ ES: ${profile.product_summary}` : null,
    profile.problem ? `PROBLEMA QUE RESUELVE: ${profile.problem}` : null,
    profile.audience ? `CLIENTE IDEAL: ${profile.audience}` : null,
    `KEYWORDS: ${profile.keywords.slice(0, 12).join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPostBlock(lead: Pick<Lead, 'reddit_id' | 'title' | 'body' | 'subreddit'>): string {
  const body = (lead.body ?? '').replace(/\s+/g, ' ').slice(0, 700);
  return [
    `id: ${lead.reddit_id}`,
    `subreddit: r/${lead.subreddit}`,
    `título: ${lead.title}`,
    body ? `texto: ${body}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Puntúa un lote de posts. Devuelve solo los ids presentes en la entrada. */
export async function scoreLeads(profile: Profile, leads: Lead[]): Promise<ScoredPost[]> {
  if (leads.length === 0) return [];

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${buildContext(profile)}

Posts a puntuar:
"""
${leads.map(buildPostBlock).join('\n\n')}
"""

Devuelve únicamente este JSON:
{"scores":[{"reddit_id":"abc123","relevance":78,"reason":"pide ayuda para organizar sus gastos"}]}`,
    },
  ];

  const raw = await chatJson({
    model: env.scoringModel,
    temperature: 0.1,
    maxTokens: 2000,
    messages,
    schema: scoresSchema,
    repairPrompt:
      'Tu respuesta anterior no tenía el formato pedido. Devuelve SOLO: {"scores":[{"reddit_id":"...","relevance":<número del 1 al 100>,"reason":"..."}]} usando exactamente los mismos ids que te pasé.',
  });

  const known = new Set(leads.map((lead) => lead.reddit_id));
  const seen = new Set<string>();
  const result: ScoredPost[] = [];

  for (const entry of raw.scores) {
    const id = String(entry.reddit_id ?? '').trim();
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push({
      redditId: id,
      relevance: Math.max(1, Math.min(100, Math.round(entry.relevance))),
      reason: String(entry.reason ?? '').trim(),
    });
  }

  if (result.length < leads.length) {
    log.warn(
      `La IA puntuó ${result.length} de ${leads.length} posts; los restantes se descartan de la tanda`,
    );
  }

  return result;
}
