import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/layouts/RootLayout';
import { APP_CONFIG, AUTH_PROFILES } from '@/config/app.config';

import { clearUser } from '@/store/userSlice';
import ApperIcon from '@/components/ApperIcon';
import AuthLayout from './AuthLayout';

export default function AccessDenied() {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useDispatch();

  const switchToAdminLogin = () => {
    // Admin login is a public route. Navigate there directly instead of invoking logout,
    // which can race the SDK's session restore and send the user back to Access Denied.
    dispatch(clearUser());
    window.location.href = '/admin/login';
  };

  return (
    <AuthLayout
      title="Access Denied"
      icon="ShieldOff"
    >
      <div className="text-center space-y-5">
        <p className="text-sm text-muted-foreground">
          {isAuthenticated
            ? `Your ${user?.profileLabel || 'current'} account doesn't have permission to access this page.`
            : 'You need to sign in to access this page.'}
        </p>
        {!isAuthenticated && AUTH_PROFILES?.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Sign in as:</p>
            <div className="flex flex-col gap-2">
              {AUTH_PROFILES.map((p) => (
                <Button key={p.key} variant="outline" asChild className="h-9">
                  <Link to={`/${p.key}/login`}>{p.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        )}
        {!isAuthenticated && !AUTH_PROFILES?.length && (
          <Button asChild className="h-9">
            <Link to={APP_CONFIG.defaultLoginRoute}>
              <ApperIcon name="LogIn" size={16} />
              Sign in
            </Link>
          </Button>
        )}
        {isAuthenticated && (
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={switchToAdminLogin} className="h-9 w-full">
              <ApperIcon name="LogIn" size={16} />
              Switch account / Admin sign in
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link to="/">
                <ApperIcon name="Home" size={16} />
                Go home
              </Link>
            </Button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
