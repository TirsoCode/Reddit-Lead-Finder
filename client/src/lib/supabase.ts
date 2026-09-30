import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase usado **solo** para autenticación (email + Google OAuth).
 * Los datos nunca se leen de aquí: todo pasa por la API de Express.
 *
 * Si las variables no están definidas (p. ej. en desarrollo local) se usan valores
 * de relleno: `createClient` lanza si recibe cadenas vacías, así que el fallback
 * usa `||` y no `??`, y siempre debe ser una URL válida.
 */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'local-dev-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
