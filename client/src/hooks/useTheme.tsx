import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'redditleads-theme';

/** Aplica el tema antes de pintar la app, para que no haya destello al cargar. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  // 1. Lo que el usuario eligió en una visita anterior.
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;

  // 2. Si nunca lo eligió, lo que pida el sistema operativo.
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Comparte el tema entre todos los interruptores de la app.
 *
 * Hace falta un contexto y no un hook suelto porque el botón aparece a la vez en
 * la barra lateral y en la cabecera móvil: con estado local cada uno dibujaría el
 * icono del tema anterior al que acaba de pulsar el otro.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // El tema se lee de golpe en el primer render (y no en un efecto) para que el
  // interruptor muestre desde el principio el icono del tema activo.
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  // Red de seguridad: mantiene `<html>` y la preferencia del navegador alineados.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme necesita un ThemeProvider por encima');
  return context;
}

/**
 * Se llama en `main.tsx` antes de montar React. Poner la clase en `<html>`
 * desde el principio evita el flash blanco de las apps con tema oscuro.
 */
export function initTheme(): void {
  if (typeof window === 'undefined') return;
  applyTheme(readInitialTheme());
}