import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { IconDashboard, IconLeads, IconMenu, IconUser } from './icons';
import { Sidebar, type NavItem } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

interface LayoutProps {
  email: string | null;
  newLeads?: number;
  onSignOut: () => void;
}

/** Envuelve las páginas del panel; la ruta se resuelve en `<Outlet />`. */
export function Layout({ email, newLeads = 0, onSignOut }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
    { to: '/leads', label: 'Leads', icon: IconLeads, badge: newLeads },
    { to: '/perfil', label: 'Perfil', icon: IconUser },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Sidebar
        items={items}
        email={email}
        onSignOut={onSignOut}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-surface-line bg-white/90 px-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="btn-ghost -ml-2"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <span className="font-display text-[15px] font-bold tracking-tight">
            Reddit<span className="text-brand-500">Leads</span>
          </span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
          <div key={location.pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
