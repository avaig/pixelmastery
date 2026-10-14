import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';

export const route = {
  path: '/admin',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export const nav = {
  to: '/admin',
  label: 'Overview',
  icon: 'LayoutDashboard',
  order: 1,
  profiles: ['Admin_c'],
  section: 'Admin',
};

export default function AdminDashboard() {
  const { data, loading, error, run } = useFetch(async () => {
    const tables = [
      ['service_categories_c', ['Id', 'Name', 'status_c']],
      ['customer_profiles_c', ['Id', 'Name', 'status_c']],
      ['technician_profiles_c', ['Id', 'Name', 'availability_c', 'status_c']],
      ['service_requests_c', ['Id', 'Name', 'location_c', 'status_c']],
      ['technician_responses_c', ['Id', 'Name', 'proposed_price_c', 'status_c']],
      ['jobs_c', ['Id', 'Name', 'status_c', 'agreed_price_c']],
      ['emergency_requests_c', ['Id', 'Name', 'emergency_type_c', 'emergency_status_c', 'agreed_price_c']],
    ];
    const results = await Promise.all(tables.map(([table, fields]) => sdk.table(table).select(fields).orderByDesc('CreatedOn').page(1, 50).fetch()));
    if (results.some((res) => !res.success)) throw new Error('One or more marketplace tables could not be loaded.');
    const [rawCategories, customers, technicians, requests, responses, jobs, emergencies] = results.map((res) => res.data);
    const categories = (rawCategories ?? []).filter((item) => ['Car Assistance', 'Bike Assistance'].includes(String(item.Name ?? '').trim()));
    return { categories, customers, technicians, requests, responses, jobs, emergencies };
  }, []);

  const requests = data?.requests ?? [];
  const responses = data?.responses ?? [];
  const jobs = data?.jobs ?? [];
  const emergencies = data?.emergencies ?? [];
  const attention = useMemo(() => requests.filter((item) => ['Open', 'Negotiating'].includes(item.status_c)).slice(0, 5), [requests]);
  const pipelineValue = useMemo(() => responses.reduce((sum, item) => sum + Number(item.proposed_price_c ?? 0), 0), [responses]);
  const urgentCount = useMemo(() => emergencies.filter((item) => item.emergency_status_c === 'Open').length, [emergencies]);

  return (
    <div>
      <PageHeader eyebrow="Admin workspace" title="LOCAL marketplace overview" description="Watch the marketplace loop: requests → offers → jobs, plus emergency & urgent services." action={<Button asChild variant="outline"><Link to="/categories"><ApperIcon name="Layers3" size={17} /> Manage categories</Link></Button>} />
      {loading && !data ? <div className="grid gap-4 md:grid-cols-3"><Card className="h-28 animate-pulse" /><Card className="h-28 animate-pulse" /><Card className="h-28 animate-pulse" /><Card className="h-28 animate-pulse" /><Card className="h-28 animate-pulse" /><Card className="h-28 animate-pulse" /><Card className="h-28 animate-pulse" /></div> : error ? <Card className="border-l-4 border-destructive p-6"><div className="font-medium">Could not load the admin dashboard.</div><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card> : (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            {[
              ['Categories', data.categories.length, 'Layers3', '/categories'],
              ['Customers', data.customers.length, 'Users', '/customers'],
              ['Service Providers', data.technicians.length, 'Wrench', '/technicians'],
              ['Requests', data.requests.length, 'ClipboardList', '/requests'],
              ['Offers', data.responses.length, 'BadgeIndianRupee', '/responses'],
              ['Jobs', data.jobs.length, 'BriefcaseBusiness', '/jobs'],
            ].map(([label, value, icon, href]) => <Link key={href} to={href}><Card className="h-full border-l-4 border-primary p-4 transition-colors hover:bg-accent"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><ApperIcon name={icon} size={17} className="text-primary" /></div><div className="mt-3 font-heading text-3xl font-semibold">{value}</div></Card></Link>)}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="border-l-4 border-destructive p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Emergency & Urgent</div>
                  <div className="mt-2 font-heading text-3xl font-semibold">{data.emergencies.length}</div>
                </div>
                <ApperIcon name="AlertTriangle" size={20} className="text-destructive" />
              </div>
              <div className="mt-3">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/emergency-requests"><ApperIcon name="AlertTriangle" size={16} /> Manage emergencies</Link>
                </Button>
              </div>
            </Card>
            <Card className="border-l-4 border-warning p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Open emergency/urgent</div>
                  <div className="mt-2 font-heading text-3xl font-semibold">{urgentCount}</div>
                </div>
                <ApperIcon name="Clock" size={20} className="text-warning" />
              </div>
            </Card>
          </div>
          <div className="mt-7 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-l-4 border-highlight p-5">
              <div className="flex items-center justify-between"><div><h2 className="font-heading text-xl font-semibold">Needs attention</h2><p className="mt-1 text-sm text-muted-foreground">Requests still waiting for a decision.</p></div><div className="text-right"><div className="text-xs uppercase tracking-wider text-muted-foreground">Offer value</div><div className="font-heading text-xl font-semibold">₹{pipelineValue.toLocaleString('en-IN')}</div></div></div>
              <div className="mt-5 space-y-3">
                {attention.map((item) => <Link key={item.Id} to={'/requests/' + item.Id} className="flex items-center justify-between gap-3 border-l-4 border-primary bg-muted/30 p-4 hover:bg-accent"><div><div className="font-medium">{item.Name}</div><div className="mt-1 text-xs text-muted-foreground">{item.location_c}</div></div><StatusBadge value={item.status_c} /></Link>)}
                {!attention.length && <div className="py-8 text-center text-sm text-muted-foreground">Nothing needs attention right now.</div>}
              </div>
            </Card>
            <Card className="border-l-4 border-success p-5">
              <h2 className="font-heading text-xl font-semibold">Quick administration</h2>
              <div className="mt-5 grid gap-2">
                <Button asChild variant="outline" className="justify-start"><Link to="/customers"><ApperIcon name="Users" size={17} /> Manage customers</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link to="/technicians"><ApperIcon name="Wrench" size={17} /> Manage service providers</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link to="/admin/provider-onboarding"><ApperIcon name="ClipboardCheck" size={17} /> Review provider onboarding</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link to="/requests"><ApperIcon name="ClipboardList" size={17} /> Review requests</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link to="/jobs"><ApperIcon name="BriefcaseBusiness" size={17} /> Review jobs</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link to="/emergency-requests"><ApperIcon name="AlertTriangle" size={17} /> Emergency requests</Link></Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}