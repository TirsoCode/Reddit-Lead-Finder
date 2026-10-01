import { useEffect, useState, type FormEvent } from 'react';
import { isAuthConfigured, signIn, signInWithGoogle, signUp, useDevAuth } from '../lib/auth';
import { Spinner } from '../components/ui';
import { IconArrowLeft } from '../components/icons';
import { Logo } from '../components/Logo';

type Mode = 'login' | 'signup';

const BENEFITS = [
  'Pegas tu URL y la app entiende qué vendes y qué problema resuelves',
  'Encuentra posts recientes de gente con ese mismo problema',
  'Cada post puntuado del 1 al 100 según lo bien que encaja',
  'Respuestas en español listas para copiar y pegar',
];

interface AuthPageProps {
  /** Vuelve a la portada pública. Si no se pasa, el acceso es a pantalla completa. */
  onBack?: () => void;
}

export function AuthPage({ onBack }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || password.length < 6) {
      setError('Introduce un email válido y una contraseña de 6 caracteres o más.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo iniciar sesión';
      setError(translateAuthError(message));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo conectar con Google. Revisa la configuración de Supabase.',
      );
      setGoogleLoading(false);
    }
  }

  if (!isAuthConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-5 dark:bg-neutral-950">
        <div className="card max-w-md p-7 text-center">
          <h1 className="font-display text-xl font-bold text-ink dark:text-neutral-100">Falta configuración</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted dark:text-neutral-400">
            Añade <code className="rounded bg-surface-muted dark:bg-neutral-800 px-1.5 py-0.5">VITE_SUPABASE_URL</code> y{' '}
            <code className="rounded bg-surface-muted dark:bg-neutral-800 px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code> a tu
            archivo <code className="rounded bg-surface-muted dark:bg-neutral-800 px-1.5 py-0.5">.env</code> y reinicia la
            aplicación.
          </p>        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        {/* Formulario */}
        <div className="flex items-center justify-center px-5 py-12 sm:px-10">
          <div className="w-full max-w-sm">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="btn-ghost mb-7 -ml-2 px-2 text-[13px] text-ink-muted dark:text-neutral-400"
              >
                <IconArrowLeft className="h-4 w-4" />
                Volver
              </button>
            ) : null}

            <div className="mb-9">
              <Logo />
            </div>

            <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-ink dark:text-neutral-100">
              {mode === 'signup' ? 'Crea tu cuenta gratis' : 'Entra en tu cuenta'}
            </h1>
            <p className="mt-2 text-sm text-ink-muted dark:text-neutral-400">
              {mode === 'signup'
                ? 'Sin invitaciones ni tarjeta. Solo necesitas la URL de tu producto.'
                : 'Vuelve a ver los posts donde puede estar tu próximo cliente.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@email.com"
                  className="input"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="input"
                  required
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-lg bg-brand-50 dark:bg-brand-500/15 px-3.5 py-2.5 text-sm text-brand-800 dark:text-brand-300">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p className="rounded-lg bg-surface-muted dark:bg-neutral-800 px-3.5 py-2.5 text-sm text-ink-soft dark:text-neutral-300">
                  {notice}
                </p>
              ) : null}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <Spinner className="h-4 w-4" /> : null}
                {mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-surface-line" />
              <span className="text-xs uppercase tracking-wide text-ink-faint dark:text-neutral-500">o</span>
              <span className="h-px flex-1 bg-surface-line" />
            </div>

            {useDevAuth ? (
              <p className="rounded-lg bg-surface-muted dark:bg-neutral-800 px-3.5 py-2.5 text-center text-xs text-ink-soft dark:text-neutral-300">
                Modo local: la autenticación la sirve el propio backend (Supabase está desactivado
                con <code>DEV_AUTH=true</code>).
              </p>
            ) : (
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="btn-secondary w-full"
              >
                {googleLoading ? <Spinner className="h-4 w-4" /> : <GoogleMark />}
                Continuar con Google
              </button>
            )}

            <p className="mt-6 text-center text-sm text-ink-muted dark:text-neutral-400">
              {mode === 'signup' ? '¿Ya tienes cuenta?' : '¿Todavía no tienes cuenta?'}{' '}
              <button
                type="button"
                onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
                className="font-medium text-brand-600 dark:text-brand-400 underline-offset-2 hover:underline"
              >
                {mode === 'signup' ? 'Inicia sesión' : 'Regístrate gratis'}
              </button>
            </p>
          </div>
        </div>

        {/* Propuesta de valor */}
        <div className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-center lg:px-14">
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 22% 28%, #E63946 0, transparent 42%), radial-gradient(circle at 78% 72%, #E63946 0, transparent 38%)',
            }}
          />
          <div className="relative max-w-md">
            <h2 className="font-display text-[34px] font-bold leading-[1.15] tracking-tight text-white">
              Tus próximos clientes ya están escribiendo en Reddit.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/70">
              Solo pega la URL de tu producto. RedditLeads lee tu web, deduce a quién le duele tu
              problema y te enseña cada conversación donde esa persona está buscando una solución.
            </p>

            <ul className="mt-8 space-y-3.5">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex gap-3 text-sm text-white/80">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z" />
      <path
        fill="#EA4335"
        d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10A5.9 5.9 0 0 1 12 5.9Z"
      />
    </svg>
  );
}

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (lower.includes('user already registered')) {
    return 'Ya existe una cuenta con ese email. Prueba a iniciar sesión.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirma tu email antes de entrar. Revisa tu bandeja de entrada.';
  }
  if (lower.includes('rate limit')) {
    return 'Demasiados intentos. Espera unos segundos y vuelve a probar.';
  }
  return message;
}
