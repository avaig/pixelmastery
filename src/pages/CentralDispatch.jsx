import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useFunction } from '@/hooks/useFunction';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import { getDistanceKm, formatDistance, getProviderCapabilities, providerCanHandleRequest } from '@/services/providerMatching';
import { calculateDriverOnDemandTariff } from '@/services/pricing';

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

function readDriverTripMetadata(note, marker) {
  const source = String(note ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  const raw = source.slice(index + marker.length);
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function readCarEssentialsQuote(message) {
  const marker = 'LOCAL_CAR_ESSENTIALS_QUOTE_JSON:';
  const source = String(message ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).trim()); return payload && Array.isArray(payload.items) && Number.isFinite(Number(payload.total)) ? payload : null; } catch { return null; }
}

function readCarEssentialsApproval(description) {
  const marker = 'LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).trim()); return payload && payload.approved === true ? payload : null; } catch { return null; }
}

function readCarWashMarkerJson(description, marker) {
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  const raw = source.slice(index + marker.length).replace(/^(?:\\\\n|\\n|\\r\\n|\\r)+/, '').trimStart();
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function readCarWashQuote(description) {
  const payload = readCarWashMarkerJson(description, 'LOCAL_CAR_WASH_QUOTE_JSON:');
  return payload && Number.isFinite(Number(payload.total)) ? payload : null;
}

function readCarWashApproval(description) {
  const payload = readCarWashMarkerJson(description, 'LOCAL_CAR_WASH_APPROVAL_JSON:');
  return payload && payload.approved === true ? payload : null;
}

function readRsaQuote(message) {
  const marker = 'LOCAL_RSA_QUOTE_JSON:';
  const source = String(message ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).trim()); return payload && Number.isFinite(Number(payload.total)) ? payload : null; } catch { return null; }
}

function readBikeMaintenanceQuote(message) {
  const marker = 'LOCAL_BIKE_MAINTENANCE_QUOTE_JSON:';
  const source = String(message ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try {
    const payload = JSON.parse(source.slice(index + marker.length).trim());
    return payload && Number.isFinite(Number(payload.serviceTotal)) ? payload : null;
  } catch { return null; }
}

function readDriverQuote(description) {
  const marker = 'LOCAL_DRIVER_BOOKING_QUOTE_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && Number.isFinite(Number(payload.serviceAmount)) && Number.isFinite(Number(payload.customerTotal)) ? payload : null; } catch { return null; }
}

function readDriverApproval(description) {
  const marker = 'LOCAL_DRIVER_BOOKING_APPROVAL_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && payload.approved === true ? payload : null; } catch { return null; }
}

function readDriverRoute(description) {
  const marker = 'LOCAL_DRIVER_ROUTE_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  const raw = source.slice(index + marker.length).trimStart();
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const route = JSON.parse(raw.slice(start, i + 1));
          return route && route.pickup && route.dropoff ? route : null;
        } catch { return null; }
      }
    }
  }
  return null;
}

function isDriverBookingRequest(request) {
  return /car driver on demand|driver on demand|hourly driver|full[- ]day driver|outstation driver|emergency driver|scheduled driver|professional car driver/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
}

function readRsaApproval(description) {
  const marker = 'LOCAL_RSA_APPROVAL_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && payload.approved === true ? payload : null; } catch { return null; }
}

function isRsaQuoteRequest(request) {
  const text = String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? '');
  return !/emergency car rental/i.test(text) && /battery jump start|flat tyre|flat tire|puncture|diesel on demand|key locked|lockout|towing required/i.test(text);
}

function readCancellationDetails(description) {
  const source = String(description ?? '');
  const marker = 'LOCAL_CANCELLATION_JSON:';
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try {
    const payload = JSON.parse(source.slice(index + marker.length).split('\n')[0]);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function formatCancellationTime(value) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}
const PROVIDER_FIELDS = ['Id', 'Name', 'email_c', 'phone_c', 'status_c', 'verification_status_c', 'availability_c', 'service_area_c', 'latitude_c', 'longitude_c', 'service_radius_km_c'];

function RequestServiceLocation({ request, customerAddress }) {
  const [resolvedAddress, setResolvedAddress] = useState('');
  useEffect(() => {
    let active = true;
    const requestAddress = String(request?.location_c || '').trim();
    const profileAddress = String(customerAddress || '').trim();
    const isPlaceholder = (value) => !value || /to be confirmed by LOCAL Customer Care|saved customer address not available|address could not be resolved/i.test(value);
    const savedAddress = !isPlaceholder(requestAddress) ? requestAddress : (!isPlaceholder(profileAddress) ? profileAddress : '');
    if (savedAddress) {
      setResolvedAddress(savedAddress);
      return () => { active = false; };
    }
    setResolvedAddress('Resolving address from the captured location…');
    const latitude = Number(request?.latitude_c);
    const longitude = Number(request?.longitude_c);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setResolvedAddress('Address not recorded');
      return () => { active = false; };
    }
    fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=' + encodeURIComponent(latitude) + '&lon=' + encodeURIComponent(longitude), { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Address lookup unavailable')))
      .then((result) => {
        if (active) setResolvedAddress(String(result?.display_name || '').trim() || 'Address unavailable — use the map pin below.');
      })
      .catch(() => {
        if (active) setResolvedAddress('Address unavailable — use the map pin below.');
      });
    return () => { active = false; };
  }, [request?.Id, request?.location_c, request?.latitude_c, request?.longitude_c, customerAddress]);

  return (
    <div>
      <p className="text-xs text-muted-foreground">Service location</p>
      <p className="mt-1 font-medium">{resolvedAddress || 'Resolving address from the captured location…'}</p>
      {request?.latitude_c != null && request?.longitude_c != null && (
        <a href={'https://www.google.com/maps?q=' + encodeURIComponent(request.latitude_c + ',' + request.longitude_c)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary underline underline-offset-4">
          <ApperIcon name="MapPin" size={15} /> View Customer Location
        </a>
      )}
    </div>
  );
}

export default function CentralDispatch() {
  const [search, setSearch] = useState('');
  const [requestFilter, setRequestFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('30');
  const [page, setPage] = useState(1);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [providerChoice, setProviderChoice] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [carWashQuoteInputs, setCarWashQuoteInputs] = useState({});
  const [carWashCalculatedQuotes, setCarWashCalculatedQuotes] = useState({});
  const [driverQuoteDrafts, setDriverQuoteDrafts] = useState({});
  const { invoke: calculateDriverTariffOnServer } = useFunction(import.meta.env.VITE_CALCULATE_DRIVER_ON_DEMAND_TARIFF, { showError: true });
  const { data, loading, error, run } = useFetch(async () => {
    const [requestRes, providerRes, responseRes, jobsRes, customerRes] = await Promise.all([
      sdk.table('service_requests_c').select(REQUEST_FIELDS).orderByDesc('CreatedOn').page(1, 500).fetch(),
      sdk.table('technician_profiles_c').select(PROVIDER_FIELDS).page(1, 1000).fetch(),
      sdk.table('technician_responses_c').select(['Id', 'Name', 'request_c', 'technician_c', 'status_c', 'availability_c', 'message_c', 'proposed_price_c']).page(1, 2000).fetch(),
      sdk.table('jobs_c').select(['Id', 'Name', 'request_c', 'technician_c', 'agreed_price_c', 'local_service_fee_amount_c', 'customer_payable_now_c', 'status_c', 'payment_status_c', 'billing_status_c', 'payment_method_c', 'payment_reference_c', 'payout_status_c', 'returned_at_c', 'customer_completion_confirmed_at_c', 'dispute_status_c', 'service_start_otp_c', 'service_start_otp_verified_at_c', 'admin_review_note_c', 'original_provider_quote_c']).page(1, 2000).fetch(),
      sdk.table('customer_profiles_c').select(['Id', 'Name', 'phone_c', 'email_c', 'location_c']).page(1, 2000).fetch(),
    ]);
    if (!requestRes.success || !providerRes.success || !responseRes.success || !jobsRes.success || !customerRes.success) throw new Error('Central dispatch data could not be loaded. Check table permissions and try again.');
    return { requests: requestRes.data ?? [], providers: providerRes.data ?? [], responses: responseRes.data ?? [], jobs: jobsRes.data ?? [], customers: customerRes.data ?? [] };
  }, []);

  const requests = data?.requests ?? [];
  const providers = data?.providers ?? [];
  const responses = data?.responses ?? [];
  const jobs = data?.jobs ?? [];
  const customers = data?.customers ?? [];
  function getRequestCustomer(request) {
    const customerId = String(request?.customer_c?.Id ?? request?.customer_c ?? '');
    return customers.find((customer) => String(customer.Id) === customerId) ?? request?.customer_c ?? null;
  }
  useEffect(() => {
    if (!data?.requests?.length || !data?.jobs?.length) return;
    let cancelled = false;
    const reconcileApprovedCarWashJobs = async () => {
      let changed = false;
      for (const request of data.requests) {
        if (cancelled || getStructuredServiceDetails(request).type !== 'Car Wash') continue;
        const quote = readCarWashQuote(request.problem_description_c);
        const approval = readCarWashApproval(request.problem_description_c);
        if (!quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.total) || !Number.isFinite(Number(quote.total))) continue;
        const linkedJob = data.jobs.find((job) => String(job.request_c?.Id ?? job.request_c ?? '') === String(request.Id));
        if (!linkedJob || Number(linkedJob.agreed_price_c) === Number(quote.total)) continue;
        // The customer's exact approved quote is authoritative for Car Wash, not the original catalog/package price.
        const changes = { Id: linkedJob.Id, agreed_price_c: Number(quote.total), original_provider_quote_c: Number(quote.total) };
        if (linkedJob.payment_status_c !== 'Final Payment Paid') {
          changes.remaining_amount_c = Number(quote.total);
          changes.customer_payable_now_c = Number(quote.total);
        }
        const result = await sdk.table('jobs_c').update(changes);
        if (result.data?.length) changed = true;
        else console.warn('Could not sync approved Car Wash quote for job', linkedJob.Id, result.messages?.[0]);
      }
      if (!cancelled && changed) await run();
    };
    reconcileApprovedCarWashJobs();
    return () => { cancelled = true; };
  }, [data?.requests, data?.jobs, run]);
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
    if (isDriverBookingRequest(request)) {
      const quote = readDriverQuote(request.problem_description_c);
      const approval = readDriverApproval(request.problem_description_c);
      if (!quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.customerTotal)) {
        toast.error('Driver search is locked until the customer approves the Customer Care quotation.');
        return;
      }
    }
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

  function calculateCarWashQuote(details, values = {}) {
    const serviceSubtotal = Number(values.customerQuotedAmount ?? details.total ?? 0);
    const discount = Number(values.discount ?? 0);
    const pickupDropCharge = Number(values.pickupCharge ?? 0);
    const platformFee = Number(values.platformFee ?? 25);
    if (!Number.isFinite(serviceSubtotal) || serviceSubtotal < 0) return { error: 'Customer Quoted Amount must be ₹0 or more.' };
    if (!Number.isFinite(discount) || discount < 0 || discount > serviceSubtotal) return { error: 'Discount Offered must be between ₹0 and Customer Quoted Amount.' };
    if (!Number.isFinite(pickupDropCharge) || pickupDropCharge < 0) return { error: 'Pick up and drop must be ₹0 or more.' };
    if (!Number.isFinite(platformFee) || platformFee < 0) return { error: 'Local Platform Fee must be ₹0 or more.' };
    return { discount, pickupDrop: pickupDropCharge > 0, pickupDropCharge, platformFee, serviceSubtotal, total: serviceSubtotal - discount + pickupDropCharge + platformFee, refreshedAt: Date.now() };
  }

  function refreshCarWashQuote(request, details, visibleInput = null) {
    const current = visibleInput ?? carWashQuoteInputs[request.Id] ?? {};
    const calculation = calculateCarWashQuote(details, current);
    if (calculation.error) { toast.error(calculation.error); return; }
    setCarWashCalculatedQuotes((old) => ({...old, [request.Id]: calculation}));
    toast.success('Quote total refreshed.');
  }

  async function sendCarWashQuote(request, details) {
    const current = carWashQuoteInputs[request.Id] ?? {};
    const calculation = calculateCarWashQuote(details, current);
    if (calculation.error) { toast.error(calculation.error); return; }
    const refreshed = carWashCalculatedQuotes[request.Id];
    if (!refreshed || ['serviceSubtotal','discount','pickupDropCharge','platformFee','total'].some((key) => Number(refreshed[key]) !== Number(calculation[key]))) {
      toast.error('Please press Refresh Final Quote Total before sending, and refresh again after changing any amount.');
      return;
    }
    const subtotal = Number(calculation.serviceSubtotal || 0);
    const pickupDrop = calculation.pickupDropCharge > 0;
    const finalDiscount = calculation.discount;
    const finalPickupCharge = calculation.pickupDropCharge;
    const platformFee = calculation.platformFee;
    const total = calculation.total;

    if (!(subtotal > 0) || !Number.isFinite(total) || total < 25) {
      toast.error('Please review the service subtotal and quote amounts.');
      return;
    }
    setBusyKey('car-wash-quote:' + request.Id);
    try {
      const previous = readCarWashQuote(request.problem_description_c);
      const quote = {
        quoteId: 'CW-' + Date.now(),
        version: Number(previous?.version || 0) + 1,
        serviceSubtotal: subtotal,
        discount: finalDiscount,
        platformFee,
        pickupDrop,
        pickupDropCharge: finalPickupCharge,
        total,
        status: 'Sent to Customer',
        sentAt: new Date().toISOString(),
        sentBy: 'LOCAL Customer Care',
        reason: String(current.reason || '').trim(),
      };
      const clean = String(request.problem_description_c || '').split('LOCAL_CAR_WASH_QUOTE_JSON:')[0].split('LOCAL_CAR_WASH_APPROVAL_JSON:')[0].trimEnd();
      const result = await sdk.table('service_requests_c').update({
        Id: request.Id,
        status_c: 'Quoted',
        problem_description_c: clean + '\nLOCAL_CAR_WASH_QUOTE_JSON:' + JSON.stringify(quote),
      });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Revised quote could not be saved.');
      toast.success('Revised quote sent to the customer for approval.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not send the revised quote.');
    } finally {
      setBusyKey('');
    }
  }

  async function saveDriverQuote(request) {
    const draft = driverQuoteDrafts[request.Id] ?? {};
    const travelType = String(draft.travelType ?? '').trim();
    const savedRoute = readDriverRoute(request.problem_description_c);
    const routeSummary = savedRoute ? [savedRoute.pickup?.text, savedRoute.dropoff?.text, ...(Array.isArray(savedRoute.stops) ? savedRoute.stops : [])].filter(Boolean).join(' → ') : '';
    const tripDetails = String(draft.tripDetails ?? routeSummary).trim();
    const pickupDate = String(draft.pickupDate ?? '').trim();
    const pickupTime = String(draft.pickupTime ?? '').trim();
    const durationHours = Number(draft.durationHours);
    const schedule = [pickupDate, pickupTime, `${durationHours} hour(s)`].filter(Boolean).join(' · ');
    const travellers = String(draft.travellers ?? '').trim();
    const otherCharges = Number(draft.otherCharges ?? 0);
    const notes = String(draft.terms ?? '').trim();
    if (!travelType || !tripDetails || !pickupDate || !pickupTime || !Number.isFinite(durationHours) || durationHours <= 0) { toast.error('Confirm travel type, route, pickup date, pickup time and trip duration before sending the quote.'); return; }
    if (!Number.isFinite(otherCharges) || otherCharges < 0) { toast.error('Enter valid additional charges (₹0 or more).'); return; }
    let tariff;
    try {
      const serverResult = await calculateDriverTariffOnServer({ pickupDate, pickupTime, durationHours });
      if (!serverResult?.tariff || !Number.isFinite(Number(serverResult.tariff.serviceAmount)) || !Number.isFinite(Number(serverResult.tariff.customerTotal))) {
        toast.error('The server could not verify the tariff. No quotation was sent.');
        return;
      }
      tariff = serverResult.tariff;
    } catch (error) {
      toast.error(error.message || 'Could not calculate the published tariff. No quotation was sent.');
      return;
    }
    const serviceAmount = Number(tariff.serviceAmount);
    const previousQuote = readDriverQuote(request.problem_description_c);
    const quote = { quoteId: 'DRV-' + Date.now().toString(36).toUpperCase(), version: Number(previousQuote?.version ?? 0) + 1, quoteType: 'Estimated Quotation', isEstimate: true, travelType, tripDetails, schedule, pickupDate, pickupTime, estimatedDurationHours: durationHours, travellers, tariff, serviceAmount, otherCharges, localFee: tariff.localFee, customerTotal: serviceAmount + otherCharges + tariff.localFee, terms: notes, status: 'Sent to Customer', createdAt: new Date().toISOString(), pricingDisclosure: 'This is an estimate, not a fixed-price cap. Final charges are calculated from the verified actual trip hours using the rates approved by the customer.' };
    const clean = String(request.problem_description_c ?? '').split('LOCAL_DRIVER_BOOKING_QUOTE_JSON:')[0].split('LOCAL_DRIVER_BOOKING_APPROVAL_JSON:')[0].trimEnd();
    setBusyKey('driver-quote:' + request.Id);
    try {
      const result = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Quoted', problem_description_c: clean + '\\nLOCAL_DRIVER_BOOKING_QUOTE_JSON:' + JSON.stringify(quote) });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Driver quotation could not be saved.');
      toast.success('Travel requirements and quotation saved. Customer must approve before driver assignment.');
      await run();
    } catch (err) { toast.error(err.message || 'Could not save driver quotation.'); }
    finally { setBusyKey(''); }
  }

  async function manualAssign(request) {
    if (isDriverBookingRequest(request)) {
      const quote = readDriverQuote(request.problem_description_c);
      const approval = readDriverApproval(request.problem_description_c);
      if (!quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.customerTotal)) {
        toast.error('Driver assignment is locked until Customer Care sends the quotation and the customer approves that exact total.');
        return;
      }
    }
    const details = getStructuredServiceDetails(request);
    if (details.type === 'Car Wash') {
      const quote = readCarWashQuote(request.problem_description_c);
      const approval = readCarWashApproval(request.problem_description_c);
      if (!quote || quote.status !== 'Sent to Customer' || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.total)) {
        toast.error('Car Wash assignment is locked until the customer approves the latest revised quote.');
        return;
      }
    }
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
    const text = String(value ?? '')
      .split('LOCAL_DRIVER_BOOKING_QUOTE_JSON:')[0]
      .split('LOCAL_DRIVER_BOOKING_APPROVAL_JSON:')[0]
      .split('LOCAL_DRIVER_ROUTE_JSON:')[0]
      .split('LOCAL_AC_REQUEST_JSON:')[0]
      .split('LOCAL_RSA_APPROVAL_JSON:')[0]
      .split('LOCAL_RSA_QUOTE_JSON:')[0]
      .split('LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:')[0]
      .split('LOCAL_CAR_ESSENTIALS_QUOTE_JSON:')[0]
      .split('LOCAL_CANCELLATION_JSON:')[0]
      .replace(/\\n/g, '\n')
      .trim();
    if (/Customer requested Car Essentials Delivery/i.test(text)) {
      const vehicle = text.match(/Vehicle:\s*([^.]+)/i)?.[1]?.trim();
      const location = text.match(/Requested delivery location:\s*([^.]+(?:\([^)]*\))?)/i)?.[1]?.trim();
      const items = text.match(/Car Essentials order details:\s*([^.]+)\./i)?.[1]?.trim();
      return [vehicle ? 'Vehicle: ' + vehicle : '', items ? 'Requested items: ' + items : '', location ? 'Delivery location: ' + location : '', 'Provider to confirm compatibility, stock, final price and delivery charges before fulfilment.'].filter(Boolean).join('\n');
    }
    if (/Car Wash quote for Customer Care review/i.test(text)) {
      const pickupDrop = /Pickup\s*&\s*Drop requested/i.test(text);
      return [
        'Customer Care action required',
        'Call customer to confirm vehicle details and service location.',
        pickupDrop ? 'Confirm the Pickup & Drop charge and availability.' : 'Ask whether Pickup & Drop is required; if yes, confirm the charge before finalizing.',
        'Review the selected services and confirm the final quote with the customer.',
        'Do not start work until the customer approves the final quote.',
      ].join('\n');
    }
    return text
      .replace(/CUSTOMER_CAR_WASH_OFFER_JSON:[\s\S]*$/i, '')
      .replace(/CAR_WASH_DECISIONS_JSON:[\s\S]*$/i, '')
      .replace(/^Customer requested these Car Wash services:[\s\S]*?(?:Prices are indicative demo menu prices\.?|$)/i, '')
      .replace(/^Customer selected\s*/i, '')
      .replace(/^Customer requested\s*/i, '')
      .trim();
  }

  function getCarWashAdminSummary(value) {
    const text = String(value ?? '');
    const marker = 'CAR_WASH_DECISIONS_JSON:';
    const markerIndex = text.indexOf(marker);
    if (markerIndex >= 0) {
      const jsonStart = markerIndex + marker.length;
      const jsonEnd = text.lastIndexOf(']');
      if (jsonEnd >= jsonStart) {
        try {
          const selected = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
          if (Array.isArray(selected) && selected.length) {
            const items = selected.map((item) => ({
              name: String(item.title ?? item.name ?? 'Car Wash option') + (item.variant && item.variant !== 'Fixed' ? ' — ' + item.variant : ''),
              quantity: Math.max(1, Number(item.quantity ?? 1)),
              amount: Number.isFinite(Number(item.listedUnitPrice ?? item.unitPrice ?? item.price)) ? Number(item.listedUnitPrice ?? item.unitPrice ?? item.price) * Math.max(1, Number(item.quantity ?? 1)) : null,
            }));
            const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
            return { items, menuTotal: total > 0 ? total : null, customerOffer: null };
          }
        } catch {
          // Fall back to parsing older requests saved before structured selections were added.
        }
      }
    }
    const body = text.match(/these Car Wash services:\s*(.*?)\.\s*(?:Menu Total|Estimated Total Value):/i)?.[1] ?? '';
    const items = body.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const pickup = /Pickup\s*&\s*Drop/i.test(part);
      const itemMatch = part.match(/^(.*?)\s*[×x]\s*(\d+)\s*=\s*₹\s*([\d,]+)/i);
      const pickupMatch = part.match(/Pickup\s*&\s*Drop\s*[—-]\s*₹\s*([\d,]+)/i);
      if (pickup) return { name: 'Pickup & Drop', quantity: 1, amount: Number((pickupMatch?.[1] ?? '100').replace(/,/g, '')) };
      if (itemMatch) return { name: itemMatch[1].trim(), quantity: Number(itemMatch[2]), amount: Number(itemMatch[3].replace(/,/g, '')) };
      return { name: part, quantity: 1, amount: null };
    });
    const totalMatch = text.match(/(?:Customer menu estimate|Menu Total|Estimated Total Value):?\s*₹\s*([\d,]+)/i);
    return { items, menuTotal: totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : null, customerOffer: null };
  }

  function getStructuredServiceDetails(request) {
    const description = String(request?.problem_description_c ?? '');
    const name = String(request?.Name ?? '');
    const isCarWash = /car wash/i.test(name) || /Car Wash services/i.test(description);
    const isAC = /AC Technician/i.test(name) || description.includes('LOCAL_AC_REQUEST_JSON:');
    const isCarService = /economy service|normal service|major service|point checkup|covered items:/i.test(name + ' ' + description);
    if (isCarWash) {
      const summary = getCarWashAdminSummary(description);
      const pickupDrop = /Pickup\s*&\s*Drop requested/i.test(description);
      const serviceSubtotal = summary.items.filter(item => !/Pickup\s*&\s*Drop/i.test(item.name)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const pickupDropAmount = summary.items.filter(item => /Pickup\s*&\s*Drop/i.test(item.name)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      return {
        type: 'Car Wash',
        title: 'Selected services',
        items: summary.items.map(item => ({ name: String(item.name || '').replace(/\bSmall Car(?: \(Hatchback \/ Sedan\))?/gi, 'Hatchback / Sedan'), quantity: item.quantity, amount: item.amount, included: false })),
        total: serviceSubtotal,
        platformFee: 25,
        pickupDrop,
        pickupDropAmount,
        indicativeTotal: serviceSubtotal + 25 + pickupDropAmount,
        offer: summary.customerOffer,
        notes: getCleanRequestNotes(description),
        structured: true,
      };
    }
    if (isAC) {
      let payload = null;
      try { const marker = 'LOCAL_AC_REQUEST_JSON:'; const index = description.indexOf(marker); if (index >= 0) payload = JSON.parse(description.slice(index + marker.length)); } catch { payload = null; }
      const groups = Array.isArray(payload?.groups) ? payload.groups : [];
      const items = groups.map(group => ({ name: [group.acType, group.serviceType].filter(Boolean).join(' — ') + (group.notes ? ' — ' + group.notes : ''), quantity: Number(group.quantity || 1), amount: null, included: false }));
      const notes = [payload?.serviceAddress ? 'Address: ' + payload.serviceAddress : '', payload?.accessInstructions ? 'Access instructions: ' + payload.accessInstructions : ''].filter(Boolean).join('\n');
      return { type: 'AC Service', title: 'Requested AC work', items, total: null, offer: null, notes: notes || 'Provider visit charge and estimate are subject to provider response and customer approval.', structured: true };
    }
    if (isCarService) {
      const packageMatch = description.match(/(Economy Service|Normal Service|Major Service).*?Listed package price:\s*₹\s*([\d,]+)/i);
      const coveredMatch = description.match(/Covered items:\s*(.*?)(?:\. Customer selected|$)/i);
      const items = [];
      if (packageMatch) items.push({ name: packageMatch[1] + ' package', quantity: 1, amount: Number(packageMatch[2].replace(/,/g, '')), included: false });
      if (coveredMatch) coveredMatch[1].split(';').map(part => part.trim()).filter(Boolean).forEach(part => items.push({ name: part.replace(/\s*\(Included\)/i, ''), quantity: '—', amount: null, included: /\(Included\)/i.test(part) }));
      return { type: 'Car Service', title: 'Package includes', items, total: packageMatch ? Number(packageMatch[2].replace(/,/g, '')) : null, offer: null, notes: /Customer selected this package/i.test(description) ? 'Customer selected this package and requests provider availability/confirmation.' : getCleanRequestNotes(description), structured: true };
    }
    return { type: 'Service request', title: 'Service details', items: [], total: null, offer: null, notes: getCleanRequestNotes(description), structured: false };
  }

  function getCarWashMenuTotal(notes) {
    const marker = 'CAR_WASH_DECISIONS_JSON:';
    const markerIndex = notes.indexOf(marker);
    if (markerIndex < 0) return null;
    const jsonStart = markerIndex + marker.length;
    const jsonEnd = notes.lastIndexOf(']');
    if (jsonEnd < jsonStart) return null;
    try {
      const items = JSON.parse(notes.slice(jsonStart, jsonEnd + 1));
      if (!Array.isArray(items) || !items.length) return null;
      const total = items.reduce((sum, item) => {
        const price = Number(item.listedUnitPrice ?? item.unitPrice ?? item.price);
        const quantity = Number(item.quantity ?? 1);
        return sum + (Number.isFinite(price) && price >= 0 && Number.isFinite(quantity) && quantity > 0 ? price * quantity : 0);
      }, 0);
      return Number.isFinite(total) && total > 0 ? total : null;
    } catch {
      return null;
    }
  }

  function isFixedPriceRequest(request) {
    if (String(request?.pricing_mode_c ?? '').toLowerCase() === 'fixed price') return true;
    const notes = String(request?.problem_description_c ?? '');
    return getCarWashMenuTotal(notes) !== null || /(?:listed package price|menu total|customer car wash total offer|actual price of service|fixed service total|package price)\s*:/i.test(notes);
  }

  function getFixedPrice(request) {
    const notes = String(request?.problem_description_c ?? '');
    const menuTotal = getCarWashMenuTotal(notes);
    if (menuTotal !== null) return menuTotal;
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

  async function sendRsaQuoteToCustomer(response) {
    const quote = readRsaQuote(response?.message_c);
    if (!response?.Id || !quote || quote.status === 'Sent to Customer') return;
    setBusyKey('rsa-quote:' + response.Id);
    try {
      const updatedQuote = { ...quote, status: 'Sent to Customer', reviewedAt: new Date().toISOString(), reviewedBy: 'LOCAL Admin' };
      const baseMessage = String(response.message_c ?? '').split('LOCAL_RSA_QUOTE_JSON:')[0].trimEnd();
      const result = await sdk.table('technician_responses_c').update({ Id: response.Id, message_c: baseMessage + '\\nLOCAL_RSA_QUOTE_JSON:' + JSON.stringify(updatedQuote) });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Reviewed RSA quote could not be sent to customer.');
      toast.success('Admin-reviewed RSA quote sent to customer for approval.'); await run();
    } catch (err) { toast.error(err.message || 'Could not send RSA quote to customer.'); }
    finally { setBusyKey(''); }
  }

  async function sendCarEssentialsQuoteToCustomer(response) {
    const quote = readCarEssentialsQuote(response?.message_c);
    if (!response?.Id || !quote || quote.status === 'Sent to Customer') return;
    setBusyKey('quote:' + response.Id);
    try {
      const updatedQuote = { ...quote, status: 'Sent to Customer', reviewedAt: new Date().toISOString(), reviewedBy: 'LOCAL Admin' };
      const baseMessage = String(response.message_c ?? '').split('LOCAL_CAR_ESSENTIALS_QUOTE_JSON:')[0].trimEnd();
      const result = await sdk.table('technician_responses_c').update({ Id: response.Id, message_c: baseMessage + '\nLOCAL_CAR_ESSENTIALS_QUOTE_JSON:' + JSON.stringify(updatedQuote) });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Reviewed quote could not be sent to customer.');
      toast.success('Admin-reviewed quote sent to customer for approval.');
      await run();
    } catch (err) { toast.error(err.message || 'Could not send quote to customer.'); }
    finally { setBusyKey(''); }
  }

  async function recordBikeMaintenanceCustomerConsent(request, acceptedAssignment) {
    if (!request?.Id || !acceptedAssignment?.Id) return;
    const quote = readBikeMaintenanceQuote(acceptedAssignment.message_c);
    if (!quote || quote.status !== 'Admin Approved' || !quote.adminApprovedAt) {
      toast.error('Approve the technician quotation before recording customer consent.');
      return;
    }
    if (!window.confirm('Confirm that you have called the customer, explained the approved total of ₹' + Number(quote.customerTotal).toLocaleString('en-IN') + ', and the customer explicitly agreed to proceed?')) return;
    const key = 'consent:' + request.Id;
    setBusyKey(key);
    try {
      const updatedQuote = { ...quote, status: 'Customer Approved', customerConsentAt: new Date().toISOString(), customerConsentRecordedBy: 'LOCAL Admin', updatedAt: new Date().toISOString() };
      const baseMessage = String(acceptedAssignment.message_c ?? '').split('LOCAL_BIKE_MAINTENANCE_QUOTE_JSON:')[0].trimEnd();
      const result = await sdk.table('technician_responses_c').update({ Id: acceptedAssignment.Id, message_c: baseMessage + '\\nLOCAL_BIKE_MAINTENANCE_QUOTE_JSON:' + JSON.stringify(updatedQuote) });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Customer consent could not be recorded.');
      toast.success('Customer consent recorded. You can now confirm the booking.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not record customer consent.');
    } finally {
      setBusyKey('');
    }
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
      const isCarWashRequest = getStructuredServiceDetails(request).type === 'Car Wash';
      const isDriverRequest = isDriverBookingRequest(request);
      const driverQuote = isDriverRequest ? readDriverQuote(request.problem_description_c) : null;
      const driverApproval = isDriverRequest ? readDriverApproval(request.problem_description_c) : null;
      if (isDriverRequest && (!driverQuote || !driverApproval || String(driverApproval.quoteId) !== String(driverQuote.quoteId) || Number(driverApproval.total) !== Number(driverQuote.customerTotal))) {
        toast.error('Driver booking cannot be confirmed until Customer Care sends a quotation and the customer approves the exact total.');
        return;
      }
      const isBikeMaintenanceRequest = /bike maintenance/i.test(String(request.Name ?? '') + ' ' + String(request.required_capability_c?.Name ?? '') + ' ' + String(request.problem_description_c ?? ''));
      if (isBikeMaintenanceRequest) {
        const bikeQuote = readBikeMaintenanceQuote(acceptedAssignment.message_c);
        if (!bikeQuote || !bikeQuote.visitCompletedAt || bikeQuote.status !== 'Customer Approved' || !Number.isFinite(Number(bikeQuote.customerTotal)) || Number(bikeQuote.customerTotal) <= 25 || !bikeQuote.adminApprovedAt || !bikeQuote.customerConsentAt) {
          toast.error('Bike Maintenance booking cannot be confirmed until the technician submits a quote, Admin approves it, and Customer Care records customer consent.');
          return;
        }
      }
      let approvedCarWashQuote = null;
      if (isCarWashRequest) {
        const quote = readCarWashQuote(request.problem_description_c);
        const approval = readCarWashApproval(request.problem_description_c);
        if (!quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.total) || !Number.isFinite(Number(quote.total))) {
          toast.error('Car Wash booking cannot be confirmed until the customer approves the latest revised quote.');
          return;
        }
        approvedCarWashQuote = quote;
      }
      if (acceptedAssignment.status_c !== 'Selected' || !/Central LOCAL assignment invitation/i.test(String(acceptedAssignment.message_c ?? ''))) {
        toast.error('Only a provider who accepted a Central LOCAL assignment can be confirmed.');
        return;
      }
      const isCarEssentials = /car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '') + ' ' + String(request.problem_description_c ?? ''));
      const isRsaQuote = isRsaQuoteRequest(request) && !isCarEssentials;
      const fixedPriceRequest = isRsaQuote || isBikeMaintenanceRequest ? false : isFixedPriceRequest(request);
      const fixedPrice = isCarWashRequest && approvedCarWashQuote ? Number(approvedCarWashQuote.total) : fixedPriceRequest ? getFixedPrice(request) : null;
      const providerQuoteRequest = String(request.pricing_mode_c ?? '').toLowerCase() === 'provider quote' || isCarEssentials || isRsaQuote || isBikeMaintenanceRequest;
      if (isRsaQuote) {
        const quote = readRsaQuote(acceptedAssignment.message_c);
        const approval = readRsaApproval(request.problem_description_c);
        if (!quote || !approval || String(approval.quoteId ?? '') !== String(quote.quoteId ?? '') || Number(approval.total) !== Number(quote.total) || !quote.providerApproved || String(quote.providerApprovedQuoteId ?? '') !== String(quote.quoteId ?? '') || Number(quote.providerApprovedTotal) !== Number(quote.total) || quote.status !== 'Sent to Customer') {
          toast.error('RSA booking cannot be confirmed until Admin reviews the quote, the customer approves it, and the provider confirms the exact same quote and total.'); return;
        }
      }
      if (isCarEssentials) {
        const quote = readCarEssentialsQuote(acceptedAssignment.message_c);
        const approval = readCarEssentialsApproval(request.problem_description_c);
        if (!quote || !approval || String(approval.quoteId ?? '') !== String(quote.quoteId ?? '') || Number(approval.total) !== Number(quote.total) || !quote.providerApproved || String(quote.providerApprovedQuoteId ?? '') !== String(quote.quoteId ?? '') || Number(quote.providerApprovedTotal) !== Number(quote.total)) {
          toast.error('Car Essentials Delivery cannot be confirmed yet. Admin review, customer approval, and Service Provider confirmation of the exact same quote are all required.');
          return;
        }
      }
      const resolvedServicePrice = isDriverRequest && driverQuote ? Number(driverQuote.serviceAmount) + Number(driverQuote.otherCharges) : isCarWashRequest && approvedCarWashQuote ? Number(approvedCarWashQuote.serviceSubtotal) - Number(approvedCarWashQuote.discount ?? 0) + Number(approvedCarWashQuote.pickupDropCharge ?? 0) : fixedPriceRequest ? Number(fixedPrice) : isCarEssentials ? Number(readCarEssentialsQuote(acceptedAssignment.message_c)?.total) : isRsaQuote ? Number(readRsaQuote(acceptedAssignment.message_c)?.total) : isBikeMaintenanceRequest ? Number(readBikeMaintenanceQuote(acceptedAssignment.message_c)?.serviceTotal) : Number(acceptedAssignment.final_agreed_price_c ?? acceptedAssignment.proposed_price_c);
      if (!Number.isFinite(resolvedServicePrice) || resolvedServicePrice <= 0) {
        toast.error('Booking cannot be confirmed without a valid agreed service price greater than ₹0. Contact the customer/provider, record the agreed quote, and confirm only after the customer approves it.');
        return;
      }
      if (fixedPriceRequest && fixedPrice === null) {
        toast.error('A clear, positive fixed service total could not be read. Please review the price before confirming; no job was created.');
        return;
      }
      if (!fixedPriceRequest && !providerQuoteRequest) {
        toast.error('This request needs a supported pricing workflow before booking can be finalized.');
        return;
      }

      // Idempotency must be checked only AFTER every required approval gate.
      // Older test data may already have a job record from the previous flow; it
      // must never let Admin bypass the customer/provider quote approvals.
      const existingJobs = await sdk.table('jobs_c').select(['Id', 'Name', 'request_c', 'response_c', 'technician_c', 'status_c', 'service_start_otp_c']).where(eq('request_c', request.Id)).page(1, 20).fetch();
      if (!existingJobs.success) throw new Error(existingJobs.message || 'Could not check for an existing job.');
      const existingJob = (existingJobs.data ?? []).find((job) => String(job.response_c?.Id ?? job.response_c ?? '') === String(acceptedAssignment.Id));
      if (existingJob) {
        const currentQuote = isCarEssentials ? readCarEssentialsQuote(acceptedAssignment.message_c) : isRsaQuote ? readRsaQuote(acceptedAssignment.message_c) : null;
        const updateExistingJob = await sdk.table('jobs_c').update({
          Id: existingJob.Id,
          agreed_price_c: resolvedServicePrice,
          original_provider_quote_c: resolvedServicePrice,
          remaining_amount_c: resolvedServicePrice,
          local_service_fee_amount_c: 25,
          customer_payable_now_c: isDriverRequest && driverQuote ? Number(driverQuote.customerTotal) : resolvedServicePrice + 25,
          billing_status_c: 'Booking Confirmed — Payment Due After Delivery',
          service_start_otp_c: isCarEssentials ? null : existingJob.service_start_otp_c,
          admin_review_note_c: isCarEssentials
            ? 'Booking confirmed by LOCAL Admin after Admin review, customer approval, and Service Provider confirmation of the same quote ID and total. Delivery and payment completion remain pending.'
            : isRsaQuote ? 'RSA booking confirmed by LOCAL Admin after Admin review, customer approval, and Service Provider confirmation of the same quote ID and total.' : 'Booking confirmed by LOCAL Admin after validating the assigned provider and pricing workflow.',
        });
        if (!updateExistingJob.data?.length) throw new Error(updateExistingJob.messages?.[0] || 'Existing job could not be updated after approval checks.');
        const updateExistingRequest = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Confirmed' });
        if (!updateExistingRequest.data?.length) throw new Error(updateExistingRequest.messages?.[0] || 'Existing job is ready, but request status could not be confirmed.');
        toast.success('Booking confirmed. Existing job updated; no duplicate job was created.');
        await run();
        return;
      }
      const jobName = 'LOCAL Job • ' + request.Name;
      const jobRes = await sdk.table('jobs_c').create({
        Name: jobName,
        request_c: request.Id,
        response_c: acceptedAssignment.Id,
        customer_c: request.customer_c?.Id ?? request.customer_c ?? null,
        technician_c: acceptedAssignment.technician_c?.Id ?? acceptedAssignment.technician_c,
        agreed_price_c: resolvedServicePrice,
        remaining_amount_c: resolvedServicePrice,
        local_service_fee_amount_c: 25,
        customer_payable_now_c: isDriverRequest && driverQuote ? Number(driverQuote.customerTotal) : resolvedServicePrice + 25,
        original_provider_quote_c: providerQuoteRequest && !fixedPriceRequest ? Number((isRsaQuote ? readRsaQuote(acceptedAssignment.message_c)?.total : readCarEssentialsQuote(acceptedAssignment.message_c)?.total) ?? 0) : null,
        scheduled_at_c: request.scheduled_at_c || null,
        status_c: 'Assigned',
        payment_status_c: 'Unpaid',
        billing_status_c: 'Booking Confirmed — Payment Due After Delivery',
        service_start_otp_c: null,
        admin_review_note_c: isCarEssentials
          ? 'Booking confirmed by LOCAL Admin after Admin review, customer approval, and Service Provider confirmation of the same quote ID and total. Delivery and payment completion remain pending.'
          : isRsaQuote ? 'RSA booking confirmed by LOCAL Admin after Admin review, customer approval, and Service Provider confirmation of the same quote ID and total. Service and payment remain pending.'
          : providerQuoteRequest && !fixedPriceRequest
            ? 'Booking confirmed by LOCAL Admin after the required pricing workflow. Delivery and payment completion remain pending.'
            : 'Confirmed by LOCAL Admin after provider accepted central assignment. Fixed price: ₹' + fixedPrice.toLocaleString('en-IN') + '.',
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
    if (['Cancelled', 'Completed'].includes(String(request?.status_c ?? ''))) return [];
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
    const approvedWashQuote = getStructuredServiceDetails(request).type === 'Car Wash' ? readCarWashQuote(request.problem_description_c) : null;
    const washApproval = approvedWashQuote ? readCarWashApproval(request.problem_description_c) : null;
    const hasApprovedWashQuote = Boolean(approvedWashQuote && washApproval && String(washApproval.quoteId) === String(approvedWashQuote.quoteId) && Number(washApproval.total) === Number(approvedWashQuote.total) && Number.isFinite(Number(approvedWashQuote.total)));
    const fixedPrice = hasApprovedWashQuote ? Number(approvedWashQuote.total) : isFixedPriceRequest(request) ? getFixedPrice(request) : null;
    const nearbyCount = eligibleProviders.filter((provider) => {
      const distance = providerDistance(request, provider);
      return distance !== null && distance <= Number(provider.service_radius_km_c ?? 25);
    }).length;
    const customerProfile = getRequestCustomer(request);
    const customerName = customerProfile?.Name ?? 'Customer';
    const customerPhone = customerProfile?.phone_c ?? customerProfile?.Phone ?? customerProfile?.mobile_c ?? '';
    const customerEmail = customerProfile?.email_c ?? customerProfile?.Email ?? '';
    const cancellationDetails = readCancellationDetails(request.problem_description_c);

    return (
      <div className="space-y-4">
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setSelectedRequestId(null)} className="-ml-3">
            <ApperIcon name="ArrowLeft" size={16} /> Back to requests
          </Button>
          <Button variant="outline" onClick={run} disabled={loading} className="ml-auto">
            <ApperIcon name="RefreshCw" size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request detail</p>
                <h2 className="mt-1 font-heading text-xl font-semibold">{request.Name}</h2>{/Car Wash|Car Service/i.test(String(request.Name || '') + ' ' + String(request.required_capability_c?.Name || '')) && <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm"><ApperIcon name="CarFront" size={16} /><span className="font-semibold">Car type:</span><span>{/SUV|Big Car/i.test(String(request.problem_description_c || '') + ' ' + String(request.Name || '')) ? 'SUV / Big Car' : 'Hatchback / Sedan'}</span></div>}
              </div>
              <StatusBadge value={request.status_c} />
            </div>
            <div className="space-y-5 p-5">
              {String(request.status_c ?? '') === 'Cancelled' && <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><div className="flex items-center gap-2 font-semibold text-destructive"><ApperIcon name="XCircle" size={18} /> Booking Cancelled</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Cancelled by</p><p className="mt-1 font-medium">{cancellationDetails?.actorName || cancellationDetails?.actor || 'Details not recorded'}</p><p className="text-xs text-muted-foreground">{cancellationDetails?.actor || 'Actor unknown'}</p></div><div><p className="text-xs text-muted-foreground">Cancelled on</p><p className="mt-1 font-medium">{formatCancellationTime(cancellationDetails?.cancelledAt)}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Reason</p><p className="mt-1 text-sm">{cancellationDetails?.reason || 'Reason not recorded'}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Booking stage</p><p className="mt-1 text-sm">{cancellationDetails?.stage || 'Not recorded'}</p></div></div></section>}
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-3 text-primary"><ApperIcon name="CarFront" size={26} /></div>
                <div>
                  <div className="font-semibold">{request.service_category_c?.Name ?? 'Service'} · {request.required_capability_c?.Name ?? 'Capability not mapped'}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{isFixedPriceRequest(request) ? 'Fixed package price' : request.pricing_mode_c === 'Provider Quote' ? 'Inspection / estimate required' : request.pricing_mode_c || 'Pricing not set'}</p>
                </div>
              </div>
              <div className="grid gap-4 border-y py-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Customer contact</p><p className="mt-1 font-medium">{customerName}</p>{customerPhone ? <a href={'tel:' + String(customerPhone).replace(/[^+\d]/g, '')} className="mt-1 inline-flex items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"><ApperIcon name="Phone" size={15} /> {customerPhone} · Call customer</a> : <p className="mt-1 text-sm font-medium text-amber-700">Phone number not saved in customer profile</p>}{customerEmail && <p className="mt-1 text-sm text-muted-foreground">{customerEmail}</p>}</div>
                <RequestServiceLocation request={request} customerAddress={getRequestCustomer(request)?.location_c} />
                <div><p className="text-xs text-muted-foreground">Requested time</p><p className="mt-1 font-medium">{request.preferred_time_c === 'ASAP' ? 'Book Now' : request.preferred_time_c || 'Not specified'}</p>{request.scheduled_at_c && <p className="text-sm text-muted-foreground">{new Date(request.scheduled_at_c).toLocaleString('en-IN')}</p>}</div>
                <div><p className="text-xs text-muted-foreground">Nearby eligible providers</p><p className="mt-1 font-medium">{nearbyCount} with recorded location</p></div>
              </div>
              {linkedJob && <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h3 className="font-semibold">Job completion and payment</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Job status</p><div className="mt-1"><StatusBadge value={linkedJob.status_c || 'Unknown'} /></div></div>
                  <div><p className="text-xs text-muted-foreground">Payment status</p><div className="mt-1"><StatusBadge value={linkedJob.payment_status_c || 'Not recorded'} /></div></div>
                  <div><p className="text-xs text-muted-foreground">Billing status</p><p className="mt-1 font-medium">{linkedJob.billing_status_c || 'Not recorded'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Customer total (incl. LOCAL fee)</p><p className="mt-1 font-semibold">₹{Number(hasApprovedWashQuote ? approvedWashQuote.total : (Number(linkedJob.customer_payable_now_c) > 0 ? linkedJob.customer_payable_now_c : Number(linkedJob.agreed_price_c ?? 0) + Number(linkedJob.local_service_fee_amount_c ?? 0))).toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-muted-foreground">Service amount ₹{Number(hasApprovedWashQuote ? approvedWashQuote.total : linkedJob.agreed_price_c ?? 0).toLocaleString('en-IN')} · LOCAL fee ₹{Number(linkedJob.local_service_fee_amount_c ?? 25).toLocaleString('en-IN')}</p>{hasApprovedWashQuote && Number(linkedJob.agreed_price_c) !== Number(approvedWashQuote.total) && <p className="mt-1 text-xs text-amber-700">Approved quote ₹{Number(approvedWashQuote.total).toLocaleString('en-IN')} is being synced to this job record.</p>}</div>
                  <div><p className="text-xs text-muted-foreground">Payment method / reference</p><p className="mt-1 font-medium">{linkedJob.payment_method_c || 'Not recorded'}{linkedJob.payment_reference_c ? ' · ' + linkedJob.payment_reference_c : ''}</p></div>
                  <div><p className="text-xs text-muted-foreground">Provider payout</p><p className="mt-1 font-medium">{linkedJob.payout_status_c || 'Not recorded'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Car returned</p><p className="mt-1 font-medium">{linkedJob.returned_at_c ? new Date(linkedJob.returned_at_c).toLocaleString('en-IN') : 'Not recorded'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Customer completion confirmation</p><p className="mt-1 font-medium">{linkedJob.customer_completion_confirmed_at_c ? new Date(linkedJob.customer_completion_confirmed_at_c).toLocaleString('en-IN') : 'Not recorded'}</p></div>
                  {linkedJob.dispute_status_c && linkedJob.dispute_status_c !== 'None' && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Dispute status</p><p className="mt-1 font-medium">{linkedJob.dispute_status_c}</p></div>}
                  {linkedJob.status_c === 'Completed' && linkedJob.payment_status_c === 'Final Payment Paid' && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Final invoice</p><Link to={'/jobs/' + linkedJob.Id} className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><ApperIcon name="FileText" size={16} /> View / Download Invoice</Link></div>}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Request status and job status are tracked separately. This panel reads the job linked to this service request.</p>
              </section>}
              {request.Id === '__removed_service_summary__' && <section className="rounded-xl border border-border bg-card p-4 md:p-5">
                {(() => { const details = getStructuredServiceDetails(request); return <>
                  <div className="flex items-center gap-3 border-b border-border pb-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ApperIcon name="ClipboardList" size={18} /></div>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-base font-semibold">Service summary</h3><span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">{details.type}</span></div></div>
                  </div>
                  {details.structured && <div className="mt-5 space-y-4">
                    <div className="rounded-xl border border-border bg-muted/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{details.title}</p><h4 className="mt-1 font-heading text-lg font-bold">{request.Name || details.type}</h4><p className="mt-1 text-sm text-muted-foreground">{details.type === 'AC Service' ? 'Service requested for the customer’s AC unit(s)' : details.type === 'Car Service' ? 'Vehicle service package and covered work' : 'Customer-selected wash services and add-ons'}</p></div>{details.total != null && <div className="min-w-[135px] rounded-lg bg-primary/5 px-4 py-3"><p className="text-xs text-muted-foreground">{details.type === 'Car Wash' ? 'Menu total' : 'Listed package price'}</p><p className="mt-1 text-2xl font-bold tabular-nums">₹{details.total.toLocaleString('en-IN')}</p></div>}</div>
                    </div>
                    {details.items.length > 0 ? <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{details.type === 'Car Wash' ? 'Selected services' : details.type === 'AC Service' ? 'Requested AC work' : 'Package includes'}</h4><span className="text-xs text-muted-foreground">{details.type === 'AC Service' ? 'Quote pending provider response' : 'Quantity and price details'}</span></div><div className="grid gap-2 sm:grid-cols-2">{details.items.map((item,index) => <div key={item.name + index} className="flex min-w-0 items-start gap-3 rounded-lg border border-border/80 bg-background p-3"><span className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' + (item.included ? 'bg-success/10 text-success' : 'bg-primary/5 text-primary')}><ApperIcon name={item.included ? 'Check' : details.type === 'AC Service' ? 'Wind' : 'Wrench'} size={16} /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.included ? 'Included in package price' : item.amount == null ? (details.type === 'AC Service' ? 'Provider estimate required' : 'If required / confirm with provider') : 'Qty: ' + item.quantity}</p></div><div className="shrink-0 text-right text-sm font-semibold tabular-nums">{item.amount == null ? (details.type === 'AC Service' ? 'Quote' : '—') : '₹' + item.amount.toLocaleString('en-IN')}</div></div>)}</div></div> : <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Detailed service items were not included in the request. Review the customer notes below before assigning.</div>}
                    {details.type === 'Car Wash' && <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price breakdown · no bidding</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3"><span>Selected services subtotal</span><strong className="tabular-nums">{details.total == null ? '—' : '₹' + details.total.toLocaleString('en-IN')}</strong></div>
                        <div className="flex items-center justify-between gap-3"><span>LOCAL Platform Fee (per booking)</span><strong className="tabular-nums">₹{details.platformFee ?? 25}</strong></div>
                        {details.pickupDrop && <div className="flex items-center justify-between gap-3"><span>Pickup &amp; Drop (indicative)</span><strong className="tabular-nums">₹{Number(details.pickupDropAmount || 100).toLocaleString('en-IN')}</strong></div>}
                        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-base"><span className="font-bold">Indicative total</span><strong className="tabular-nums">{details.indicativeTotal == null ? '—' : '₹' + details.indicativeTotal.toLocaleString('en-IN')}</strong></div>
                      </div>
                    </div>}
                  </div>}
                  {/car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? (() => { const notes = String(details.notes || request.problem_description_c || ''); const orderText = notes.match(/Car Essentials order details:\\s*(.*?)(?:\\.\\s*Vehicle:|$)/i)?.[1] || ''; const vehicle = notes.match(/Vehicle:\\s*(.*?)(?:\\.\\s*Requested delivery location:|$)/i)?.[1] || 'Not specified'; const deliveryLocation = notes.match(/Requested delivery location:\\s*(.*?)(?:\\.\\s*Product compatibility|$)/i)?.[1] || request.location_c || 'Not recorded'; const fulfilment = notes.match(/(Product compatibility, stock, final price and delivery charges must be confirmed.*)$/i)?.[1] || 'Confirm product compatibility, availability, final price and delivery charges with the customer before fulfilment.'; const items = orderText.split(';').map(item => item.trim()).filter(Boolean); return <div className="mt-4 rounded-xl border border-border bg-background p-4"><div className="flex items-center gap-2 border-b border-border pb-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ApperIcon name="Package" size={18} /></span><div><h4 className="font-semibold">Car Essentials delivery</h4><p className="text-xs text-muted-foreground">Customer order instructions</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</p><p className="mt-1 font-medium">{vehicle.replace(/[.]$/, '')}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery location</p><p className="mt-1 break-words text-sm font-medium">{deliveryLocation.replace(/[.]$/, '')}</p></div></div><div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products requested</p>{items.length ? <div className="mt-2 divide-y rounded-lg border border-border">{items.map((item, index) => <div key={index} className="flex items-center gap-3 px-3 py-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span><span className="min-w-0 flex-1 break-words text-sm font-medium">{item.replace(/[.]$/, '')}</span></div>)}</div> : <p className="mt-2 text-sm">No product details recorded.</p>}</div><div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Before fulfilment</p><p className="mt-1 text-sm leading-5 text-amber-900">{fulfilment.replace(/[.]$/, '')}</p></div></div>; })() : <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service requested</p>
                        <p className="mt-1 break-words text-sm font-semibold text-foreground">{request.Name || details.type}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request type</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{details.notes && /callback/i.test(details.notes) ? 'Customer Care callback' : request.preferred_time_c === 'ASAP' ? 'Book Now' : 'Service request'}</p>
                      </div>
                    </div>
                    {isDriverBookingRequest(request) && (() => {
                      const route = readDriverRoute(request.problem_description_c);
                      if (!route) return null;
                      return <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-center gap-2 border-b border-primary/10 pb-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ApperIcon name="Route" size={18} /></span><div><h4 className="font-semibold">Driver journey details</h4><p className="text-xs text-muted-foreground">Pickup and drop-off supplied by customer</p></div></div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pickup location</p><p className="mt-1 break-words text-sm font-semibold">{route.pickup.text || 'Not recorded'}</p><p className="mt-1 text-xs text-muted-foreground">{Number(route.pickup.latitude).toFixed(5)}, {Number(route.pickup.longitude).toFixed(5)}</p></div>
                          <div className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drop-off location</p><p className="mt-1 break-words text-sm font-semibold">{route.dropoff.text || 'Not recorded'}</p><p className="mt-1 text-xs text-muted-foreground">{Number(route.dropoff.latitude).toFixed(5)}, {Number(route.dropoff.longitude).toFixed(5)}</p></div>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Journey type</p><p className="mt-1 text-sm font-medium">{route.travelType || 'Not specified'} · {route.tripType || 'One-way'}</p></div>
                          <div className="rounded-lg bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional stops</p>{Array.isArray(route.stops) && route.stops.length ? <ol className="mt-1 list-inside list-decimal space-y-1 text-sm">{route.stops.map((stop, index) => <li key={index}>{stop}</li>)}</ol> : <p className="mt-1 text-sm">No additional stops</p>}</div>
                        </div>
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Customer Care next step</p><p className="mt-1 text-sm leading-5 text-amber-950">Call the customer to confirm pickup time, trip duration, night halt, waiting time and additional charges. Send the quote for customer approval before assigning a driver.</p></div>
                        <a className="mt-3 inline-flex text-sm font-semibold text-primary underline underline-offset-4" href={'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=' + route.pickup.latitude + '%2C' + route.pickup.longitude + '%3B' + route.dropoff.latitude + '%2C' + route.dropoff.longitude} target="_blank" rel="noreferrer">Open route in map</a>
                      </div>;
                    })()}
                    <div className="rounded-lg border border-border bg-muted/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer requirement</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">{details.notes || 'No additional instructions provided.'}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Next action</p>
                        <p className="mt-1 text-sm leading-5 text-blue-950">{details.notes && /callback/i.test(details.notes) ? 'Call the customer, confirm availability and charges, then update the request.' : 'Review the request and confirm the service details with the customer before proceeding.'}</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Pricing reminder</p>
                        <p className="mt-1 text-sm leading-5 text-amber-950">Confirm the full amount, including the ₹25 LOCAL Platform Fee, before confirming payment.</p>
                      </div>
                    </div>
                  </div>}
                </>; })()}
              </section>}
              {(() => {
                const details = getStructuredServiceDetails(request);
                if (details.type !== 'Car Wash') return null;
                const quote = readCarWashQuote(request.problem_description_c);
                const approval = readCarWashApproval(request.problem_description_c);
                const approved = Boolean(quote && approval && String(approval.quoteId) === String(quote.quoteId) && Number(approval.total) === Number(quote.total));
                const quoteSent = Boolean(quote && quote.status === 'Sent to Customer');
                const input = carWashQuoteInputs[request.Id] ?? {};
                const serviceSubtotal = Number(details.total || 0);
                const refreshed = carWashCalculatedQuotes[request.Id];
                const discountValue = Number(input.discount ?? quote?.discount ?? 0) || 0;
                const pickupChoice = 'no';
                const pickupChargeValue = Number(input.pickupCharge ?? quote?.pickupDropCharge ?? 0) || 0;
                const quoteTotalValue = refreshed ? refreshed.total : serviceSubtotal + 25;
                return <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div><h3 className="font-semibold">Customer Care · Revised quote</h3><p className="mt-1 text-sm text-muted-foreground">Review the service total and send the final quote to the customer.</p></div>
                  {quote && <div className="rounded-lg border bg-background p-3 text-sm"><div className="flex justify-between gap-3"><span>Last quote (v{quote.version || 1})</span><strong>₹{Number(quote.total).toLocaleString('en-IN')}</strong></div><p className="mt-1 text-muted-foreground">{approved ? 'Customer approved this exact quote.' : quote.status === 'Sent to Customer' ? 'Awaiting customer approval.' : 'Quote needs to be sent.'}</p></div>}
                  <div className="overflow-hidden rounded-lg border bg-background">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(130px,220px)] border-b bg-muted/60 px-3 py-3 text-sm font-semibold sm:px-4"><span>Description</span><span className="text-right">Amount (₹)</span></div>
                    {[
                      {key:'customerQuotedAmount', label:'Customer Quoted Amount', value: input.customerQuotedAmount ?? String(quote?.serviceSubtotal ?? serviceSubtotal)},
                      {key:'discount', label:'Discount Offered', value: input.discount ?? String(quote?.discount ?? 0)},
                      {key:'pickupCharge', label:'Pick up and drop', value: input.pickupCharge ?? String(quote?.pickupDropCharge ?? 0)},
                      {key:'platformFee', label:'Local Platform Fee', value: input.platformFee ?? String(quote?.platformFee ?? 25)},
                    ].map((row) => <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_minmax(130px,220px)] items-center gap-3 border-b px-3 py-3 last:border-b-0 sm:px-4"><label htmlFor={'manual-quote-' + row.key + '-' + request.Id} className="text-sm sm:text-base">{row.label}</label><input id={'manual-quote-' + row.key + '-' + request.Id} type="number" min="0" step="1" className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-base shadow-sm disabled:cursor-not-allowed disabled:opacity-60" value={row.value} disabled={quoteSent || Boolean(busyKey)} onChange={(e) => { const value = e.currentTarget.value; setCarWashQuoteInputs((old) => ({...old, [request.Id]: {...(old[request.Id] || {}), [row.key]: value}})); setCarWashCalculatedQuotes((old) => ({...old, [request.Id]: null})); }} /></div>)}
                    {(() => { const displayed = carWashCalculatedQuotes[request.Id]; return <div className="grid grid-cols-[minmax(0,1fr)_minmax(130px,220px)] items-center gap-3 bg-primary/5 px-3 py-4 sm:px-4"><span className="font-bold">Final Quote Total</span><span className="text-right text-lg font-bold">{displayed && !displayed.error ? '₹' + Number(displayed.total).toLocaleString('en-IN') : ''}</span><Button type="button" variant="outline" className="col-span-2 w-full" disabled={Boolean(busyKey) || quoteSent} onClick={() => { const keys = [{key:'customerQuotedAmount', id:'customerQuotedAmount'}, {key:'discount', id:'discount'}, {key:'pickupCharge', id:'pickupCharge'}, {key:'platformFee', id:'platformFee'}]; const values = {...input}; for (const field of keys) { const element = document.getElementById('manual-quote-' + field.id + '-' + request.Id); if (element) values[field.key] = element.value; } const calculation = calculateCarWashQuote(details, values); if (calculation.error) { toast.error(calculation.error); return; } setCarWashQuoteInputs((old) => ({...old, [request.Id]: {...(old[request.Id] || {}), ...values}})); setCarWashCalculatedQuotes((old) => ({...old, [request.Id]: calculation})); toast.success('Final quote total refreshed.'); }}><ApperIcon name="RefreshCw" size={16} /> Refresh Final Quote Total</Button></div>; })()}
                  </div>
                  <Button className="w-full" disabled={Boolean(busyKey) || quoteSent} onClick={() => sendCarWashQuote(request, details)}><ApperIcon name="Send" size={16} /> {busyKey === 'car-wash-quote:' + request.Id ? 'Sending quote…' : quoteSent ? 'Revised quote sent · Editing locked' : 'Send Revised Quote to Customer'}</Button>
                  <p className="text-xs text-muted-foreground">Assignment stays locked until the customer approves this exact quote and amount.</p>
                </section>;
              })()}
              {getStructuredServiceDetails(request).type !== 'Car Wash' && !isDriverBookingRequest(request) && <section className="rounded-lg border p-4">
                <h3 className="font-semibold">Price review</h3>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{request.pricing_mode_c === 'Fixed Price' ? 'Detected fixed service total' : 'Inspection / estimate amount'}</span>
                  <span className="text-xl font-bold">{fixedPrice !== null ? '₹' + fixedPrice.toLocaleString('en-IN') : 'Review required'}</span>
                </div>
                {request.pricing_mode_c !== 'Fixed Price' && <p className="mt-2 text-xs text-amber-700">If inspection is required, disclose the visiting charge first and obtain customer approval for any additional repair price before work begins. This is not a bidding process.</p>}
              </section>}
            </div>
          </Card>
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-2"><ApperIcon name="Settings2" size={19} /><h3 className="font-semibold">{getStructuredServiceDetails(request).type === 'Car Wash' ? 'Pickup & Drop Assignment' : 'Assignment controls'}</h3></div>
              <p className="mt-1 text-sm text-muted-foreground">{getStructuredServiceDetails(request).type === 'Car Wash' ? 'After customer approval, select a verified person for manual pickup and return coordination.' : 'Choose a verified provider or invite the nearest eligible provider. No bidding or counter-offers.'}</p>
              {isDriverBookingRequest(request) && (() => { const quote = readDriverQuote(request.problem_description_c); const approval = readDriverApproval(request.problem_description_c); const approved = Boolean(quote && approval && String(approval.quoteId) === String(quote.quoteId) && Number(approval.total) === Number(quote.customerTotal)); const saved = quote ?? {}; const route = readDriverRoute(request.problem_description_c); const routeSummary = route ? [route.pickup?.text, route.dropoff?.text, ...(Array.isArray(route.stops) ? route.stops : [])].filter(Boolean).join(' → ') : ''; const draft = driverQuoteDrafts[request.Id] ?? { travelType: saved.travelType ?? route?.travelType ?? 'Within city', tripDetails: saved.tripDetails ?? routeSummary, pickupDate: saved.pickupDate ?? '', pickupTime: saved.pickupTime ?? '', durationHours: saved.durationHours ?? '', travellers: saved.travellers ?? '', otherCharges: saved.otherCharges ?? '0', terms: saved.terms ?? '' }; const setDraft = (key, value) => setDriverQuoteDrafts(current => ({ ...current, [request.Id]: { ...(current[request.Id] ?? draft), [key]: value } })); const otherCharges = Math.max(0, Number(draft.otherCharges) || 0); let tariffPreview = null; try { if (draft.pickupDate && draft.pickupTime && Number(draft.durationHours) > 0) tariffPreview = calculateDriverOnDemandTariff({ pickupDate: draft.pickupDate, pickupTime: draft.pickupTime, durationHours: Number(draft.durationHours) }); } catch { tariffPreview = null; } const serviceAmount = tariffPreview?.serviceAmount ?? 0; return <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4"><h4 className="font-semibold">Prepare Estimated Quotation for Customer</h4><p className="mt-1 text-sm text-muted-foreground">Complete the trip details below. Review the customer-ready quotation preview, then save it to the customer's request for approval. This is an estimate; the final bill will use verified actual working hours. Do not assign a driver until the customer approves the pricing rules.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Travel type *</label><select className="w-full rounded-md border border-input bg-background px-3 py-2" value={draft.travelType} disabled={approved} onChange={e => setDraft('travelType',e.target.value)}><option>Within city</option><option>Outstation — one-way</option><option>Outstation — round trip</option><option>Multiple stops</option></select></div><div><label className="mb-1 block text-sm font-medium">Pickup date *</label><input type="date" className="w-full rounded-md border border-input bg-background px-3 py-2" value={draft.pickupDate} disabled={approved} onChange={e => setDraft('pickupDate',e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">Pickup time *</label><input type="time" className="w-full rounded-md border border-input bg-background px-3 py-2" value={draft.pickupTime} disabled={approved} onChange={e => setDraft('pickupTime',e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">Expected duration (hours) *</label><input type="number" min="0.5" max="720" step="0.5" className="w-full rounded-md border border-input bg-background px-3 py-2" value={draft.durationHours} disabled={approved} placeholder="e.g. 8 or 10.5" onChange={e => setDraft('durationHours',e.target.value)} /></div><div className="sm:col-span-2 rounded-md border bg-background px-3 py-3"><p className="text-sm font-medium">Journey confirmed with customer</p>{route ? <div className="mt-2 space-y-1 text-sm text-muted-foreground"><p><span className="font-medium text-foreground">Pickup:</span> {route.pickup?.text || 'Not recorded'}</p><p><span className="font-medium text-foreground">Destination:</span> {route.dropoff?.text || 'Not recorded'}</p>{Array.isArray(route.stops) && route.stops.length > 0 && <p><span className="font-medium text-foreground">Stops:</span> {route.stops.join(' · ')}</p>}<p className="mt-2 text-xs text-muted-foreground">Taken from the customer request. No need to enter it again.</p></div> : <><p className="mt-1 text-xs text-muted-foreground">No route was saved with this request. Enter the journey once after speaking with the customer.</p><input className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2" value={draft.tripDetails} disabled={approved} placeholder="Pickup → destination → any stops" onChange={e => setDraft('tripDetails',e.target.value)} /></>}</div><div><label className="mb-1 block text-sm font-medium">Travellers (including customer)</label><input type="number" min="1" max="100" className="w-full rounded-md border border-input bg-background px-3 py-2" value={draft.travellers} disabled={approved} placeholder="Optional" onChange={e => setDraft('travellers',e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">Other agreed expenses (₹)</label><input type="number" min="0" className="w-full rounded-md border border-input bg-background px-3 py-2" value={draft.otherCharges} disabled={approved} onChange={e => setDraft('otherCharges',e.target.value)} /></div><div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">Anything else agreed (optional)</label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2" rows={2} value={draft.terms} disabled={approved} placeholder="Only if needed: tolls, parking, extra hours/km or special arrangements" onChange={e => setDraft('terms',e.target.value)} /></div></div><div className="mt-4 overflow-hidden rounded-md border bg-background"><div className="border-b bg-muted px-3 py-2"><p className="text-sm font-semibold">Automatically calculated tariff</p><p className="text-xs text-muted-foreground">ESTIMATED QUOTATION — not a fixed-price cap. ₹800 covers the first 8 hours. After 8 hours, extra time before 10 PM is ₹50/hour. From 10 PM onward, extra time is ₹100/hour and a one-time ₹300 night charge is added automatically when applicable. The final bill is calculated from the driver's verified actual working hours. Partial hours are prorated by the minute.</p></div><table className="w-full text-sm"><tbody><tr><td className="border-t px-3 py-2">First 8 hours (base fare)</td><td className="border-t px-3 py-2 text-right">₹{(tariffPreview?.baseAmount ?? 800).toLocaleString('en-IN')}</td></tr><tr><td className="border-t px-3 py-2">Additional hours before 10 PM (₹50/hour)</td><td className="border-t px-3 py-2 text-right">₹{(tariffPreview?.additionalDayAmount ?? 0).toLocaleString('en-IN')}</td></tr><tr><td className="border-t px-3 py-2">Additional hours from 10 PM (₹100/hour)</td><td className="border-t px-3 py-2 text-right">₹{(tariffPreview?.additionalNightAmount ?? 0).toLocaleString('en-IN')}</td></tr><tr><td className="border-t px-3 py-2">One-time night charge (automatically added when applicable)</td><td className="border-t px-3 py-2 text-right">₹{(tariffPreview?.nightCharge ?? 0).toLocaleString('en-IN')}</td></tr><tr><td className="border-t px-3 py-2">Other agreed expenses</td><td className="border-t px-3 py-2 text-right">₹{otherCharges.toLocaleString('en-IN')}</td></tr><tr><td className="border-t px-3 py-2">LOCAL convenience fee (fixed)</td><td className="border-t px-3 py-2 text-right">₹25</td></tr><tr className="bg-muted font-bold"><td className="border-t px-3 py-3">Customer quote total</td><td className="border-t px-3 py-3 text-right">{tariffPreview ? '₹' + (serviceAmount + otherCharges + 25).toLocaleString('en-IN') : 'Enter trip date, time and duration'}</td></tr></tbody></table>{tariffPreview?.nightChargeApplies && <p className="px-3 py-2 text-xs text-amber-700">Night charge applies because the scheduled trip reaches 10 PM or later.</p>}</div>{quote && <p className={approved ? 'mt-3 text-emerald-700' : 'mt-3 text-amber-700'}>{approved ? 'Customer approved the estimated quotation and pricing rules. Final charges will be based on the verified actual trip hours.' : 'Estimated quotation saved/sent. Waiting for customer approval of the pricing rules.'}</p>}<Button className="mt-3 w-full" variant="outline" disabled={Boolean(busyKey) || approved || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? ''))} onClick={() => saveDriverQuote(request)}>{busyKey === 'driver-quote:' + request.Id ? 'Saving quote…' : quote ? 'Revise & resend quotation' : 'Send Quote to Customer'}</Button></div>; })()}
              <div className="mt-4 space-y-3">
                {getStructuredServiceDetails(request).type === 'Car Wash' && (() => { const quote = readCarWashQuote(request.problem_description_c); const approval = readCarWashApproval(request.problem_description_c); return !quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.total) ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Manual assignment is locked until the customer approves the latest revised quote.</p> : <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Customer approved the current quote. You can now assign the pickup-and-drop person.</p>; })()}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Manual assignment</label>
                  <Select value={providerChoice[request.Id] ?? ''} onValueChange={(value) => setProviderChoice((current) => ({ ...current, [request.Id]: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select eligible provider" /></SelectTrigger>
                    <SelectContent>{eligibleProviders.map((provider) => <SelectItem key={provider.Id} value={provider.Id}>{provider.Name}{providerDistance(request, provider) !== null ? ' · ' + formatDistance(providerDistance(request, provider)) : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button className="w-full" variant="outline" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? '')) || (isDriverBookingRequest(request) && (() => { const quote = readDriverQuote(request.problem_description_c); const approval = readDriverApproval(request.problem_description_c); return !quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.customerTotal); })()) || (getStructuredServiceDetails(request).type === 'Car Wash' && (() => { const quote = readCarWashQuote(request.problem_description_c); const approval = readCarWashApproval(request.problem_description_c); return !quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.total); })())} onClick={() => manualAssign(request)}>
                  <ApperIcon name="UserCheck" size={16} /> {busyKey === request.Id + ':' + providerChoice[request.Id] ? 'Sending invitation…' : getStructuredServiceDetails(request).type === 'Car Wash' ? 'Assign Pickup & Drop Person' : 'Assign manually'}
                </Button>
                <Button className="w-full" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? '')) || getStructuredServiceDetails(request).type === 'Car Wash' || (isDriverBookingRequest(request) && (() => { const quote = readDriverQuote(request.problem_description_c); const approval = readDriverApproval(request.problem_description_c); return !quote || !approval || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.customerTotal); })())} onClick={() => findNearby(request)}>
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
              {acceptedAssignment && !['Cancelled', 'Completed'].includes(String(request.status_c ?? '')) && <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-700"><ApperIcon name="CheckCircle2" size={17} /> {/car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? (() => { const quote = readCarEssentialsQuote(acceptedAssignment.message_c); return quote?.providerApproved ? 'Service Provider confirmed quote' : 'Service Provider quote received'; })() : 'Provider accepted'}</div>
                <p className="mt-1 text-sm text-muted-foreground">{/car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? 'Confirm Booking unlocks only after the customer and Service Provider approve the exact same quote.' : 'Verify the service and total before confirming this booking.'}</p>
                {/car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) && (() => { const quote = readCarEssentialsQuote(acceptedAssignment.message_c); const approval = readCarEssentialsApproval(request.problem_description_c); return <div className="mt-3 rounded-lg border p-3 text-sm"><p className="font-semibold">Car Essentials quote review</p>{quote ? <><div className="mt-2 space-y-1">{quote.items.map((item, idx) => <div key={idx} className="flex justify-between gap-3"><span>{item.name} × {item.quantity}</span><span>₹{Number(item.lineTotal).toLocaleString('en-IN')}</span></div>)}<div className="flex justify-between border-t pt-2"><span>Home delivery</span><span>₹{Number(quote.deliveryCharge).toLocaleString('en-IN')}</span></div><div className="flex justify-between font-bold"><span>Total</span><span>₹{Number(quote.total).toLocaleString('en-IN')}</span></div></div><p className="mt-2 text-xs text-muted-foreground">{approval && String(approval.quoteId) === String(quote.quoteId) && Number(approval.total) === Number(quote.total) && quote.providerApproved && String(quote.providerApprovedQuoteId ?? '') === String(quote.quoteId) && Number(quote.providerApprovedTotal) === Number(quote.total) ? 'Customer and Service Provider approved this exact quote. Ready for Admin booking confirmation.' : approval && String(approval.quoteId) === String(quote.quoteId) && Number(approval.total) === Number(quote.total) ? 'Customer approved this exact quote. Awaiting Service Provider confirmation.' : quote.status === 'Sent to Customer' ? 'Sent to customer; awaiting customer approval.' : 'Quote received; Admin review required before customer approval.'}</p>{quote.status !== 'Sent to Customer' && !approval && <Button className="mt-3 w-full" disabled={Boolean(busyKey)} onClick={() => sendCarEssentialsQuoteToCustomer(acceptedAssignment)}>{busyKey === 'quote:' + acceptedAssignment.Id ? 'Sending to customer…' : 'Review & Send Quote to Customer'}</Button>}</> : <p className="mt-2 text-amber-700">Waiting for the provider to submit item prices and delivery charges.</p>}</div>; })()}
                {isRsaQuoteRequest(request) && (() => { const quote = readRsaQuote(acceptedAssignment.message_c); const approval = readRsaApproval(request.problem_description_c); return <div className="mt-3 rounded-lg border border-primary/20 p-3 text-sm"><p className="font-semibold">RSA quotation review</p>{quote ? <><div className="mt-2 space-y-1"><div className="flex justify-between gap-3"><span>Service charge</span><span>₹{Number(quote.serviceCharge).toLocaleString('en-IN')}</span></div><div className="flex justify-between gap-3"><span>Travel charge</span><span>₹{Number(quote.travelCharge).toLocaleString('en-IN')}</span></div>{Number(quote.extraCharge) > 0 && <div className="flex justify-between gap-3"><span>Additional costs</span><span>₹{Number(quote.extraCharge).toLocaleString('en-IN')}</span></div>}<div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>₹{Number(quote.total).toLocaleString('en-IN')}</span></div>{quote.eta && <p>Estimated arrival: {quote.eta}</p>}{quote.notes && <p className="text-muted-foreground">Notes: {quote.notes}</p>}</div><p className="mt-2 text-xs text-muted-foreground">{approval && String(approval.quoteId) === String(quote.quoteId) && Number(approval.total) === Number(quote.total) && quote.providerApproved && String(quote.providerApprovedQuoteId ?? '') === String(quote.quoteId) && Number(quote.providerApprovedTotal) === Number(quote.total) ? 'Customer and provider approved this exact quote. Ready for booking confirmation.' : approval && String(approval.quoteId) === String(quote.quoteId) && Number(approval.total) === Number(quote.total) ? 'Customer approved this quote; waiting for provider confirmation.' : quote.status === 'Sent to Customer' ? 'Sent to customer; awaiting approval.' : 'Quote received; Admin review required.'}</p>{quote.status !== 'Sent to Customer' && !(approval && String(approval.quoteId) === String(quote.quoteId) && Number(approval.total) === Number(quote.total)) && <Button className="mt-3 w-full" disabled={Boolean(busyKey)} onClick={() => sendRsaQuoteToCustomer(acceptedAssignment)}>{busyKey === 'rsa-quote:' + acceptedAssignment.Id ? 'Sending to customer…' : 'Review & Send Quote to Customer'}</Button>}</> : <p className="mt-2 text-amber-700">Waiting for the assigned provider to submit service and travel charges.</p>}</div>; })()}
                {Boolean(/bike maintenance/i.test(String(request.Name ?? '') + ' ' + String(request.required_capability_c?.Name ?? '') + ' ' + String(request.problem_description_c ?? ''))) && <div className="mt-3 rounded-lg border border-primary/20 p-3 text-sm"><p className="font-semibold">Bike Maintenance quotation</p>{readBikeMaintenanceQuote(acceptedAssignment.message_c) ? <div className="mt-2 space-y-1">{(readBikeMaintenanceQuote(acceptedAssignment.message_c).items || []).map((item, idx) => <div key={idx} className="flex justify-between gap-3"><span>{item.name}</span><span>₹{Number(item.amount).toLocaleString('en-IN')}</span></div>)}<div className="flex justify-between border-t pt-2"><span>Service subtotal</span><span>₹{Number(readBikeMaintenanceQuote(acceptedAssignment.message_c).serviceTotal || 0).toLocaleString('en-IN')}</span></div><div className="flex justify-between"><span>LOCAL convenience fee</span><span>₹25</span></div><div className="flex justify-between font-bold"><span>Customer total</span><span>₹{Number(readBikeMaintenanceQuote(acceptedAssignment.message_c).customerTotal || 0).toLocaleString('en-IN')}</span></div><p className="mt-2 text-xs text-muted-foreground">Status: {readBikeMaintenanceQuote(acceptedAssignment.message_c).status}</p></div> : <p className="mt-2 text-amber-700">Technician visit and itemized quotation are pending.</p>}<p className="mt-2 text-xs text-muted-foreground">Admin must approve the quote and call the customer to record consent on the request details page before confirming the booking.</p><Button asChild variant="outline" className="mt-3 w-full"><Link to={'/requests/' + request.Id}>Open request & quotation</Link></Button>{readBikeMaintenanceQuote(acceptedAssignment.message_c)?.status === 'Admin Approved' && <Button className="mt-2 w-full" variant="outline" disabled={Boolean(busyKey)} onClick={() => recordBikeMaintenanceCustomerConsent(request, acceptedAssignment)}>Record Customer Consent</Button>}</div>}
                <Button className="mt-3 w-full" disabled={Boolean(busyKey) || ['Confirmed', 'Completed', 'Cancelled'].includes(String(request.status_c ?? '')) || (fixedPrice === null && String(request.pricing_mode_c ?? '').toLowerCase() !== 'provider quote' && !/car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '')) && !isRsaQuoteRequest(request)) || (/car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) && (() => { const quote = readCarEssentialsQuote(acceptedAssignment.message_c); const approval = readCarEssentialsApproval(request.problem_description_c); return !quote || !approval || String(approval.quoteId ?? '') !== String(quote.quoteId ?? '') || Number(approval.total) !== Number(quote.total) || !quote.providerApproved || String(quote.providerApprovedQuoteId ?? '') !== String(quote.quoteId ?? '') || Number(quote.providerApprovedTotal) !== Number(quote.total); })()) || (isRsaQuoteRequest(request) && (() => { const quote = readRsaQuote(acceptedAssignment.message_c); const approval = readRsaApproval(request.problem_description_c); return !quote || !approval || quote.status !== 'Sent to Customer' || String(approval.quoteId ?? '') !== String(quote.quoteId ?? '') || Number(approval.total) !== Number(quote.total) || !quote.providerApproved || String(quote.providerApprovedQuoteId ?? '') !== String(quote.quoteId ?? '') || Number(quote.providerApprovedTotal) !== Number(quote.total); })())} onClick={() => confirmBooking(request, acceptedAssignment)}>{busyKey === 'confirm:' + request.Id ? 'Confirming booking…' : 'Confirm Booking'}</Button>
                {((!isFixedPriceRequest(request) || fixedPrice === null) && !isRsaQuoteRequest(request)) && <p className="mt-2 text-xs text-amber-700">{String(request.pricing_mode_c ?? '').toLowerCase() === 'provider quote' || /car essentials delivery/i.test(String(request.required_capability_c?.Name ?? request.Name ?? '')) ? 'Booking confirmation requires Admin review, customer approval, and Service Provider confirmation of the exact same final quote.' : isFixedPriceRequest(request) ? 'The listed fixed price could not be read. Review the request price before confirming.' : 'This request needs a supported pricing workflow before booking can be finalized.'}</p>}
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
    // The request lifecycle is authoritative for cancellation. Historical provider acceptance
    // must never make a cancelled request look active in the dispatch list.
    if (['Cancelled', 'Completed'].includes(String(request?.status_c ?? ''))) {
      return { label: String(request.status_c), tone: 'border-slate-200 bg-slate-50 text-slate-700' };
    }
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
    <div id="central-dispatch-page-top" className="min-w-0 space-y-5 text-slate-900 scroll-mt-20">
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
            <Button className="h-11 border-blue-200 text-blue-700 hover:bg-blue-50 lg:ml-auto" variant="outline" onClick={run} disabled={loading}><ApperIcon name="RefreshCw" size={17} /> Refresh</Button>
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
              const customerProfile = getRequestCustomer(request);
              const customerName = customerProfile?.Name ?? 'Customer details unavailable';
              const customerPhone = customerProfile?.phone_c ?? customerProfile?.Phone ?? customerProfile?.mobile_c ?? '';
              const capabilityName = request.required_capability_c?.Name ?? request.service_category_c?.Name ?? 'Service';
              const total = linkedJob?.agreed_price_c ?? fixedPrice;
              return <Card key={request.Id} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
                <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(170px,1.05fr)_minmax(175px,1.12fr)_minmax(145px,0.92fr)_minmax(175px,1.12fr)_145px]">
                  <div className="flex min-w-0 items-start gap-3 p-4">
                    <div className={'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ' + (/ambulance/i.test(capabilityName) ? 'bg-rose-50 text-rose-600' : /ac|air condition/i.test(capabilityName) ? 'bg-violet-50 text-violet-600' : /wash/i.test(capabilityName) ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600')}><ApperIcon name={serviceIcon(request)} size={27} /></div>
                    <div className="min-w-0"><h2 className="break-words font-semibold leading-5 text-slate-900">{request.Name}</h2><p className="mt-1 text-xs text-slate-500">{formatCreated(request.CreatedOn)}</p><span className="mt-2 inline-flex max-w-full rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{capabilityName}</span></div>
                  </div>
                  <div className="space-y-2 border-t border-slate-100 p-4 xl:border-l xl:border-t-0"><p className="flex items-start gap-2 text-sm text-slate-700"><ApperIcon name="MapPin" size={16} className="mt-0.5 shrink-0 text-slate-500" /><span>{request.location_c || 'Location not recorded'}</span></p><p className="flex items-start gap-2 text-sm font-semibold text-slate-800"><ApperIcon name="IndianRupee" size={16} className="mt-0.5 shrink-0 text-slate-500" /><span>{(total !== null && total !== undefined ? '₹' + Number(total).toLocaleString('en-IN') : request.pricing_mode_c === 'Fixed Price' ? 'Price review needed' : 'Inspection charge / estimate')}{/wash/i.test(capabilityName) && /Pickup\s*&\s*Drop\s*—?\s*₹?\s*100/i.test(String(request.problem_description_c ?? '')) ? ' (incl. Pickup & Drop ₹100)' : ''}</span></p><p className="flex items-start gap-2 text-sm text-slate-700"><ApperIcon name="CalendarDays" size={16} className="mt-0.5 shrink-0 text-slate-500" /><span>{request.preferred_time_c === 'ASAP' ? 'Book Now' : request.scheduled_at_c ? new Date(request.scheduled_at_c).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : request.preferred_time_c || 'Time not recorded'}</span></p></div>
                  <div className="space-y-2 border-t border-slate-100 p-4 xl:border-l xl:border-t-0"><p className="flex items-center gap-2 text-xs text-slate-500"><ApperIcon name="UserRound" size={15} /> Customer</p><p className="flex items-start gap-2 text-sm font-medium text-slate-800"><ApperIcon name="User" size={15} className="mt-0.5 shrink-0 text-slate-500" /><span>{customerName}</span></p>{customerPhone ? <a href={'tel:' + String(customerPhone).replace(/[^+\d]/g, '')} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ApperIcon name="Phone" size={15} /><span>{customerPhone} · Call</span></a> : <p className="text-xs font-medium text-amber-700">Customer phone number missing</p>}</div>
                  <div className="space-y-2 border-t border-slate-100 p-4 xl:border-l xl:border-t-0"><p className="text-xs text-slate-500">Assignment Method</p><span className={'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ' + (activeAssignments.some((item) => /Nearby/i.test(String(item.message_c))) ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-blue-200 bg-blue-50 text-blue-700')}>{activeAssignments.some((item) => /Nearby/i.test(String(item.message_c))) ? 'Nearby Check' : activeAssignments.length ? 'Manual Assignment' : 'Not assigned'}</span><p className="pt-1 text-xs text-slate-500">Assigned Provider</p><p className="flex items-center gap-2 text-sm font-medium text-slate-800"><ApperIcon name="UserRound" size={15} className="shrink-0 text-slate-500" /><span>{providerName}</span></p>{activeAssignments.length > 0 && !['Cancelled', 'Completed'].includes(String(request.status_c ?? '')) && <p className={'flex items-center gap-1.5 text-xs font-medium ' + (acceptedAssignment ? 'text-emerald-700' : 'text-amber-700')}><ApperIcon name={acceptedAssignment ? 'CheckCircle2' : 'Clock3'} size={14} />{acceptedAssignment ? 'Accepted' : 'Awaiting Acceptance'}</p>}{linkedJob && /car essentials delivery/i.test(String(linkedJob.Name ?? '') + ' ' + String(request.required_capability_c?.Name ?? '')) && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2"><p className="text-xs font-semibold text-emerald-800">Delivery OTP</p>{linkedJob.service_start_otp_c ? <p className="text-xl font-bold tracking-[0.22em] text-emerald-900">{linkedJob.service_start_otp_c}</p> : <p className="text-xs text-emerald-800">Not generated yet</p>}{linkedJob.service_start_otp_verified_at_c && <p className="text-xs text-emerald-800">Verified</p>}</div>}{linkedJob && <p className="text-xs text-slate-500">Payout: {linkedJob.payout_status_c || 'Not recorded'}</p>}</div>
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