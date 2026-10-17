import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { getEligibleRequests } from '@/services/providerMatching';
import { getLanguage, tr } from '@/services/i18n';
import { toast } from 'sonner';

const { eq } = window.ApperSDK.CoreSDK;
const AVAILABILITY_OPTIONS = [
  { value: 'Available Now', label: 'Available Now', description: 'Receive eligible nearby requests now.', icon: 'Zap' },
  { value: 'Available Later', label: 'Available Later', description: 'See scheduled requests only.', icon: 'CalendarClock' },
  { value: 'Unavailable Today', label: 'Unavailable Today', description: 'Pause new request matching for today.', icon: 'Moon' },
];

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
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [radiusDraft, setRadiusDraft] = useState('');
  const { data, loading, error, run } = useFetch(async () => {
    const profileRes = await sdk.table('technician_profiles_c')
      .select(['Id', 'Name', 'email_c', 'availability_c', 'service_area_c', 'latitude_c', 'longitude_c', 'service_radius_km_c', 'verification_status_c', 'status_c'])
      .where(eq('email_c', user?.emailAddress ?? user?.email ?? ''))
      .page(1, 1).fetch();
    if (!profileRes.success) throw new Error(profileRes.message);
    const technician = profileRes.data?.[0];
    if (!technician) return { technician: null, requests: [], offers: [], jobs: [], emergencyRequests: [] };
    const eligibleRequests = await getEligibleRequests(technician.Id);
    const offersRes = await sdk.table('technician_responses_c').select(['Id', 'Name', 'request_c', 'technician_c', 'proposed_price_c', 'original_proposed_price_c', 'final_agreed_price_c', 'negotiation_status_c', 'negotiation_history_c', 'message_c', 'availability_c', 'status_c']).where(eq('technician_c', technician.Id)).orderByDesc('CreatedOn').page(1, 50).fetch();
    const jobsRes = await sdk.table('jobs_c').select(['Id', 'Name', 'customer_c', 'agreed_price_c', 'scheduled_at_c', 'status_c']).where(eq('technician_c', technician.Id)).orderByDesc('CreatedOn').page(1, 8).fetch();
    const emergencyRes = await sdk.table('emergency_requests_c').select(['Id', 'Name', 'emergency_type_c', 'location_c', 'distance_c', 'estimated_eta_c', 'emergency_status_c', 'agreed_price_c']).where(eq('emergency_status_c', 'Open')).orderByDesc('CreatedOn').page(1, 8).fetch();
    if (!offersRes.success || !jobsRes.success) throw new Error('Some service provider data could not be loaded.');
    return { technician, requests: eligibleRequests.slice(0, 8), offers: offersRes.data, jobs: jobsRes.data, emergencyRequests: emergencyRes.success ? emergencyRes.data : [] };
  }, [user?.emailAddress, user?.email]);

  const requests = data?.requests ?? [];
  const offers = data?.offers ?? [];
  const jobs = data?.jobs ?? [];
  const emergencyRequests = data?.emergencyRequests ?? [];
  const technician = data?.technician;
  const availability = technician ? String(technician.availability_c ?? 'Unavailable Today') : 'Profile not found';
  const activeJobs = useMemo(() => jobs.filter((item) => ['Assigned', 'In Progress'].includes(item.status_c)).length, [jobs]);
  const pendingOffers = useMemo(() => offers.filter((item) => item.status_c === 'Pending').length, [offers]);
  const offersNeedingAction = useMemo(() => offers.filter((item) => item.status_c === 'Pending' && (item.negotiation_status_c === 'Negotiating' || String(item.message_c ?? '').startsWith('Customer counter-offer:') || String(item.message_c ?? '').startsWith('Customer offer accepted:'))), [offers]);
  const language = getLanguage();

  async function changeAvailability(value) {
    if (!technician?.Id) return toast.error('Complete your provider profile first.');
    setUpdatingAvailability(true);
    try {
      const result = await sdk.table('technician_profiles_c').update({ Id: technician.Id, availability_c: value });
      if (!result.success || !result.data?.length) throw new Error(result.messages?.[0] || 'Availability could not be saved.');
      const key = 'local_demo_provider_onboarding_applications_v1';
      const saved = JSON.parse(window.localStorage.getItem(key) || '[]');
      if (Array.isArray(saved)) {
        window.localStorage.setItem(key, JSON.stringify(saved.map((item) => String(item.Id) === String(technician.Id) ? { ...item, availability_c: value } : item)));
      }
      toast.success('Availability updated: ' + value);
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not update availability.');
    } finally {
      setUpdatingAvailability(false);
    }
  }

  function updateCurrentLocation() {
    if (!technician?.Id) return toast.error('Complete your provider profile first.');
    if (!navigator.geolocation) return toast.error('This device does not support location. Try a phone with location enabled.');
    setUpdatingLocation(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const payload = { Id: technician.Id, latitude_c: Number(position.coords.latitude), longitude_c: Number(position.coords.longitude) };
        const result = await sdk.table('technician_profiles_c').update(payload);
        if (!result.success || !result.data?.length) throw new Error(result.messages?.[0] || 'Location could not be saved.');
        const key = 'local_demo_provider_onboarding_applications_v1';
        const saved = JSON.parse(window.localStorage.getItem(key) || '[]');
        if (Array.isArray(saved)) window.localStorage.setItem(key, JSON.stringify(saved.map((item) => String(item.Id) === String(technician.Id) ? { ...item, ...payload } : item)));
        toast.success('Your current location is updated for nearby matching.');
        await run();
      } catch (err) {
        toast.error(err.message || 'Could not update your location.');
      } finally {
        setUpdatingLocation(false);
      }
    }, (err) => {
      setUpdatingLocation(false);
      toast.error(err.code === 1 ? 'Location permission is off. Enable it or keep using your last saved location.' : 'Could not detect your current location. Please try again.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  async function saveRadius() {
    if (!technician?.Id) return;
    const radius = Number(radiusDraft || technician.service_radius_km_c || 10);
    if (!Number.isFinite(radius) || radius < 1 || radius > 100) return toast.error('Enter a radius between 1 and 100 km.');
    setUpdatingLocation(true);
    try {
      const result = await sdk.table('technician_profiles_c').update({ Id: technician.Id, service_radius_km_c: radius });
      if (!result.success || !result.data?.length) throw new Error(result.messages?.[0] || 'Travel radius could not be saved.');
      const key = 'local_demo_provider_onboarding_applications_v1';
      const saved = JSON.parse(window.localStorage.getItem(key) || '[]');
      if (Array.isArray(saved)) window.localStorage.setItem(key, JSON.stringify(saved.map((item) => String(item.Id) === String(technician.Id) ? { ...item, service_radius_km_c: radius } : item)));
      setRadiusDraft('');
      toast.success('Maximum travel distance saved.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not save travel distance.');
    } finally {
      setUpdatingLocation(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow={tr('Service Provider workspace', language)} title={tr('Welcome,', language) + ' ' + (technician?.Name?.split(' ')[0] ?? tr('Service Provider', language))} description={tr('Find nearby service requests, respond to eligible bookings, and keep your accepted jobs moving.', language)} />
      {loading && !data ? <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" /> : error ? <Card className="border-l-4 border-destructive p-6"><div className="font-medium">{tr('Could not load service provider activity.', language)}</div><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>{tr('Retry', language)}</Button></Card> : (
        <Card className="hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-heading text-xl font-semibold">Your availability</h2><p className="mt-1 text-sm text-muted-foreground">Choose whether you can take a new job. Change this whenever you move or stop working.</p></div>
            {technician && <StatusBadge value={availability} />}
          </div>
          {!technician && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No saved provider profile is linked to this login yet. Complete and submit Provider onboarding first; once your profile is saved, you can manage availability and travel distance here. <Link className="ml-1 font-semibold underline" to="/service-provider/profile">Open Provider onboarding</Link></div>}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {AVAILABILITY_OPTIONS.map((option) => (
              <button key={option.value} type="button" disabled={updatingAvailability || !technician} onClick={() => changeAvailability(option.value)} className={'rounded-xl border p-4 text-left transition ' + (availability.toLowerCase() === option.value.toLowerCase() ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:bg-accent')}>
                <span className="flex items-center gap-2 font-semibold"><ApperIcon name={option.icon} size={18} />{option.label}</span>
                <span className="mt-2 block text-sm text-muted-foreground">{option.description}</span>
                {availability.toLowerCase() === option.value.toLowerCase() && <span className="mt-3 block text-xs font-semibold text-primary">Current selection</span>}
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-4 border-t border-border pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div><h3 className="font-medium">Your current working location</h3><p className="mt-1 text-sm text-muted-foreground">{technician?.latitude_c != null && technician?.longitude_c != null ? 'GPS coordinates saved. Update them whenever you move to a new area.' : 'No GPS location saved yet. Save your current location to enable accurate distance matching.'}</p><Button className="mt-3" variant="outline" onClick={updateCurrentLocation} disabled={updatingLocation || updatingAvailability || !technician}><ApperIcon name={updatingLocation ? 'LoaderCircle' : 'LocateFixed'} size={16} className={updatingLocation ? 'animate-spin' : ''} />{updatingLocation ? 'Saving…' : 'Update my current location'}</Button></div>
            <div><label htmlFor="provider-travel-radius" className="text-sm font-medium">Maximum travel distance (km)</label><p className="mt-1 text-xs text-muted-foreground">Measured from your latest saved location, not a fixed base.</p><Input id="provider-travel-radius" type="number" min="1" max="100" value={radiusDraft || technician?.service_radius_km_c || 10} onChange={(event) => setRadiusDraft(event.target.value)} className="mt-2" disabled={!technician} /></div>
            <Button onClick={saveRadius} disabled={updatingLocation || updatingAvailability || !technician}>Save distance</Button>
          </div>
          {technician && availability.toLowerCase() === 'available now' && (technician.latitude_c == null || technician.longitude_c == null) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You can mark yourself available, but accurate nearby matching and distance display need a current location. Update your location when you can.</p>}
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-primary p-5"><div className="text-sm text-muted-foreground">{tr('Open requests', language)}</div><div className="mt-2 font-heading text-3xl font-semibold">{requests.length}</div><div className="mt-1 text-xs text-muted-foreground">Matching your availability, approved services and current location</div></Card>
        <Card className="border-l-4 border-highlight p-5"><div className="text-sm text-muted-foreground">{tr('Pending offers', language)}</div><div className="mt-2 font-heading text-3xl font-semibold">{pendingOffers}</div><div className="mt-1 text-xs text-muted-foreground">{tr('Waiting for customer choice', language)}</div></Card>
        <Card className="border-l-4 border-success p-5"><div className="text-sm text-muted-foreground">{tr('Active jobs', language)}</div><div className="mt-2 font-heading text-3xl font-semibold">{activeJobs}</div><div className="mt-1 text-xs text-muted-foreground">{tr('Accepted work', language)}</div></Card>
      </div>
      {!loading && !error && (
        <div className="mt-7 grid gap-6">
          {emergencyRequests.length > 0 && (
            <Card className="border-l-4 border-destructive p-5">
              <h2 className="font-heading text-xl font-semibold text-destructive">{tr('Emergency & Urgent Requests', language)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tr('Quick response needed. No negotiation required.', language)}</p>
              <div className="mt-5 space-y-3">{emergencyRequests.slice(0, 4).map((req) => <div key={req.Id} className="border-l-4 border-destructive bg-destructive/5 p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-medium">{req.Name}</div><div className="mt-1 text-sm text-muted-foreground">{req.location_c} • {req.distance_c}km away • ETA {req.estimated_eta_c}</div></div><Button asChild size="sm" variant="destructive"><Link to={'/emergency-requests/' + req.Id}>{tr('View & Accept', language)}</Link></Button></div></div>)}</div>
            </Card>
          )}
          {offersNeedingAction.length > 0 && <Card className="border-l-4 border-highlight p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">Customer Counter-Offers — Action Required</h2><p className="mt-1 text-sm text-muted-foreground">Review the latest amount, negotiation history, and accept or counter with one overall price.</p></div><StatusBadge value="Negotiating" /></div><div className="mt-4 space-y-3">{offersNeedingAction.map((offer) => { const latestAmount = Number(offer.proposed_price_c ?? 0); const historyLines = String(offer.negotiation_history_c ?? '').split(/\n|\n/).filter(Boolean); const latestHistory = historyLines.slice(-2).join(' · '); return <div key={offer.Id} className="rounded-lg border border-highlight/40 bg-highlight/5 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><div className="font-semibold">{offer.request_c?.Name ?? offer.Name ?? 'Service request'}</div><div className="mt-1 text-sm text-muted-foreground">Current customer offer / counter-offer</div><div className="mt-1 font-heading text-2xl font-bold">₹{latestAmount.toLocaleString('en-IN')}</div>{latestHistory && <p className="mt-2 text-xs leading-5 text-muted-foreground">{latestHistory}</p>}</div><Button asChild><Link to={'/responses/' + offer.Id}>Review negotiation <ApperIcon name="ArrowRight" size={15} /></Link></Button></div></div>; })}</div></Card>}
          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <Card className="border-l-4 border-primary p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">{tr('Relevant service requests', language)}</h2><p className="mt-1 text-sm text-muted-foreground">Only requests matching your availability, location and approved services are shown.</p></div><Button asChild variant="outline" size="sm"><Link to="/requests">{tr('Browse requests', language)}</Link></Button></div><div className="mt-5 space-y-3">{requests.slice(0, 6).map((request) => { const driverRequest = /hourly driver|full-day driver|full day driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')); return <div key={request.Id} className="border-l-4 border-primary bg-muted/30 p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-medium">{request.Name}</div><div className="mt-1 text-sm text-muted-foreground">{request.location_c} • {request.distance_label_c || 'Distance unavailable'}{request.estimated_eta_c ? ' • approx. ' + request.estimated_eta_c + ' min travel' : ''} • {String(request.preferred_time_c).toLowerCase() === 'scheduled' && request.scheduled_at_c ? 'Scheduled for ' + new Date(request.scheduled_at_c).toLocaleString('en-IN') : ['asap', 'book now'].includes(String(request.preferred_time_c).toLowerCase()) ? 'Book Now — need help now' : request.preferred_time_c}</div></div><Button asChild size="sm"><Link to={'/requests/' + request.Id}>{driverRequest ? 'View & Accept' : tr('Quote', language)}</Link></Button></div></div>; })}{!requests.length && <div className="py-10 text-center text-sm text-muted-foreground">{!technician ? 'Complete Provider onboarding to activate your profile and manage availability.' : availability.toLowerCase() === 'unavailable today' ? 'You are unavailable today. Switch availability when you are ready for new requests.' : availability.toLowerCase() === 'available later' ? 'No scheduled requests match your approved services right now.' : tr('No open requests right now.', language)}</div>}</div></Card>
            <Card className="border-l-4 border-highlight p-5"><h2 className="font-heading text-xl font-semibold">{tr('Accepted jobs', language)}</h2><div className="mt-5 space-y-3">{jobs.slice(0, 5).map((job) => <Link key={job.Id} to={'/jobs/' + job.Id} className="block border border-border p-3 hover:bg-accent"><div className="flex items-center justify-between gap-3"><div className="font-medium">{job.Name}</div><StatusBadge value={job.status_c} /></div><div className="mt-1 text-xs text-muted-foreground">₹{Number(job.agreed_price_c ?? 0).toLocaleString('en-IN')}</div></Link>)}{!jobs.length && <div className="py-8 text-center text-sm text-muted-foreground">{tr('No jobs accepted yet.', language)}</div>}</div></Card>
          </div>
        </div>
      )}
    </div>
  );
}
