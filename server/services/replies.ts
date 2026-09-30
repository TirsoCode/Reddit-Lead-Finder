import { z } from 'zod';
import { env } from '../env.js';
import { createLogger } from '../logger.js';
import type { Lead, Profile, Tone } from '../types.js';
import { chatJson, type ChatMessage } from './ai.js';

const log = createLogger('replies');

const replySchema = z.object({
  reply: z.string().min(30).max(1800),
});

const BASE_RULES = `Eres un asistente que ayuda a un emprendedor a responder posts de Reddit
con la máxima naturalidad. Escribes SIEMPRE en español (tú/vosotros, tono coloquial español).

Objetivo: la respuesta debe ser útil por sí sola para quien lee el post. Si la
persona pide consejo, primero das el consejo. Después conectas con lo que hace el
producto como algo que a ti te funcionó o que alguien más está usando, sin vender.

Prohibido:
- Mencionar el nombre de la web, el precio, enlaces o "regístrate".
- Frases de venta: "en mi empresa", "somos Expertos", "no dude en", "descubra".
- Empezar con "¡Hola!" seguido del título del post.
- Emoticonos, emojis, signos de exclamación múltiples ni estilo de spam.

- Inventar datos, cifras, precios o funcionalidades que no estén en el contexto.

Formato: 2 o 3 frases en párrafos cortos, en un único bloque de texto plano,
sin viñetas, sin encabezados y sin entrecomillar el texto completo.`;

const TONES: Record<Tone, string> = {
  conversational:
    'Tono conversacional: como si lo escribiera una persona normal en un hilo de Reddit. Frases cortas y honestas, sin jerga.',
  professional:
    'Tono profesional y directo: explica el problema con precisión y da la respuesta en pocas frases, sin rodeos ni tono publicitario.',
  friendly:
    'Tono amigable e informal: cercano y cálido, como un consejo entre iguales. Algo de coloquial sin pasarse de gracioso.',
};

function buildContext(profile: Profile): string {
  return [
    `PRODUCTO: ${profile.product_name ?? 'Sin nombre'}`,
    profile.product_summary ? `QUÉ HACE: ${profile.product_summary}` : null,
    profile.problem ? `PROBLEMA QUE RESUELVE: ${profile.problem}` : null,
    profile.audience ? `A QUIÉN LE APORTA: ${profile.audience}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPost(lead: Pick<Lead, 'title' | 'body' | 'subreddit' | 'author'>): string {
  const body = (lead.body ?? '').replace(/\s+/g, ' ').slice(0, 900);
  return [
    `subreddit: r/${lead.subreddit}`,
    `título: ${lead.title}`,
    body ? `texto del post: ${body}` : '(post sin texto, solo título)',
  ].join('\n');
}

/** Genera una respuesta en español para un post concreto. */
export async function generateReply(profile: Profile, lead: Lead): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${BASE_RULES}\n\n${TONES[profile.tone]}`,
    },
    {
      role: 'user',
      content: `${buildContext(profile)}

Post al que hay que responder:
"""
${buildPost(lead)}
"""

Escribe solo el texto de la respuesta, sin comillas ni explicaciones.`,
    },
  ];

  const raw = await chatJson({
    model: env.scoringModel,
    temperature: 0.85,
    maxTokens: 500,
    messages,
    schema: replySchema,
    repairPrompt:
      'Devuelve SOLO el JSON {"reply":"<texto de la respuesta>"} con la respuesta en español, sin nada más alrededor.',
  });

  const reply = raw.reply
    .replace(/^["'“”]|["'“”]$/g, '')
    .replace(/^(respuesta|reply)\s*:\s*/i, '')
    .replace(/\s+\n/g, '\n')
    .trim();

  if (reply.length < 20) throw new Error('La IA devolvió una respuesta demasiado corta');
  log.debug(`Respuesta generada para ${lead.reddit_id}`);
  return reply;
}
