import { query, queryOne } from '../db.ts';
import type { ProductAnalysis, Profile, Tone } from '../types.ts';

/** Crea el perfil si el trigger de Supabase aún no lo ha hecho (registro social). */
export async function ensureProfile(userId: string): Promise<Profile> {
  const existing = await getProfile(userId);
  if (existing) return existing;

  const created = await queryOne<ProfileRow>(
    `insert into public.profiles (id)
     values ($1)
     on conflict (id) do nothing
     returning *`,
    [userId],
  );
  if (created) return mapProfile(created);

  const fallback = await getProfile(userId);
  if (fallback) return fallback;
  throw new Error(`No se pudo crear el perfil del usuario ${userId}`);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await queryOne<ProfileRow>(`select * from public.profiles where id = $1`, [userId]);
  return row ? mapProfile(row) : null;
}

export async function setProductUrl(userId: string, url: string | null): Promise<Profile> {
  const row = await queryOne<ProfileRow>(
    // Cambiar la URL invalida el análisis anterior: hay que volver a analizar.
    `update public.profiles
        set product_url = $2,
            analysis_status = 'idle',
            analysis_error = null,
            updated_at = now()
      where id = $1
      returning *`,
    [userId, url],
  );
  if (!row) throw new Error('Perfil no encontrado');
  return mapProfile(row);
}

export async function setTone(userId: string, tone: Tone): Promise<Profile> {
  const row = await queryOne<ProfileRow>(
    `update public.profiles set tone = $2, updated_at = now() where id = $1 returning *`,
    [userId, tone],
  );
  if (!row) throw new Error('Perfil no encontrado');
  return mapProfile(row);
}

export async function setTimezone(userId: string, timezone: string): Promise<Profile> {
  const row = await queryOne<ProfileRow>(
    `update public.profiles set timezone = $2, updated_at = now() where id = $1 returning *`,
    [userId, timezone],
  );
  if (!row) throw new Error('Perfil no encontrado');
  return mapProfile(row);
}

export async function markAnalysisPending(userId: string): Promise<void> {
  await query(
    `update public.profiles
        set analysis_status = 'pending', analysis_error = null, updated_at = now()
      where id = $1`,
    [userId],
  );
}

export async function saveAnalysis(
  userId: string,
  analysis: ProductAnalysis,
): Promise<Profile> {
  const row = await queryOne<ProfileRow>(
    `update public.profiles
        set product_name = $2,
            product_summary = $3,
            problem = $4,
            audience = $5,
            keywords = $6,
            subreddits = $7,
            search_queries = $8,
            analysis = $9,
            analysis_status = 'ready',
            analysis_error = null,
            analyzed_at = now(),
            updated_at = now()
      where id = $1
      returning *`,
    [
      userId,
      analysis.product_name,
      analysis.summary,
      analysis.problem,
      analysis.audience,
      analysis.keywords,
      analysis.subreddits,
      analysis.search_queries,
      JSON.stringify(analysis),
    ],
  );
  if (!row) throw new Error('Perfil no encontrado');
  return mapProfile(row);
}

export async function markAnalysisFailed(userId: string, message: string): Promise<void> {
  await query(
    `update public.profiles
        set analysis_status = 'error', analysis_error = $2, updated_at = now()
      where id = $1`,
    [userId, message.slice(0, 500)],
  );
}

/** Perfiles listos para buscar: tienen URL analizada. */
export async function listActiveProfiles(limit = 200): Promise<Profile[]> {
  const rows = await query<ProfileRow>(
    `select * from public.profiles
      where product_url is not null
        and analysis_status = 'ready'
      order by analyzed_at asc nulls last
      limit $1`,
    [limit],
  );
  return rows.map(mapProfile);
}

/**
 * Perfiles listos para buscar, ordenados por antigüedad: primero los que llevan
 * más tiempo sin pasar por una búsqueda.
 *
 * La diferencia con `listActiveProfiles` importa en el despliegue en Supabase:
 * cada invocación de la Edge Function solo puede atender a unos pocos usuarios
 * (150 s de techo), así que la tanda coge un trozo y la siguiente invocación
 * continúa donde quedó esta. Sin este orden, siempre atendería a los mismos.
 */
export async function listProfilesNeedingScan(limit: number): Promise<Profile[]> {
  const rows = await query<ProfileRow>(
    `select p.*
       from public.profiles p
      where p.product_url is not null
        and p.analysis_status = 'ready'
      order by coalesce(
               (select max(r.started_at) from public.scan_runs r where r.user_id = p.id),
               'epoch'::timestamptz
             ) asc
      limit $1`,
    [limit],
  );
  return rows.map(mapProfile);
}

export interface ProfileRow {
  id: string;
  product_url: string | null;
  product_name: string | null;
  tone: Tone;
  product_summary: string | null;
  problem: string | null;
  audience: string | null;
  keywords: string[] | null;
  subreddits: string[] | null;
  search_queries: string[] | null;
  analysis: ProductAnalysis | null;
  analysis_status: Profile['analysis_status'];
  analysis_error: string | null;
  analyzed_at: Date | null;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    ...row,
    keywords: row.keywords ?? [],
    subreddits: row.subreddits ?? [],
    search_queries: row.search_queries ?? [],
  };
}
