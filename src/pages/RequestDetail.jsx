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

function readCarEssentialsQuote(message) {
  const marker = 'LOCAL_CAR_ESSENTIALS_QUOTE_JSON:';
  const source = String(message ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).trim()); return payload && Array.isArray(payload.items) ? payload : null; } catch { return null; }
}

function readCarEssentialsApproval(description) {
  const marker = 'LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && payload.approved === true ? payload : null; } catch { return null; }
}

function getRequestLineItems(request) {
  const description = String(request?.problem_description_c ?? '');
  if (/car essentials delivery/i.test(String(request?.Name ?? '') + ' ' + description)) {
    const itemsText = description.match(/Car Essentials order details:\s*([^.]+)/i)?.[1] ?? '';
    const items = itemsText.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const match = part.match(/^(.*?)\s*[×x]\s*(\d+)/i);
      return { name: match ? match[1].trim() : part, quantity: match ? Number(match[2]) : 1, price: null, fixed: false };
    });
    return items.length ? items : [{ name: 'Requested product details', quantity: 1, price: null, fixed: false }];
  }
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

function readCancellationDetails(description) {
  const marker = 'LOCAL_CANCELLATION_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try {
    const payload = JSON.parse(source.slice(index + marker.length).split('\n')[0]);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function writeCancellationDetails(description, payload) {
  const marker = 'LOCAL_CANCELLATION_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  const clean = index >= 0 ? source.slice(0, index).trimEnd() : source.trimEnd();
  return clean + (clean ? '\n\n' : '') + marker + JSON.stringify(payload);
}

function getCancellationReasons(request) {
  const service = String(request?.Name ?? '') + ' ' + String(request?.service_category_c?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? '');
  if (/pandit|puja|pooja/i.test(service)) return [
    'Puja date or time changed', 'I selected the wrong puja/service', 'I need a different language', 'Samagri requirements changed',
    'Pandit is delayed or not responding', 'Charges are higher than expected', 'I want to reschedule', 'I no longer need this service', 'Booked by mistake', 'Other'
  ];
  if (/car wash/i.test(service)) return [
    'I no longer need the car wash', 'I selected the wrong service/package', 'Price or extra charges are higher than expected',
    'Pickup and drop charges are higher than expected', 'Service Provider is delayed or not responding',
    'The Service Provider asked me to cancel', 'I want to reschedule', 'Booked by mistake', 'Other'
  ];
  if (/car service|vehicle service|mechanic|car repair/i.test(service)) return [
    'I no longer need the service', 'I selected the wrong service', 'Price or extra charges are higher than expected',
    'Service Provider is delayed or not responding', 'The Service Provider asked me to cancel',
    'The problem has been resolved', 'I want to reschedule', 'Booked by mistake', 'Other'
  ];
  if (/driver|car drive|professional car/i.test(service)) return [
    'My travel plan changed', 'Pickup or destination details are incorrect', 'Driver is delayed or not responding',
    'Fare or extra charges are higher than expected', 'I arranged another driver', 'I no longer need the service',
    'I want to reschedule', 'Booked by mistake', 'Other'
  ];
  if (/ambulance/i.test(service)) return [
    'Ambulance is no longer required', 'Pickup location was entered incorrectly', 'Help is taking too long to arrive',
    'I arranged emergency help elsewhere', 'Booking was made by mistake', 'Other'
  ];
  if (/fuel|towing|battery|jump start|lockout|roadside|puncture|car assistance/i.test(service)) return [
    'The issue has been resolved', 'Help is taking too long to arrive', 'Service Provider cannot reach my location',
    'Price or extra charges are higher than expected', 'I arranged help elsewhere', 'Pickup location is incorrect',
    'The Service Provider asked me to cancel', 'Booked by mistake', 'Other'
  ];
  if (/ac technician|air conditioner|electrician|plumber|home service|home repair/i.test(service)) return [
    'I no longer need the service', 'I selected the wrong service', 'Price or extra charges are higher than expected',
    'Service Provider is delayed or not responding', 'The problem has been resolved',
    'I want to reschedule', 'The Service Provider asked me to cancel', 'Booked by mistake', 'Other'
  ];
  return [
    'I no longer need the service', 'I selected the wrong service', 'Price or extra charges are higher than expected',
    'Service Provider is delayed or not responding', 'The problem has been resolved',
    'I want to reschedule', 'The Service Provider asked me to cancel', 'Booked by mistake', 'Other'
  ];
}

function formatCancellationTime(value) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}
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
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOtherReason, setCancelOtherReason] = useState('');
  const [working, setWorking] = useState(false);
  const [quotePrices, setQuotePrices] = useState({});
  const [deliveryCharge, setDeliveryCharge] = useState('');

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

    // Legacy data may contain multiple response rows for the same provider/request.
    // The query is newest-first, so keep the latest row per provider and show one card.
    // This is a presentation safeguard; it does not delete negotiation history or records.
    const seenProviderIds = new Set();
    visibleResponses = visibleResponses.filter((item) => {
      const providerId = item.technician_c?.Id ?? item.technician_c;
      const key = providerId == null ? 'response:' + String(item.Id) : 'provider:' + String(providerId);
      if (seenProviderIds.has(key)) return false;
      seenProviderIds.add(key);
      return true;
    });

    const jobsRes = await sdk.table('jobs_c').select(['Id', 'Name', 'request_c', 'status_c', 'payment_status_c', 'billing_status_c', 'agreed_price_c', 'customer_payable_now_c', 'remaining_amount_c', 'payment_method_c', 'payment_reference_c', 'returned_at_c', 'customer_completion_confirmed_at_c', 'payout_status_c', 'payment_timing_c', 'customer_c', 'technician_c']).where(eq('request_c', id)).page(1, 1).fetch();
    if (!jobsRes.success) throw new Error(jobsRes.message);

    return { request: requestRes.data, responses: visibleResponses, job: jobsRes.data?.[0] ?? null };
  }, [id, user?.profile, user?.emailAddress, user?.email]);

  const request = data?.request;
  const cancellationDetails = readCancellationDetails(request?.problem_description_c);
  const cancellationReasons = getCancellationReasons(request);
  const responses = data?.responses ?? [];
  const relatedJob = data?.job;
  const vendorAcceptedOffer = responses.find((item) => item.status_c === 'Vendor Accepted' || (item.status_c === 'Pending' && item.negotiation_status_c === 'Agreed' && /Service Provider accepted customer offer/i.test(String(item.negotiation_history_c ?? ''))));
  const requestDisplayStatus = request?.status_c === 'Cancelled' ? 'Cancelled' : relatedJob ? (relatedJob.status_c || 'Job Accepted') : vendorAcceptedOffer ? 'Price Accepted — Job Accepted By Vendor' : request?.status_c;
  const isCustomer = user?.profile === 'Customer_c';
  const isTechnician = user?.profile === 'ServiceProvider_c';
  const language = getLanguage();
  const requestLineItems = getRequestLineItems(request);
  const isCarWashRequest = /car wash/i.test(String(request?.Name ?? '')) || /Car Wash services/i.test(String(request?.problem_description_c ?? ''));
  const isAcRequest = /AC Technician/i.test(String(request?.Name ?? '')) || String(request?.problem_description_c ?? '').includes('LOCAL_AC_REQUEST_JSON:');
  const isDriverRequest = /hourly driver|full-day driver|full day driver|outstation driver|emergency driver|scheduled driver|professional car driver/i.test(String(request?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const isFixedRateDriverRequest = /hourly driver|full-day driver|full day driver/i.test(String(request?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const carWashMenuTotal = requestLineItems.reduce((sum, item) => sum + (Number(item.price ?? 0)), 0);
  const isCarEssentialsRequest = /car essentials delivery/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const centralAssignment = responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Selected');
  const carQuote = readCarEssentialsQuote(centralAssignment?.message_c);
  const carApproval = readCarEssentialsApproval(request?.problem_description_c);

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

  async function submitCarEssentialsQuote(response) {
    if (!isTechnician || !isCarEssentialsRequest || !response?.Id || !['Pending', 'Selected'].includes(response.status_c) || !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? ''))) return;
    const prices = requestLineItems.map((item, index) => ({ name: item.name, quantity: Number(item.quantity || 1), unitPrice: Number(quotePrices[index]), lineTotal: Number(quotePrices[index]) * Number(item.quantity || 1) }));
    const fee = Number(deliveryCharge);
    if (!prices.length || prices.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0) || !Number.isFinite(fee) || fee < 0) {
      toast.error('Enter a positive unit price for every requested product and a valid delivery charge.');
      return;
    }
    const quoteId = 'CE-' + Date.now().toString(36).toUpperCase();
    const total = prices.reduce((sum, item) => sum + item.lineTotal, 0) + fee;
    const quote = { quoteId, version: 1, items: prices, deliveryCharge: fee, total, submittedAt: new Date().toISOString(), status: 'Submitted to Admin' };
    setWorking(true);
    try {
      const baseMessage = String(response.message_c ?? '').split('LOCAL_CAR_ESSENTIALS_QUOTE_JSON:')[0].trimEnd();
      const updated = await sdk.table('technician_responses_c').update({ Id: response.Id, status_c: 'Selected', proposed_price_c: total, original_proposed_price_c: total, final_agreed_price_c: null, message_c: baseMessage + '\nLOCAL_CAR_ESSENTIALS_QUOTE_JSON:' + JSON.stringify(quote) });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Quote could not be saved.');
      toast.success('Itemized quote sent to Admin Central Dispatch for review.');
      await run();
    } catch (err) { toast.error(err.message || 'Could not submit quote.'); }
    finally { setWorking(false); }
  }

  async function approveCarEssentialsQuote() {
    if (!isCustomer || !carQuote || !request?.Id || carApproval?.quoteId === carQuote.quoteId) return;
    setWorking(true);
    try {
      const otpArray = new Uint32Array(1);
      window.crypto.getRandomValues(otpArray);
      const otp = String(100000 + (otpArray[0] % 900000));
      const clean = String(request.problem_description_c ?? '').split('LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:')[0].trimEnd();
      const approval = { approved: true, quoteId: carQuote.quoteId, total: Number(carQuote.total), approvedAt: new Date().toISOString(), otp, otpExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), otpUsed: false };
      const updated = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Quoted', problem_description_c: clean + '\nLOCAL_CAR_ESSENTIALS_APPROVAL_JSON:' + JSON.stringify(approval) });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Approval could not be saved.');
      toast.success('Quote approved. Delivery OTP generated and Admin Central Dispatch notified.');
      await run();
    } catch (err) { toast.error(err.message || 'Could not approve quote.'); }
    finally { setWorking(false); }
  }

  async function acceptCentralAssignment(response) {
    if (!isTechnician || !response?.Id || !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) || response.status_c !== 'Pending') return;
    setWorking(true);
    try {
      const acceptedAt = new Date().toLocaleString('en-IN');
      const updated = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        status_c: 'Selected',
        availability_c: request.preferred_time_c === 'Scheduled' ? 'Within 1 hour' : 'Available Now',
        message_c: String(response.message_c ?? '') + '\nProvider accepted assignment at ' + acceptedAt + '. No price negotiation is involved.',
      });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Your acceptance could not be saved.');
      toast.success('Assignment accepted. Central LOCAL has been notified; wait for booking confirmation.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not accept assignment.');
    } finally {
      setWorking(false);
    }
  }

  async function declineCentralAssignment(response) {
    if (!isTechnician || !response?.Id || !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) || response.status_c !== 'Pending') return;
    setWorking(true);
    try {
      const updated = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        status_c: 'Declined',
        message_c: String(response.message_c ?? '') + '\nProvider declined assignment at ' + new Date().toLocaleString('en-IN') + '.',
      });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Decline could not be saved.');
      toast.success('Assignment declined. Central LOCAL can assign another provider.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not decline assignment.');
    } finally {
      setWorking(false);
    }
  }

  async function confirmTechnician(response) {
    setWorking(true);
    try {
      // Customer SELECT access to technician_profiles_c is intentionally restricted by RLS.
      // Never scan that private table from this customer action: an empty result means
      // "not visible", not "deleted". Use the provider Lookup already saved on the offer.
      const providerId = response.technician_c?.Id ?? response.technician_c;
      const currentProvider = response.technician_c && typeof response.technician_c === 'object'
        ? response.technician_c
        : null;
      const customerId = request.customer_c?.Id ?? request.customer_c;
      if (!request?.Id || typeof request.Id !== 'string') {
        throw new Error('This service request has no valid database record ID. Refresh and open the request again.');
      }
      if (!providerId || typeof providerId !== 'string') {
        throw new Error('This offer has no valid Service Provider reference. Ask the Service Provider to submit a fresh quote.');
      }
      if (!customerId || typeof customerId !== 'string') {
        throw new Error('The customer profile linked to this request is missing. The request must be recreated from a valid customer account.');
      }
      const validProviderId = providerId;
      const validCustomerId = customerId;
      const completedJobsRes = await sdk.table('jobs_c').select(['Id', 'technician_c', 'status_c']).page(1, 1000).fetch();
      if (!completedJobsRes.success) throw new Error(completedJobsRes.message);
      const completedJobsCount = (completedJobsRes.data ?? []).filter((job) => String(job.technician_c?.Id ?? job.technician_c) === String(providerId) && job.status_c === 'Completed').length;
      const finalPriceForBooking = Number(response.final_agreed_price_c ?? response.proposed_price_c);
      const isCarWashBooking = String(request.Name ?? '').toLowerCase().includes('car wash');
      const isAcBooking = isAcTechnicianRequest(request);
      const calculatedBilling = getBillingBreakdown(finalPriceForBooking, request.service_mode_c ?? 'Normal', completedJobsCount, 0, 0);
      const billing = isCarWashBooking || isAcBooking
        ? { ...calculatedBilling, servicePrice: finalPriceForBooking, bookingCommitment: 0, remainingServiceAmount: finalPriceForBooking, customerPayableNow: 0, localServiceFee: 0 }
        : calculatedBilling;

      const jobsRes = await sdk.table('jobs_c').select(['Id']).where(eq('request_c', request.Id)).page(1, 1).fetch();
      if (!jobsRes.success) throw new Error(jobsRes.message);
      if (jobsRes.data?.length) {
        toast.error('A job already exists for this request.');
        return;
      }
      const finalPrice = Number(response.final_agreed_price_c ?? response.proposed_price_c);
      const history = String(response.negotiation_history_c ?? '').trim();
      const agreedHistory = (history ? history + '\n' : '') + new Date().toLocaleString('en-IN') + ' — Customer selected Service Provider at ₹' + finalPrice.toLocaleString('en-IN');
      const jobRes = await sdk.table('jobs_c').create({
        Name: request.Name + ' • ' + (currentProvider?.Name ?? response.technician_c?.Name ?? 'Service Provider'),
        request_c: request.Id,
        response_c: response.Id,
        customer_c: validCustomerId,
        technician_c: validProviderId,
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
      if (!jobRes.data?.length) {
        toast.error(jobRes.messages?.[0] ?? 'Service Provider was selected, but the job was not created.');
        return;
      }
      const selectedRes = await sdk.table('technician_responses_c').update({ Id: response.Id, status_c: 'Selected', final_agreed_price_c: finalPrice, negotiation_status_c: 'Agreed', negotiation_history_c: agreedHistory });
      if (!selectedRes.data?.length) toast.warning('Booking created, but the accepted offer status could not be updated.');
      const otherIds = responses.filter((item) => String(item.Id) !== String(response.Id) && item.status_c === 'Pending').map((item) => item.Id);
      if (otherIds.length) await sdk.table('technician_responses_c').update(otherIds.map((responseId) => ({ Id: responseId, status_c: 'Declined' })));
      const requestRes = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Confirmed' });
      if (!requestRes.data?.length) toast.warning('Job created, but request status could not be updated.');
      toast.success(isCarWashBooking ? 'Service Provider confirmed. No advance is due for Car Wash.' : isAcBooking ? 'AC Service Provider confirmed. Payment is due after service completion.' : 'Service Provider confirmed and job created. Opening payment options…');
      navigate('/jobs/' + jobRes.data[0].Id);
    } catch (err) {
      toast.error(err.message ?? 'Could not confirm Service Provider.');
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
      const actorName = String(user?.fullName ?? user?.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ') ?? user?.emailAddress ?? user?.email ?? 'Customer').trim() || 'Customer';
      const cancellation = {
        actor: 'Customer',
        actorName,
        actorProfile: String(user?.profile ?? 'Customer_c'),
        cancelledAt: new Date().toISOString(),
        reason: cancelReason === 'Other' ? (cancelOtherReason.trim() || 'Other (details not provided)') : cancelReason,
        reasonCode: cancelReason,
        stage: String(request.status_c ?? 'Unknown'),
      };
      const result = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Cancelled', problem_description_c: writeCancellationDetails(request.problem_description_c, cancellation) });
      if (!result.data?.length) {
        toast.error(result.messages?.[0] ?? 'This request could not be cancelled. Refresh the page and try again.');
        return;
      }
      toast.success('Request cancelled. The cancellation details and offer history have been preserved.');
      setCancelReason('');
      setCancelOtherReason('');
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
        action={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => run()} disabled={loading}><ApperIcon name="RefreshCw" size={16} className={loading ? 'animate-spin' : ''} /> Refresh</Button><Button asChild variant="outline"><Link to="/requests"><ApperIcon name="ArrowLeft" size={16} /> Back</Link></Button>{isCustomer && request.status_c === 'Confirmed' && relatedJob && <Button asChild><Link to={'/jobs/' + relatedJob.Id}><ApperIcon name="CreditCard" size={16} /> {['Booking Commitment & LOCAL Fee Paid', 'Final Payment Paid'].includes(relatedJob.payment_status_c) ? 'View payment & job' : 'Proceed to payment'}</Link></Button>}{(isCustomer && canEditRequest || user?.profile === 'Admin_c') && <Button asChild variant="outline"><Link to={'/requests/' + request.Id + '/edit'}><ApperIcon name="Pencil" size={16} /> Edit booking</Link></Button>}{isTechnician && responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending') && <><Button onClick={() => acceptCentralAssignment(responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending'))} disabled={working}><ApperIcon name="CheckCircle" size={16} /> {working ? 'Saving…' : 'Accept LOCAL Assignment'}</Button><Button variant="outline" onClick={() => declineCentralAssignment(responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending'))} disabled={working}>Decline</Button></>}{isTechnician && isFixedRateDriverRequest && ['Open', 'Quoted', 'Negotiating'].includes(String(request.status_c ?? '')) && !responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))) && <Button onClick={acceptDriverRequest} disabled={working}><ApperIcon name="CheckCircle" size={16} /> {working ? 'Accepting…' : 'I’m Available — Accept Request'}</Button>}</div>}
      />
      {relatedJob && request?.status_c === 'Confirmed' && (isCustomer || isTechnician) && (() => { const customerPhone = String(request?.customer_c?.phone_c ?? request?.customer_c?.Phone ?? request?.customer_c?.mobile_c ?? '').trim(); const providerRecord = relatedJob?.technician_c && typeof relatedJob.technician_c === 'object' ? relatedJob.technician_c : responses.find((item) => String(item.technician_c?.Id ?? item.technician_c) === String(relatedJob?.technician_c?.Id ?? relatedJob?.technician_c))?.technician_c; const providerPhone = String(providerRecord?.phone_c ?? providerRecord?.Phone ?? providerRecord?.mobile_c ?? '').trim(); const otherPartyName = isCustomer ? (providerRecord?.Name ?? 'Assigned Service Provider') : (request?.customer_c?.Name ?? 'Customer'); const otherPartyPhone = isCustomer ? providerPhone : customerPhone; return <Card className="mt-5 border border-primary/20 bg-primary/5 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><ApperIcon name="PhoneCall" size={22} /></div><div className="min-w-0 flex-1"><h2 className="font-heading text-lg font-semibold">Coordinate your confirmed booking</h2><p className="mt-1 text-sm text-muted-foreground">Contact details are available only to the customer and assigned provider after LOCAL confirms the booking. Tap Call only when you want to contact the other party.</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"><div><p className="font-semibold">{otherPartyName}</p><p className="text-sm text-muted-foreground">{otherPartyPhone ? 'Phone number available for this booking' : 'Contact number is not available in the linked profile yet.'}</p></div>{otherPartyPhone ? <Button asChild><a href={'tel:' + otherPartyPhone.replace(/[^+\\d]/g, '')}><ApperIcon name="Phone" size={16} /> Call {isCustomer ? 'Provider' : 'Customer'}</a></Button> : <Button variant="outline" disabled><ApperIcon name="PhoneOff" size={16} /> Call unavailable</Button>}</div><p className="mt-3 text-xs text-muted-foreground">For your privacy, LOCAL does not display the full number in the booking screen. Calls use the number stored in the profile; this is not masked calling.</p></div></div></Card>; })()}\n      {relatedJob && (user?.profile === 'Admin_c' || isCustomer || isTechnician) && (
        <Card className="mt-5 border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-heading text-lg font-semibold">Job completion and payment</h2><p className="mt-1 text-sm text-muted-foreground">Payment and completion details for the job linked to this service request.</p></div>
            <Button variant="outline" onClick={() => navigate('/jobs/' + relatedJob.Id)}>Open full job record</Button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><div className="text-sm text-muted-foreground">Job status</div><div className="mt-1 font-semibold">{relatedJob.status_c || 'Not recorded'}</div></div>
            <div><div className="text-sm text-muted-foreground">Payment status</div><div className="mt-1 font-semibold">{relatedJob.payment_status_c || 'Not recorded'}</div></div>
            <div><div className="text-sm text-muted-foreground">Billing status</div><div className="mt-1 font-semibold">{relatedJob.billing_status_c || 'Not recorded'}</div></div>
            <div><div className="text-sm text-muted-foreground">Final agreed amount</div><div className="mt-1 text-lg font-bold">{relatedJob.agreed_price_c == null ? 'Not recorded' : '₹' + Number(relatedJob.agreed_price_c).toLocaleString('en-IN')}</div></div>
            <div><div className="text-sm text-muted-foreground">Payment method / reference</div><div className="mt-1 font-medium">{[relatedJob.payment_method_c, relatedJob.payment_reference_c].filter(Boolean).join(' · ') || 'Not recorded'}</div></div>
            <div><div className="text-sm text-muted-foreground">Provider payout</div><div className="mt-1 font-medium">{relatedJob.payout_status_c || 'Not recorded'}</div></div>
            <div><div className="text-sm text-muted-foreground">Car returned</div><div className="mt-1">{relatedJob.returned_at_c ? new Date(relatedJob.returned_at_c).toLocaleString('en-IN') : 'Not recorded'}</div></div>
            <div><div className="text-sm text-muted-foreground">Customer completion confirmation</div><div className="mt-1">{relatedJob.customer_completion_confirmed_at_c ? new Date(relatedJob.customer_completion_confirmed_at_c).toLocaleString('en-IN') : 'Not recorded'}</div></div>
          </div>
          {relatedJob.payment_status_c === 'Final Payment Paid' && <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-100 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><div className="font-semibold">Invoice available</div><p className="mt-1">Final payment is recorded. Open the full job record to download or save the printable invoice / payment receipt as PDF.</p><Button className="mt-3" onClick={() => navigate('/jobs/' + relatedJob.Id)}><ApperIcon name="FileDown" size={16} /> Open invoice / payment receipt</Button></div>}
        </Card>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="border-l-4 border-primary p-4 md:p-5">
          <h2 className="font-heading text-xl font-semibold">{isAcRequest ? 'AC SERVICE REQUIRED' : /car wash/i.test(String(request.Name ?? '')) ? 'CAR WASH REQUIRED' : /car service|service package|economy service|normal service|major service/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? 'CAR SERVICE REQUIRED' : /bike/i.test(String(request.Name ?? '')) ? 'BIKE SERVICE REQUIRED' : /ambulance|emergency/i.test(String(request.Name ?? '')) ? 'EMERGENCY SERVICE REQUIRED' : 'SERVICE REQUIRED'}</h2>
          <div className="mt-3 rounded-md border border-border"><table className="w-full table-fixed text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="w-[58%] px-2 py-2 sm:px-3">Service item</th><th className="w-[12%] px-1 py-2 text-center sm:px-2">Qty.</th><th className="w-[30%] px-2 py-2 text-right sm:px-3">{isAcRequest ? 'Provider quote' : 'Menu price'}</th></tr></thead><tbody>{requestLineItems.map((item, index) => <tr key={item.name + '-' + index} className="border-t border-border"><td className="break-words px-2 py-2.5 font-medium sm:px-3">{item.name}</td><td className="px-1 py-2.5 text-center text-muted-foreground sm:px-2">{item.quantity}</td><td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums sm:px-3">{item.price == null ? '—' : '₹' + Number(item.price).toLocaleString('en-IN')}</td></tr>)}{isCarWashRequest && <tr className="border-t bg-muted/40"><td colSpan={2} className="px-2 py-3 font-semibold sm:px-3">Actual Price of Service</td><td className="whitespace-nowrap px-2 py-3 text-right text-base font-bold tabular-nums sm:px-3">₹{carWashMenuTotal.toLocaleString('en-IN')}</td></tr>}</tbody></table></div>
          {isCarWashRequest && <p className="mt-2 text-xs text-muted-foreground">Car Wash services, quantities and menu prices are shown together in a compact horizontal table. The Service Provider submits one final total. The customer can confirm the provider directly; Pickup &amp; Drop is included in the total.</p>}
          {isCarEssentialsRequest && <section className="mt-4 rounded-xl border p-4 space-y-3"><h3 className="font-semibold">Car Essentials itemized quote</h3>{carQuote ? <><div className="space-y-2">{carQuote.items.map((item, index) => <div key={index} className="flex justify-between gap-3 text-sm"><span>{item.name} × {item.quantity}</span><span>₹{Number(item.lineTotal).toLocaleString('en-IN')}</span></div>)}<div className="flex justify-between border-t pt-2 text-sm"><span>Home delivery charges</span><span>₹{Number(carQuote.deliveryCharge).toLocaleString('en-IN')}</span></div><div className="flex justify-between font-bold"><span>Total payable</span><span>₹{Number(carQuote.total).toLocaleString('en-IN')}</span></div></div><p className="text-xs text-muted-foreground">Quote status: {carApproval?.quoteId === carQuote.quoteId ? 'Customer approved — awaiting Admin confirmation' : 'Submitted to Admin for review'}</p>{isCustomer && !carApproval && carQuote.status === 'Sent to Customer' && <Button className="w-full" onClick={approveCarEssentialsQuote} disabled={working}>Approve Quote &amp; Generate Delivery OTP</Button>}{isCustomer && !carApproval && carQuote.status !== 'Sent to Customer' && <p className="rounded-lg bg-muted p-3 text-sm">Your provider's quote is being reviewed by LOCAL Admin. You can approve it once Admin sends it to you.</p>}{isCustomer && carApproval?.quoteId === carQuote.quoteId && <p className="rounded-lg bg-muted p-3 text-sm">Quote approved. Delivery OTP: <strong className="font-mono text-lg">{carApproval.otp}</strong>. Share it only after checking the products. This code expires in 24 hours.</p>}</> : (isTechnician && centralAssignment) ? <><p className="text-sm text-muted-foreground">Enter a unit price for every requested product and the home-delivery charge. The total is calculated automatically and sent to Admin for review.</p>{requestLineItems.map((item, index) => <div key={index} className="grid grid-cols-[1fr_110px] items-center gap-3"><label className="text-sm">{item.name} × {item.quantity}</label><Input type="number" min="0.01" step="0.01" value={quotePrices[index] ?? ''} onChange={(event) => setQuotePrices((current) => ({ ...current, [index]: event.target.value }))} placeholder="Unit ₹" /></div>)}<div className="grid grid-cols-[1fr_110px] items-center gap-3"><label className="text-sm font-medium">Home delivery charge (₹)</label><Input type="number" min="0" step="0.01" value={deliveryCharge} onChange={(event) => setDeliveryCharge(event.target.value)} placeholder="₹" /></div><p className="text-sm font-semibold">Calculated total: ₹{(requestLineItems.reduce((sum, item, index) => sum + Number(quotePrices[index] || 0) * Number(item.quantity || 1), 0) + Number(deliveryCharge || 0)).toLocaleString('en-IN')}</p><Button className="w-full" onClick={() => submitCarEssentialsQuote(centralAssignment)} disabled={working}>{working ? 'Submitting quote…' : 'Submit Itemized Quote to Admin'}</Button></> : <p className="text-sm text-muted-foreground">Waiting for the assigned provider to accept and submit an itemized quote.</p>}</section>}
          {user?.profile === 'Admin_c' && <section className="mt-4 rounded-xl border border-border bg-card p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ApperIcon name="ClipboardList" size={20} /></div>
              <div className="min-w-0"><h3 className="font-heading text-base font-semibold">Service details &amp; customer notes</h3><p className="mt-0.5 text-sm text-muted-foreground">A concise summary of what the customer requested.</p></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected service</div>
                <div className="mt-1 font-semibold">{request.Name || 'Service request'}</div>
                {isCarWashRequest && <><div className="mt-3 space-y-2">{requestLineItems.map((item, index) => <div key={`admin-service-${index}`} className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{item.name}{Number(item.quantity) > 1 ? ` × ${item.quantity}` : ''}</span><span className="shrink-0 font-medium tabular-nums">{item.price == null ? '—' : '₹' + Number(item.price).toLocaleString('en-IN')}</span></div>)}</div><div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm"><span className="font-medium">Menu total</span><span className="font-bold tabular-nums">₹{carWashMenuTotal.toLocaleString('en-IN')}</span></div></>}
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer notes</div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{String(request.problem_description_c ?? '').split('LOCAL_AC_REQUEST_JSON:')[0].replace(/CAR_WASH_DECISIONS_JSON:\\s*\\[[\\s\\S]*?\\]/, '').replace(/^Customer requested these Car Wash services:[\\s\\S]*?(?:Prices are indicative demo menu prices\\.?|$)/i, '').replace(/^Customer selected\\s*/i, '').replace(/^Customer requested Car Essentials Delivery for their car\\.?/i, '').replace(/Car Essentials order details:[\\s\\S]*?Product compatibility, stock, final price and delivery charges must be confirmed by the Service Provider before fulfilment\\.?/i, '').trim() || 'No additional instructions provided.'}</p>
              </div>
            </div>
          </section>}
          {String(request?.status_c ?? '') === 'Cancelled' && <section className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4" aria-label="Cancellation details"><div className="flex items-center gap-2 font-semibold text-destructive"><ApperIcon name="XCircle" size={18} /> Booking Cancelled</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Cancelled by</p><p className="mt-1 font-medium">{cancellationDetails?.actorName || cancellationDetails?.actor || 'Cancellation details unavailable'}</p><p className="text-xs text-muted-foreground">{cancellationDetails?.actor || 'Actor not recorded'}</p></div><div><p className="text-xs text-muted-foreground">Cancelled on</p><p className="mt-1 font-medium">{formatCancellationTime(cancellationDetails?.cancelledAt)}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Reason</p><p className="mt-1 text-sm">{cancellationDetails?.reason || 'Reason not recorded'}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Booking stage at cancellation</p><p className="mt-1 text-sm">{cancellationDetails?.stage || 'Not recorded'}</p></div></div></section>}
          {String(request?.status_c ?? '') === 'Cancelled' && <section className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4" aria-label="Cancellation details"><div className="flex items-center gap-2 font-semibold text-destructive"><ApperIcon name="XCircle" size={18} /> Booking Cancelled</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Cancelled by</p><p className="mt-1 font-medium">{cancellationDetails?.actorName || cancellationDetails?.actor || 'Cancellation details unavailable'}</p><p className="text-xs text-muted-foreground">{cancellationDetails?.actor || 'Actor not recorded'}</p></div><div><p className="text-xs text-muted-foreground">Cancelled on</p><p className="mt-1 font-medium">{formatCancellationTime(cancellationDetails?.cancelledAt)}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Reason</p><p className="mt-1 text-sm">{cancellationDetails?.reason || 'Reason not recorded'}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Booking stage at cancellation</p><p className="mt-1 text-sm">{cancellationDetails?.stage || 'Not recorded'}</p></div></div></section>}
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div><div className="text-xs text-muted-foreground">{tr('Category', language)}</div><div className="mt-1 font-medium">{tr(request.service_category_c?.Name ?? '—', language)}</div></div>
            <div><div className="text-xs text-muted-foreground">{tr('Required capability', language)}</div><div className="mt-1 font-medium">{tr(request.required_capability_c?.Name ?? '—', language)}</div></div>
            <div><div className="text-xs text-muted-foreground">{tr('Customer', language)}</div><div className="mt-1 font-medium">{request.customer_c?.Name ?? '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">{tr('Location', language)}</div><div className="mt-1 font-medium">{request.location_c}</div></div>
            <div><div className="text-xs text-muted-foreground">Request created</div><div className="mt-1 font-medium">{(request.requested_at_c || request.CreatedOn) ? new Date(/(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(String(request.requested_at_c || request.CreatedOn)) ? (request.requested_at_c || request.CreatedOn) : String(request.requested_at_c || request.CreatedOn).replace(' ', 'T') + 'Z').toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : 'Time unavailable'}</div></div>
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
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-heading text-xl font-semibold">{responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))) ? (isCustomer ? 'LOCAL-assigned Service Provider' : 'Central LOCAL assignment') : isFixedRateDriverRequest ? (isCustomer ? 'Drivers who accepted' : 'Your driver response') : isTechnician ? tr('Your offer', language) : tr('Service Provider offers', language)}</h2><p className="mt-1 text-sm text-muted-foreground">{responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))) ? 'LOCAL assigns a capability-matched provider. The provider accepts or declines; there are no competing quotes or negotiations.' : isFixedRateDriverRequest ? (isCustomer ? 'Choose one available driver to continue. The booking is not confirmed until you select a driver.' : (responses.length ? 'Your availability response is recorded. Wait for the customer to select you.' : 'Accept this request to share your availability. No price quote is required.')) : isTechnician ? (responses.length ? 'Your submitted quote is shown below.' : 'You have not submitted a quote for this request yet.') : responses.length + ' ' + tr(responses.length === 1 ? 'quote' : 'quotes', language) + ' ' + tr('Each Service Provider sets their own price.', language)}</p></div>{isTechnician && isFixedRateDriverRequest && !responses.length && <Button size="sm" onClick={acceptDriverRequest} disabled={working}><ApperIcon name="CheckCircle" size={15} /> I’m Available — Accept Request</Button>}{isTechnician && responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending') && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => acceptCentralAssignment(responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending'))} disabled={working}><ApperIcon name="CheckCircle" size={15} /> Accept Assignment</Button><Button size="sm" variant="outline" onClick={() => declineCentralAssignment(responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending'))} disabled={working}>Decline</Button></div>}{isTechnician && responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Selected') && <span className="rounded-full border border-success-border bg-success-muted px-3 py-1 text-xs font-semibold text-success">Accepted — awaiting LOCAL confirmation</span>}</div>
          <div className="mt-3 space-y-3">
            {responses.map((response) => {
              const historyText = String(response.negotiation_history_c ?? '');
              const vendorAccepted = response.status_c === 'Vendor Accepted' || (response.status_c === 'Pending' && response.negotiation_status_c === 'Agreed' && /Service Provider accepted customer offer/i.test(historyText));
              return (
              <div key={response.Id} className="border-l-4 border-primary bg-muted/30 p-4">
                <div className="flex flex-col gap-4">
                  <div className="min-w-0 w-full"><div className="flex flex-wrap items-center gap-2"><div className="font-medium">{response.technician_c?.Name ?? 'Service Provider'}</div><StatusBadge value={vendorAccepted ? 'Vendor Accepted' : response.status_c} /></div><div className="mt-1 text-sm text-muted-foreground">{response.availability_c}{isCustomer && response.provider_distance_label_c ? ' • ' + response.provider_distance_label_c + ' from your location' : ''}</div><p className="mt-2 break-words text-sm">{/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) ? (response.status_c === 'Selected' ? 'Provider accepted the assignment. LOCAL must verify visit details and confirm the booking.' : response.status_c === 'Declined' ? 'Provider declined. LOCAL can assign another eligible provider.' : 'LOCAL sent this assignment invitation. Waiting for the provider to accept or decline.') : isFixedRateDriverRequest ? 'Available for this driver request.' : (response.message_c || 'No additional message.')}</p></div>
                  <div className="w-full min-w-0">{(/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && isCarEssentialsRequest) ? (() => { const responseQuote = readCarEssentialsQuote(response.message_c); return <div className="mt-3 rounded-lg border border-primary/30 bg-background p-3"><div className="font-semibold">Car Essentials itemized quote</div>{responseQuote ? <><div className="mt-2 space-y-1 text-sm">{responseQuote.items.map((item, idx) => <div key={idx} className="flex justify-between gap-3"><span>{item.name} × {item.quantity}</span><span>₹{Number(item.lineTotal).toLocaleString('en-IN')}</span></div>)}<div className="flex justify-between border-t pt-2"><span>Home delivery</span><span>₹{Number(responseQuote.deliveryCharge).toLocaleString('en-IN')}</span></div><div className="flex justify-between font-bold"><span>Total quote</span><span>₹{Number(responseQuote.total).toLocaleString('en-IN')}</span></div></div><p className="mt-2 text-xs text-muted-foreground">Status: {responseQuote.status || 'Submitted to Admin'}</p></> : isTechnician && ['Pending', 'Selected'].includes(response.status_c) ? <><p className="mt-1 text-sm text-muted-foreground">Enter a unit price for every requested product and your home-delivery charge. Submitting this quote also records your acceptance of the assignment, then sends the itemized quote to LOCAL Admin for review.</p>{requestLineItems.map((item, index) => <div key={index} className="mt-2 grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2"><label className="break-words text-sm">{item.name} × {item.quantity}</label><Input type="number" min="0.01" step="0.01" value={quotePrices[index] ?? ''} onChange={(event) => setQuotePrices((current) => ({ ...current, [index]: event.target.value }))} placeholder="Unit price ₹" /></div>)}<div className="mt-2 grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2"><label className="text-sm font-medium">Home delivery (₹)</label><Input type="number" min="0" step="0.01" value={deliveryCharge} onChange={(event) => setDeliveryCharge(event.target.value)} placeholder="Delivery ₹" /></div><p className="mt-2 text-sm font-semibold">Total: ₹{(requestLineItems.reduce((sum, item, index) => sum + Number(quotePrices[index] || 0) * Number(item.quantity || 1), 0) + Number(deliveryCharge || 0)).toLocaleString('en-IN')}</p><Button className="mt-3 w-full" size="sm" disabled={working} onClick={() => submitCarEssentialsQuote(response)}>{working ? 'Submitting quote…' : response.status_c === 'Pending' ? 'Accept Assignment & Submit Itemized Quote' : 'Submit Itemized Quote to LOCAL'}</Button></> : <p className="mt-2 text-sm text-muted-foreground">Accept the assignment above or enter the quote here to accept and submit it in one step.</p>}</div>; })() : /Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) ? <div className="font-medium">Central assignment — no quote requested</div> : isFixedRateDriverRequest ? <><div className="font-heading text-xl font-semibold">{/hourly driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? '₹300 minimum' : '₹100/hour'}</div><div className="mt-1 max-w-xs text-xs text-muted-foreground">{/hourly driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? 'First 2 hours; then ₹100/hour after the first 2 hours. Night halt ₹300 if applicable.' : '8 AM–10 PM. Night halt ₹300 if applicable.'}</div></> : <div className="font-heading text-2xl font-semibold">₹{Number(response.proposed_price_c ?? 0).toLocaleString('en-IN')}</div>}{!isFixedRateDriverRequest && response.original_proposed_price_c != null && Number(response.original_proposed_price_c) !== Number(response.proposed_price_c) && <div className="mt-1 text-xs text-muted-foreground">{tr('Original quote', language)} ₹{Number(response.original_proposed_price_c).toLocaleString('en-IN')}</div>}{isCustomer && response.status_c === 'Pending' && !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && !vendorAccepted && !relatedJob && <div className="mt-3 flex flex-wrap gap-2 md:justify-end"><Button size="sm" disabled={working} onClick={() => confirmTechnician(response)}>{isFixedRateDriverRequest ? 'Choose this driver' : tr('Confirm service provider', language)}</Button></div>}
                {isCustomer && vendorAccepted && !relatedJob && <div className="mt-3 flex w-full min-w-0 flex-col items-start gap-3 rounded-lg border border-success-border bg-success-muted p-3"><p className="break-words text-sm text-success"><strong>Provider accepted.</strong> Final agreed price: ₹{Number(response.final_agreed_price_c ?? response.proposed_price_c).toLocaleString('en-IN')}. Review the booking before confirming.</p><Button className="max-w-full whitespace-normal" size="sm" disabled={working} onClick={() => confirmTechnician(response)}>Select This Provider</Button></div>}{isCustomer && response.status_c === 'Selected' && /Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && !relatedJob && <div className="mt-3 rounded-md border border-success/30 bg-success/5 p-3 text-sm"><strong>Provider accepted the assignment.</strong><p className="mt-1 text-muted-foreground">Central LOCAL is finalizing the booking and will share confirmed visit details. No bidding or price negotiation is involved.</p></div>}{isCustomer && response.status_c === 'Selected' && !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && !relatedJob && <div className="mt-3 flex flex-wrap items-center gap-2 md:justify-end"><span className="text-xs text-muted-foreground">Provider selected; review and finish booking confirmation.</span><Button size="sm" disabled={working} onClick={() => confirmTechnician(response)}>Confirm Booking</Button></div>}{isTechnician && !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && <div className="mt-3 text-xs font-semibold text-muted-foreground">{isFixedRateDriverRequest ? 'Waiting for customer selection' : <Link to={'/responses/' + response.Id}>Manage offer</Link>}</div>}</div>
                </div>

              </div>
              );
            })}
            {!responses.length && <div className="py-10 text-center text-sm text-muted-foreground">{isFixedRateDriverRequest ? (isCustomer ? 'No drivers have accepted this request yet. Check back shortly.' : 'You have not accepted this request yet.') : tr('No service provider offers yet. Service providers will appear here as they respond.', language)}</div>}
          </div>
        </Card>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request.status_c === 'Confirmed' || request.status_c === 'In progress' ? 'Request booking cancellation?' : 'Cancel this service request?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {request.status_c === 'Confirmed' || request.status_c === 'In progress'
                ? 'Request cancellation for “' + request.Name + '”. The booking record and payment history will be preserved; support may need to review the cancellation.'
                : 'Cancel “' + request.Name + '”? Provider offers and request history will be preserved. This cannot be undone from this screen.'}
            </AlertDialogDescription>
            <div className="space-y-2"><label htmlFor="cancel-reason" className="text-sm font-medium">Reason for cancellation <span className="text-destructive">*</span></label><select id="cancel-reason" required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="" disabled>Select a reason</option>{cancellationReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select>{cancelReason === 'Other' && <div className="space-y-1"><label htmlFor="cancel-other-reason" className="text-sm font-medium">Please tell us more <span className="text-destructive">*</span></label><textarea id="cancel-other-reason" value={cancelOtherReason} onChange={(event) => setCancelOtherReason(event.target.value)} maxLength={500} rows={3} placeholder="Enter your reason…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>}</div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working} onClick={() => { setCancelReason(''); setCancelOtherReason(''); }}>Keep request</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { if (!cancelReason || (cancelReason === 'Other' && !cancelOtherReason.trim())) { event.preventDefault(); toast.error('Please select a cancellation reason' + (cancelReason === 'Other' ? ' and enter details.' : '.')); return; } removeRequest(); }} disabled={working}>
              {working ? 'Cancelling…' : 'Confirm cancellation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}