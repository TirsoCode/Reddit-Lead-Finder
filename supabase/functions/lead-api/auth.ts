import type { User } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { env } from './env.ts';
import { HttpError } from './errors.ts';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface CachedUser {
  user: User;
  expiresAt: number;
}

/**
 * Caché corta de validaciones: verificar el JWT contra Supabase en cada petición
 * añade latencia y carga innecesaria. 60 s es un punto razonable (si el usuario
 * cierra sesión, el token deja de ser válido para la API igualmente).
 */
const USER_TTL_MS = 60_000;
const userCache = new Map<string, CachedUser>();

function cacheKey(token: string): string {
  // El JWT es largo; solo guardamos una huella para no retenerlo en memoria.
  // SHA-256 y no un hash propio: una colisión aquí devolvería el usuario de
  // otro token, es decir, los datos de otra cuenta.
  return createHash('sha256').update(token).digest('hex');
}

/** Valida un JWT de Supabase y devuelve su usuario. */
async function verifySupabaseToken(token: string): Promise<User> {
  const key = cacheKey(token);
  const cached = userCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw HttpError.unauthorized('Sesión inválida o caducada');
  }

  if (userCache.size > 500) userCache.clear();
  userCache.set(key, { user: data.user, expiresAt: Date.now() + USER_TTL_MS });
  return data.user;
}

export interface AuthedRequest {
  user: User;
  userId: string;
  email: string | null;
}

/**
 * Exige una cabecera Authorization: Bearer <jwt de Supabase>.
 *
 * La pasarela de Supabase también valida el JWT (`verify_jwt`), pero esta
 * comprobación se mantiene porque es la que devuelve los mensajes en español y
 * porque el endpoint del cron entra por otro camino.
 */
export async function requireAuth(req: Request): Promise<AuthedRequest> {
  const header = req.headers.get('authorization');
  const token = header ?? undefined;

  if (!token?.startsWith('Bearer ')) {
    throw HttpError.unauthorized('Falta la cabecera Authorization');
  }

  const user = await verifySupabaseToken(token.slice('Bearer '.length).trim());
  return {
    user,
    userId: user.id,
    email: typeof user.email === 'string' ? user.email : null,
  };
}

/**
 * Autoriza la llamada de `pg_cron`. No hay usuario Supabase detrás, así que se
 * compara el secreto que se guarda en Supabase Vault con el de la petición.
 */
export function requireCronSecret(req: Request): void {
  const provided = req.headers.get('x-cron-secret') ?? '';
  const expected = env.CRON_SECRET.trim();

  // Comparación de longitud constante: no regalar información con el tiempo.
  if (provided.length !== expected.length) {
    throw HttpError.unauthorized('Cron no autorizado');
  }

  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (diff !== 0) throw HttpError.unauthorized('Cron no autorizado');
}
