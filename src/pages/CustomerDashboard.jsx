import { Link } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';

export const route = {
  path: '/customer',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export const nav = {
  to: '/customer',
  label: 'My Dashboard',
  icon: 'LayoutDashboard',
  order: 1,
  profiles: ['Customer_c'],
};

export default function CustomerDashboard() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">LOCAL · Customer</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">My Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your requests, bookings and profile in one place.</p>
        </div>
        <Link to="/" className="inline-flex items-center gap-2 self-start rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-muted">
          <ApperIcon name="ArrowLeft" size={16} />
          Back to LOCAL home
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/requests" className="group rounded-2xl border bg-card p-5 transition hover:border-primary/50 hover:shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ApperIcon name="ClipboardList" size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Service Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">Track requests, review offers and update eligible bookings.</p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">View requests <ApperIcon name="ArrowRight" size={16} /></span>
        </Link>

        <Link to="/jobs" className="group rounded-2xl border bg-card p-5 transition hover:border-primary/50 hover:shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ApperIcon name="BriefcaseBusiness" size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">My Bookings & Jobs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review confirmed bookings and service progress.</p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">View bookings <ApperIcon name="ArrowRight" size={16} /></span>
        </Link>

        <Link to="/customer/profile" className="group rounded-2xl border bg-card p-5 transition hover:border-primary/50 hover:shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ApperIcon name="UserRound" size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">My Profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage your contact details and saved information.</p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Open profile <ApperIcon name="ArrowRight" size={16} /></span>
        </Link>
      </section>

      <section className="mt-6 rounded-2xl border border-dashed p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Need a service?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose a service from LOCAL and find help near your location.</p>
        <Link to="/" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Find local help <ApperIcon name="ArrowRight" size={16} />
        </Link>
      </section>
    </main>
  );
}