import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { setUser, clearUser, setInitialized } from '@/store/userSlice';
import { verifyRouteAccess } from '@/router/route.utils';
import { APP_CONFIG, AUTH_PROFILES, GENERIC_AUTH } from '@/config/app.config';
import AppLoader from '@/components/AppLoader';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import CustomerLocationGate from '@/components/local/CustomerLocationGate';
import ServiceProviderLocationGate from '@/components/local/ServiceProviderLocationGate';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within RootLayout');
  return ctx;
}

const AUTH_PAGE_PATTERN = /^\/(([\w-]+)\/)?(login|signup|callback|forgot-password|reset-password|verify-email|accept-invite)/;

export default function RootLayout() {
  const dispatch = useDispatch();
  const { user, isAuthenticated, isInitialized } = useSelector((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const matches = useMatches();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const hasInitRef = useRef(false);

  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;

    let isMounted = true;
    const init = async () => {
      try {
        if (sdk.session.initFailed) await sdk.session.retry();
        const sessionUser = sdk.session.user() ?? await sdk.session.getUser?.();
        if (!isMounted) return;
        if (sessionUser) {
          dispatch(setUser(sessionUser));
          handlePostAuthNavigation();
        } else {
          dispatch(setInitialized());
        }
      } catch {
        if (isMounted) dispatch(setInitialized());
      }
    };
    init();

    return () => { isMounted = false; };
  }, [dispatch]);

  function handlePostAuthNavigation() {
    const params = new URLSearchParams(window.location.search);
    const redirectPath = params.get('redirect');
    if (redirectPath) {
      navigateRef.current(redirectPath, { replace: true });
      return;
    }
    const pathname = window.location.pathname;
    // A protected admin login must remain reachable even when a previous Customer or
    // Service Provider session is still active. The Admin login will replace that session.
    if (pathname === '/admin/login') return;
    const authMatch = pathname.match(AUTH_PAGE_PATTERN);
    if (authMatch) {
      const profileKey = authMatch[2];
      const matched = profileKey && AUTH_PROFILES?.find(p => p.key === profileKey);
      const target = matched?.redirectAfterAuth ?? GENERIC_AUTH?.redirectAfterAuth ?? '/';
      navigateRef.current(target, { replace: true });
    }
  }

  const deepestMatch = matches[matches.length - 1];
  const accessRule = deepestMatch?.handle?.access ?? 'public';
  const requiresCustomerLocation = user?.profile === 'Customer_c' && String(accessRule).includes('Customer_c');
  const requiresProviderLocation = user?.profile === 'ServiceProvider_c' && String(accessRule).includes('ServiceProvider_c');
  // Decided during render, not after it: a route this session may not open never paints.
  const allowed = isInitialized && verifyRouteAccess(accessRule, user);

  useEffect(() => {
    if (!isInitialized) return;
    if (!allowed) {
      const loginRoute = APP_CONFIG.defaultLoginRoute ?? '/login';
      if (user) {
        navigateRef.current('/access-denied', { replace: true });
      } else {
        const currentPath = location.pathname + location.search;
        navigateRef.current(`${loginRoute}?redirect=${encodeURIComponent(currentPath)}`, { replace: true });
      }
    }
  }, [location.pathname, isInitialized, allowed, user]);

  const handleLogout = useCallback(async () => {
    const currentProfile = user?.profile;
    const loginRoute = currentProfile === 'Admin_c'
      ? '/admin/login'
      : currentProfile === 'ServiceProvider_c'
        ? '/service-provider/login'
        : '/customer/login';

    try { await sdk.session.logout(); } catch { /* clear local state regardless */ }
    dispatch(clearUser());
    // Hard navigation prevents the protected-route access guard from racing the logout redirect.
    window.location.replace(loginRoute);
  }, [dispatch, user?.profile]);

  // Loader while the session resolves AND while a denied route redirects — the shell, the page
  // and its data fetches never mount for a visitor who may not see them.
  if (!isInitialized || !allowed) return <AppLoader fullScreen />;

  return (
    <AuthContext.Provider value={{ logout: handleLogout, user, isAuthenticated }}>
      <CustomerLocationGate required={requiresCustomerLocation} />
      {requiresProviderLocation && <ServiceProviderLocationGate />}
      <ErrorBoundary fullPage>
        <Outlet />
      </ErrorBoundary>
    </AuthContext.Provider>
  );
}
