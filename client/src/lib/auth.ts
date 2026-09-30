import { useEffect, useState } from 'react';
import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Modo de autenticación local: el backend trae su propio registro/login por email
 * (`DEV_AUTH=true` en el servidor + `VITE_DEV_AUTH=true` aquí). Sirve para
 * trabajar en local sin montar Supabase. En producción se usa Supabase siempre.
 */
const isDevAuth = import.meta.env.VITE_DEV_AUTH === 'true';

export const useDevAuth = isDevAuth && !isSupabaseConfigured;
export const isAuthConfigured = isSupabaseConfigured || useDevAuth;

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

export interface Session {
  userId: string;
  email: string | null;
}

const STORAGE_KEY = 'redditleads.dev.session';

type Listener = () => void;

const listeners = new Set<Listener>();

let session: Session | null = null;
let accessToken: string | null = null;
let ready = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function setSession(next: Session | null, token: string | null): void {
  session = next;
  accessToken = token;
  emit();
}

function toSession(value: SupabaseSession): Session {
  return { userId: value.user.id, email: value.user.email ?? null };
}

function readStoredSession(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Session & { token: string };
    session = { userId: parsed.userId, email: parsed.email ?? null };
    accessToken = parsed.token;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Token actual para las llamadas a la API. */
export async function getAccessToken(): Promise<string | null> {
  if (useDevAuth) return accessToken;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function devRequest(
  path: '/auth/register' | '/auth/login',
  email: string,
  password: string,
): Promise<void> {
  const response = await fetch(`/api/dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { token?: string; user?: { id: string; email: string }; error?: string }
    | null;

  if (!response.ok || !payload?.token || !payload.user) {
    throw new Error(payload?.error ?? 'No se pudo iniciar sesión.');
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ userId: payload.user.id, email: payload.user.email, token: payload.token }),
  );
  setSession({ userId: payload.user.id, email: payload.user.email }, payload.token);
}

export async function signIn(email: string, password: string): Promise<void> {
  if (useDevAuth) return devRequest('/auth/login', email, password);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string): Promise<void> {
  if (useDevAuth) return devRequest('/auth/register', email, password);

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw signUpError;

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error('Cuenta creada. Revisa tu correo para confirmarla si hace falta.');
  }
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (useDevAuth) {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null, null);
    return;
  }
  await supabase.auth.signOut();
  setSession(null, null);
}

if (useDevAuth) {
  readStoredSession();
  ready = true;
} else {
  void supabase.auth.getSession().then(({ data }) => {
    session = data.session ? toSession(data.session) : null;
    accessToken = data.session?.access_token ?? null;
    ready = true;
    emit();
  });

  supabase.auth.onAuthStateChange((_event, next) => {
    session = next ? toSession(next) : null;
    accessToken = next?.access_token ?? null;
    ready = true;
    emit();
  });
}

export function useAuth(): {
  session: Session | null;
  loading: boolean;
  signIn: typeof signIn;
  signUp: typeof signUp;
  signOut: typeof signOut;
  signInWithGoogle: typeof signInWithGoogle;
} {
  const [, force] = useState(0);

  useEffect(() => {
    const listener = () => force((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    session,
    loading: !ready,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
  };
}
