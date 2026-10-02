import { queryOne } from '../db.js';

/** Lo que sabemos de un modelo del catálogo de OpenRouter. */
export interface CatalogueModel {
  id: string;
  /** Tokens de contexto. Se guarda pero no se usa para ordenar: ver `aiModels.ts`. */
  contextLength: number;
  /**
   * `true` si declara soportar `response_format`, que es lo que obliga al modelo
   * a devolver JSON en vez de prose. No todos lo hacen, y los que no lo hacen
   * acaban fallando más con las peticiones de `chatJson`.
   */
  structuredOutputs: boolean;
  /** Fecha en que OpenRouter retira el modelo, si la ha anunciado. */
  expiresAt: string | null;
}

/** Aciertos, fallos y cuarentena de un modelo. */
export interface ModelScore {
  ok: number;
  fail: number;
  /** Instante hasta el que conviene saltarse el modelo. */
  until?: string;
}

export interface Catalogue {
  models: CatalogueModel[];
  scores: Record<string, ModelScore>;
  refreshedAt: string;
}

interface CatalogueRow {
  models: CatalogueModel[] | string;
  scores: Record<string, ModelScore> | string;
  refreshed_at: string;
}

/** Lee la caché. `null` si no se ha descargado nunca. */
export async function readCatalogue(): Promise<Catalogue | null> {
  const row = await queryOne<CatalogueRow>(
    `select models, scores, refreshed_at from public.ai_model_catalogue where id = 1`,
  );
  if (!row) return null;

  // `jsonb` llega como objeto ya parseado; el tipo lo declara como unión
  // porque según el cliente puede llegar como texto.
  const asArray = (value: CatalogueModel[] | string): CatalogueModel[] => {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  };
  const asScores = (value: Record<string, ModelScore> | string): Record<string, ModelScore> => {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : {};
  };

  return {
    models: asArray(row.models),
    scores: asScores(row.scores),
    refreshedAt: new Date(row.refreshed_at).toISOString(),
  };
}

/** Guarda el catálogo y lo que se ha aprendido de cada modelo. */
export async function writeCatalogue(entry: Catalogue): Promise<void> {
  await queryOne<{ id: number }>(
    `insert into public.ai_model_catalogue (id, models, scores, refreshed_at)
     values (1, $1::jsonb, $2::jsonb, $3::timestamptz)
     on conflict (id) do update
        set models = excluded.models,
            scores = excluded.scores,
            refreshed_at = excluded.refreshed_at
     returning id`,
    [JSON.stringify(entry.models), JSON.stringify(entry.scores), entry.refreshedAt],
  );
}
