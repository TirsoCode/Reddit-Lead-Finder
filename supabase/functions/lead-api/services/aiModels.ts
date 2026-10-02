import { env } from '../env.ts';
import { createLogger } from '../logger.ts';
import {
  readCatalogue,
  writeCatalogue,
  type Catalogue,
  type CatalogueModel,
  type ModelScore,
} from '../repositories/aiModels.ts';

/**
 * Descubre qué modelos gratuitos hay disponibles ahora mismo, y aprende cuáles
 * sirven de verdad.
 *
 * El plan gratuito de OpenRouter cambia cada semana: desaparecen los que se
 * quedan sin capacidad y aparecen otros. En vez de mantener una lista escrita a
 * mano (que se quedaría vieja y, en cuanto uno de sus modelos desapareciera,
 * dejaría la app sin IA aunque quedaran diez libres), se pregunta a la API.
 *
 * Pero el catálogo no dice si un modelo funciona: solo da su nombre, su
 * contexto y los parámetros que dice admitir. Al probar los 17 modelos `:free`
 * que había al escribir esto, `gemma-4-26b` declaraba admitir `response_format`
 * y devolvía un 429, y `nemotron-3.5-lightning` tenía el mayor contexto de todos
 * y tardaba 98 segundos en responder. Ninguno de los dos datos que publica
 * OpenRouter sirven para prever eso, así que el orden no se saca de ahí: se saca
 * de lo que cada modelo ha respondido.
 *
 * De ahí las dos mitades de este módulo: `freeModelCatalogue()` mantiene la
 * lista al día (lo que entra y lo que sale), y `learnFromOutcome()` guarda qué
 * modelos han fallado y durante cuánto tiempo conviene saltarlos. Se guardan en
 * la tabla `ai_model_catalogue` porque las invocaciones de Edge Functions
 * arrancan en frío: si no, cada arranque volvería a pagar los mismos fallos.
 */

const log = createLogger('ai-models');

const CATALOGUE_URL = 'https://openrouter.ai/api/v1/models';
const REQUEST_TIMEOUT_MS = 15_000;

/** Cuántos modelos descubiertos se añaden al final de la lista. */
const MAX_DISCOVERED = 10;

/** Cuánto se salta un modelo que acaba de fallar. */
const SATURATION_COOLDOWN_MS = 10 * 60_000;

/**
 * Modelos que aparecen como gratuit pero no sirven para redactar texto.
 *
 * No hay forma de deducirlo del catálogo, así que la lista sale de probarlos
 * todos:
 *
 *   · `*safety*`   → clasificadores de contenido. Contestan "User Safety: safe".
 *   · `*code*`     → modelos de programación; hacen mal el español y el JSON.
 *   · `*laguna*`   → los modelos de código de Poolside, que no llevan "code" en
 *                    el nombre pero devolvieron cuerpo vacío.
 *   · `*inkling*`  → solo accesibles desde un "agentic harness"; dan un 403.
 *
 * Lo que no se pueda excluir aquí lo descarta solo el failover: si un modelo no
 * sirve, `services/ai.ts` lo marca y sigue con el siguiente.
 */
const NOT_A_TEXT_MODEL = [/safety/i, /code/i, /laguna/i, /inkling/i];

/** Lo que devuelve OpenRouter para cada modelo; aquí solo lo que se usa. */
interface RouterModel {
  id?: string;
  context_length?: number | null;
  supported_parameters?: string[] | null;
  expiration_date?: string | null;
  architecture?: { output_modalities?: string[] | null } | null;
}

/**
 * De los 465 modelos que publica OpenRouter, cuáles nos pueden servir.
 *
 * Se exige el sufijo `:free` y no solo el precio a cero: hay modelos con precio
 * cero que no forman parte del plan gratuito (los que se crean para un entorno
 * concreto y caducan a los pocos días).
 */
export function parseCatalogue(payload: unknown): CatalogueModel[] {
  const data = (payload as { data?: RouterModel[] } | null)?.data;
  if (!Array.isArray(data)) return [];

  const now = Date.now();

  return data
    .filter((model): model is RouterModel & { id: string } => typeof model.id === 'string')
    .filter((model) => model.id.endsWith(':free'))
    .filter((model) => !NOT_A_TEXT_MODEL.some((pattern) => pattern.test(model.id)))
    // Un modelo que no devuelve texto es inservible para nosotros.
    .filter((model) => (model.architecture?.output_modalities ?? ['text']).includes('text'))
    // Si ya ha caducado, ni mirarlo.
    .filter((model) => {
      if (!model.expiration_date) return true;
      const expiry = Date.parse(model.expiration_date);
      return Number.isNaN(expiry) || expiry > now;
    })
    .map((model) => ({
      id: model.id,
      contextLength: model.context_length ?? 0,
      structuredOutputs: (model.supported_parameters ?? []).includes('response_format'),
      expiresAt: model.expiration_date ?? null,
    }));
}

/* ============================================================================
   Lo que se ha aprendido de cada modelo
   ============================================================================ */

/**
 * Lo que un modelo ha hecho hasta ahora.
 *
 * `until` es la cuarentena: si un modelo acaba de fallar, `services/ai.ts` deja
 * de probarlo hasta esa hora en vez de volver a perder el tiempo en cada
 * llamada.
 */
interface ModelRecord {
  ok: number;
  fail: number;
  /** Instante hasta el que se salta el modelo, o `null` si está disponible. */
  until: number | null;
}

const records = new Map<string, ModelRecord>();

function recordFor(model: string): ModelRecord {
  const current = records.get(model);
  if (current) return current;
  const fresh: ModelRecord = { ok: 0, fail: 0, until: null };
  records.set(model, fresh);
  return fresh;
}

/** Espera a que se guarden los contadores antes de volver a escribir. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!memory) return;

    const scores: Record<string, ModelScore> = {};
    for (const [model, record] of records) {
      scores[model] = {
        ok: record.ok,
        fail: record.fail,
        until: record.until ? new Date(record.until).toISOString() : undefined,
      };
    }

    memory = { ...memory, scores };
    void writeCatalogue(memory).catch((error) =>
      log.warn('No se pudieron guardar los contadores de los modelos', error),
    );
  }, 2_000);
}

/**
 * Anota cómo ha ido un modelo.
 *
 * `ok` suma un acierto y levanta la cuarentena. `fail` suma un fallo y deja el
 * modelo en cuarentena diez minutos, para que las siguientes llamadas no vuelvan
 * a perder el tiempo en probarlo.
 */
export function learnFromOutcome(model: string, ok: boolean): void {
  const record = recordFor(model);

  if (ok) {
    record.ok += 1;
    record.until = null;
  } else {
    record.fail += 1;
    record.until = Date.now() + SATURATION_COOLDOWN_MS;
  }

  scheduleSave();
}

/** ¿Está este modelo en cuarentena en este momento? */
export function isSaturated(model: string): boolean {
  const until = records.get(model)?.until;
  return until !== undefined && until !== null && until > Date.now();
}

/**
 * Los modelos descubiertos que merece la pena probar, de mejor a peor.
 *
 * El criterio es solo uno: cuánto ha acertado cada uno. Los que aún no se han
 * probado van detrás, y entre ellos se usa como desempate lo poco que dice el
 * catálogo (que declare `response_format`), porque resulta ser mejor indicador
 * que el tamaño del contexto.
 */
export function rankByRecord(models: readonly CatalogueModel[]): string[] {
  const now = Date.now();

  return [...models]
    .sort((a, b) => {
      const ra = recordFor(a.id);
      const rb = recordFor(b.id);

      // En cuarentena va detrás, pero solo si queda alguien libre.
      const ca = ra.until !== null && ra.until > now;
      const cb = rb.until !== null && rb.until > now;
      if (ca !== cb) return ca ? 1 : -1;

      const triedA = ra.ok + ra.fail;
      const triedB = rb.ok + rb.fail;
      // Los ya probados mandan sobre los desconocidos.
      if ((triedA > 0) !== (triedB > 0)) return triedB > 0 ? -1 : 1;

      const rateA = triedA === 0 ? 0 : ra.ok / triedA;
      const rateB = triedB === 0 ? 0 : rb.ok / triedB;
      if (rateA !== rateB) return rateB - rateA;

      if (a.structuredOutputs !== b.structuredOutputs) return a.structuredOutputs ? -1 : 1;
      return a.id.localeCompare(b.id);
    })
    .map((model) => model.id);
}

/**
 * Los modelos a probar después de los que el usuario tiene configurados.
 *
 * No se mezclan con la lista del `.env`: esa es una decisión del usuario y va
 * primero. Solo se añaden aquí los que OpenRouter tiene disponibles ahora mismo
 * y no estaban escritos a mano, que es lo que hace que un modelo nuevo entre
 * solo y uno que desaparece se deje de probar.
 */
export async function discoveredModels(configured: readonly string[]): Promise<string[]> {
  try {
    const catalogue = await freeModelCatalogue();
    const known = new Set(configured);
    const fresh = catalogue.filter((model) => !known.has(model.id));
    return rankByRecord(fresh).slice(0, MAX_DISCOVERED);
  } catch (error) {
    log.warn('No se pudieron añadir modelos descubiertos', error);
    return [];
  }
}

/** Para probar: reinicia lo aprendido en memoria. */
export function __resetLearned(): void {
  memory = null;
  records.clear();
}

/* ============================================================================
   Caché del catálogo
   ============================================================================ */

/** Copia en memoria, para no tocar la base de datos en cada llamada a la IA. */
let memory: Catalogue | null = null;

function isFresh(entry: Catalogue): boolean {
  return Date.now() - Date.parse(entry.refreshedAt) < env.AI_CATALOGUE_TTL_HOURS * 3_600_000;
}

function loadMemory(entry: Catalogue): void {
  memory = entry;

  // Se recupera lo aprendido en otras instancias: si un modelo falló hace diez
  // minutos en una Edge Function, esta no tiene que averiguarlo otra vez.
  for (const [model, score] of Object.entries(entry.scores ?? {})) {
    records.set(model, {
      ok: score.ok ?? 0,
      fail: score.fail ?? 0,
      until: score.until ? Date.parse(score.until) : null,
    });
  }
}

/**
 * Los modelos gratuitos que hay ahora mismo.
 *
 * Si el catálogo nunca se ha descargado, se descarga. Si la descarga falla pero
 * hay una copia antigua en la base de datos, se usa esa: una lista de hace seis
 * horas vale más que ninguna.
 */
export async function freeModelCatalogue(): Promise<CatalogueModel[]> {
  if (memory && isFresh(memory)) return memory.models;

  let cached: Catalogue | null = null;

  try {
    cached = await readCatalogue();
    if (cached && isFresh(cached)) {
      loadMemory(cached);
      return cached.models;
    }
  } catch (error) {
    // Sin caché no pasa nada: se pregunta directamente a OpenRouter.
    log.warn('No se pudo leer la caché del catálogo', error);
  }

  try {
    const response = await fetch(CATALOGUE_URL, {
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      log.warn(`OpenRouter respondió ${response.status} al pedir el catálogo`);
      return cached?.models ?? [];
    }

    const models = parseCatalogue(await response.json());
    const entry: Catalogue = { models, scores: cached?.scores ?? {}, refreshedAt: new Date().toISOString() };
    memory = entry;

    // Los contadores que ya había se conservan: el catálogo cambia, el historial
    // de cada modelo no se borra porque OpenRouter haya añadido otro.
    void writeCatalogue(entry).catch((error) => log.warn('No se pudo guardar el catálogo', error));

    log.info(`Catálogo actualizado: ${models.length} modelos gratuitos`);
    return models;
  } catch (error) {
    log.warn('No se pudo descargar el catálogo de modelos', error);
    return cached?.models ?? [];
  }
}
