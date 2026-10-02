import { Link, NavLink } from 'react-router-dom';
import { cx } from '../lib/format';
import { IconClose, IconDashboard, IconLogout } from './icons';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof IconDashboard;
  end?: boolean;
  badge?: number;
}

interface SidebarProps {
  items: NavItem[];
  email: string | null;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ items, email, onSignOut, mobileOpen, onCloseMobile }: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden dark:bg-black/60"
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-surface-line bg-white',
          'transition-transform duration-200 lg:translate-x-0 dark:border-neutral-800 dark:bg-neutral-900',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link
            to="/portada"
            onClick={onCloseMobile}
            aria-label="Ir a la portada"
            title="Ir a la portada"
            className="focus-ring -m-1 rounded-lg p-1 transition hover:opacity-75"
          >
            <Logo />
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="btn-ghost -mr-1 lg:hidden"
          >
            <IconClose className="h-[18px] w-[18px]" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'text-ink-muted hover:bg-surface-subtle hover:text-ink dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span
                      className={cx(
                        'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                        isActive
                          ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-100'
                          : 'bg-surface-muted text-ink-soft dark:bg-neutral-800 dark:text-neutral-300',
                      )}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-surface-line p-3 dark:border-neutral-800">
          {email && <p className="truncate px-2.5 pb-2 text-xs text-ink-muted dark:text-neutral-400">{email}</p>}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSignOut}
              className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <IconLogout className="h-[17px] w-[17px]" />
              Cerrar sesión
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}
