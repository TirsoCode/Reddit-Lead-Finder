import type { User } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { env } from './env.js';
import { HttpError } from './errors.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

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

/** Exige un cabecera Authorization: Bearer <jwt de Supabase>. */
export async function requireAuth(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<AuthedRequest> {
  const header = req.headers.authorization;
  const token = Array.isArray(header) ? header[0] : header;

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
