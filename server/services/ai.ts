import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { createLogger } from '../logger.js';

const log = createLogger('openrouter');

const BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_ATTEMPTS = 3;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
}

interface ChatResponse {
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Quita vallas ```json ... ``` que algunos modelos añaden alrededor del JSON. */
export function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Último recurso: el primer objeto o array balanceado dentro del texto.
    const start = candidate.search(/[[{]/);
    if (start === -1) throw new Error('La respuesta del modelo no contenía JSON');
    const open = candidate[start] as '{' | '[';
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < candidate.length; i += 1) {
      const char = candidate[i] as string;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) return JSON.parse(candidate.slice(start, i + 1)) as T;
      }
    }
    throw new Error('JSON incompleto en la respuesta del modelo');
  }
}

export async function chat(options: ChatOptions): Promise<ChatResponse> {
  const model = options.model ?? env.OPENROUTER_MODEL;

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2000,
  };
  if (options.json) body.response_format = { type: 'json_object' };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = env.OPENROUTER_SITE_URL;
    headers['X-Title'] = env.OPENROUTER_APP_NAME;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const retryable = response.status === 429 || response.status >= 500;

        log.warn(
          `OpenRouter respondió ${response.status} (intento ${attempt}/${MAX_ATTEMPTS})`,
          detail.slice(0, 400),
        );

        if (retryable && attempt < MAX_ATTEMPTS) {
          await sleep(800 * 2 ** (attempt - 1));
          continue;
        }
        throw HttpError.upstream(
          response.status === 429
            ? 'Se ha alcanzado el límite de uso de la IA. Inténtalo más tarde.'
            : `La IA respondió con un error (${response.status}).`,
          detail.slice(0, 400),
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('La IA devolvió una respuesta vacía');

      return {
        content,
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Los errores de la app (HttpError) ya son definitivos: no reintentar.
      if (error instanceof HttpError) throw error;
      if (options.signal?.aborted) throw error;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(800 * 2 ** (attempt - 1));
    }
  }

  log.error('Fallo la llamada a OpenRouter', lastError);
  throw HttpError.upstream('No se pudo contactar con el servicio de IA.', lastError?.message);
}

/** Pide JSON y valida el esquema con Zod; reintenta una vez si no encaja. */
export async function chatJson<T>(
  options: ChatOptions & { schema: { parse: (value: unknown) => T }; repairPrompt?: string },
): Promise<T> {
  let lastInvalid: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages: ChatMessage[] =
      attempt === 0
        ? options.messages
        : [
            ...options.messages,
            { role: 'assistant', content: 'JSON inválido' },
            {
              role: 'user',
              content:
                options.repairPrompt ??
                'Tu respuesta anterior no era JSON válido. Devuelve SOLO el objeto JSON pedido, sin texto alrededor ni vallas de código.',
            },
          ];

    const { content } = await chat({ ...options, messages, json: true });
    try {
      return options.schema.parse(extractJson<unknown>(content));
    } catch (error) {
      lastInvalid = error instanceof Error ? error.message : String(error);
      log.warn(`La IA no devolvió el formato esperado (intento ${attempt + 1})`, lastInvalid);
    }
  }

  throw HttpError.upstream('La IA no devolvió una respuesta válida.', lastInvalid);
}
