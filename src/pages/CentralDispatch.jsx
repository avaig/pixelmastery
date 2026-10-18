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
  const [requestFilter, setRequestFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('30');
  const [page, setPage] = useState(1);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [providerChoice, setProviderChoice] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const { data, loading, error, run } = useFetch(async () => {
    const [requestRes, providerRes, responseRes, jobsRes] = await Promise.all([
      sdk.table('service_requests_c').select(REQUEST_FIELDS).orderByDesc('CreatedOn').page(1, 500).fetch(),
      sdk.table('technician_profiles_c').select(PROVIDER_FIELDS).page(1, 1000).fetch(),
      sdk.table('technician_responses_c').select(['Id', 'Name', 'request_c', 'technician_c', 'status_c', 'availability_c', 'message_c', 'proposed_price_c']).page(1, 2000).fetch(),
      sdk.table('jobs_c').select(['Id', 'Name', 'request_c', 'technician_c', 'agreed_price_c', 'status_c', 'payment_status_c', 'billing_status_c', 'payment_method_c', 'payment_reference_c', 'payout_status_c', 'returned_at_c', 'customer_completion_confirmed_at_c', 'dispute_status_c']).page(1, 2000).fetch(),
    ]);
    if (!requestRes.success || !providerRes.success || !responseRes.success || !jobsRes.success) throw new Error('Central dispatch data could not be loaded. Check table permissions and try again.');
    return { requests: requestRes.data ?? [], providers: providerRes.data ?? [], responses: responseRes.data ?? [], jobs: jobsRes.data ?? [] };
  }, []);

  const requests = data?.requests ?? [];
  const providers = data?.providers ?? [];
  const responses = data?.responses ?? [];
  const jobs = data?.jobs ?? [];
  function getRequestJob(request) {
    return jobs.find((job) => String(job.request_c?.Id ?? job.request_c) === String(request?.Id)) ?? null;
  }
  const eligibleProviders = useMemo(() => providers.filter((provider) => {
    const verification = String(provider.verification_status_c ?? (provider.status_c === 'Active' ? 'Approved' : '')).toLowerCase();
    return provider.status_c === 'Active' && verification === 'approved';
  }), [providers]);

  const serviceNames = useMemo(() => [...new Set(requests.map((request) => request.required_capability_c?.Name ?? request.service_category_c?.Name ?? 'Service'))].sort(), [requests]);
  const recentRequests = useMemo(() => requests.filter((request) => {
    if (dateFilter === 'All') return true;
    const created = request.CreatedOn ? new Date(request.CreatedOn).getTime() : 0;
    return created > 0 && created >= Date.now() - Number(dateFilter) * 24 * 60 * 60 * 1000;
  }), [requests, dateFilter]);
  const visibleRequests = useMemo(() => recentRequests.filter((request) => {
    const matchesSearch = !search || [request.Name, request.location_c, request.problem_description_c, request.customer_c?.Name, request.service_category_c?.Name, request.required_capability_c?.Name].some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = requestFilter === 'All' || String(request.status_c ?? '') === requestFilter;
    const serviceName = request.required_capability_c?.Name ?? request.service_category_c?.Name ?? 'Service';
    const matchesService = serviceFilter === 'All' || serviceName === serviceFilter;
    return matchesSearch && matchesStatus && matchesService;
  }), [recentRequests, search, requestFilter, serviceFilter]);
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(visibleRequests.length / pageSize));
  const pagedRequests = visibleRequests.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const recentCount = recentRequests.length;
  const assignedCount = recentRequests.filter((request) => ['Confirmed', 'Assigned', 'In Progress', 'Completed'].includes(String(request.status_c)) || getRequestJob(request)).length;
  const pendingCount = recentRequests.filter((request) => ['Open', 'Quoted', 'Negotiating'].includes(String(request.status_c))).length;
  const noProviderCount = recentRequests.filter((request) => !getRequestAssignments(request).length && !getRequestJob(request) && !['Cancelled', 'Completed'].includes(String(request.status_c))).length;

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

  function isFixedPriceRequest(request) {
    if (String(request?.pricing_mode_c ?? '').toLowerCase() === 'fixed price') return true;
    const notes = String(request?.problem_description_c ?? '');
    return /(?:listed package price|menu total|customer car wash total offer|actual price of service|fixed service total|package price)\s*:/i.test(notes);
  }

  function getFixedPrice(request) {
    const notes = String(request?.problem_description_c ?? '');
    const patterns = [
      /(?:Menu Total|Customer Car Wash total offer|Actual Price of Service|Listed package price|Package price|Fixed service total|Service total)\s*:?\s*(?:₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ];
    const matches = patterns.flatMap((pattern) => [...notes.matchAll(pattern)]);
    if (!matches.length) return null;
    // When multiple amounts are listed, use the explicit total/package price, not an incidental item price.
    const preferred = [...notes.matchAll(/(?:Menu Total|Customer Car Wash total offer|Fixed service total|Listed package price|Package price|Service total)\s*:?\s*(?:₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    const selected = preferred.length ? preferred[preferred.length - 1] : matches[matches.length - 1];
    const value = Number(selected[1].replace(/,/g, ''));
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
      const fixedPrice = isFixedPriceRequest(request) ? getFixedPrice(request) : null;
      if (isFixedPriceRequest(request) && fixedPrice === null) {
        toast.error('A clear, positive fixed service total could not be read. Please review the price before confirming; no job was created.');
        return;
      }
      if (!isFixedPriceRequest(request)) {
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

  const selectedRequest = requests.find((request) => String(request.Id) === String(selectedRequestId));

  function getRequestAssignments(request) {
    return responses.filter((item) =>
      String(item.request_c?.Id ?? item.request_c) === String(request.Id)
      && /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))
      && !['Declined', 'Withdrawn'].includes(String(item.status_c ?? ''))
    );
  }

  function renderRequestDetail(request) {
    const linkedJob = getRequestJob(request);
    const activeAssignments = getRequestAssignments(request);
    const acceptedAssignment = activeAssignments.find((item) => item.status_c === 'Selected');
    const fixedPrice = isFixedPriceRequest(request) ? getFixedPrice(request) : null;
    const nearbyCount = eligibleProviders.filter((provider) => {
      const distance = providerDistance(request, provider);
      return distance !== null && distance <= Number(provider.service_radius_km_c ?? 25);
    }).length;
    const customerName = request.customer_c?.Name ?? 'Customer';
    const customerPhone = request.customer_c?.phone_c ?? request.customer_c?.Phone ?? '';

    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedRequestId(null)} className="-ml-3">
          <ApperIcon name="ArrowLeft" size={16} /> Back to requests
        </Button>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request detail</p>
                <h2 className="mt-1 font-heading text-xl font-semibold">{request.Name}</h2>
              </div>
              <StatusBadge value={request.status_c} />
            </div>
            <div className="space-y-5 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-3 text-primary"><ApperIcon name="CarFront" size={26} /></div>
                <div>
                  <div className="font-semibold">{request.service_category_c?.Name ?? 'Service'} · {request.required_capability_c?.Name ?? 'Capability not mapped'}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{isFixedPriceRequest(request) ? 'Fixed package price' : request.pricing_mode_c === 'Provider Quote' ? 'Inspection / estimate required' : request.pricing_mode_c || 'Pricing not set'}</p>
                </div>
              </div>
              <div className="grid gap-4 border-y py-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Customer</p><p className="mt-1 font-medium">{customerName}</p>{customerPhone && <p className="text-sm text-muted-foreground">{customerPhone}</p>}</div>
                <div><p className="text-xs text-muted-foreground">Service location</p><p className="mt-1 font-medium">{request.location_c || 'Location missing'}</p>{request.latitude_c != null && request.longitude_c != null && <p className="text-xs text-muted-foreground">GPS location available</p>}</div>
                <div><p className="text-xs text-muted-foreground">Requested time</p><p className="mt-1 font-medium">{request.preferred_time_c === 'ASAP' ? 'Book Now' : request.preferred_time_c || 'Not specified'}</p>{request.scheduled_at_c && <p className="text-sm text-muted-foreground">{new Date(request.scheduled_at_c).toLocaleString('en-IN')}</p>}</div>
                <div><p className="text-xs text-muted-foreground">Nearby eligible providers</p><p className="mt-1 font-medium">{nearbyCount} with recorded location</p></div>
              </div>
              {linkedJob && <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h3 className="font-semibold">Job completion and payment</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Job status</p><div className="mt-1"><StatusBadge value={linkedJob.status_c || 'Unknown'} /></div></div>
                  <div><p className="text-xs text-muted-foreground">Payment status</p><div className="mt-1"><StatusBadge value={linkedJob.payment_status_c || 'Not recorded'} /></div></div>
                  <div><p className="text-xs text-muted-foreground">Billing status</p><p className="mt-1 font-medium">{linkedJob.billing_status_c || 'Not recorded'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Final agreed amount</p><p className="mt-1 font-semibold">₹{Number(linkedJob.agreed_price_c ?? 0).toLocaleString('en-IN')}</p></div>
                  <div><p className="text-xs text-muted-foreground">Payment method / reference</p><p className="mt-1 font-medium">{linkedJob.payment_method_c || 'Not recorded'}{linkedJob.payment_reference_c ? ' · ' + linkedJob.payment_reference_c : ''}</p></div>
                  <div><p className="text-xs text-muted-foreground">Provider payout</p><p className="mt-1 font-medium">{linkedJob.payout_status_c || 'Not recorded'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Car returned</p><p className="mt-1 font-medium">{linkedJob.returned_at_c ? new Date(linkedJob.returned_at_c).toLocaleString('en-IN') : 'Not recorded'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Customer completion confirmation</p><p className="mt-1 font-medium">{linkedJob.customer_completion_confirmed_at_c ? new Date(linkedJob.customer_completion_confirmed_at_c).toLocaleString('en-IN') : 'Not recorded'}</p></div>
                  {linkedJob.dispute_status_c && linkedJob.dispute_status_c !== 'None' && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Dispute status</p><p className="mt-1 font-medium">{linkedJob.dispute_status_c}</p></div>}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Request status and job status are tracked separately. This panel reads the job linked to this service request.</p>
              </section>}
              <section>
                <h3 className="font-semibold">Service details and customer notes</h3>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-sm leading-6">{getCleanRequestNotes(request.problem_description_c) || 'No additional problem details were provided.'}</p>
              </section>
              <section className="rounded-lg border p-4">
                <h3 className="font-semibold">Price review</h3>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{request.pricing_mode_c === 'Fixed Price' ? 'Detected fixed service total' : 'Inspection / estimate amount'}</span>
                  <span className="text-xl font-bold">{fixedPrice !== null ? '₹' + fixedPrice.toLocaleString('en-IN') : 'Review required'}</span>
                </div>
                {request.pricing_mode_c !== 'Fixed Price' && <p className="mt-2 text-xs text-amber-700">Do not confirm until the estimate is recorded and the customer has approved it.</p>}
              </section>
            </div>
          </Card>
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-2"><ApperIcon name="Settings2" size={19} /><h3 className="font-semibold">Assignment controls</h3></div>
              <p className="mt-1 text-sm text-muted-foreground">Choose a verified provider or invite the nearest eligible provider. No bidding or counter-offers.</p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Manual assignment</label>
                  <Select value={providerChoice[request.Id] ?? ''} onValueChange={(value) => setProviderChoice((current) => ({ ...current, [request.Id]: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select eligible provider" /></SelectTrigger>
                    <SelectContent>{eligibleProviders.map((provider) => <SelectItem key={provider.Id} value={provider.Id}>{provider.Name}{providerDistance(request, provider) !== null ? ' · ' + formatDistance(providerDistance(request, provider)) : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button className="w-full" variant="outline" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? ''))} onClick={() => manualAssign(request)}>
                  <ApperIcon name="UserCheck" size={16} /> {busyKey === request.Id + ':' + providerChoice[request.Id] ? 'Sending invitation…' : 'Assign manually'}
                </Button>
                <Button className="w-full" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? ''))} onClick={() => findNearby(request)}>
                  <ApperIcon name="MapPinned" size={16} /> {busyKey === request.Id ? 'Checking nearby…' : 'Find Nearby & Invite'}
                </Button>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold">Provider status</h3>
              {activeAssignments.length ? <div className="mt-3 space-y-3">{activeAssignments.map((item) => {
                const provider = providers.find((entry) => String(entry.Id) === String(item.technician_c?.Id ?? item.technician_c));
                const distance = provider ? providerDistance(request, provider) : null;
                return <div key={item.Id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2"><div className="font-medium">{item.technician_c?.Name ?? provider?.Name ?? 'Assigned provider'}</div><StatusBadge value={item.status_c === 'Selected' ? 'Accepted' : item.status_c === 'Pending' ? 'Awaiting response' : item.status_c} /></div>
                  <p className="mt-1 text-sm text-muted-foreground">{distance !== null ? formatDistance(distance) + ' away' : 'Distance unavailable'}</p>
                </div>;
              })}</div> : <p className="mt-2 text-sm text-muted-foreground">No provider has been invited yet.</p>}
              {acceptedAssignment && <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-700"><ApperIcon name="CheckCircle2" size={17} /> Provider accepted</div>
                <p className="mt-1 text-sm text-muted-foreground">Verify the service and total before confirming this booking.</p>
                <Button className="mt-3 w-full" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? '')) || fixedPrice === null || !isFixedPriceRequest(request)} onClick={() => confirmBooking(request, acceptedAssignment)}>{busyKey === 'confirm:' + request.Id ? 'Confirming booking…' : 'Confirm Booking'}</Button>
                {(!isFixedPriceRequest(request) || fixedPrice === null) && <p className="mt-2 text-xs text-amber-700">{isFixedPriceRequest(request) ? 'The listed fixed price could not be read. Review the request price before confirming.' : 'Estimate-based jobs remain blocked until an estimate is recorded and customer approval is implemented.'}</p>}
              </div>}
            </Card>
          </div>
        </div>
      </div>
    );
  }

  function formatCreated(value) {
    if (!value) return 'Date not recorded';
    return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function serviceIcon(request) {
    const value = String(request.required_capability_c?.Name ?? request.service_category_c?.Name ?? '').toLowerCase();
    if (/ambulance/.test(value)) return 'Ambulance';
    if (/ac|air condition/.test(value)) return 'AirVent';
    if (/wash/.test(value)) return 'CarFront';
    if (/bike|motorcycle|scooter/.test(value)) return 'Bike';
    if (/electric|plumb|home/.test(value)) return 'Wrench';
    return 'CarFront';
  }

  function displayLifecycle(request, job, acceptedAssignment) {
    if (job) {
      if (job.status_c === 'Completed' && ['Final Payment Paid', 'Paid', 'Completed'].includes(String(job.payment_status_c))) return { label: 'Completed · Paid', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
      if (job.status_c === 'Completed') return { label: 'Completed · Payment pending', tone: 'border-amber-200 bg-amber-50 text-amber-700' };
      if (job.payment_status_c === 'Final Payment Paid') return { label: 'Paid', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
      return { label: job.status_c || 'Job created', tone: 'border-blue-200 bg-blue-50 text-blue-700' };
    }
    if (acceptedAssignment) return { label: 'Provider accepted', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    if (getRequestAssignments(request).some((item) => item.status_c === 'Pending')) return { label: 'Awaiting acceptance', tone: 'border-amber-200 bg-amber-50 text-amber-700' };
    if (['Cancelled', 'Completed'].includes(String(request.status_c))) return { label: request.status_c, tone: 'border-slate-200 bg-slate-50 text-slate-700' };
    return { label: 'Finding provider', tone: 'border-violet-200 bg-violet-50 text-violet-700' };
  }

  return (
    <div className="min-w-0 space-y-5 text-slate-900">
      <PageHeader eyebrow="" title="Central Dispatch" description="Manage and assign customer service requests" />
      {loading && !data ? <div className="h-64 animate-pulse rounded-lg border bg-muted" /> : error ? <Card className="p-6"><p className="font-medium">Dispatch data could not be loaded.</p><p className="mt-2 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card> : selectedRequest ? renderRequestDetail(selectedRequest) : (
        <>
          <div className="mb-5 grid grid-cols-4 gap-2">
            <Card className="flex min-w-0 items-center gap-2 border-blue-100 bg-gradient-to-br from-white to-blue-50/80 p-2.5 shadow-sm"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><ApperIcon name="ClipboardList" size={23} /></div><div><p className="text-sm text-slate-600">Total Requests <span className="block text-xs">({dateFilter === 'All' ? 'All Time' : 'Last ' + dateFilter + ' Days'})</span></p><p className="text-3xl font-bold tracking-tight">{recentCount}</p></div></Card>
            <Card className="flex min-w-0 items-center gap-2 border-emerald-100 bg-gradient-to-br from-white to-emerald-50/80 p-2.5 shadow-sm"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><ApperIcon name="Check" size={25} /></div><div><p className="text-sm text-slate-600">Assigned</p><p className="text-3xl font-bold tracking-tight">{assignedCount} <span className="text-sm font-semibold text-emerald-700">{recentCount ? Math.round(assignedCount / recentCount * 100) : 0}%</span></p></div></Card>
            <Card className="flex min-w-0 items-center gap-2 border-orange-100 bg-gradient-to-br from-white to-orange-50/80 p-2.5 shadow-sm"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white"><ApperIcon name="Clock3" size={25} /></div><div><p className="text-sm text-slate-600">Pending Review</p><p className="text-3xl font-bold tracking-tight">{pendingCount} <span className="text-sm font-semibold text-orange-600">{recentCount ? Math.round(pendingCount / recentCount * 100) : 0}%</span></p></div></Card>
            <Card className="flex min-w-0 items-center gap-2 border-purple-100 bg-gradient-to-br from-white to-purple-50/80 p-2.5 shadow-sm"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white"><ApperIcon name="X" size={25} /></div><div><p className="text-sm text-slate-600">No Provider Available</p><p className="text-3xl font-bold tracking-tight">{noProviderCount} <span className="text-sm font-semibold text-slate-500">{recentCount ? Math.round(noProviderCount / recentCount * 100) : 0}%</span></p></div></Card>


          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1"><ApperIcon name="Search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input className="h-11 border-slate-200 pl-10 text-slate-800" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by customer name, service, location…" /></div>
            <Select value={serviceFilter} onValueChange={(value) => { setServiceFilter(value); setPage(1); }}><SelectTrigger className="h-11 w-full border-slate-200 xl:w-44"><SelectValue placeholder="All Services" /></SelectTrigger><SelectContent><SelectItem value="All">All Services</SelectItem>{serviceNames.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
            <Select value={requestFilter} onValueChange={(value) => { setRequestFilter(value); setPage(1); }}><SelectTrigger className="h-11 w-full border-slate-200 lg:w-36 xl:w-40"><SelectValue /></SelectTrigger><SelectContent>{['All', 'Open', 'Quoted', 'Negotiating', 'Confirmed', 'Completed', 'Cancelled'].map((value) => <SelectItem key={value} value={value}>{value === 'All' ? 'All Status' : value}</SelectItem>)}</SelectContent></Select>
            <Select value={dateFilter} onValueChange={(value) => { setDateFilter(value); setPage(1); }}><SelectTrigger className="h-11 w-full border-slate-200 xl:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">Last 30 Days</SelectItem><SelectItem value="7">Last 7 Days</SelectItem><SelectItem value="90">Last 90 Days</SelectItem><SelectItem value="All">All Time</SelectItem></SelectContent></Select>
            <Button className="h-11 border-blue-200 text-blue-700 hover:bg-blue-50" variant="outline" onClick={run} disabled={loading}><ApperIcon name="RefreshCw" size={17} /> Refresh</Button>
          </div>
          <div className="space-y-2.5" aria-busy={loading}>
            {visibleRequests.map((request) => {
              const linkedJob = getRequestJob(request);
              const activeAssignments = getRequestAssignments(request);
              const acceptedAssignment = activeAssignments.find((item) => item.status_c === 'Selected');
              const assignedProvider = acceptedAssignment ? providers.find((item) => String(item.Id) === String(acceptedAssignment.technician_c?.Id ?? acceptedAssignment.technician_c)) : null;
              const fixedPrice = isFixedPriceRequest(request) ? getFixedPrice(request) : null;
              const distance = assignedProvider ? providerDistance(request, assignedProvider) : null;
              const lifecycle = displayLifecycle(request, linkedJob, acceptedAssignment);
              const providerName = linkedJob?.technician_c?.Name ?? assignedProvider?.Name ?? activeAssignments[0]?.technician_c?.Name ?? 'Not assigned yet';
              const customerName = request.customer_c?.Name ?? 'Customer details unavailable';
              const customerPhone = request.customer_c?.phone_c ?? request.customer_c?.Phone ?? request.customer_c?.mobile_c ?? '';
              const capabilityName = request.required_capability_c?.Name ?? request.service_category_c?.Name ?? 'Service';
              const total = linkedJob?.agreed_price_c ?? fixedPrice;
              return <Card key={request.Id} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
                <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(170px,1.05fr)_minmax(175px,1.12fr)_minmax(145px,0.92fr)_minmax(175px,1.12fr)_145px]">
                  <div className="flex min-w-0 items-start gap-3 p-4">
                    <div className={'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ' + (/ambulance/i.test(capabilityName) ? 'bg-rose-50 text-rose-600' : /ac|air condition/i.test(capabilityName) ? 'bg-violet-50 text-violet-600' : /wash/i.test(capabilityName) ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600')}><ApperIcon name={serviceIcon(request)} size={27} /></div>
                    <div className="min-w-0"><h2 className="break-words font-semibold leading-5 text-slate-900">{request.Name}</h2><p className="mt-1 text-xs text-slate-500">{formatCreated(request.CreatedOn)}</p><span className="mt-2 inline-flex max-w-full rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{capabilityName}</span></div>
                  </div>
                  <div className="space-y-2 border-t border-slate-100 p-4 xl:border-l xl:border-t-0"><p className="flex items-start gap-2 text-sm text-slate-700"><ApperIcon name="MapPin" size={16} className="mt-0.5 shrink-0 text-slate-500" /><span>{request.location_c || 'Location not recorded'}</span></p><p className="flex items-start gap-2 text-sm font-semibold text-slate-800"><ApperIcon name="IndianRupee" size={16} className="mt-0.5 shrink-0 text-slate-500" /><span>{(total !== null && total !== undefined ? '₹' + Number(total).toLocaleString('en-IN') : request.pricing_mode_c === 'Fixed Price' ? 'Price review needed' : 'Inspection charge / estimate')}{/wash/i.test(capabilityName) && /Pickup\s*&\s*Drop\s*—?\s*₹?\s*100/i.test(String(request.problem_description_c ?? '')) ? ' (incl. Pickup & Drop ₹100)' : ''}</span></p><p className="flex items-start gap-2 text-sm text-slate-700"><ApperIcon name="CalendarDays" size={16} className="mt-0.5 shrink-0 text-slate-500" /><span>{request.preferred_time_c === 'ASAP' ? 'Book Now' : request.scheduled_at_c ? new Date(request.scheduled_at_c).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : request.preferred_time_c || 'Time not recorded'}</span></p></div>
                  <div className="space-y-2 border-t border-slate-100 p-4 xl:border-l xl:border-t-0"><p className="flex items-center gap-2 text-xs text-slate-500"><ApperIcon name="UserRound" size={15} /> Customer</p><p className="flex items-start gap-2 text-sm font-medium text-slate-800"><ApperIcon name="User" size={15} className="mt-0.5 shrink-0 text-slate-500" /><span>{customerName}</span></p>{customerPhone && <p className="flex items-start gap-2 text-sm text-slate-700"><ApperIcon name="Phone" size={15} className="mt-0.5 shrink-0 text-slate-500" /><span>{customerPhone}</span></p>}</div>
                  <div className="space-y-2 border-t border-slate-100 p-4 xl:border-l xl:border-t-0"><p className="text-xs text-slate-500">Assignment Method</p><span className={'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ' + (activeAssignments.some((item) => /Nearby/i.test(String(item.message_c))) ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-blue-200 bg-blue-50 text-blue-700')}>{activeAssignments.some((item) => /Nearby/i.test(String(item.message_c))) ? 'Nearby Check' : activeAssignments.length ? 'Manual Assignment' : 'Not assigned'}</span><p className="pt-1 text-xs text-slate-500">Assigned Provider</p><p className="flex items-center gap-2 text-sm font-medium text-slate-800"><ApperIcon name="UserRound" size={15} className="shrink-0 text-slate-500" /><span>{providerName}</span></p>{activeAssignments.length > 0 && <p className={'flex items-center gap-1.5 text-xs font-medium ' + (acceptedAssignment ? 'text-emerald-700' : 'text-amber-700')}><ApperIcon name={acceptedAssignment ? 'CheckCircle2' : 'Clock3'} size={14} />{acceptedAssignment ? 'Accepted' : 'Awaiting Acceptance'}</p>}{linkedJob && <p className="text-xs text-slate-500">Payout: {linkedJob.payout_status_c || 'Not recorded'}</p>}</div>
                  <div className="flex flex-col items-stretch justify-center gap-2 border-t border-slate-100 p-4 xl:border-l xl:border-t-0"><span className={'inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-center text-xs font-semibold ' + lifecycle.tone}><ApperIcon name={linkedJob?.status_c === 'Completed' && linkedJob?.payment_status_c === 'Final Payment Paid' ? 'CheckCircle2' : acceptedAssignment ? 'CheckCircle2' : 'Clock3'} size={14} />{lifecycle.label}</span><Button className="w-full border-slate-200 text-slate-800" variant="outline" onClick={() => setSelectedRequestId(request.Id)}><ApperIcon name="Eye" size={16} /> View Details <ApperIcon name="ChevronDown" size={14} /></Button></div>
                </div>
              </Card>;
            })}
            {!pagedRequests.length && <Card className="p-10 text-center"><p className="font-medium">No requests in this view.</p><p className="mt-1 text-sm text-muted-foreground">Try another service, status, date range or search term.</p></Card>}
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-row"><p className="text-sm text-slate-600">Showing {visibleRequests.length ? (Math.min(page, pageCount) - 1) * pageSize + 1 : 0}–{Math.min(page, pageCount) * pageSize} of {visibleRequests.length} requests</p><div className="flex items-center gap-1"><Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ApperIcon name="ChevronLeft" size={16} /></Button>{Array.from({ length: Math.min(pageCount, 5) }, (_, index) => { const pageNumber = pageCount <= 5 ? index + 1 : Math.min(Math.max(1, page - 2), pageCount - 4) + index; return <Button key={pageNumber} variant={Math.min(page, pageCount) === pageNumber ? 'default' : 'outline'} className="h-9 w-9" onClick={() => setPage(pageNumber)}>{pageNumber}</Button>; })}<Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ApperIcon name="ChevronRight" size={16} /></Button></div></div>
        </>
      )}
    </div>
  );
}