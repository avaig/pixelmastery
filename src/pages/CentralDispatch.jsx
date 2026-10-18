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

  function getCleanRequestNotes(value) {
    return String(value ?? '')
      .replace(/CUSTOMER_CAR_WASH_OFFER_JSON:[\s\S]*$/i, '')
      .replace(/CAR_WASH_DECISIONS_JSON:[\s\S]*$/i, '')
      .trim();
  }

  function getFixedPrice(request) {
    const notes = String(request.problem_description_c ?? '');
    const matches = [...notes.matchAll(/(?:Menu Total|Customer Car Wash total offer|Actual Price of Service)\s*:?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    if (!matches.length) return null;
    const value = Number(matches[matches.length - 1][1].replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  async function confirmBooking(request, acceptedAssignment) {
    if (!request?.Id || !acceptedAssignment?.Id) return;
    const key = 'confirm:' + request.Id;
    setBusyKey(key);
    try {
      if (request.status_c === 'Confirmed' || request.status_c === 'Completed' || request.status_c === 'Cancelled') {
        toast.info('This request is already finalized or closed.');
        return;
      }
      const existingJobs = await sdk.table('jobs_c').select(['Id', 'Name', 'request_c', 'status_c']).where(eq('request_c', request.Id)).page(1, 20).fetch();
      if (!existingJobs.success) throw new Error(existingJobs.message || 'Could not check for an existing job.');
      if ((existingJobs.data ?? []).length) {
        if (request.status_c !== 'Confirmed') {
          const updateExisting = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Confirmed' });
          if (!updateExisting.data?.length) throw new Error(updateExisting.messages?.[0] || 'Existing job found, but request status could not be updated.');
        }
        toast.info('A job already exists for this request; no duplicate was created.');
        await run();
        return;
      }
      if (acceptedAssignment.status_c !== 'Selected' || !/Central LOCAL assignment invitation/i.test(String(acceptedAssignment.message_c ?? ''))) {
        toast.error('Only a provider who accepted a Central LOCAL assignment can be confirmed.');
        return;
      }
      const fixedPrice = request.pricing_mode_c === 'Fixed Price' ? getFixedPrice(request) : null;
      if (request.pricing_mode_c === 'Fixed Price' && fixedPrice === null) {
        toast.error('A clear, positive fixed service total could not be read. Please review the price before confirming; no job was created.');
        return;
      }
      if (request.pricing_mode_c !== 'Fixed Price') {
        toast.error('This request needs a confirmed inspection/estimate amount before booking can be finalized.');
        return;
      }
      const jobName = 'LOCAL Job • ' + request.Name;
      const jobRes = await sdk.table('jobs_c').create({
        Name: jobName,
        request_c: request.Id,
        response_c: acceptedAssignment.Id,
        customer_c: request.customer_c?.Id ?? request.customer_c ?? null,
        technician_c: acceptedAssignment.technician_c?.Id ?? acceptedAssignment.technician_c,
        agreed_price_c: fixedPrice,
        original_provider_quote_c: null,
        scheduled_at_c: request.scheduled_at_c || null,
        status_c: 'Assigned',
        payment_status_c: 'Unpaid',
        billing_status_c: 'Ready for Confirmation',
        admin_review_note_c: 'Confirmed by LOCAL Admin after provider accepted central assignment. Fixed price: ₹' + fixedPrice.toLocaleString('en-IN') + '.',
      });
      if (!jobRes.data?.length) throw new Error(jobRes.messages?.[0] || 'Job creation failed; request remains unconfirmed.');
      const requestRes = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Confirmed' });
      if (!requestRes.data?.length) {
        toast.warning('Job was created, but the request status update failed. Refresh and review the job before retrying.');
        await run();
        return;
      }
      toast.success('Booking confirmed and job created for ' + (acceptedAssignment.technician_c?.Name ?? 'the accepted provider') + '.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Booking confirmation failed.');
    } finally {
      setBusyKey('');
    }
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
            const acceptedAssignment = activeAssignments.find((item) => item.status_c === 'Selected');
            const fixedPrice = request.pricing_mode_c === 'Fixed Price' ? getFixedPrice(request) : null;
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
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{getCleanRequestNotes(request.problem_description_c) || 'No additional problem details.'}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-md border bg-background p-3"><div className="text-xs text-muted-foreground">Pricing</div><div className="mt-1 text-sm font-medium">{request.pricing_mode_c === 'Fixed Price' ? 'Pre-decided price' : request.pricing_mode_c === 'Provider Quote' ? 'Inspection / estimate' : request.pricing_mode_c || 'Not set'}</div></div><div className="rounded-md border bg-background p-3"><div className="text-xs text-muted-foreground">Service total</div><div className="mt-1 text-sm font-semibold">{fixedPrice !== null ? '₹' + fixedPrice.toLocaleString('en-IN') : 'Review required'}</div></div><div className="rounded-md border bg-background p-3"><div className="text-xs text-muted-foreground">Nearby providers</div><div className="mt-1 text-sm font-medium">{matchedCount} with location data</div></div></div>
                    {activeAssignments.length > 0 && <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm"><strong>Assignment status</strong><div className="mt-1 space-y-2">{activeAssignments.map((item) => <div key={item.Id} className="flex flex-wrap items-center justify-between gap-2"><span>{item.technician_c?.Name ?? 'Assigned provider'}</span><span className="rounded-full border px-2 py-0.5 text-xs">{item.status_c === 'Selected' ? 'Accepted' : item.status_c === 'Pending' ? 'Awaiting response' : item.status_c}</span></div>)}</div></div>}
                  </div>
                  <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
                    <div className="font-semibold">Assignment controls</div>
                    <p className="mt-1 text-xs text-muted-foreground">Nearby counts are only a location-based shortlist. Eligibility is checked against saved capabilities before an invitation is sent.</p>
                    <div className="mt-4 grid gap-3">
                      <div><label className="mb-1.5 block text-sm font-medium">Manual provider assignment</label><Select value={providerChoice[request.Id] ?? ''} onValueChange={(value) => setProviderChoice((current) => ({ ...current, [request.Id]: value }))}><SelectTrigger><SelectValue placeholder="Select eligible provider" /></SelectTrigger><SelectContent>{eligibleProviders.map((provider) => <SelectItem key={provider.Id} value={provider.Id}>{provider.Name}{providerDistance(request, provider) !== null ? ' · ' + formatDistance(providerDistance(request, provider)) : ''}</SelectItem>)}</SelectContent></Select></div>
                      <Button variant="outline" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? ''))} onClick={() => manualAssign(request)}><ApperIcon name="UserCheck" size={16} /> {busyKey === request.Id + ':' + providerChoice[request.Id] ? 'Sending invitation…' : 'Assign Manually'}</Button>
                      <Button disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? ''))} onClick={() => findNearby(request)}><ApperIcon name="MapPinned" size={16} /> {busyKey === request.Id ? 'Checking nearby…' : 'Find Nearby & Invite'}</Button>
                      {acceptedAssignment && <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><ApperIcon name="CheckCircle2" size={17} /> Provider accepted</div><p className="mt-1 text-xs text-muted-foreground">{acceptedAssignment.technician_c?.Name ?? 'Selected provider'} accepted this assignment. Admin must verify the total and confirm the booking.</p><Button className="mt-3 w-full" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? '')) || fixedPrice === null || request.pricing_mode_c !== 'Fixed Price'} onClick={() => confirmBooking(request, acceptedAssignment)}>{busyKey === 'confirm:' + request.Id ? 'Confirming booking…' : 'Confirm Booking'}</Button>{(request.pricing_mode_c !== 'Fixed Price' || fixedPrice === null) && <p className="mt-2 text-xs text-amber-700">A verified fixed total is required before this action is enabled.</p>}</div>}
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
