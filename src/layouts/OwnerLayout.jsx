import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOwnerLayoutData } from '@/hooks/useOwnerLayoutData';
import { APP_CONFIG } from '@/config/app.config';
import { cn } from '@/lib/utils';
import ApperIcon from '@/components/ApperIcon';
import UserMenu from '@/components/UserMenu';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { getLanguage, setLanguage, tr } from '@/services/i18n';
import LanguageRuntime from '@/components/LanguageRuntime';
import { sdk } from '@/services/sdk';
import { toast } from 'sonner';

const { eq } = window.ApperSDK.CoreSDK;
const PROVIDER_AVAILABILITY = ['Available Now', 'Available Later', 'Unavailable Today'];

export default function OwnerLayout() {
  const { user, logout, homeRoute, navItems, navGroups, initials, displayName, counts } = useOwnerLayoutData();
  const location = useLocation();

  // Reset every likely page scroll container, including the document and app content.
  function scrollPageToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelectorAll('main, [data-page-scroll], [class*="overflow-y-auto"], [class*="overflow-auto"]').forEach((element) => { element.scrollTop = 0; });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll('main, [data-page-scroll], [class*="overflow-y-auto"], [class*="overflow-auto"]').forEach((element) => { element.scrollTop = 0; });
    });
  }

  useEffect(() => {
    scrollPageToTop();
  }, [location.pathname, location.search, location.hash]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [language, setLanguageState] = useState(getLanguage);
  const [providerAvailability, setProviderAvailability] = useState('Unavailable Today');
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [providerRecordId, setProviderRecordId] = useState(null);
  const [providerJobsCount, setProviderJobsCount] = useState(null);
  const profileLabel = tr(String(user?.profile ?? '').replace(/_c$/, '') || 'Account', language);

  useEffect(() => {
    if (user?.profile !== 'ServiceProvider_c') {
      setProviderJobsCount(null);
      return;
    }
    let active = true;
    setProviderJobsCount(null);
    (async () => {
      try {
        const email = user?.emailAddress ?? user?.email ?? '';
        const result = await sdk.table('technician_profiles_c')
          .select(['Id', 'availability_c'])
          .where(eq('email_c', email))
          .page(1, 1).fetch();
        if (!active) return;
        const row = result.data?.[0];
        if (row) {
          setProviderRecordId(row.Id);
          setProviderAvailability(PROVIDER_AVAILABILITY.includes(row.availability_c) ? row.availability_c : 'Unavailable Today');
          const jobsResult = await sdk.table('jobs_c')
            .select(['Id'])
            .where(eq('technician_c', row.Id))
            .page(1, 1).fetch();
          if (!active) return;
          setProviderJobsCount(jobsResult.success ? Number(jobsResult.total ?? jobsResult.data?.length ?? 0) : null);
        } else {
          setProviderRecordId(null);
          setProviderJobsCount(0);
        }
      } catch {
        if (active) {
          setProviderRecordId(null);
          setProviderJobsCount(null);
        }
      }
    })();
    return () => { active = false; };
  }, [user?.profile, user?.emailAddress, user?.email, location.pathname]);

  async function changeProviderAvailability(value) {
    if (!PROVIDER_AVAILABILITY.includes(value)) return;
    if (!providerRecordId) {
      toast.error('Your provider profile is not saved yet. Complete Provider onboarding first; then this dropdown will update your availability.');
      return;
    }
    setAvailabilitySaving(true);
    try {
      const result = await sdk.table('technician_profiles_c').update({ Id: providerRecordId, availability_c: value });
      if (!result.success || !result.data?.length) throw new Error(result.messages?.[0] || 'Availability could not be saved.');
      setProviderAvailability(value);
      toast.success('Availability updated: ' + value);
    } catch (error) {
      toast.error(error.message || 'Availability could not be saved.');
    } finally {
      setAvailabilitySaving(false);
    }
  }

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
                onClick={() => {
                  setMobileOpen(false);
                  // On the active dispatch route, target its own anchor directly. When entering it from
                  // another route, CentralDispatch also scrolls to this anchor after mounting.
                  if (item.to === '/admin/dispatch') {
                    const top = document.getElementById('central-dispatch-page-top');
                    if (top) top.scrollIntoView({ block: 'start', behavior: 'auto' });
                    else scrollPageToTop();
                  } else {
                    scrollPageToTop();
                  }
                }}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                )}
              >
                <ApperIcon name={item.icon ?? 'Circle'} size={17} />
                <span className="flex-1 truncate">{tr(item.label, language)}</span>
                {(item.to === '/jobs' && user?.profile === 'ServiceProvider_c' ? providerJobsCount : counts[item.to]) != null && <span className="rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[11px] text-sidebar-foreground/70">{item.to === '/jobs' && user?.profile === 'ServiceProvider_c' ? providerJobsCount : counts[item.to]}</span>}
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
          <Link to="/" className="block min-w-0 rounded-lg bg-white p-1.5" aria-label="LOCAL — Happy to Help">
            <img src="/local-logo-dark.svg" alt="LOCAL — Happy to Help" className="h-9 w-auto max-w-full" />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{navigation}</div>
        <div className="border-t border-sidebar-border pt-4">
          <UserMenu user={user} initials={initials} displayName={displayName} logout={logout} />
        </div>
      </aside>
      <div className="lg:col-start-2">
        <header className="sticky top-0 z-30 flex min-h-(--spacing-header) flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:gap-3 sm:px-4 md:flex-nowrap md:px-6">
          <button type="button" className="rounded-md border border-border p-2 lg:hidden" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">
            <ApperIcon name="Menu" size={18} />
          </button>
          <Link to="/" className="block lg:hidden" aria-label="LOCAL — Happy to Help">
            <img src="/local-logo.svg" alt="LOCAL — Happy to Help" className="h-8 w-auto" />
          </Link>
          <div className="ml-auto flex min-w-0 max-w-full items-center justify-end gap-2 sm:gap-3">
            {user?.profile === 'ServiceProvider_c' && (
              <div className="flex items-center gap-2">
                <label htmlFor="header-provider-availability" className="hidden text-xs font-medium text-muted-foreground sm:block">Availability</label>
                <select
                  id="header-provider-availability"
                  value={providerAvailability}
                  onChange={(event) => changeProviderAvailability(event.target.value)}
                  disabled={availabilitySaving}
                  title={providerRecordId ? 'Change your service availability' : 'Complete provider onboarding to activate availability'}
                  className="h-9 max-w-[112px] rounded-full border border-border bg-background px-2 text-[11px] font-semibold text-foreground shadow-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-[150px] sm:px-3 sm:text-xs md:max-w-[180px]"
                >
                  {PROVIDER_AVAILABILITY.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            )}
            <div className="flex shrink-0 items-center rounded-full border border-border bg-muted/30 p-1 text-xs font-bold">
              <button type="button" onClick={() => changeLanguage('en')} className={'rounded-full px-2.5 py-1 transition ' + (language === 'en' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')} aria-pressed={language === 'en'}>EN</button>
              <button type="button" onClick={() => changeLanguage('hi')} className={'rounded-full px-2.5 py-1 transition ' + (language === 'hi' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')} aria-pressed={language === 'hi'}>हिन्दी</button>
            </div>
            <div className="hidden max-w-[140px] text-right sm:block">
              <div className="truncate text-sm font-medium">{displayName}</div>
              <div className="text-xs text-muted-foreground">{profileLabel}</div>
            </div>
            <div className="lg:hidden"><UserMenu user={user} initials={initials} displayName={displayName} logout={logout} /></div>
          </div>
        </header>
        {mobileOpen && <div className="border-b border-border bg-sidebar p-3 lg:hidden">{navigation}</div>}
        <main className="min-w-0 p-4 md:p-6 lg:p-8">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </main>
        <button
          type="button"
          onClick={scrollPageToTop}
          aria-label="Scroll to top"
          title="Back to top"
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <ApperIcon name="ArrowUp" size={22} />
        </button>
      </div>
    </div>
  );
}
