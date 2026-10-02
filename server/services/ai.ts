import { env, isPlaceholderSecret } from '../env.js';
import { HttpError } from '../errors.js';
import { createLogger } from '../logger.js';
import { discoveredModels, isSaturated, learnFromOutcome } from './aiModels.js';

const log = createLogger('openrouter');

const BASE_URL = 'https://openrouter.ai/api/v1';

/** Intentos por modelo. Al cambiar de modelo el reintento ya es de otro sitio. */
const MAX_ATTEMPTS = 2;

/**
 * Tope de tiempo para recorrer la lista de modelos.
 *
 * La búsqueda programada tiene 105 s de presupuesto (`SCAN_TIME_BUDGET_MS`) y
 * calificar un post llama a la IA varias veces: si cada modelo fallara y se
 * esperara a todos, la tanda se quedaría sin tiempo a mitad.
 */
const FAILOVER_BUDGET_MS = 40_000;

/**
 * Lo único que ve el cliente cuando la IA falla.
 *
 * El proveedor, el modelo y el nombre de las variables se quedan en el log del
 * servidor: quien paga el producto no tiene por qué leerlos, y publicarlos
 * además ata el producto a un proveedor que se puede cambiar. Estos mensajes
 * viajan también a `analysis_error` y a `scan_runs.error`, que se leen en el
 * panel del cliente, así que deben ser presentables.
 */
const AI_UNAVAILABLE_MESSAGE = 'No hemos podido completar la petición ahora mismo. Inténtalo más tarde.';


/** Tope de modelos por llamada, contando los que se descubren solos. */
const MAX_CHAIN_LENGTH = 16;

/**
 * El último modelo que respondió bien, para intentarlo primero la próxima vez.
 *
 * Los gratuitos se saturan y se liberan sin avisar, así que quien acaba de
 * contestar hace ahora mismo es el que menos probable es que falle en la
 * siguiente llamada. El resto del historial (cuántas veces ha fallado cada uno y
 * durante cuánto conviene saltárselo) lo lleva `services/aiModels.ts`.
 */
let preferredModel: string | null = null;

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
  /** El modelo que acabó contestando, que no siempre es el principal. */
  model: string;
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

/**
 * Error de un modelo concreto, con lo justo para decidir si merece la pena
 * probar otro: un 429 del proveedor es saturación, pero un 401 es una clave
 * mala y ningún otro modelo lo arregla.
 */
class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly fatal: boolean,
  ) {
    super(`OpenRouter respondió ${status}`);
    this.name = 'ProviderError';
  }
}

/** Un 401 (clave rechazada) o un 402 (sin saldo) no se arregla cambiando de modelo. */
function isFatalStatus(status: number): boolean {
  return status === 401 || status === 402;
}

/**
 * Los modelos a probar, en orden: el que se ha pedido, sus reservas, y por
 * delante el último que respondió bien.
 *
 * `includeDiscovered` añade al final los modelos gratuitos que OpenRouter tenga
 * ahora mismo y no estén en la lista configurada. Así, cuando quitan un modelo
 * y añaden otro, el nuevo entra solo sin tocar el código ni el `.env`.
 */
export function modelChain(
  primary: string = env.OPENROUTER_MODEL,
  includeDiscovered: string[] = [],
): string[] {
  // Tope por si el catálogo deviene enorme: los que sobran no llegan a probarse,
  // pero mantienen la cadena acotada y el tiempo de espera, también.
  const configured = [
    ...new Set([primary, ...env.fallbackModels, ...includeDiscovered]),
  ].slice(0, MAX_CHAIN_LENGTH);

  const fresh = configured.filter((model) => !isSaturated(model));
  // Si todos están en cuarentena no se cae a uno vacío: es mejor reintentar un
  // modelo saturado que quedarse sin respuesta.
  const usable = fresh.length > 0 ? fresh : configured;

  if (preferredModel && usable.includes(preferredModel)) {
    return [preferredModel, ...usable.filter((model) => model !== preferredModel)];
  }
  return usable;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = env.OPENROUTER_SITE_URL;
    headers['X-Title'] = env.OPENROUTER_APP_NAME;
  }
  return headers;
}

/** Una llamada a un modelo. Falla con `ProviderError` si hay que cambiar de modelo. */
async function callOnce(model: string, options: ChatOptions): Promise<ChatResponse> {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2000,
  };
  if (options.json) body.response_format = { type: 'json_object' };

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ProviderError(
      response.status,
      detail.slice(0, 400),
      isFatalStatus(response.status),
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = payload.choices?.[0]?.message?.content;

  // Un 200 con el cuerpo vacío es tan común en los modelos gratuitos como el
  // 429: OpenRouter acepta la petición y el proveedor no entrega nada. Pasa a
  // los dos por el mismo camino.
  if (!content?.trim()) {
    throw new ProviderError(200, 'El modelo devolvió una respuesta vacía', false);
  }

  return {
    content,
    model,
    usage: {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
    },
  };
}

export async function chat(options: ChatOptions): Promise<ChatResponse> {
  // Con la clave de ejemplo del `.env.example` OpenRouter devuelve un 401 sin
  // explicar nada útil. Se corta aquí con un mensaje que sí dice qué hacer.
  if (isPlaceholderSecret(env.OPENROUTER_API_KEY)) {
    throw HttpError.upstream(AI_UNAVAILABLE_MESSAGE, 'Falta OPENROUTER_API_KEY real en el servidor');
  }

  const discovered = await discoveredModels(env.fallbackModels);
  const chain = modelChain(options.model ?? env.OPENROUTER_MODEL, discovered);
  const deadline = Date.now() + FAILOVER_BUDGET_MS;
  let lastError: unknown = null;

  for (const model of chain) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (Date.now() > deadline) {
        log.warn('Se acabó el tiempo del failover; no se prueban más modelos');
        throw HttpError.upstream(
          AI_UNAVAILABLE_MESSAGE,
          lastError instanceof Error ? lastError.message : undefined,
        );
      }

      try {
        const result = await callOnce(model, options);
        preferredModel = model;
        learnFromOutcome(model, true);

        if (model !== chain[0]) {
          log.info(`Se usa ${model} porque ${chain[0]} no estaba disponible`);
        }
        return result;
      } catch (error) {
        // Cortar antes de tiempo no es culpa del modelo: se propaga tal cual.
        if (options.signal?.aborted) throw error;

        if (error instanceof ProviderError) {
          lastError = error;

          if (error.status === 401) {
            // El detalle (cuerpo de la respuesta del proveedor) no se enseña al
            // cliente: solo al log.
            log.error('El proveedor rechazó la clave de la IA', error.detail);
            throw HttpError.invalidCredentials(AI_UNAVAILABLE_MESSAGE, 'Credenciales de IA rechazadas');
          }
          if (error.status === 402) {
            log.error('La cuenta del proveedor de IA no tiene saldo', error.detail);
            throw HttpError.upstream(AI_UNAVAILABLE_MESSAGE, 'Sin saldo en la cuenta de IA');
          }

          if (attempt < MAX_ATTEMPTS) {
            await sleep(800 * 2 ** (attempt - 1));
            continue;
          }

          // Se agotaron los intentos de este modelo: se marca para no volver a
          // él durante un rato y se pasa al siguiente de la lista.
          learnFromOutcome(model, false);
          log.warn(`${model} no respondió (${error.status}); se prueba otro modelo`, error.detail);
        } else {
          lastError = error;
          if (attempt === MAX_ATTEMPTS) {
            learnFromOutcome(model, false);
            break;
          }
          await sleep(800 * 2 ** (attempt - 1));
        }
      }
    }
  }

  log.error('Ninguno de los modelos de IA respondió', lastError);
  throw HttpError.upstream(
    AI_UNAVAILABLE_MESSAGE,
    lastError instanceof Error ? lastError.message : undefined,
  );
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

  throw HttpError.upstream(AI_UNAVAILABLE_MESSAGE, lastInvalid);
}
