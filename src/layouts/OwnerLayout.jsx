import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useOwnerLayoutData } from '@/hooks/useOwnerLayoutData';
import { APP_CONFIG } from '@/config/app.config';
import { cn } from '@/lib/utils';
import ApperIcon from '@/components/ApperIcon';
import UserMenu from '@/components/UserMenu';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { getLanguage, setLanguage, tr } from '@/services/i18n';
import LanguageRuntime from '@/components/LanguageRuntime';

export default function OwnerLayout() {
  const { user, logout, homeRoute, navItems, navGroups, initials, displayName, counts } = useOwnerLayoutData();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [language, setLanguageState] = useState(getLanguage);
  const profileLabel = tr(String(user?.profile ?? '').replace(/_c$/, '') || 'Account', language);

  function changeLanguage(nextLanguage) {
    const next = setLanguage(nextLanguage);
    setLanguageState(next);
    window.location.reload();
  }
  const grouped = navGroups.length ? navGroups : [{ label: null, items: navItems }];

  const navigation = (
    <nav className="space-y-5" aria-label="Primary navigation">
      {grouped.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label && <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">{tr(group.label, language)}</div>}
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === homeRoute || item.to === '/admin' || item.to === '/admin/provider-onboarding'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                    isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )
                }
              >
                <ApperIcon name={item.icon ?? 'Circle'} size={17} />
                <span className="flex-1 truncate">{tr(item.label, language)}</span>
                {counts[item.to] != null && (
                  <span className="rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[11px] text-sidebar-foreground/70">{counts[item.to]}</span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-svh bg-background text-foreground lg:grid lg:grid-cols-[var(--spacing-sidebar)_1fr]">
      <LanguageRuntime />
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:fixed lg:inset-y-0 lg:flex lg:w-[var(--spacing-sidebar)] lg:flex-col lg:px-3 lg:py-5">
        <div className="flex items-center gap-3 px-3 pb-6">
          <Link to="/" className="block min-w-0" aria-label="LOCAL — Happy to Help">
            <img src="/local-logo-dark.svg" alt="LOCAL — Happy to Help" className="h-12 w-auto max-w-full" />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{navigation}</div>
        <div className="border-t border-sidebar-border pt-4">
          <UserMenu user={user} initials={initials} displayName={displayName} logout={logout} />
        </div>
      </aside>
      <div className="lg:col-start-2">
        <header className="sticky top-0 z-30 flex min-h-(--spacing-header) items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
          <button type="button" className="rounded-md border border-border p-2 lg:hidden" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">
            <ApperIcon name="Menu" size={18} />
          </button>
          <Link to="/" className="block lg:hidden" aria-label="LOCAL — Happy to Help">
            <img src="/local-logo.svg" alt="LOCAL — Happy to Help" className="h-10 w-auto" />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center rounded-full border border-border bg-muted/30 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => changeLanguage('en')}
                className={'rounded-full px-2.5 py-1 transition ' + (language === 'en' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                aria-pressed={language === 'en'}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => changeLanguage('hi')}
                className={'rounded-full px-2.5 py-1 transition ' + (language === 'hi' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                aria-pressed={language === 'hi'}
              >
                हिन्दी
              </button>
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{displayName}</div>
              <div className="text-xs text-muted-foreground">{profileLabel}</div>
            </div>
            <div className="lg:hidden">
              <UserMenu user={user} initials={initials} displayName={displayName} logout={logout} />
            </div>
          </div>
        </header>
        {mobileOpen && <div className="border-b border-border bg-sidebar p-3 lg:hidden">{navigation}</div>}
        <main className="min-w-0 p-4 md:p-6 lg:p-8">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}