import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/layouts/RootLayout';
import ApperIcon from '@/components/ApperIcon';

const items = [
  { label: 'Home', to: '/', icon: 'House', end: true },
  { label: 'Orders', to: '/customer', icon: 'ClipboardList' },
  { label: 'You', to: '/customer/profile', icon: 'UserRound' },
];

export default function CustomerBottomNav() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (user && user.profile !== 'Customer_c') return null;

  const activeClass = 'text-primary';
  const inactiveClass = 'text-muted-foreground hover:text-foreground';

  return (
    <nav
      aria-label="Customer navigation"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto grid max-w-xl grid-cols-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors ${isActive ? activeClass : inactiveClass}`}
            aria-label={item.label}
          >
            <ApperIcon name={item.icon} size={21} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        {user ? (
          <button
            type="button"
            onClick={logout}
            className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Sign Out"
          >
            <ApperIcon name="LogOut" size={21} />
            <span>Sign Out</span>
          </button>
        ) : (
          <Link
            to={`/customer/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
            className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Sign In"
          >
            <ApperIcon name="LogIn" size={21} />
            <span>Sign In</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
