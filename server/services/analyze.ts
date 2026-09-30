import { z } from 'zod';
import { env } from '../env.js';
import { createLogger } from '../logger.js';
import type { ProductAnalysis } from '../types.js';
import { chatJson, type ChatMessage } from './ai.js';
import { normalizeUrl, scrapePage, type ScrapedPage } from './scraper.js';

const log = createLogger('analyze');

const analysisSchema = z.object({
  product_name: z.string().min(1).max(120).catch('Tu producto'),
  summary: z.string().min(1).max(600),
  problem: z.string().min(1).max(600),
  audience: z.string().min(1).max(600),
  keywords: z.array(z.string().min(2).max(60)).min(4).max(25),
  subreddits: z.array(z.string().min(2).max(60)).min(3).max(20),
  search_queries: z.array(z.string().min(3).max(180)).min(3).max(15),
});

const SYSTEM_PROMPT = `Eres un estratega de marketing que conoce Reddit a fondo.
Analizas la web de un producto y diseñas la estrategia para encontrar en Reddit a
personas que tienen el problema que ese producto resuelve.

Reglas estrictas:
- Escribe TODO el contenido en español.
- Conoce el producto solo con lo que hay en la web. No inventes precios, marcas ni funciones.
- Las keywords son las frases que una persona escribiría en Reddit hablando de su
  problema o buscando una solución. Nada de jerga de marketing ni nombres de producto.
  Mezcla problemas ("como dejar de procrastinar"), intenciones ("recomendadme app para X")
  y solución ("alternativa barata a X").
- Los subreddits deben ser reales, de la comunidad angloparlante (Reddit es mayoritario en
  inglés) y donde realmente se pide ayuda con ese tipo de problema.
- search_queries son búsquedas listas para el buscador de Reddit: encuadra cada una con
  comillas, usa OR entre alternativas y el operador "need" o "help" cuando tenga sentido.`;

function buildUserPrompt(page: ScrapedPage): ChatMessage['content'] {
  const sections = [
    `URL: ${page.url}`,
    page.title ? `Título: ${page.title}` : null,
    page.description ? `Descripción: ${page.description}` : null,
    page.headings.length > 0 ? `Apartados: ${page.headings.join(' | ')}` : null,
    page.truncated ? '(contenido recortado)' : null,
    '',
    'Contenido de la web:',
    '"""',
    page.text,
    '"""',
  ].filter((line) => line !== null);

  return `${sections.join('\n')}

Devuelve únicamente este JSON:
{
  "product_name": "nombre corto del producto",
  "summary": "qué es y qué hace, en 2 frases",
  "problem": "qué problema concreto resuelve, en 2 frases",
  "audience": "quién es el cliente ideal y en qué situación se encuentra, en 2 frases",
  "keywords": ["frase que se escribe en Reddit", "..."],
  "subreddits": ["subredditreal", "..."],
  "search_queries": ["(\\"frase 1\\" OR \\"frase 2\\") help", "..."]
}`;
}

function cleanList(values: string[], mapper: (value: string) => string, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = mapper(String(value ?? '')).trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

/** Quita el prefijo r/ y sanea el nombre del subreddit. */
function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^\/?(r|u)\//i, '').replace(/[^A-Za-z0-9_]/g, '');
}

export interface AnalyzeResult {
  analysis: ProductAnalysis;
  page: { url: string; title: string | null };
}

/** Analiza la web y devuelve keywords + queries listas para Reddit. */
export async function analyzeProduct(inputUrl: string): Promise<AnalyzeResult> {
  const url = normalizeUrl(inputUrl);
  const page = await scrapePage(url);

  const raw = await chatJson({
    model: env.OPENROUTER_MODEL,
    temperature: 0.3,
    maxTokens: 1600,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(page) },
    ],
    schema: analysisSchema,
  });

  const keywords = cleanList(raw.keywords, (value) => value.replace(/^["']|["']$/g, ''), 25);
  const subreddits = cleanList(raw.subreddits, normalizeSubreddit, 20);
  const searchQueries = cleanList(raw.search_queries, (value) => value.replace(/\s+/g, ' '), 15);

  if (keywords.length < 3) {
    throw new Error('La IA no generó suficientes keywords');
  }

  log.info(`Análisis listo: ${keywords.length} keywords, ${subreddits.length} subreddits`);

  return {
    analysis: {
      product_name: raw.product_name.trim(),
      summary: raw.summary.trim(),
      problem: raw.problem.trim(),
      audience: raw.audience.trim(),
      keywords,
      subreddits,
      search_queries: searchQueries,
    },
    page: { url: page.url, title: page.title },
  };
}
