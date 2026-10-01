import { useEffect, useState } from 'react';
import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isAuthConfigured = isSupabaseConfigured;

/**
 * `createClient` lanza si recibe cadenas vacías, así que cuando faltan las
 * variables usamos una URL válida de relleno. En ese estado nunca se llega a
 * hacer una petición real: `isAuthConfigured` es false y la interfaz lo avisa.
 */
export const supabase = createClient(
  supabaseUrl || 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey || 'anon-key-sin-configurar',
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

type Listener = () => void;

const listeners = new Set<Listener>();

let session: Session | null = null;
let ready = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function toSession(value: SupabaseSession): Session {
  return { userId: value.user.id, email: value.user.email ?? null };
}

/** Token actual para las llamadas a la API. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string): Promise<void> {
  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw signUpError;

  // Si el proyecto tiene la confirmación por correo activada, la cuenta existe
  // pero aún no hay sesión: avisamos en lugar de fallar con un error genérico.
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
  await supabase.auth.signOut();
}

if (isSupabaseConfigured) {
  void supabase.auth.getSession().then(({ data }) => {
    session = data.session ? toSession(data.session) : null;
    ready = true;
    emit();
  });

  supabase.auth.onAuthStateChange((_event, next) => {
    session = next ? toSession(next) : null;
    ready = true;
    emit();
  });
} else {
  ready = true;
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
