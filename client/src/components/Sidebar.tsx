import { NavLink } from 'react-router-dom';
import { cx } from '../lib/format';
import { IconClose, IconDashboard, IconLogout } from './icons';

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

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink">
        <span className="grid h-3.5 w-3.5 grid-cols-2 gap-[2px]">
          <span className="rounded-[1px] bg-brand-500" />
          <span className="rounded-[1px] bg-white" />
          <span className="col-span-2 rounded-[1px] bg-brand-500" />
        </span>
      </span>
      <span className="font-display text-[17px] font-bold tracking-tight text-ink">
        Reddit<span className="text-brand-500">Leads</span>
      </span>
    </div>
  );
}

export function Sidebar({ items, email, onSignOut, mobileOpen, onCloseMobile }: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-ink/25 lg:hidden"
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-surface-line bg-white',
          'transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
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
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
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
                        isActive ? 'bg-brand-100 text-brand-700' : 'bg-surface-muted text-ink-soft',
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

        <div className="border-t border-surface-line p-3">
          {email && <p className="truncate px-2.5 pb-2 text-xs text-ink-muted">{email}</p>}
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
          >
            <IconLogout className="h-[17px] w-[17px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
