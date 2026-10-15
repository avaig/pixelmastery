import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { sdk } from '@/services/sdk';
import { setUser } from '@/store/userSlice';
import { AUTH_PROFILES, GENERIC_AUTH } from '@/config/app.config';
import ApperIcon from '@/components/ApperIcon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AuthLayout from './AuthLayout';

const AUTH_TARGET_ID = 'authentication';

export default function AuthPage({ mode, profileKey = null }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { profile: profileParam } = useParams();
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const pathProfileKey = normalizedPath.startsWith('/service-provider')
    ? 'service-provider'
    : normalizedPath.startsWith('/customer')
      ? 'customer'
      : normalizedPath.startsWith('/admin')
        ? 'admin'
        : null;
  // Explicit role routes must win over stale/reused component props and generic route params.
  const effectiveProfileKey = pathProfileKey || profileKey || profileParam;
  const effectiveProfilePrefix = pathProfileKey || profileKey || profileParam || '';

  const hasProfiles = AUTH_PROFILES?.length > 0;
  const matchedProfile = hasProfiles && effectiveProfileKey
    ? AUTH_PROFILES.find((p) => p.key === effectiveProfileKey)
    : null;

  const redirectAfterAuth = matchedProfile?.redirectAfterAuth ?? GENERIC_AUTH.redirectAfterAuth;
  const authPage = matchedProfile?.authPage;
  const loginTitle = authPage?.loginTitle ?? GENERIC_AUTH.loginTitle;
  const signupTitle = authPage?.signupTitle ?? GENERIC_AUTH.signupTitle;
  const loginDescription = authPage?.loginDescription ?? GENERIC_AUTH.loginDescription;
  const signupDescription = authPage?.signupDescription ?? GENERIC_AUTH.signupDescription;

  const title = mode === 'login' ? loginTitle : signupTitle;
  const description = mode === 'login' ? loginDescription : signupDescription;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasUI = Boolean(sdk.session.ui);
  const connectionFailed = sdk.session.initFailed;

  // Apper's hosted Member UI renders into #authentication; the profile slug scopes it to this portal.
  useEffect(() => {
    if (!hasUI || connectionFailed) return;
    const target = `#${AUTH_TARGET_ID}`;
    const profileData = matchedProfile?.profileSlug ? { profileSlug: matchedProfile.profileSlug } : undefined;
    if (mode === 'login') sdk.session.ui.showLogin(target, profileData);
    else sdk.session.ui.showSignup(target, profileData);
    return () => {
      if (document.querySelector(target)) sdk.session.ui?.showBlank?.(target);
    };
  }, [hasUI, connectionFailed, mode, matchedProfile?.profileSlug]);

  // The hosted UI reports success through the session; mirror it into Redux and leave the auth page.
  useEffect(() => {
    return sdk.session.subscribe(() => {
      const user = sdk.session.user();
      if (!user) return;
      dispatch(setUser(user));
      navigate(redirectAfterAuth, { replace: true });
    });
  }, [dispatch, navigate, redirectAfterAuth]);

  // Fallback form, used only when the SDK exposes no hosted UI.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const credentials = { email: email.trim(), password, profileSlug: matchedProfile?.profileSlug };
      const result = mode === 'login'
        ? await sdk.session.login(credentials)
        : await sdk.session.register({ ...credentials, confirmPassword });
      if (!result.ok) {
        setError(result.error?.message || 'Authentication failed');
        return;
      }
      dispatch(setUser(result.value));
      navigate(redirectAfterAuth);
    } catch (err) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  if (connectionFailed) {
    const handleRetry = async () => {
      setError(null);
      setLoading(true);
      await sdk.session.retry();
      setLoading(false);
      if (!sdk.session.initFailed) {
        window.location.reload();
      } else {
        setError('Still unable to connect. Check your network and try again.');
      }
    };

    return (
      <AuthLayout title="Unable to connect" icon="WifiOff">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Authentication service is unreachable. This may be due to a network issue or CORS configuration.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="outline" onClick={handleRetry} disabled={loading} className="w-full">
            {loading ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (hasUI) {
    return (
      <AuthLayout title={title} description={description}>
        <div id={AUTH_TARGET_ID} className="flex flex-col" />
        {matchedProfile?.key !== 'admin' && (
          <AuthFooter mode={mode} profilePrefix={effectiveProfilePrefix} altLinksLeadIn={matchedProfile?.altLinksLeadIn} altLinks={matchedProfile?.altLinks} />
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={title} description={description}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === 'login' && (
              <Link to="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              <ApperIcon name={showPassword ? 'EyeOff' : 'Eye'} size={16} />
            </button>
          </div>
        </div>
        {mode === 'signup' && (
          <div className="space-y-1">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                <ApperIcon name={showConfirmPassword ? 'EyeOff' : 'Eye'} size={16} />
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="pt-2">
          <Button type="submit" disabled={loading} className="w-full h-9">
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : matchedProfile?.key === 'service-provider' ? 'Join LOCAL' : 'Create account'}
          </Button>
        </div>
      </form>
      {matchedProfile?.key !== 'admin' && (
        <AuthFooter mode={mode} profilePrefix={effectiveProfilePrefix} altLinksLeadIn={matchedProfile?.altLinksLeadIn} altLinks={matchedProfile?.altLinks} />
      )}
    </AuthLayout>
  );
}

function AuthFooter({ mode, profilePrefix, altLinksLeadIn, altLinks }) {
  const base = profilePrefix ? `/${profilePrefix}` : '';
  return (
    <div className="mt-8 space-y-5">
      <p className="text-[13px] text-center text-muted-foreground">
        {mode === 'login' ? (
          <>Don&apos;t have an account?{' '}
            <Link to={base === '/service-provider' ? '/service-provider/signup' : '/customer/signup'} className="text-primary font-medium hover:underline underline-offset-4 transition-colors">{base === '/service-provider' ? 'Join LOCAL' : 'Create Account'}</Link>
          </>
        ) : (
          <>Already have an account?{' '}
            <Link to={base === '/service-provider' ? '/service-provider/login' : '/customer/login'} className="text-primary font-medium hover:underline underline-offset-4 transition-colors">Sign in</Link>
          </>
        )}
      </p>
      {altLinks?.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[11px] text-muted-foreground/60 uppercase tracking-widest select-none">or continue as</span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div className="flex flex-col gap-2">
            {altLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="group flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 hover:border-primary/20 hover:bg-primary/[0.03] transition-all"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ApperIcon name="UserRound" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{link.label}</p>
                  {altLinksLeadIn && <p className="text-xs text-muted-foreground truncate">{altLinksLeadIn}</p>}
                </div>
                <ApperIcon name="ChevronRight" size={16} className="text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}