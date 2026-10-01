import { useTheme } from '../hooks/useTheme';
import { IconMoon, IconSun } from './icons';

/**
 * Interruptor de tema claro/oscuro. Se apoya en `useTheme`, que guarda la
 * elección en localStorage y aplica la clase `dark` sobre `<html>`.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={dark}
      title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={`btn-ghost px-2.5 ${className ?? ''}`}
    >
      {dark ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
      <span className="sr-only">{dark ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  );
}