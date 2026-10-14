import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { getEligibleRequests } from '@/services/providerMatching';
import { getLanguage, tr } from '@/services/i18n';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/service-provider',
  layout: 'owner',
  access: "profile === 'ServiceProvider_c'",
};

export const nav = {
  to: '/service-provider',
  label: 'Service Provider Dashboard',
  icon: 'LayoutDashboard',
  order: 1,
  profiles: ['ServiceProvider_c'],
};

export default function ServiceProviderDashboard() {
  const user = useSelector((state) => state.user.user);
  const { data, loading, error, run } = useFetch(async () => {
    const profileRes = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c', 'availability_c', 'service_area_c']).where(eq('email_c', user?.emailAddress ?? user?.email ?? '')).page(1, 1).fetch();
    if (!profileRes.success) throw new Error(profileRes.message);
    const technician = profileRes.data?.[0];
    if (!technician) return { technician: null, requests: [], offers: [], jobs: [], emergencyRequests: [] };
    const eligibleRequests = await getEligibleRequests(technician.Id);
    const requestsRes = { success: true, data: eligibleRequests.slice(0, 8) };
    const offersRes = await sdk.table('technician_responses_c').select(['Id', 'Name', 'request_c', 'technician_c', 'proposed_price_c', 'original_proposed_price_c', 'final_agreed_price_c', 'negotiation_status_c', 'negotiation_history_c', 'message_c', 'availability_c', 'status_c']).where(eq('technician_c', technician.Id)).orderByDesc('CreatedOn').page(1, 50).fetch();
    const jobsRes = await sdk.table('jobs_c').select(['Id', 'Name', 'customer_c', 'agreed_price_c', 'scheduled_at_c', 'status_c']).where(eq('technician_c', technician.Id)).orderByDesc('CreatedOn').page(1, 8).fetch();
    const emergencyRes = await sdk.table('emergency_requests_c').select(['Id', 'Name', 'emergency_type_c', 'location_c', 'distance_c', 'estimated_eta_c', 'emergency_status_c', 'agreed_price_c']).where(eq('emergency_status_c', 'Open')).orderByDesc('CreatedOn').page(1, 8).fetch();
    if (!requestsRes.success || !offersRes.success || !jobsRes.success) throw new Error('Some service provider data could not be loaded.');
    return { technician, requests: requestsRes.data, offers: offersRes.data, jobs: jobsRes.data, emergencyRequests: emergencyRes.success ? emergencyRes.data : [] };
  }, [user?.emailAddress, user?.email]);

  const requests = data?.requests ?? [];
  const offers = data?.offers ?? [];
  const jobs = data?.jobs ?? [];
  const emergencyRequests = data?.emergencyRequests ?? [];
  const activeJobs = useMemo(() => jobs.filter((item) => ['Assigned', 'In Progress'].includes(item.status_c)).length, [jobs]);
  const pendingOffers = useMemo(() => offers.filter((item) => item.status_c === 'Pending').length, [offers]);
  const offersNeedingAction = useMemo(() => offers.filter((item) => item.status_c === 'Pending' && (item.negotiation_status_c === 'Negotiating' || String(item.message_c ?? '').startsWith('Customer counter-offer:') || String(item.message_c ?? '').startsWith('Customer offer accepted:'))), [offers]);
  const language = getLanguage();

  return (
    <div>
      <PageHeader eyebrow={tr('Service Provider workspace', language)} title={tr('Welcome,', language) + ' ' + (data?.technician?.Name?.split(' ')[0] ?? tr('Service Provider', language))} description={tr('Find nearby service requests, quote your price, and keep your accepted jobs moving.', language)} action={<Button asChild><Link to="/responses/new"><ApperIcon name="BadgeIndianRupee" size={17} /> {tr('Send an offer', language)}</Link></Button>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-primary p-5"><div className="text-sm text-muted-foreground">{tr('Open requests', language)}</div><div className="mt-2 font-heading text-3xl font-semibold">{requests.length}</div><div className="mt-1 text-xs text-muted-foreground">{tr('Available in the mock marketplace', language)}</div></Card>
        <Card className="border-l-4 border-highlight p-5"><div className="text-sm text-muted-foreground">{tr('Pending offers', language)}</div><div className="mt-2 font-heading text-3xl font-semibold">{pendingOffers}</div><div className="mt-1 text-xs text-muted-foreground">{tr('Waiting for customer choice', language)}</div></Card>
        <Card className="border-l-4 border-success p-5"><div className="text-sm text-muted-foreground">{tr('Active jobs', language)}</div><div className="mt-2 font-heading text-3xl font-semibold">{activeJobs}</div><div className="mt-1 text-xs text-muted-foreground">{tr('Accepted work', language)}</div></Card>
      </div>
      {loading && !data ? <div className="mt-7 h-80 animate-pulse rounded-lg border border-border bg-muted" /> : error ? <Card className="mt-7 border-l-4 border-destructive p-6"><div className="font-medium">{tr('Could not load service provider activity.', language)}</div><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>{tr('Retry', language)}</Button></Card> : (
        <div className="mt-7 grid gap-6">
          {emergencyRequests.length > 0 && (
            <Card className="border-l-4 border-destructive p-5">
              <h2 className="font-heading text-xl font-semibold text-destructive">{tr('Emergency & Urgent Requests', language)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tr('Quick response needed. No negotiation required.', language)}</p>
              <div className="mt-5 space-y-3">
                {emergencyRequests.slice(0, 4).map((req) => (
                  <div key={req.Id} className="border-l-4 border-destructive bg-destructive/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{req.Name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{req.location_c} • {req.distance_c}km away • ETA {req.estimated_eta_c}</div>
                      </div>
                      <Button asChild size="sm" variant="destructive"><Link to={'/emergency-requests/' + req.Id}>{tr('View & Accept', language)}</Link></Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {offersNeedingAction.length > 0 && (
            <Card className="border-l-4 border-highlight p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">Customer Counter-Offers — Action Required</h2><p className="mt-1 text-sm text-muted-foreground">Review the latest amount, negotiation history, and accept or counter with one overall price.</p></div><StatusBadge value="Negotiating" /></div>
              <div className="mt-4 space-y-3">
                {offersNeedingAction.map((offer) => {
                  const requestId = offer.request_c?.Id ?? offer.request_c;
                  const latestAmount = Number(offer.proposed_price_c ?? 0);
                  const historyLines = String(offer.negotiation_history_c ?? '').split(/\\n|\n/).filter(Boolean);
                  const latestHistory = historyLines.slice(-2).join(' · ');
                  return <div key={offer.Id} className="rounded-lg border border-highlight/40 bg-highlight/5 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><div className="font-semibold">{offer.request_c?.Name ?? offer.Name ?? 'Car Wash request'}</div><div className="mt-1 text-sm text-muted-foreground">Current customer offer / counter-offer</div><div className="mt-1 font-heading text-2xl font-bold">₹{latestAmount.toLocaleString('en-IN')}</div>{latestHistory && <p className="mt-2 text-xs leading-5 text-muted-foreground">{latestHistory}</p>}</div><Button asChild><Link to={'/responses/' + offer.Id}>Review negotiation <ApperIcon name="ArrowRight" size={15} /></Link></Button></div></div>;
                })}
              </div>
            </Card>
          )}
          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <Card className="border-l-4 border-primary p-5">
              <div className="flex items-center justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">{tr('Relevant service requests', language)}</h2><p className="mt-1 text-sm text-muted-foreground">{tr('Only requests matching your selected capabilities are shown.', language)}</p></div><Button asChild variant="outline" size="sm"><Link to="/requests">{tr('Browse requests', language)}</Link></Button></div>
              <div className="mt-5 space-y-3">
                {requests.slice(0, 6).map((request) => { const driverRequest = /hourly driver|full-day driver|full day driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')); return <div key={request.Id} className="border-l-4 border-primary bg-muted/30 p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-medium">{request.Name}</div><div className="mt-1 text-sm text-muted-foreground">{request.location_c} • {request.distance_label_c || 'Distance unavailable'}{request.estimated_eta_c ? ' • approx. ' + request.estimated_eta_c + ' min travel' : ''} • {request.preferred_time_c === 'Scheduled' && request.scheduled_at_c ? 'Scheduled for ' + new Date(request.scheduled_at_c).toLocaleString('en-IN') : request.preferred_time_c === 'ASAP' ? 'Book Now — need help now' : request.preferred_time_c}</div></div><Button asChild size="sm"><Link to={'/requests/' + request.Id}>{driverRequest ? 'View & Accept' : tr('Quote', language)}</Link></Button></div></div>; })}
                {!requests.length && <div className="py-10 text-center text-sm text-muted-foreground">{tr('No open requests right now.', language)}</div>}
              </div>
            </Card>
            <Card className="border-l-4 border-highlight p-5">
              <h2 className="font-heading text-xl font-semibold">{tr('Accepted jobs', language)}</h2>
              <div className="mt-5 space-y-3">
                {jobs.slice(0, 5).map((job) => <Link key={job.Id} to={'/jobs/' + job.Id} className="block border border-border p-3 hover:bg-accent"><div className="flex items-center justify-between gap-3"><div className="font-medium">{job.Name}</div><StatusBadge value={job.status_c} /></div><div className="mt-1 text-xs text-muted-foreground">₹{Number(job.agreed_price_c ?? 0).toLocaleString('en-IN')}</div></Link>)}
                {!jobs.length && <div className="py-8 text-center text-sm text-muted-foreground">{tr('No jobs accepted yet.', language)}</div>}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}