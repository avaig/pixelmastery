import { Link, Outlet, useLocation } from 'react-router-dom';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageRuntime from '@/components/LanguageRuntime';
import CustomerBottomNav from '@/components/local/CustomerBottomNav';

export default function PublicLayout() {
  const location = useLocation();
  const showUniversalLogo = location.pathname !== '/';

  return (
    <div className={`min-h-svh bg-background relative ${location.pathname === '/' ? 'pb-20 md:pb-0' : ''}`}>
      <LanguageRuntime />
      {showUniversalLogo && (
        <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" aria-label="LOCAL — Happy to Help" className="inline-flex shrink-0">
            <img src="/local-logo.svg" alt="LOCAL — Happy to Help" className="h-10 w-auto sm:h-11" />
          </Link>
          <ThemeToggle />
        </div>
      )}
      {!showUniversalLogo && (
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
      )}
      <Outlet />
      {location.pathname === '/' && <CustomerBottomNav />}
    </div>
  );
}
