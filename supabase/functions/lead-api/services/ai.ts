import { env, isPlaceholderSecret } from '../env.ts';
import { HttpError } from '../errors.ts';
import { createLogger } from '../logger.ts';

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

  // Con la clave de ejemplo del `.env.example` OpenRouter devuelve un 401 sin
  // explicar nada útil. Se corta aquí con un mensaje que sí dice qué hacer.
  if (isPlaceholderSecret(env.OPENROUTER_API_KEY)) {
    throw HttpError.upstream(
      'La IA no está configurada: falta una clave real de OpenRouter (OPENROUTER_API_KEY en .env).',
      'placeholder-key',
    );
  }

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

        // Una clave inválida no mejora reintentando.
        if (response.status === 401 || response.status === 403) {
          throw HttpError.invalidCredentials(
            'La clave de OpenRouter no es válida. Revisa OPENROUTER_API_KEY en .env.',
            detail.slice(0, 400),
          );
        }

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

/* ============================================================================
   Estado de la conexión con la IA
   ============================================================================ */

export type AiStatus = 'ready' | 'unconfigured' | 'invalid_key' | 'unreachable' | 'error';

export interface AiHealth {
  status: AiStatus;
  /** Explicación en español, lista para mostrar en la interfaz. */
  message: string;
  provider: string;
  model: string;
  scoringModel: string;
  /** `true` cuando la clave es la de ejemplo del `.env.example`. */
  placeholderKey: boolean;
  /** Respuesta real del modelo o detalle del error de OpenRouter. */
  detail?: string;
}

/**
 * Comprueba contra OpenRouter si la clave y el modelo responden de verdad.
 *
 * Hace una petición mínima (pide una respuesta de una sola palabra) en lugar de
 * fiarte de que la variable existe: así el usuario sabe si la IA está conectada
 * antes de analizar su web y se sorprende al recibir el error.
 */
export async function checkAiHealth(): Promise<AiHealth> {
  const base = {
    provider: 'OpenRouter',
    model: env.OPENROUTER_MODEL,
    scoringModel: env.scoringModel,
    placeholderKey: isPlaceholderSecret(env.OPENROUTER_API_KEY),
  };

  if (base.placeholderKey) {
    return {
      ...base,
      status: 'unconfigured',
      message:
        'Falta la clave de OpenRouter. Copia .env.example a .env y pon tu clave real en OPENROUTER_API_KEY.',
    };
  }

  try {
    const { content } = await chat({
      model: env.OPENROUTER_MODEL,
      temperature: 0,
      maxTokens: 16,
      messages: [{ role: 'user', content: 'Responde únicamente con la palabra: listo' }],
    });

    return {
      ...base,
      status: 'ready',
      message: `La IA responde correctamente con ${env.OPENROUTER_MODEL}.`,
      detail: content.trim().slice(0, 80),
    };
  } catch (error) {
    const detail = error instanceof HttpError ? error.details : undefined;
    const code = error instanceof HttpError ? error.code : null;

    // Una clave rechazada (401/403) es un problema de configuración, no de red.
    if (code === 'invalid_credentials') {
      return {
        ...base,
        status: 'invalid_key',
        message:
          error instanceof Error
            ? error.message
            : 'OpenRouter rechazó la clave. Revisa OPENROUTER_API_KEY en .env.',
        detail: typeof detail === 'string' ? detail.slice(0, 300) : undefined,
      };
    }

    const networkIssue = error instanceof HttpError && error.status === 502;

    return {
      ...base,
      status: networkIssue ? 'unreachable' : 'error',
      message: networkIssue
        ? 'No se pudo contactar con OpenRouter. Revisa la conexión, la cuota de la clave y vuelve a intentarlo.'
        : error instanceof Error
          ? error.message
          : 'Error desconocido al conectar con la IA.',
      detail: typeof detail === 'string' ? detail.slice(0, 300) : undefined,
    };
  }
}
