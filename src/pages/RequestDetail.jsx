import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import { getBillingBreakdown, getBookingCommitmentAmount, getRemainingAmount } from '@/services/pricing';
import { getDistanceKm, formatDistance, isAcTechnicianRequest } from '@/services/providerMatching';
import { getLanguage, tr } from '@/services/i18n';

const { eq } = window.ApperSDK.CoreSDK;

function getRequestLineItems(request) {
  const description = String(request?.problem_description_c ?? '');
  const acMarker = 'LOCAL_AC_REQUEST_JSON:';
  const acMarkerIndex = description.indexOf(acMarker);
  if (acMarkerIndex >= 0) {
    try {
      const acPayload = JSON.parse(description.slice(acMarkerIndex + acMarker.length));
      const groups = Array.isArray(acPayload.groups) ? acPayload.groups : [];
      return groups.map((group) => ({
        name: group.acType + ' — ' + group.serviceType + (group.notes ? ': ' + group.notes : ''),
        quantity: group.quantity,
        price: null,
        fixed: false,
      }));
    } catch {
      return [{ name: 'AC service details are unavailable. Please contact the customer before quoting.', quantity: '—', price: null, fixed: false }];
    }
  }
  let washDecisions = [];
  try { const marker = 'CAR_WASH_DECISIONS_JSON:'; const start = description.indexOf(marker); const jsonStart = start >= 0 ? start + marker.length : -1; const jsonEnd = jsonStart >= 0 ? description.indexOf(']', jsonStart) + 1 : -1; if (jsonStart >= 0 && jsonEnd > jsonStart) washDecisions = JSON.parse(description.slice(jsonStart, jsonEnd)); } catch { washDecisions = []; }
  const isWash = /car wash/i.test(String(request?.Name ?? '')) || /Car Wash services/i.test(description);
  const isCarService = /service package|point checkup|Covered items:/i.test(description) || /economy|normal|major/i.test(String(request?.Name ?? ''));
  if (isWash) {
    if (washDecisions.length) return washDecisions.map((item) => ({ name: item.title + (item.variant && item.variant !== 'Fixed' ? ' — ' + item.variant : ''), quantity: item.quantity, price: Number(item.listedUnitPrice) * Number(item.quantity || 1), decision: item.decision, proposedUnitPrice: item.proposedUnitPrice, fixed: Boolean(item.fixed) || item.id === 'pickup-drop' }));
    const body = description.match(/these Car Wash services:\s*(.*?)\. Estimated Total Value:/i)?.[1] ?? description;
    return body.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const pickup = /Pickup\s*&\s*Drop/i.test(part);
      const match = part.match(/^(.*?)\s*[×x]\s*(\d+)\s*=\s*₹\s*([\d,]+)/i);
      const pickupMatch = part.match(/Pickup\s*&\s*Drop\s*[—-]\s*₹\s*([\d,]+)/i);
      if (pickup) return { name: 'Pickup & Drop', quantity: 1, price: Number((pickupMatch?.[1] ?? '100').replace(/,/g, '')), fixed: true };
      if (match) return { name: match[1].trim(), quantity: Number(match[2]), price: Number(match[3].replace(/,/g, '')), fixed: false };
      return { name: part, quantity: 1, price: null, fixed: false };
    }).filter((item) => !/indicative demo|provider confirmation/i.test(item.name));
  }
  if (isCarService) {
    const packageMatch = description.match(/(Economy Service|Normal Service|Major Service).*?Listed package price:\s*₹\s*([\d,]+)/i);
    const items = [];
    if (packageMatch) items.push({ name: packageMatch[1] + ' package', quantity: 1, price: Number(packageMatch[2].replace(/,/g, '')), fixed: false });
    const coveredMatch = description.match(/Covered items:\s*(.*?)(?:\. Customer selected|$)/i);
    if (coveredMatch) coveredMatch[1].split(';').map((part) => part.trim()).filter(Boolean).forEach((part) => items.push({ name: part, quantity: 'Included / if required', price: null, fixed: true }));
    if (items.length) return items;
  }
  const cleaned = description.replace(/^Customer (?:requested|selected)\s*/i, '').replace(/\s+for their car\.?$/i, '').trim();
  return [{ name: cleaned || request?.Name || 'Service requested', quantity: 1, price: null, fixed: /ambulance|emergency/i.test(String(request?.Name ?? '')) }];
}

const REQUEST_FIELDS = ['Id', 'Name', 'customer_c', 'service_category_c', 'required_capability_c', 'problem_description_c', 'location_c', 'latitude_c', 'longitude_c', 'status_c', 'preferred_time_c', 'requested_at_c', 'scheduled_at_c', 'service_mode_c', 'CreatedOn'];
const RESPONSE_FIELDS = ['Id', 'Name', 'request_c', 'technician_c', 'proposed_price_c', 'original_proposed_price_c', 'final_agreed_price_c', 'negotiation_status_c', 'negotiation_history_c', 'availability_c', 'message_c', 'status_c'];

export const route = {
  path: '/requests/:id',
  layout: 'owner',
  access: "profile === 'Customer_c' || profile === 'ServiceProvider_c' || profile === 'Admin_c'",
};

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [negotiatingId, setNegotiatingId] = useState(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [confirmingResponse, setConfirmingResponse] = useState(null);
  const [recoveryAttemptedId, setRecoveryAttemptedId] = useState(null);

  const { data, loading, error, run } = useFetch(async () => {
    const requestRes = await sdk.table('service_requests_c').select(REQUEST_FIELDS).get(id);
    if (!requestRes.data) throw new Error('Request not found.');

    const responseRes = await sdk.table('technician_responses_c').select(RESPONSE_FIELDS).where(eq('request_c', id)).orderByDesc('CreatedOn').page(1, 50).fetch();
    if (!responseRes.success) throw new Error(responseRes.message);

    let visibleResponses = responseRes.data ?? [];
    if (user?.profile === 'Customer_c' && Number.isFinite(Number(requestRes.data.latitude_c)) && Number.isFinite(Number(requestRes.data.longitude_c))) {
      const providerProfilesRes = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'latitude_c', 'longitude_c']).page(1, 1000).fetch();
      if (!providerProfilesRes.success) throw new Error(providerProfilesRes.message);
      const providerProfiles = providerProfilesRes.data ?? [];
      visibleResponses = visibleResponses.map((response) => {
        const providerId = response.technician_c?.Id ?? response.technician_c;
        const provider = providerProfiles.find((item) => String(item.Id) === String(providerId));
        const distanceKm = provider ? getDistanceKm(requestRes.data.latitude_c, requestRes.data.longitude_c, provider.latitude_c, provider.longitude_c) : null;
        return { ...response, provider_distance_km_c: distanceKm, provider_distance_label_c: formatDistance(distanceKm) };
      });
      visibleResponses.sort((a, b) => (a.provider_distance_km_c ?? Infinity) - (b.provider_distance_km_c ?? Infinity));
    }
    if (user?.profile === 'ServiceProvider_c') {
      const providerRes = await sdk.table('technician_profiles_c').select(['Id', 'email_c']).page(1, 1000).fetch();
      if (!providerRes.success) throw new Error(providerRes.message);
      const providerEmail = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
      const provider = (providerRes.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === providerEmail);
      if (!provider) throw new Error('Service Provider profile could not be matched.');
      visibleResponses = visibleResponses.filter((item) => String(item.technician_c?.Id ?? item.technician_c) === String(provider.Id));
    }

    const jobsRes = await sdk.table('jobs_c').select(['Id', 'request_c', 'status_c', 'payment_status_c']).where(eq('request_c', id)).page(1, 1).fetch();
    if (!jobsRes.success) throw new Error(jobsRes.message);

    return { request: requestRes.data, responses: visibleResponses, job: jobsRes.data?.[0] ?? null };
  }, [id, user?.profile, user?.emailAddress, user?.email]);

  const request = data?.request;
  const responses = data?.responses ?? [];
  const relatedJob = data?.job;
  const vendorAcceptedOffer = responses.find((item) => item.status_c === 'Vendor Accepted' || (item.status_c === 'Pending' && item.negotiation_status_c === 'Agreed' && /Service Provider accepted customer offer/i.test(String(item.negotiation_history_c ?? ''))));
  const requestDisplayStatus = relatedJob ? (relatedJob.status_c || 'Job Accepted') : vendorAcceptedOffer ? 'Price Accepted — Job Accepted By Vendor' : request?.status_c;
  const isCustomer = user?.profile === 'Customer_c';
  const isTechnician = user?.profile === 'ServiceProvider_c';
  const language = getLanguage();
  const requestLineItems = getRequestLineItems(request);
  const isCarWashRequest = /car wash/i.test(String(request?.Name ?? '')) || /Car Wash services/i.test(String(request?.problem_description_c ?? ''));
  const isAcRequest = /AC Technician/i.test(String(request?.Name ?? '')) || String(request?.problem_description_c ?? '').includes('LOCAL_AC_REQUEST_JSON:');
  const isDriverRequest = /hourly driver|full-day driver|full day driver|outstation driver|emergency driver|scheduled driver|professional car driver/i.test(String(request?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const isFixedRateDriverRequest = /hourly driver|full-day driver|full day driver/i.test(String(request?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const carWashMenuTotal = requestLineItems.reduce((sum, item) => sum + (Number(item.price ?? 0)), 0);

  useEffect(() => {
    if (!loading && request && isTechnician && /car wash/i.test(String(request.Name ?? '')) && !relatedJob) {
      // If this provider has already replied to the Car Wash request, reopen that
      // offer record so the newest customer counter-offer and full history appear.
      const latestProviderOffer = responses[0];
      if (latestProviderOffer?.Id) {
        navigate('/responses/' + encodeURIComponent(latestProviderOffer.Id), { replace: true });
      } else {
        navigate('/responses/new?requestId=' + encodeURIComponent(request.Id), { replace: true });
      }
    }
  }, [loading, request?.Id, request?.Name, isTechnician, relatedJob?.Id, responses[0]?.Id, navigate]);

  async function acceptDriverRequest() {
    if (!request?.Id || !isFixedRateDriverRequest || !isTechnician) return;
    setWorking(true);
    try {
      const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
      const providerRes = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c']).page(1, 1000).fetch();
      if (!providerRes.success) throw new Error(providerRes.message ?? 'Could not load your provider profile.');
      const provider = (providerRes.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === email);
      if (!provider?.Id) throw new Error('Your Service Provider profile could not be matched.');
      const existing = await sdk.table('technician_responses_c').select(['Id', 'technician_c']).where(eq('request_c', request.Id)).page(1, 1000).fetch();
      if (!existing.success) throw new Error(existing.message ?? 'Could not check your previous response.');
      const alreadyAccepted = (existing.data ?? []).some((item) => String(item.technician_c?.Id ?? item.technician_c) === String(provider.Id));
      if (alreadyAccepted) {
        toast.info('You have already responded to this driver request.');
        await run();
        return;
      }
      const requestName = String(request.Name ?? '');
      const isHourly = /hourly driver/i.test(requestName + ' ' + String(request.problem_description_c ?? ''));
      const rateNote = isHourly
        ? 'Published rate: ₹300 minimum for the first 2 hours, then ₹100/hour after the first 2 hours. ₹300 night-halt charge if applicable.'
        : 'Published rate: ₹100/hour from 8 AM to 10 PM. ₹300 night-halt charge if applicable.';
      const responseRes = await sdk.table('technician_responses_c').create({
        Name: provider.Name + ' • ' + requestName + ' availability',
        request_c: request.Id,
        technician_c: provider.Id,
        proposed_price_c: 0,
        original_proposed_price_c: 0,
        final_agreed_price_c: null,
        negotiation_status_c: 'Not Started',
        negotiation_history_c: new Date().toLocaleString('en-IN') + ' — Driver marked available for this request.',
        availability_c: request.preferred_time_c === 'Scheduled' ? 'Available at requested time' : 'Available Now',
        message_c: 'I am available for this request. ' + rateNote,
        status_c: 'Pending',
      });
      if (!responseRes.success || !responseRes.data?.length) throw new Error(responseRes.messages?.[0] ?? 'Could not record your acceptance.');
      toast.success('Availability shared with the customer. Waiting for customer selection.');
      await run();
    } catch (err) {
      toast.error(err.message ?? 'Could not accept this driver request.');
    } finally {
      setWorking(false);
    }
  }

  async function confirmTechnician(response) {
    if (working || !request?.Id || !response?.Id) return;
    setWorking(true);
    try {
      // technician_c is a Lookup to technician_profiles_c. Its Id is already the
      // authoritative profile foreign key; do not re-query that owner-restricted
      // table from the customer's session, because RLS correctly hides other
      // providers' profiles from customers.
      const responseProviderId = response.technician_c?.Id ?? response.technician_c;
      const providerName = String(response.technician_c?.Name ?? response.Name ?? 'Service Provider').trim().replace(/\s*[•-]\s*.*$/, '') || 'Service Provider';
      if (!responseProviderId || typeof responseProviderId === 'object') {
        throw new Error('This accepted offer is missing its Service Provider profile link. The offer needs an Admin-side data repair before confirmation; do not submit a duplicate offer.');
      }
      const providerId = responseProviderId;
      const finalPrice = Number(response.final_agreed_price_c ?? response.proposed_price_c);
      if (!Number.isFinite(finalPrice) || finalPrice <= 0) throw new Error('The offer has no valid agreed price. Reopen negotiation before confirming.');

      const existingJobsRes = await sdk.table('jobs_c').select(['Id', 'request_c', 'response_c', 'technician_c', 'status_c']).where(eq('request_c', request.Id)).page(1, 10).fetch();
      if (!existingJobsRes.success) throw new Error(existingJobsRes.message ?? 'Could not check whether this request already has a job.');
      let job = (existingJobsRes.data ?? [])[0] ?? null;
      if (job) {
        const existingProviderId = job.technician_c?.Id ?? job.technician_c;
        if (String(existingProviderId ?? '') !== String(providerId)) {
          throw new Error('This request already has a job assigned to a different Service Provider. Please contact LOCAL support before changing the assignment.');
        }
      } else {
        const completedJobsRes = await sdk.table('jobs_c').select(['Id', 'technician_c', 'status_c']).page(1, 1000).fetch();
        if (!completedJobsRes.success) throw new Error(completedJobsRes.message ?? 'Could not load Service Provider job history.');
        const completedJobsCount = (completedJobsRes.data ?? []).filter((item) => String(item.technician_c?.Id ?? item.technician_c) === String(providerId) && item.status_c === 'Completed').length;
        const isCarWashBooking = String(request.Name ?? '').toLowerCase().includes('car wash');
        const isAcBooking = isAcTechnicianRequest(request);
        const calculatedBilling = getBillingBreakdown(finalPrice, request.service_mode_c ?? 'Normal', completedJobsCount, 0, 0);
        const billing = isCarWashBooking || isAcBooking
          ? { ...calculatedBilling, servicePrice: finalPrice, bookingCommitment: 0, remainingServiceAmount: finalPrice, customerPayableNow: 0, localServiceFee: 0 }
          : calculatedBilling;
        const jobRes = await sdk.table('jobs_c').create({
          Name: request.Name + ' • ' + providerName,
          request_c: request.Id,
          response_c: response.Id,
          customer_c: request.customer_c?.Id ?? request.customer_c,
          // jobs_c.technician_c is a Lookup to technician_profiles_c; pass a record reference object so Apper resolves the relation rather than treating the ID as a missing reference.
          technician_c: { Id: providerId },
          agreed_price_c: billing.servicePrice,
          original_provider_quote_c: Number(response.original_proposed_price_c ?? response.proposed_price_c),
          booking_commitment_amount_c: billing.bookingCommitment,
          remaining_amount_c: billing.remainingServiceAmount,
          local_service_fee_amount_c: billing.localServiceFee,
          customer_discount_amount_c: billing.discount,
          customer_tax_amount_c: billing.applicableTax,
          customer_payable_now_c: billing.customerPayableNow,
          provider_completed_jobs_count_c: completedJobsCount,
          provider_commission_rate_c: billing.providerCommissionRate,
          provider_commission_amount_c: billing.providerCommission,
          provider_settlement_amount_c: billing.providerSettlement,
          billing_status_c: 'Ready for Confirmation',
          payment_status_c: 'Unpaid',
          payout_status_c: 'Not Eligible',
          dispute_status_c: 'None',
          scheduled_at_c: request.scheduled_at_c || new Date(Date.now() + 3600000).toISOString(),
          status_c: 'Assigned',
        });
        job = jobRes.data?.[0] ?? null;
        if (!job) {
          // A retry/read protects against a successful server insert whose response was lost.
          const retryRes = await sdk.table('jobs_c').select(['Id', 'request_c', 'response_c', 'technician_c', 'status_c']).where(eq('request_c', request.Id)).page(1, 10).fetch();
          if (retryRes.success) job = (retryRes.data ?? [])[0] ?? null;
          if (!job) throw new Error(jobRes.messages?.filter(Boolean).join(' | ') || jobRes.message || 'The Service Provider was selected, but LOCAL could not create the job. No request/offer status was changed; retry after refreshing.');
        }
      }

      const history = String(response.negotiation_history_c ?? '').trim();
      const alreadyRecorded = /Customer selected Service Provider|Final agreed price locked/i.test(history);
      const agreedHistory = alreadyRecorded ? history : (history ? history + '\n' : '') + new Date().toLocaleString('en-IN') + ' — Customer selected Service Provider at ₹' + finalPrice.toLocaleString('en-IN');
      const responseUpdate = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        technician_c: { Id: providerId },
        status_c: 'Selected',
        final_agreed_price_c: finalPrice,
        negotiation_status_c: 'Agreed',
        negotiation_history_c: agreedHistory,
      });
      if (!responseUpdate.data?.length) throw new Error('Job ' + job.Id + ' exists, but the offer status could not be synchronized: ' + (responseUpdate.messages?.filter(Boolean).join(' | ') || responseUpdate.message || 'update not confirmed') + '. Retry confirmation to finish syncing statuses.');

      const requestUpdate = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Confirmed' });
      if (!requestUpdate.data?.length) throw new Error('Job ' + job.Id + ' exists and the offer is selected, but the request status could not be synchronized: ' + (requestUpdate.messages?.filter(Boolean).join(' | ') || requestUpdate.message || 'update not confirmed') + '. Retry confirmation to finish syncing statuses.');

      const otherIds = responses.filter((item) => String(item.Id) !== String(response.Id) && item.status_c === 'Pending').map((item) => item.Id);
      if (otherIds.length) await sdk.table('technician_responses_c').update(otherIds.map((responseId) => ({ Id: responseId, status_c: 'Declined' })));
      const isCarWashBooking = String(request.Name ?? '').toLowerCase().includes('car wash');
      const isAcBooking = isAcTechnicianRequest(request);
      toast.success(job.status_c === 'Assigned' ? 'Service Provider confirmed. Job is now Assigned.' : 'This booking already exists; its statuses are synchronized.');
      navigate('/jobs/' + job.Id);
    } catch (err) {
      toast.error(err.message ?? 'Could not confirm Service Provider.');
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    if (loading || !isCustomer || !request?.Id || relatedJob || recoveryAttemptedId === request.Id) return;
    if (!['Negotiating', 'Quoted', 'Open'].includes(String(request.status_c ?? ''))) return;
    const selectedOffer = responses.find((item) => item.status_c === 'Selected');
    if (!selectedOffer) return;
    // Recover older/partial selections where the offer was marked Selected but
    // the job insert or request-status update never completed.
    setRecoveryAttemptedId(request.Id);
    confirmTechnician(selectedOffer);
  }, [loading, isCustomer, request?.Id, request?.status_c, relatedJob, responses, recoveryAttemptedId]);

  async function negotiate(response) {
    const price = Number(counterPrice);
    if (!price || price <= 0) {
      toast.error('Enter a valid counter price.');
      return;
    }
    setWorking(true);
    try {
      const previousPrice = Number(response.proposed_price_c ?? 0);
      const history = String(response.negotiation_history_c ?? '').trim();
      const nextHistory = (history ? history + '\n' : '') + new Date().toLocaleString('en-IN') + ' — Customer counter-offer: ₹' + price.toLocaleString('en-IN') + ' (previous ₹' + previousPrice.toLocaleString('en-IN') + ')';
      const res = await sdk.table('technician_responses_c').update({ Id: response.Id, proposed_price_c: price, status_c: 'Pending', negotiation_status_c: 'Negotiating', negotiation_history_c: nextHistory, message_c: 'Customer counter-offer: ₹' + price.toLocaleString('en-IN') });
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'Counter-offer was not saved.');
        return;
      }
      const requestRes = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Negotiating' });
      if (!requestRes.data?.length) toast.warning('Offer updated, but request status did not change.');
      toast.success('Counter-offer sent.');
      setNegotiatingId(null);
      setCounterPrice('');
      run();
    } finally {
      setWorking(false);
    }
  }

  const canEditRequest = isCustomer && !responses.length && !relatedJob && String(request?.status_c ?? '') === 'Open';
  const canCancelRequest = isCustomer && ['Open', 'Quoted', 'Negotiating', 'Confirmed', 'In progress'].includes(String(request?.status_c ?? ''));

  async function removeRequest() {
    if (!request?.Id || !canCancelRequest) return;
    if (['Confirmed', 'In progress'].includes(String(request.status_c ?? ''))) {
      setDeleteOpen(false);
      toast.info('This booking already has an active job. Please contact LOCAL support to request cancellation so provider and payment records stay consistent.');
      return;
    }
    setWorking(true);
    try {
      // Keep request and offer records for auditability. Deleting the request and its
      // dependent offers caused record-not-found failures in the connected marketplace.
      const result = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Cancelled' });
      if (!result.data?.length) {
        toast.error(result.messages?.[0] ?? 'This request could not be cancelled. Refresh the page and try again.');
        return;
      }
      toast.success('Request cancelled. Its offers and history have been preserved.');
      setDeleteOpen(false);
      navigate('/requests');
    } catch (err) {
      toast.error(err.message || 'This request could not be cancelled. No records were deleted.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" />;
  if (error || !request) return <Card className="border-l-4 border-destructive p-6">This request could not be found. <Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card>;

  return (
    <div>
      <PageHeader
        eyebrow={tr('Service request', language)}
        title={isCarWashRequest ? 'CAR • Car Wash (' + requestLineItems.length + ' items)' : request.Name}
        description={request.location_c + ' • ' + (request.preferred_time_c === 'Scheduled' && request.scheduled_at_c ? 'Scheduled for ' + new Date(request.scheduled_at_c).toLocaleString('en-IN') : request.preferred_time_c === 'ASAP' ? 'Book Now — need help now' : request.preferred_time_c)}
        action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/requests"><ApperIcon name="ArrowLeft" size={16} /> Back</Link></Button>{isCustomer && request.status_c === 'Confirmed' && relatedJob && <Button asChild><Link to={'/jobs/' + relatedJob.Id}><ApperIcon name="CreditCard" size={16} /> {['Booking Commitment & LOCAL Fee Paid', 'Final Payment Paid'].includes(relatedJob.payment_status_c) ? 'View payment & job' : 'Proceed to payment'}</Link></Button>}{(isCustomer && canEditRequest || user?.profile === 'Admin_c') && <Button asChild variant="outline"><Link to={'/requests/' + request.Id + '/edit'}><ApperIcon name="Pencil" size={16} /> Edit booking</Link></Button>}{isTechnician && ['Open', 'Quoted', 'Negotiating'].includes(String(request.status_c ?? '')) && (isFixedRateDriverRequest ? <Button onClick={acceptDriverRequest} disabled={working}><ApperIcon name="CheckCircle" size={16} /> {working ? 'Accepting…' : 'I’m Available — Accept Request'}</Button> : !responses.some((item) => item.status_c === 'Selected') && <Button asChild><Link to={'/responses/new?requestId=' + request.Id}><ApperIcon name="BadgeIndianRupee" size={16} /> Send offer</Link></Button>)}</div>}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="border-l-4 border-primary p-4 md:p-5">
          <h2 className="font-heading text-xl font-semibold">{isAcRequest ? 'AC SERVICE REQUIRED' : /car wash/i.test(String(request.Name ?? '')) ? 'CAR WASH REQUIRED' : /car service|service package|economy service|normal service|major service/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? 'CAR SERVICE REQUIRED' : /bike/i.test(String(request.Name ?? '')) ? 'BIKE SERVICE REQUIRED' : /ambulance|emergency/i.test(String(request.Name ?? '')) ? 'EMERGENCY SERVICE REQUIRED' : 'SERVICE REQUIRED'}</h2>
          <div className="mt-3 rounded-md border border-border"><table className="w-full table-fixed text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="w-[58%] px-2 py-2 sm:px-3">Service item</th><th className="w-[12%] px-1 py-2 text-center sm:px-2">Qty.</th><th className="w-[30%] px-2 py-2 text-right sm:px-3">{isAcRequest ? 'Provider quote' : 'Menu price'}</th></tr></thead><tbody>{requestLineItems.map((item, index) => <tr key={item.name + '-' + index} className="border-t border-border"><td className="break-words px-2 py-2.5 font-medium sm:px-3">{item.name}</td><td className="px-1 py-2.5 text-center text-muted-foreground sm:px-2">{item.quantity}</td><td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums sm:px-3">{item.price == null ? '—' : '₹' + Number(item.price).toLocaleString('en-IN')}</td></tr>)}{isCarWashRequest && <tr className="border-t bg-muted/40"><td colSpan={2} className="px-2 py-3 font-semibold sm:px-3">Actual Price of Service</td><td className="whitespace-nowrap px-2 py-3 text-right text-base font-bold tabular-nums sm:px-3">₹{carWashMenuTotal.toLocaleString('en-IN')}</td></tr>}</tbody></table></div>
          {isCarWashRequest && <p className="mt-2 text-xs text-muted-foreground">Car Wash services, quantities and menu prices are shown together in a compact horizontal table. The customer and provider negotiate one overall booking total; Pickup &amp; Drop cannot be negotiated separately.</p>}
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div><div className="text-xs text-muted-foreground">{tr('Category', language)}</div><div className="mt-1 font-medium">{tr(request.service_category_c?.Name ?? '—', language)}</div></div>
            <div><div className="text-xs text-muted-foreground">{tr('Required capability', language)}</div><div className="mt-1 font-medium">{tr(request.required_capability_c?.Name ?? '—', language)}</div></div>
            <div><div className="text-xs text-muted-foreground">{tr('Customer', language)}</div><div className="mt-1 font-medium">{request.customer_c?.Name ?? '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">{tr('Location', language)}</div><div className="mt-1 font-medium">{request.location_c}</div></div>
            <div><div className="text-xs text-muted-foreground">Request created</div><div className="mt-1 font-medium">{(request.requested_at_c || request.CreatedOn) ? new Date(request.requested_at_c || request.CreatedOn).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Time unavailable'}</div></div>
            <div><div className="text-xs text-muted-foreground">Requested service date &amp; time</div><div className="mt-1 font-medium">{request.preferred_time_c === 'Scheduled' && request.scheduled_at_c ? new Date(request.scheduled_at_c).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }) : request.preferred_time_c === 'ASAP' ? 'Book Now — need help now' : request.preferred_time_c}</div></div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-muted-foreground">Booking status</div><StatusBadge value={requestDisplayStatus} /></div>
            {isCustomer && request.status_c === 'Confirmed' && relatedJob && <div className="rounded-lg border border-highlight/40 bg-highlight/5 p-4"><div className="font-semibold">Booking confirmed</div><p className="mt-1 text-sm text-muted-foreground">Your Service Provider is selected. Continue to the job page to review the booking commitment, LOCAL Service Fee, and available demo payment methods.</p><Button className="mt-3 w-full" onClick={() => navigate('/jobs/' + relatedJob.Id)}><ApperIcon name="CreditCard" size={16} /> {['Booking Commitment & LOCAL Fee Paid', 'Final Payment Paid'].includes(relatedJob.payment_status_c) ? 'View job & payment status' : 'Proceed to payment'}</Button></div>}
          </div>
          {canCancelRequest && (
            <div className="mt-7 border-t border-border pt-5">
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <ApperIcon name="XCircle" size={15} />
                {request.status_c === 'Confirmed' || request.status_c === 'In progress' ? 'Request cancellation' : 'Cancel request'}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">LOCAL preserves booking and offer history. Confirmed or in-progress cancellations may need support follow-up.</p>
            </div>
          )}
        </Card>
        <Card className="border-l-4 border-highlight p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-heading text-xl font-semibold">{isFixedRateDriverRequest ? (isCustomer ? 'Drivers who accepted' : 'Your driver response') : isTechnician ? tr('Your offer', language) : tr('Service Provider offers', language)}</h2><p className="mt-1 text-sm text-muted-foreground">{isFixedRateDriverRequest ? (isCustomer ? 'Choose one available driver to continue. The booking is not confirmed until you select a driver.' : (responses.length ? 'Your availability response is recorded. Wait for the customer to select you.' : 'Accept this request to share your availability. No price quote is required.')) : isTechnician ? (responses.length ? tr('Only your offer and negotiation history are visible to you.', language) : tr('You have not submitted an offer for this request yet.', language)) : responses.length + ' ' + tr(responses.length === 1 ? 'quote' : 'quotes', language) + ' ' + tr('Each Service Provider sets their own price.', language)}</p></div>{isTechnician && isFixedRateDriverRequest && !responses.length && <Button size="sm" onClick={acceptDriverRequest} disabled={working}><ApperIcon name="CheckCircle" size={15} /> I’m Available — Accept Request</Button>}{isTechnician && !isFixedRateDriverRequest && !responses.some((item) => item.status_c === 'Selected') && <Button size="sm" asChild><Link to={'/responses/new?requestId=' + request.Id}><ApperIcon name="BadgeIndianRupee" size={15} /> Send offer</Link></Button>}{isTechnician && !isFixedRateDriverRequest && responses.some((item) => item.status_c === 'Selected') && <span className="rounded-full border border-success-border bg-success-muted px-3 py-1 text-xs font-semibold text-success">Selected by customer</span>}</div>
          <div className="mt-3 space-y-3">
            {responses.map((response) => {
              const historyText = String(response.negotiation_history_c ?? '');
              const vendorAccepted = response.status_c === 'Vendor Accepted' || (response.status_c === 'Pending' && response.negotiation_status_c === 'Agreed' && /Service Provider accepted customer offer/i.test(historyText));
              return (
              <div key={response.Id} className="border-l-4 border-primary bg-muted/30 p-4">
                <div className="flex flex-col gap-4">
                  <div className="min-w-0 w-full"><div className="flex flex-wrap items-center gap-2"><div className="font-medium">{response.technician_c?.Name ?? 'Service Provider'}</div><StatusBadge value={vendorAccepted ? 'Vendor Accepted' : response.status_c} /></div><div className="mt-1 text-sm text-muted-foreground">{response.availability_c}{isCustomer && response.provider_distance_label_c ? ' • ' + response.provider_distance_label_c + ' from your location' : ''}</div><p className="mt-2 break-words text-sm">{isFixedRateDriverRequest ? 'Available for this driver request.' : (response.message_c || 'No additional message.')}</p></div>
                  <div className="w-full min-w-0">{isFixedRateDriverRequest ? <><div className="font-heading text-xl font-semibold">{/hourly driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? '₹300 minimum' : '₹100/hour'}</div><div className="mt-1 max-w-xs text-xs text-muted-foreground">{/hourly driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? 'First 2 hours; then ₹100/hour. Night halt ₹300 if applicable.' : '8 AM–10 PM. Night halt ₹300 if applicable.'}</div></> : <div className="font-heading text-2xl font-semibold">₹{Number(response.proposed_price_c ?? 0).toLocaleString('en-IN')}</div>}{!isFixedRateDriverRequest && response.original_proposed_price_c != null && Number(response.original_proposed_price_c) !== Number(response.proposed_price_c) && <div className="mt-1 text-xs text-muted-foreground">{tr('Original quote', language)} ₹{Number(response.original_proposed_price_c).toLocaleString('en-IN')}</div>}{isCustomer && response.status_c === 'Pending' && !vendorAccepted && !relatedJob && <div className="mt-3 flex flex-wrap gap-2 md:justify-end">{!isFixedRateDriverRequest && <Button size="sm" variant="outline" disabled={working} onClick={() => { setNegotiatingId(response.Id); setCounterPrice(String(response.proposed_price_c ?? '')); }}>{tr('Negotiate', language)}</Button>}<Button size="sm" disabled={working} onClick={() => setConfirmingResponse(response)}>{isFixedRateDriverRequest ? 'Choose this driver' : tr('Confirm service provider', language)}</Button></div>}
                {isCustomer && vendorAccepted && !relatedJob && <div className="mt-3 flex w-full min-w-0 flex-col items-start gap-3 rounded-lg border border-success-border bg-success-muted p-3"><p className="break-words text-sm text-success"><strong>Vendor Accepted.</strong> The Service Provider accepted ₹{Number(response.final_agreed_price_c ?? response.proposed_price_c).toLocaleString('en-IN')}. Waiting for you to confirm the booking.</p><Button className="max-w-full whitespace-normal" size="sm" disabled={working} onClick={() => confirmTechnician(response)}>{working ? 'Confirming…' : 'Confirm Booking & Create Job'}</Button></div>}{isCustomer && response.status_c === 'Selected' && !relatedJob && <div className="mt-3 flex flex-wrap items-center gap-2 md:justify-end"><span className="text-xs text-muted-foreground">Offer selected; finish setting up the booking.</span><Button size="sm" disabled={working} onClick={() => confirmTechnician(response)}>{working ? 'Finishing booking…' : 'Complete booking setup'}</Button></div>}{isTechnician && <div className="mt-3 text-xs font-semibold text-muted-foreground">{isFixedRateDriverRequest ? 'Waiting for customer selection' : <Link to={'/responses/' + response.Id}>Manage offer</Link>}</div>}</div>
                </div>
                {!isFixedRateDriverRequest && response.negotiation_history_c && <div className="mt-3 rounded-md border border-border bg-background p-3"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tr('Negotiation history', language)}</div><pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-muted-foreground">{response.negotiation_history_c}</pre></div>}
                {negotiatingId === response.Id && isCustomer && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row"><div className="min-w-0 flex-1"><Input type="number" value={counterPrice} onChange={(event) => setCounterPrice(event.target.value)} placeholder="Counter price" aria-label="Counter price" /></div><Button disabled={working} onClick={() => negotiate(response)}>Send counter-offer</Button><Button type="button" variant="ghost" onClick={() => setNegotiatingId(null)}>Cancel</Button></div>
                )}
              </div>
              );
            })}
            {!responses.length && <div className="py-10 text-center text-sm text-muted-foreground">{isFixedRateDriverRequest ? (isCustomer ? 'No drivers have accepted this request yet. Check back shortly.' : 'You have not accepted this request yet.') : tr('No service provider offers yet. Service providers will appear here as they respond.', language)}</div>}
          </div>
        </Card>
      </div>
      <AlertDialog open={confirmingResponse != null} onOpenChange={(open) => { if (!open && !working) setConfirmingResponse(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('Confirm Booking', language)}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr('Review the final amount before confirming this booking.', language)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingResponse && (() => {
            const previewPrice = Number(confirmingResponse.final_agreed_price_c ?? confirmingResponse.proposed_price_c);
            const calculatedPreviewBilling = getBillingBreakdown(previewPrice, request.service_mode_c ?? 'Normal', 0, 0, 0);
            const isCarWashPreview = String(request.Name ?? '').toLowerCase().includes('car wash');
            const isAcPreview = isAcTechnicianRequest(request);
            const previewBilling = isCarWashPreview || isAcPreview
              ? { ...calculatedPreviewBilling, servicePrice: previewPrice, bookingCommitment: 0, remainingServiceAmount: previewPrice, customerPayableNow: 0, localServiceFee: 0 }
              : calculatedPreviewBilling;
            return (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between gap-4"><span>{tr('Service Provider', language)}</span><span className="font-medium">{confirmingResponse.technician_c?.Name ?? 'Service Provider'}</span></div>
                <div className="flex justify-between gap-4"><span>{tr('Final agreed price', language)}</span><span className="font-semibold">₹{previewBilling.servicePrice.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between gap-4"><span>{tr('Booking commitment', language)}</span><span>₹{previewBilling.bookingCommitment.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between gap-4"><span>{tr('LOCAL Service Fee', language)}</span><span>₹{previewBilling.localServiceFee.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between gap-4 border-t border-border pt-3"><span className="font-semibold">{isAcPreview ? 'Pay after service completion' : tr('Pay now to confirm', language)}</span><span className="font-heading text-xl font-semibold">₹{previewBilling.customerPayableNow.toLocaleString('en-IN')}</span></div>
                <p className="text-xs leading-5 text-muted-foreground">{isAcPreview ? 'No advance is collected for AC service. The final agreed amount is payable after the customer confirms the completed work.' : tr('The Booking Commitment is adjusted against the final service price. The LOCAL Service Fee is the platform charge.', language)}</p>
              </div>
            );
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>{tr('Cancel', language)}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const selected = confirmingResponse; setConfirmingResponse(null); confirmTechnician(selected); }} disabled={working}>{tr('Continue to payment', language)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request.status_c === 'Confirmed' || request.status_c === 'In progress' ? 'Request booking cancellation?' : 'Cancel this service request?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {request.status_c === 'Confirmed' || request.status_c === 'In progress'
                ? 'Request cancellation for “' + request.Name + '”. The booking record and payment history will be preserved; support may need to review the cancellation.'
                : 'Cancel “' + request.Name + '”? Provider offers and request history will be preserved. This cannot be undone from this screen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Keep request</AlertDialogCancel>
            <AlertDialogAction onClick={removeRequest} disabled={working}>
              {working ? 'Cancelling…' : 'Confirm cancellation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}