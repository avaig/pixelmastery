import { useMemo, useState } from 'react';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import { getDistanceKm, formatDistance, getProviderCapabilities, providerCanHandleRequest } from '@/services/providerMatching';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/admin/dispatch',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export const nav = {
  to: '/admin/dispatch',
  label: 'Central Dispatch',
  icon: 'Route',
  order: 2,
  profiles: ['Admin_c'],
  section: 'Admin',
};

const REQUEST_FIELDS = ['Id', 'Name', 'customer_c', 'service_category_c', 'required_capability_c', 'problem_description_c', 'location_c', 'latitude_c', 'longitude_c', 'status_c', 'preferred_time_c', 'scheduled_at_c', 'pricing_mode_c', 'pricing_mode_description_c', 'CreatedOn'];
const PROVIDER_FIELDS = ['Id', 'Name', 'email_c', 'phone_c', 'status_c', 'verification_status_c', 'availability_c', 'service_area_c', 'latitude_c', 'longitude_c', 'service_radius_km_c'];

export default function CentralDispatch() {
  const [search, setSearch] = useState('');
  const [requestFilter, setRequestFilter] = useState('Open');
  const [providerChoice, setProviderChoice] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const { data, loading, error, run } = useFetch(async () => {
    const [requestRes, providerRes, responseRes] = await Promise.all([
      sdk.table('service_requests_c').select(REQUEST_FIELDS).orderByDesc('CreatedOn').page(1, 500).fetch(),
      sdk.table('technician_profiles_c').select(PROVIDER_FIELDS).page(1, 1000).fetch(),
      sdk.table('technician_responses_c').select(['Id', 'Name', 'request_c', 'technician_c', 'status_c', 'availability_c', 'message_c', 'proposed_price_c']).page(1, 2000).fetch(),
    ]);
    if (!requestRes.success || !providerRes.success || !responseRes.success) throw new Error('Central dispatch data could not be loaded. Check table permissions and try again.');
    return { requests: requestRes.data ?? [], providers: providerRes.data ?? [], responses: responseRes.data ?? [] };
  }, []);

  const requests = data?.requests ?? [];
  const providers = data?.providers ?? [];
  const responses = data?.responses ?? [];
  const eligibleProviders = useMemo(() => providers.filter((provider) => {
    const verification = String(provider.verification_status_c ?? (provider.status_c === 'Active' ? 'Approved' : '')).toLowerCase();
    return provider.status_c === 'Active' && verification === 'approved';
  }), [providers]);

  const visibleRequests = useMemo(() => requests.filter((request) => {
    const matchesSearch = !search || [request.Name, request.location_c, request.problem_description_c, request.service_category_c?.Name, request.required_capability_c?.Name].some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = requestFilter === 'All' || String(request.status_c ?? '') === requestFilter;
    return matchesSearch && matchesStatus;
  }), [requests, search, requestFilter]);

  function providerDistance(request, provider) {
    if (request.latitude_c == null || request.longitude_c == null || provider.latitude_c == null || provider.longitude_c == null) return null;
    return getDistanceKm(request.latitude_c, request.longitude_c, provider.latitude_c, provider.longitude_c);
  }

  async function getCandidates(request) {
    const candidates = [];
    for (const provider of eligibleProviders) {
      const distance = providerDistance(request, provider);
      const radius = Number(provider.service_radius_km_c ?? 25);
      if (distance !== null && distance > radius) continue;
      const availability = String(provider.availability_c ?? '').trim().toLowerCase();
      if (availability && /unavailable|busy|offline|inactive/.test(availability)) continue;
      const capabilities = await getProviderCapabilities(provider.Id);
      if (!providerCanHandleRequest(request, capabilities)) continue;
      const alreadyAssigned = responses.some((response) =>
        String(response.request_c?.Id ?? response.request_c) === String(request.Id) &&
        String(response.technician_c?.Id ?? response.technician_c) === String(provider.Id) &&
        !['Declined', 'Withdrawn'].includes(String(response.status_c ?? ''))
      );
      if (alreadyAssigned) continue;
      candidates.push({ ...provider, distance });
    }
    return candidates.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }

  async function assignProvider(request, provider, method) {
    if (!request?.Id || !provider?.Id) return;
    const key = request.Id + ':' + provider.Id;
    setBusyKey(key);
    try {
      const duplicate = await sdk.table('technician_responses_c').select(['Id', 'request_c', 'technician_c', 'status_c']).where(eq('request_c', request.Id)).page(1, 500).fetch();
      if (!duplicate.success) throw new Error(duplicate.message || 'Could not verify existing assignments.');
      const already = (duplicate.data ?? []).some((row) => String(row.technician_c?.Id ?? row.technician_c) === String(provider.Id) && !['Declined', 'Withdrawn'].includes(String(row.status_c ?? '')));
      if (already) {
        toast.info('This provider already has an active invitation for this request.');
        await run();
        return;
      }
      const response = await sdk.table('technician_responses_c').create({
        Name: 'LOCAL Assignment • ' + request.Name + ' • ' + provider.Name,
        request_c: request.Id,
        technician_c: provider.Id,
        proposed_price_c: 0,
        original_proposed_price_c: 0,
        final_agreed_price_c: null,
        negotiation_status_c: 'Not Started',
        negotiation_history_c: '',
        availability_c: request.preferred_time_c === 'Scheduled' ? 'Within 1 hour' : 'Available Now',
        message_c: 'Central LOCAL assignment invitation. No bidding or counter-offers. Please accept or decline based on your availability. Assignment method: ' + method + '.',
        status_c: 'Pending',
      });
      if (!response.data?.length) throw new Error(response.messages?.[0] || 'Provider invitation was not saved.');
      toast.success('Assignment invitation sent to ' + provider.Name + '. Waiting for provider acceptance.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not assign this provider.');
    } finally {
      setBusyKey('');
    }
  }

  async function findNearby(request) {
    setBusyKey(request.Id);
    try {
      const candidates = await getCandidates(request);
      if (!candidates.length) {
        toast.warning('No verified, active, capability-matched provider with usable location data was found nearby. Try manual assignment or update provider profiles.');
        return;
      }
      const candidate = candidates[0];
      setProviderChoice((current) => ({ ...current, [request.Id]: candidate.Id }));
      await assignProvider(request, candidate, 'Nearby availability check');
    } catch (err) {
      toast.error(err.message || 'Nearby provider check failed.');
    } finally {
      setBusyKey('');
    }
  }

  async function manualAssign(request) {
    const providerId = providerChoice[request.Id];
    const provider = eligibleProviders.find((item) => String(item.Id) === String(providerId));
    if (!provider) {
      toast.error('Choose an eligible provider first.');
      return;
    }
    const candidates = await getCandidates(request);
    const matched = candidates.find((item) => String(item.Id) === String(provider.Id));
    if (!matched) {
      toast.error('This provider is not eligible for the request or is outside their recorded service radius.');
      return;
    }
    await assignProvider(request, matched, 'Manual assignment');
  }

  return (
    <div>
      <PageHeader eyebrow="Operations control" title="Central LOCAL Dispatch" description="Every customer request arrives here first. LOCAL staff control assignment; providers accept or decline. No bidding, bargaining, or automatic booking confirmation. Every assignment is sent by LOCAL staff and must be accepted or declined by the provider." />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-primary p-4"><div className="text-sm text-muted-foreground">Requests in view</div><div className="mt-2 font-heading text-3xl font-semibold">{visibleRequests.length}</div></Card>
        <Card className="border-l-4 border-highlight p-4"><div className="text-sm text-muted-foreground">Verified active providers</div><div className="mt-2 font-heading text-3xl font-semibold">{eligibleProviders.length}</div></Card>
        <Card className="border-l-4 border-warning p-4"><div className="text-sm text-muted-foreground">Awaiting provider acceptance</div><div className="mt-2 font-heading text-3xl font-semibold">{responses.filter((item) => item.status_c === 'Pending' && /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))).length}</div></Card>
      </div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row">
        <div className="relative min-w-0 flex-1"><ApperIcon name="Search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request, service, or location" /></div>
        <Select value={requestFilter} onValueChange={setRequestFilter}><SelectTrigger className="w-full md:w-56"><SelectValue /></SelectTrigger><SelectContent>{['Open', 'Quoted', 'Negotiating', 'Confirmed', 'Completed', 'Cancelled', 'All'].map((value) => <SelectItem key={value} value={value}>{value === 'All' ? 'All statuses' : value}</SelectItem>)}</SelectContent></Select>
      </div>
      {loading && !data ? <div className="h-64 animate-pulse rounded-lg border bg-muted" /> : error ? <Card className="p-6"><p className="font-medium">Dispatch data could not be loaded.</p><p className="mt-2 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card> : (
        <div className="space-y-4" aria-busy={loading}>
          {visibleRequests.map((request) => {
            const activeAssignments = responses.filter((item) => String(item.request_c?.Id ?? item.request_c) === String(request.Id) && /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && !['Declined', 'Withdrawn'].includes(String(item.status_c ?? '')));
            const matchedCount = eligibleProviders.filter((provider) => {
              const distance = providerDistance(request, provider);
              const radius = Number(provider.service_radius_km_c ?? 25);
              return distance !== null && distance <= radius;
            }).length;
            return (
              <Card key={request.Id} className="overflow-hidden">
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] lg:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-lg font-semibold">{request.Name}</h2><StatusBadge value={request.status_c} /></div>
                    <p className="mt-2 text-sm text-muted-foreground">{request.service_category_c?.Name ?? 'Service'} · {request.required_capability_c?.Name ?? 'Capability not mapped'}</p>
                    <p className="mt-1 text-sm">{request.location_c || 'Location missing'}{request.preferred_time_c ? ' · ' + (request.preferred_time_c === 'ASAP' ? 'Book Now' : request.preferred_time_c) : ''}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.problem_description_c || 'No additional problem details.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border px-2.5 py-1 text-xs">{request.pricing_mode_c === 'Fixed Price' ? 'Pre-decided Price' : request.pricing_mode_c === 'Provider Quote' ? 'Inspect & Quote' : request.pricing_mode_c || 'Pricing method not set'}</span><span className="rounded-full border px-2.5 py-1 text-xs">{matchedCount} providers with nearby location data</span><span className="rounded-full border px-2.5 py-1 text-xs">{activeAssignments.length} active invitations</span></div>
                    {activeAssignments.length > 0 && <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm"><strong>Invitations already sent</strong><div className="mt-1 space-y-1">{activeAssignments.map((item) => <div key={item.Id}>{item.technician_c?.Name ?? 'Assigned provider'} — {item.status_c === 'Selected' ? 'Accepted/selected' : item.status_c === 'Pending' ? 'Awaiting response' : item.status_c}</div>)}</div></div>}
                  </div>
                  <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
                    <div className="font-semibold">Assignment controls</div>
                    <p className="mt-1 text-xs text-muted-foreground">Nearby counts are only a location-based shortlist. Eligibility is checked against saved capabilities before an invitation is sent.</p>
                    <div className="mt-4 grid gap-3">
                      <div><label className="mb-1.5 block text-sm font-medium">Manual provider assignment</label><Select value={providerChoice[request.Id] ?? ''} onValueChange={(value) => setProviderChoice((current) => ({ ...current, [request.Id]: value }))}><SelectTrigger><SelectValue placeholder="Select eligible provider" /></SelectTrigger><SelectContent>{eligibleProviders.map((provider) => <SelectItem key={provider.Id} value={provider.Id}>{provider.Name}{providerDistance(request, provider) !== null ? ' · ' + formatDistance(providerDistance(request, provider)) : ''}</SelectItem>)}</SelectContent></Select></div>
                      <Button variant="outline" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? ''))} onClick={() => manualAssign(request)}><ApperIcon name="UserCheck" size={16} /> {busyKey === request.Id + ':' + providerChoice[request.Id] ? 'Sending invitation…' : 'Assign Manually'}</Button>
                      <Button disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? ''))} onClick={() => findNearby(request)}><ApperIcon name="MapPinned" size={16} /> {busyKey === request.Id ? 'Checking nearby…' : 'Find Nearby & Invite'}</Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {!visibleRequests.length && <Card className="p-10 text-center"><p className="font-medium">No requests in this view.</p><p className="mt-1 text-sm text-muted-foreground">New customer requests will appear here after submission.</p></Card>}
        </div>
      )}
    </div>
  );
}
