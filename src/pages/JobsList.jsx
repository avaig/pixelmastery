import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';

const { contains, eq, and } = window.ApperSDK.CoreSDK;

export const route = { path: '/jobs', layout: 'owner', access: "profile === 'Customer_c' || profile === 'ServiceProvider_c' || profile === 'Admin_c'" };
export const nav = { to: '/jobs', label: 'Jobs', icon: 'BriefcaseBusiness', order: 4, profiles: ['Customer_c', 'ServiceProvider_c', 'Admin_c'], section: 'Marketplace', count: { table: 'jobs_c' } };

export default function JobsList() {
  const user = useSelector((state) => state.user.user);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, status]);

  const { data, loading, error, run } = useFetch(async () => {
    let query = sdk.table('jobs_c').select(['Id', 'Name', 'customer_c', 'technician_c', 'agreed_price_c', 'scheduled_at_c', 'status_c', 'payment_status_c']);
    const filters = [];
    if (user?.profile === 'Customer_c') {
      const profileRes = await sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c']).where(eq('email_c', user?.emailAddress ?? user?.email ?? '')).page(1, 1).fetch();
      if (!profileRes.success) throw new Error(profileRes.message);
      if (!profileRes.data?.[0]) return { rows: [], total: 0, hasMore: false };
      filters.push(eq('customer_c', profileRes.data[0].Id));
    }
    if (user?.profile === 'ServiceProvider_c') {
      const profileRes = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c']).where(eq('email_c', user?.emailAddress ?? user?.email ?? '')).page(1, 1).fetch();
      if (!profileRes.success) throw new Error(profileRes.message);
      if (!profileRes.data?.[0]) return { rows: [], total: 0, hasMore: false };
      filters.push(eq('technician_c', profileRes.data[0].Id));
    }
    if (search) filters.push(contains('Name', search));
    if (status !== 'all') filters.push(eq('status_c', status));
    if (filters.length) query = query.where(and(...filters));
    const res = await query.orderByDesc('CreatedOn').page(page, 12).fetch();
    if (!res.success) throw new Error(res.message);
    return { rows: res.data, total: res.total, hasMore: res.hasMore };
  }, [user?.profile, user?.emailAddress, user?.email, search, status, page]);

  // Refresh the job list itself, without overlapping requests. The shared useFetch
  // hook aborts a previous run when a new one starts, so polling must be serialized.
  const refreshInFlight = useRef(false);
  useEffect(() => {
    let active = true;
    const refreshWhenVisible = async () => {
      if (!active || document.visibilityState !== 'visible' || refreshInFlight.current) return;
      refreshInFlight.current = true;
      try {
        await run();
      } finally {
        refreshInFlight.current = false;
      }
    };
    const interval = setInterval(refreshWhenVisible, 5000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [run]);

  const rows = data?.rows ?? [];
  return (
    <div>
      <PageHeader eyebrow="Marketplace" title="Jobs" description="Confirmed work moving through assigned, in-progress, completed, and cancelled states." action={user?.profile === 'Admin_c' ? <Button asChild><Link to="/jobs/new"><ApperIcon name="Plus" size={17} /> Add job</Link></Button> : null} />
      <div className="mb-5 flex flex-col gap-3 md:flex-row"><div className="relative min-w-0 flex-1"><ApperIcon name="Search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs..." /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{['Assigned', 'In Progress', 'Awaiting Customer Confirmation', 'Completed', 'Cancelled'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      {loading && !data ? <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" /> : error ? <Card className="border-l-4 border-destructive p-6"><div className="font-medium">Could not load jobs.</div><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card> : (
        <div aria-busy={loading} className={loading ? 'pointer-events-none opacity-60' : ''}><div className="space-y-3">{rows.map((job) => <Link key={job.Id} to={'/jobs/' + job.Id} className="block border-l-4 border-success bg-card p-5 hover:bg-accent"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><h2 className="font-heading text-lg font-semibold">{job.Name}</h2><StatusBadge value={user?.profile === 'Customer_c' && job.status_c === 'Completed' ? (job.payment_status_c === 'Final Payment Paid' ? 'Settled' : 'Payment Due') : job.status_c} /></div><div className="mt-2 text-sm text-muted-foreground">{job.customer_c?.Name ?? 'Customer'} • {job.technician_c?.Name ?? 'Service Provider'}</div></div><div className="text-left md:text-right"><div className="font-heading text-xl font-semibold">₹{Number(job.agreed_price_c ?? 0).toLocaleString('en-IN')}</div><div className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(job.scheduled_at_c))}</div></div></div></Link>)}{!rows.length && <Card className="p-10 text-center text-sm text-muted-foreground">No jobs match the current view.</Card>}</div><div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{data?.total ?? rows.length} total</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></div>
      )}
    </div>
  );
}