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
  const raw = source.slice(index + marker.length).trim();
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0; let inString = false; let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; }
    else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) { try { const payload = JSON.parse(raw.slice(start, i + 1)); return payload && payload.approved === true ? payload : null; } catch { return null; } } }
  }
  return null;
}

function readCarWashQuote(description) {
  const marker = 'LOCAL_CAR_WASH_QUOTE_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && Number.isFinite(Number(payload.total)) ? payload : null; } catch { return null; }
}

function readCarWashApproval(description) {
  const marker = 'LOCAL_CAR_WASH_APPROVAL_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && payload.approved === true ? payload : null; } catch { return null; }
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

function readRsaQuote(message) {
  const marker = 'LOCAL_RSA_QUOTE_JSON:';
  const source = String(message ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).trim()); return payload && Number.isFinite(Number(payload.total)) ? payload : null; } catch { return null; }
}

function readDriverBookingQuote(description) {
  const marker = 'LOCAL_DRIVER_BOOKING_QUOTE_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && Number.isFinite(Number(payload.customerTotal)) ? payload : null; } catch { return null; }
}

function readDriverBookingApproval(description) {
  const marker = 'LOCAL_DRIVER_BOOKING_APPROVAL_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  try { const payload = JSON.parse(source.slice(index + marker.length).split('\\n')[0]); return payload && payload.approved === true ? payload : null; } catch { return null; }
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

function getRequestLineItems(request) {
  const rawDescription = String(request?.problem_description_c ?? '');
  const requestName = String(request?.Name ?? '');
  const capabilityName = String(request?.required_capability_c?.Name ?? '');
  const driverRequestText = requestName + ' ' + capabilityName + ' ' + rawDescription;
  const isDriverRequest = /car driver on demand|driver on demand|hourly driver|full[- ]day driver|outstation driver|emergency driver|scheduled driver|professional car driver/i.test(driverRequestText);
  const description = (isDriverRequest
    ? rawDescription.split(/LOCAL_DRIVER_BOOKING_(?:QUOTE|APPROVAL)_JSON:/)[0]
    : rawDescription.split('LOCAL_PUNCTURE_DISPATCH_CONSENT_JSON:')[0]).trim();
  const punctureRequestText = requestName + ' ' + capabilityName + ' ' + description;
  if (/flat tyre|flat tire|puncture/i.test(punctureRequestText)) {
    return [{ name: 'Flat Tyre / Puncture', quantity: 1, price: null, fixed: false }];
  }
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
  try { const marker = 'CAR_WASH_DECISIONS_JSON:'; const start = description.indexOf(marker); const jsonStart = start >= 0 ? start + marker.length : -1; const jsonEnd = jsonStart >= 0 ? description.lastIndexOf(']') + 1 : -1; if (jsonStart >= 0 && jsonEnd > jsonStart) washDecisions = JSON.parse(description.slice(jsonStart, jsonEnd)); } catch { washDecisions = []; }
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
  const driverRequestText = String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + description;
  if (/car driver on demand|driver on demand|hourly driver|full[- ]day driver|outstation driver|emergency driver|scheduled driver|professional car driver/i.test(driverRequestText)) {
    const driverClean = description.split('LOCAL_DRIVER_BOOKING_QUOTE_JSON:')[0].split('LOCAL_DRIVER_BOOKING_APPROVAL_JSON:')[0].split('LOCAL_RSA_APPROVAL_JSON:')[0].split('LOCAL_RSA_QUOTE_JSON:')[0].split('LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:')[0].split('LOCAL_CAR_ESSENTIALS_QUOTE_JSON:')[0].split('LOCAL_CANCELLATION_JSON:')[0].replace(/\\n/g, ' ').trim();
    const customerDescription = driverClean.replace(/^Customer (?:requested|selected)\s*/i, '').replace(/\s+for their car\.?$/i, '').trim();
    return [{ name: customerDescription || 'Car Driver on Demand', quantity: 1, price: null, fixed: false }];
  }
  const cleaned = description.split('LOCAL_DRIVER_BOOKING_QUOTE_JSON:')[0].split('LOCAL_DRIVER_BOOKING_APPROVAL_JSON:')[0].split('LOCAL_RSA_APPROVAL_JSON:')[0].split('LOCAL_RSA_QUOTE_JSON:')[0].split('LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:')[0].split('LOCAL_CAR_ESSENTIALS_QUOTE_JSON:')[0].split('LOCAL_CANCELLATION_JSON:')[0].replace(/\\n/g, ' ').replace(/^Customer (?:requested|selected)\s*/i, '').replace(/\s+for their car\.?$/i, '').trim();
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
  const [quoteTotal, setQuoteTotal] = useState(0);
  const [quoteCalculated, setQuoteCalculated] = useState(false);
  const [rsaServiceCharge, setRsaServiceCharge] = useState('');
  const [rsaPunctureCount, setRsaPunctureCount] = useState('1');
  const [rsaTravelCharge, setRsaTravelCharge] = useState('200');
  const [rsaExtraCharge, setRsaExtraCharge] = useState('0');
  const [rsaQuoteNotes, setRsaQuoteNotes] = useState('');
  const [rsaEta, setRsaEta] = useState('');
  const [rsaCalculatedTotal, setRsaCalculatedTotal] = useState(null);
  const [carEssentialsCustomer, setCarEssentialsCustomer] = useState(null);
  const [bikeLabour, setBikeLabour] = useState('');
  const [bikeParts, setBikeParts] = useState('');
  const [bikeOther, setBikeOther] = useState('0');
  const [bikeNotes, setBikeNotes] = useState('');
  const [bikeCalculatedSubtotal, setBikeCalculatedSubtotal] = useState('0');
  const [bikePlatformFee, setBikePlatformFee] = useState('25');
  const [bikeCalculatedTotal, setBikeCalculatedTotal] = useState('25');
  const [bikeBillCalculated, setBikeBillCalculated] = useState(false);

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

    const jobsRes = await sdk.table('jobs_c').select(['Id', 'Name', 'request_c', 'status_c', 'payment_status_c', 'billing_status_c', 'agreed_price_c', 'customer_payable_now_c', 'remaining_amount_c', 'payment_method_c', 'payment_reference_c', 'returned_at_c', 'customer_completion_confirmed_at_c', 'payout_status_c', 'payment_timing_c', 'customer_c', 'technician_c', 'provider_travel_status_c', 'service_start_otp_c', 'service_start_otp_verified_at_c']).where(eq('request_c', id)).page(1, 1).fetch();
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
  const isPunctureDispatchRequest = /flat tyre|flat tire|puncture/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const acceptedPunctureResponseNeedingRetry = isTechnician && isPunctureDispatchRequest && !relatedJob ? responses.find((item) => item.status_c === 'Selected' && /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))) : null;
  const language = getLanguage();
  const requestLineItems = getRequestLineItems(request);
  const isCarWashRequest = /car wash/i.test(String(request?.Name ?? '')) || /Car Wash services/i.test(String(request?.problem_description_c ?? ''));
  const isAcRequest = /AC Technician/i.test(String(request?.Name ?? '')) || String(request?.problem_description_c ?? '').includes('LOCAL_AC_REQUEST_JSON:');
  const isDriverRequest = /car driver on demand|driver on demand|hourly driver|full-day driver|full day driver|outstation driver|emergency driver|scheduled driver|professional car driver/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const driverBookingQuote = isDriverRequest ? readDriverBookingQuote(request?.problem_description_c) : null;
  const driverBookingApproval = isDriverRequest ? readDriverBookingApproval(request?.problem_description_c) : null;
  const driverBookingQuoteApproved = Boolean(driverBookingQuote && driverBookingApproval && String(driverBookingApproval.quoteId) === String(driverBookingQuote.quoteId) && Number(driverBookingApproval.total) === Number(driverBookingQuote.customerTotal));
  const isFixedRateDriverRequest = /hourly driver|full-day driver|full day driver/i.test(String(request?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const carWashMenuTotal = requestLineItems.reduce((sum, item) => sum + (Number(item.price ?? 0)), 0);
  const carWashQuote = readCarWashQuote(request?.problem_description_c);
  const carWashApproval = readCarWashApproval(request?.problem_description_c);
  const carWashQuoteApproved = Boolean(carWashQuote && carWashApproval && String(carWashApproval.quoteId) === String(carWashQuote.quoteId) && Number(carWashApproval.total) === Number(carWashQuote.total));
  const isCarEssentialsRequest = /car essentials delivery/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const centralAssignment = responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Selected');
  const carQuote = readCarEssentialsQuote(centralAssignment?.message_c);
  const carApproval = readCarEssentialsApproval(request?.problem_description_c);
  useEffect(() => {
    let active = true;
    async function loadCarEssentialsCustomer() {
      if (!isTechnician || !isCarEssentialsRequest || !centralAssignment || !request?.customer_c) {
        setCarEssentialsCustomer(null);
        return;
      }
      const customerId = String(request.customer_c?.Id ?? request.customer_c ?? '');
      if (!customerId) return;
      try {
        const result = await sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c', 'phone_c', 'location_c']).get(customerId);
        if (active) setCarEssentialsCustomer(result?.success ? result.data : null);
      } catch {
        if (active) setCarEssentialsCustomer(null);
      }
    }
    loadCarEssentialsCustomer();
    return () => { active = false; };
  }, [isTechnician, isCarEssentialsRequest, centralAssignment?.Id, request?.customer_c]);
  const isRsaQuote = isRsaQuoteRequest(request) && !isCarEssentialsRequest;
  const isFlatPunctureRequest = /flat tyre|flat tire|puncture/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const rsaQuote = readRsaQuote(centralAssignment?.message_c);
  const rsaApproval = readRsaApproval(request?.problem_description_c);
  const rsaServiceChargeValue = isFlatPunctureRequest ? Math.max(0, Number.parseInt(rsaPunctureCount, 10) || 0) * 150 : Number(rsaServiceCharge || 0);
  const rsaExtraChargeValue = isFlatPunctureRequest ? 25 : Number(rsaExtraCharge || 0);
  const rsaCurrentTotal = rsaServiceChargeValue + Number(rsaTravelCharge || 0) + rsaExtraChargeValue;
  const isBikeMaintenanceRequest = /bike maintenance/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
  const bikeMaintenanceAssignment = responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Selected');
  const bikeMaintenanceQuote = readBikeMaintenanceQuote(bikeMaintenanceAssignment?.message_c);

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
    if (!quoteCalculated) { toast.error('Press “Press to Calculate Total Amount” before submitting the quote.'); return; }
    const prices = requestLineItems.map((item, index) => ({ name: item.name, quantity: Number(item.quantity || 1), unitPrice: Number(quotePrices[index]), lineTotal: Number(quotePrices[index]) * Number(item.quantity || 1) }));
    const fee = Number(deliveryCharge);
    if (!prices.length || prices.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0) || !Number.isFinite(fee) || fee < 0) {
      toast.error('Enter a positive unit price for every requested product and a valid delivery charge.');
      return;
    }
    const quoteId = 'CE-' + Date.now().toString(36).toUpperCase();
    const total = prices.reduce((sum, item) => sum + item.lineTotal, 0) + fee;
    const quote = { quoteId, version: 1, items: prices, deliveryCharge: fee, total, submittedAt: new Date().toISOString(), status: 'Submitted to Admin', providerApproved: false, providerApprovedAt: null, providerApprovedQuoteId: null, providerApprovedTotal: null };
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

  async function submitRsaQuote(response) {
    if (!isTechnician || !isRsaQuote || !response?.Id || !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? ''))) return;
    const service = rsaServiceChargeValue;
    const travel = Number(rsaTravelCharge);
    const extra = rsaExtraChargeValue;
    if (!Number.isFinite(service) || service <= 0 || !Number.isFinite(travel) || travel < 0 || !Number.isFinite(extra) || extra < 0 || (isFlatPunctureRequest && (!Number.isInteger(Number(rsaPunctureCount)) || Number(rsaPunctureCount) < 1))) {
      toast.error(isFlatPunctureRequest ? 'Enter the number of punctures found and a valid travel charge.' : 'Enter a positive service charge and valid non-negative travel and additional charges.'); return;
    }
    const quoteId = 'RSA-' + Date.now().toString(36).toUpperCase();
    const total = service + travel + extra;
    const quote = { quoteId, version: 1, serviceCharge: service, travelCharge: travel, extraCharge: extra, punctureCount: isFlatPunctureRequest ? Number(rsaPunctureCount) : null, pricePerPuncture: isFlatPunctureRequest ? 150 : null, platformFee: isFlatPunctureRequest ? 25 : 0, notes: rsaQuoteNotes.trim(), eta: rsaEta.trim(), total, submittedAt: new Date().toISOString(), status: 'Submitted to Admin', providerApproved: false, providerApprovedAt: null, providerApprovedQuoteId: null, providerApprovedTotal: null };
    setWorking(true);
    try {
      const baseMessage = String(response.message_c ?? '').split('LOCAL_RSA_QUOTE_JSON:')[0].trimEnd();
      const updated = await sdk.table('technician_responses_c').update({ Id: response.Id, status_c: 'Selected', proposed_price_c: total, original_proposed_price_c: total, final_agreed_price_c: null, message_c: baseMessage + '\\nLOCAL_RSA_QUOTE_JSON:' + JSON.stringify(quote) });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'RSA quotation could not be saved.');
      toast.success('Quotation submitted to LOCAL Admin for review.'); await run();
    } catch (err) { toast.error(err.message || 'Could not submit the quotation.'); }
    finally { setWorking(false); }
  }

  async function approveDriverBookingQuote() {
    if (!isCustomer || !request?.Id || !driverBookingQuote || driverBookingQuote.status !== 'Sent to Customer' || driverBookingQuoteApproved) return;
    if (!window.confirm('Approve LOCAL driver quotation for ₹' + Number(driverBookingQuote.customerTotal).toLocaleString('en-IN') + ', including the ₹25 LOCAL convenience fee?')) return;
    setWorking(true);
    try {
      const clean = String(request.problem_description_c ?? '').split('LOCAL_DRIVER_BOOKING_QUOTE_JSON:')[0].split('LOCAL_DRIVER_BOOKING_APPROVAL_JSON:')[0].trimEnd();
      const approval = { approved: true, quoteId: driverBookingQuote.quoteId, total: Number(driverBookingQuote.customerTotal), approvedAt: new Date().toISOString() };
      const updated = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Quoted', problem_description_c: clean + '\\nLOCAL_DRIVER_BOOKING_QUOTE_JSON:' + JSON.stringify(driverBookingQuote) + '\\nLOCAL_DRIVER_BOOKING_APPROVAL_JSON:' + JSON.stringify(approval) });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Driver quote approval could not be saved.');
      toast.success('Driver quotation approved. LOCAL can now check driver availability and assign a driver.');
      await run();
    } catch (err) { toast.error(err.message || 'Could not approve driver quotation.'); }
    finally { setWorking(false); }
  }

  async function approveRsaQuote() {
    if (!isCustomer || !rsaQuote || !request?.Id || rsaQuote.status !== 'Sent to Customer' || (rsaApproval?.quoteId === rsaQuote.quoteId && Number(rsaApproval.total) === Number(rsaQuote.total))) return;
    setWorking(true);
    try {
      const clean = String(request.problem_description_c ?? '').split('LOCAL_RSA_APPROVAL_JSON:')[0].trimEnd();
      const approval = { approved: true, quoteId: rsaQuote.quoteId, total: Number(rsaQuote.total), approvedAt: new Date().toISOString() };
      const updated = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Quoted', problem_description_c: clean + '\\nLOCAL_RSA_APPROVAL_JSON:' + JSON.stringify(approval) });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Customer approval could not be saved.');
      toast.success('Quotation approved. Waiting for the Service Provider to confirm the same amount.'); await run();
    } catch (err) { toast.error(err.message || 'Could not approve the quotation.'); }
    finally { setWorking(false); }
  }

  async function confirmCustomerApprovedRsaQuote() {
    if (!isTechnician || !centralAssignment || !rsaQuote || !rsaApproval || rsaQuote.status !== 'Sent to Customer' || String(rsaApproval.quoteId) !== String(rsaQuote.quoteId) || Number(rsaApproval.total) !== Number(rsaQuote.total) || rsaQuote.providerApproved) {
      toast.error('The customer must approve the exact Admin-reviewed quotation before provider confirmation.'); return;
    }
    setWorking(true);
    try {
      const updatedQuote = { ...rsaQuote, providerApproved: true, providerApprovedAt: new Date().toISOString(), providerApprovedQuoteId: rsaQuote.quoteId, providerApprovedTotal: Number(rsaQuote.total) };
      const baseMessage = String(centralAssignment.message_c ?? '').split('LOCAL_RSA_QUOTE_JSON:')[0].trimEnd();
      const updated = await sdk.table('technician_responses_c').update({ Id: centralAssignment.Id, message_c: baseMessage + '\\nLOCAL_RSA_QUOTE_JSON:' + JSON.stringify(updatedQuote) });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Provider quote confirmation could not be saved.');
      toast.success('Customer-approved quotation confirmed. Admin can now confirm the booking.'); await run();
    } catch (err) { toast.error(err.message || 'Could not confirm the quotation.'); }
    finally { setWorking(false); }
  }

  async function approveCarWashQuote() {
    if (!isCustomer || !carWashQuote || !request?.Id || carWashQuoteApproved || carWashQuote.status !== 'Sent to Customer') return;
    setWorking(true);
    try {
      const clean = String(request.problem_description_c ?? '').split('LOCAL_CAR_WASH_QUOTE_JSON:')[0].split('LOCAL_CAR_WASH_APPROVAL_JSON:')[0].trimEnd();
      const approval = { approved: true, quoteId: carWashQuote.quoteId, total: Number(carWashQuote.total), approvedAt: new Date().toISOString() };
      const updated = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Quoted', problem_description_c: clean + '\nLOCAL_CAR_WASH_QUOTE_JSON:' + JSON.stringify(carWashQuote) + '\nLOCAL_CAR_WASH_APPROVAL_JSON:' + JSON.stringify(approval) });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Quote approval could not be saved.');
      toast.success('Final quote approved. LOCAL Customer Care can now arrange pickup and drop.');
      await run();
    } catch (err) { toast.error(err.message || 'Could not approve the quote.'); }
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

  async function approveCustomerApprovedCarEssentialsQuote() {
    const approvalMatches = carQuote
      && carApproval
      && String(carApproval.quoteId ?? '') === String(carQuote.quoteId ?? '')
      && Number(carApproval.total) === Number(carQuote.total);
    if (!isTechnician || !centralAssignment?.Id || !approvalMatches || carQuote.status !== 'Sent to Customer' || carQuote.providerApproved) {
      toast.error('This quote can only be confirmed after the customer approves the exact Admin-reviewed quote.');
      return;
    }
    setWorking(true);
    try {
      const updatedQuote = {
        ...carQuote,
        providerApproved: true,
        providerApprovedAt: new Date().toISOString(),
        providerApprovedQuoteId: carQuote.quoteId,
        providerApprovedTotal: Number(carQuote.total),
      };
      const baseMessage = String(centralAssignment.message_c ?? '').split('LOCAL_CAR_ESSENTIALS_QUOTE_JSON:')[0].trimEnd();
      const updated = await sdk.table('technician_responses_c').update({
        Id: centralAssignment.Id,
        message_c: baseMessage + '\nLOCAL_CAR_ESSENTIALS_QUOTE_JSON:' + JSON.stringify(updatedQuote),
      });
      if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Provider confirmation could not be saved.');
      toast.success('Customer-approved quote confirmed. Admin Central Dispatch can now confirm the booking.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not confirm the customer-approved quote.');
    } finally {
      setWorking(false);
    }
  }

  async function saveBikeMaintenanceQuoteStatus(response, changes, successMessage) {
    if (!response?.Id || user?.profile !== 'Admin_c') return;
    const current = readBikeMaintenanceQuote(response.message_c);
    if (!current) { toast.error('The technician must submit the itemized quotation first.'); return; }
    setWorking(true);
    try {
      const updatedQuote = { ...current, ...changes, updatedAt: new Date().toISOString() };
      const baseMessage = String(response.message_c ?? '').split('LOCAL_BIKE_MAINTENANCE_QUOTE_JSON:')[0].trimEnd();
      const result = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        message_c: baseMessage + '\\nLOCAL_BIKE_MAINTENANCE_QUOTE_JSON:' + JSON.stringify(updatedQuote),
      });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Quotation status could not be saved.');
      toast.success(successMessage);
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not update quotation status.');
    } finally {
      setWorking(false);
    }
  }

  async function markBikeVisitCompleted(response) {
    if (!isTechnician || !response?.Id || response.status_c !== 'Selected') return;
    setWorking(true);
    try {
      const existing = readBikeMaintenanceQuote(response.message_c);
      const quote = existing || {
        quoteId: 'BIKE-' + Date.now().toString(36).toUpperCase(),
        version: 1,
        status: 'Visit Completed — Quote Required',
        items: [],
        serviceTotal: 0,
        localConvenienceFee: 25,
        customerTotal: 25,
        visitCompletedAt: new Date().toISOString(),
        adminApprovedAt: null,
        customerConsentAt: null,
      };
      quote.visitCompletedAt = quote.visitCompletedAt || new Date().toISOString();
      quote.status = quote.status === 'Submitted to Admin' || quote.status === 'Admin Approved' || quote.status === 'Customer Approved'
        ? quote.status : 'Visit Completed — Quote Required';
      const baseMessage = String(response.message_c ?? '').split('LOCAL_BIKE_MAINTENANCE_QUOTE_JSON:')[0].trimEnd();
      const result = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        message_c: baseMessage + '\\nLOCAL_BIKE_MAINTENANCE_QUOTE_JSON:' + JSON.stringify(quote),
      });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Visit status could not be saved.');
      toast.success('Visit recorded. Submit the itemized quote for LOCAL Admin review.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not record the visit.');
    } finally {
      setWorking(false);
    }
  }

  async function submitBikeMaintenanceQuote(response, currentValues = null) {
    if (!isTechnician || !response?.Id) return;
    const previous = readBikeMaintenanceQuote(response.message_c);
    if (!previous?.visitCompletedAt) {
      toast.error('Mark the customer visit completed before submitting a quotation.');
      return;
    }
    const labourText = String(currentValues?.labour ?? bikeLabour);
    const partsText = String(currentValues?.parts ?? bikeParts);
    const otherText = String(currentValues?.other ?? bikeOther);
    const notesText = String(currentValues?.notes ?? bikeNotes);
    const labour = labourText.trim() === '' ? NaN : Number(labourText);
    const parts = partsText.trim() === '' ? NaN : Number(partsText);
    const other = otherText.trim() === '' ? NaN : Number(otherText);
    const feeText = String(currentValues?.fee ?? bikePlatformFee);
    const fee = feeText.trim() === '' ? NaN : Number(feeText);
    if (!Number.isFinite(labour) || labour < 0 || !Number.isFinite(parts) || parts < 0 || !Number.isFinite(other) || other < 0 || !Number.isFinite(fee) || fee < 0 || labour + parts + other <= 0) {
      toast.error('Enter valid non-negative labour, parts, other charges and platform fee.');
      return;
    }
    const serviceTotal = labour + parts + other;
    const quote = {
      ...previous,
      quoteId: previous.quoteId || 'BIKE-' + Date.now().toString(36).toUpperCase(),
      version: Number(previous.version || 0) + 1,
      items: [
        { name: 'Labour charges', amount: labour },
        { name: 'Spare parts', amount: parts },
        { name: 'Other charges', amount: other },
      ],
      notes: notesText.trim(),
      serviceTotal,
      localConvenienceFee: fee,
      customerTotal: serviceTotal + fee,
      submittedAt: new Date().toISOString(),
      status: 'Submitted to Admin',
      adminApprovedAt: null,
      adminApprovedBy: null,
      customerConsentAt: null,
      customerConsentRecordedBy: null,
    };
    setWorking(true);
    try {
      const baseMessage = String(response.message_c ?? '').split('LOCAL_BIKE_MAINTENANCE_QUOTE_JSON:')[0].trimEnd();
      const result = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        proposed_price_c: quote.customerTotal,
        original_proposed_price_c: quote.customerTotal,
        final_agreed_price_c: null,
        message_c: baseMessage + '\\nLOCAL_BIKE_MAINTENANCE_QUOTE_JSON:' + JSON.stringify(quote),
      });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Quotation could not be submitted.');
      toast.success('Itemized quotation sent to LOCAL Customer Care for review.');
      setBikeLabour('');
      setBikeParts('');
      setBikeOther('0');
      setBikeNotes('');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not submit the quotation.');
    } finally {
      setWorking(false);
    }
  }

  async function acceptCentralAssignment(response) {
    const isPunctureDispatch = /flat tyre|flat tire|puncture/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
    const isCentralInvitation = /Central LOCAL assignment invitation/i.test(String(response?.message_c ?? ''));
    if (!isTechnician || !response?.Id || !isCentralInvitation || (response.status_c !== 'Pending' && !(isPunctureDispatch && response.status_c === 'Selected'))) return;
    setWorking(true);
    try {
      const acceptedAt = new Date().toLocaleString('en-IN');
      if (response.status_c === 'Pending') {
        const updated = await sdk.table('technician_responses_c').update({
          Id: response.Id,
          status_c: 'Selected',
          availability_c: request.preferred_time_c === 'Scheduled' ? 'Within 1 hour' : 'Available Now',
          message_c: String(response.message_c ?? '') + '\nProvider accepted assignment at ' + acceptedAt + '. No price negotiation is involved.' + (isPunctureDispatch ? '\nLOCAL_PUNCTURE_PROVIDER_ACCEPTED_JSON:' + JSON.stringify({ accepted: true, acceptedAt: new Date().toISOString(), dispatchStatus: 'Confirmed — Provider En Route' }) : ''),
        });
        if (!updated.data?.length) throw new Error(updated.messages?.[0] || 'Your acceptance could not be saved.');
      }
      if (isPunctureDispatch) {
        const jobsResult = await sdk.table('jobs_c').select(['Id', 'Name', 'request_c', 'response_c', 'status_c']).where(eq('request_c', request.Id)).page(1, 20).fetch();
        if (!jobsResult.success) throw new Error(jobsResult.message || 'Assignment accepted, but LOCAL could not check the dispatch job. Please contact Admin.');
        const existing = (jobsResult.data ?? []).find((job) => String(job.response_c?.Id ?? job.response_c ?? '') === String(response.Id));
        if (!existing) {
          const created = await sdk.table('jobs_c').create({
            Name: 'LOCAL Job • ' + String(request.Name ?? 'Flat Tyre / Puncture'),
            request_c: request.Id,
            response_c: response.Id,
            // The legacy request's customer lookup can point to a deleted customer_profiles_c record.
            // request_c remains the authoritative link; do not pass a stale lookup ID that makes the database reject job creation.
            technician_c: response.technician_c?.Id ?? response.technician_c ?? null,
            agreed_price_c: 0,
            original_provider_quote_c: null,
            scheduled_at_c: request.scheduled_at_c || null,
            status_c: 'Assigned',
            payment_status_c: 'Unpaid',
            billing_status_c: 'Booking Confirmed — Payment Due After Delivery',
            service_start_otp_c: null,
            admin_review_note_c: 'Flat Tyre / Puncture dispatch auto-confirmed after the assigned provider accepted. Provider may travel and inspect; no repair is authorized until customer approves the final itemized quote. No advance or partial payment.',
          });
          if (!created.data?.length) throw new Error(created.messages?.[0] || 'Provider accepted, but the dispatch job could not be created. Admin must review this request.');
        }
        // Service Providers must not change the admin-controlled request status.
        // Creating/recovering the job is the provider-side handoff; Admin confirmation remains a separate step.
        toast.success('Provider acceptance saved and dispatch job is ready. Booking confirmation is pending LOCAL Admin review; repair still requires customer quote approval.');
      } else {
        toast.success('Assignment accepted. Central LOCAL has been notified; wait for booking confirmation.');
      }
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
      const isPunctureCancellation = /flat tyre|flat tire|puncture/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? ''));
      const priorCancellation = readCancellationDetails(request.problem_description_c);
      const providerArrivalRecorded = Boolean(priorCancellation?.providerArrivedAt || priorCancellation?.arrivalConfirmedAt);
      const cancellation = {
        actor: 'Customer',
        actorName,
        actorProfile: String(user?.profile ?? 'Customer_c'),
        cancelledAt: new Date().toISOString(),
        reason: cancelReason === 'Other' ? (cancelOtherReason.trim() || 'Other (details not provided)') : cancelReason,
        reasonCode: cancelReason,
        stage: String(request.status_c ?? 'Unknown'),
        cancellationFeePolicy: isPunctureCancellation ? { currency: 'INR', amount: providerArrivalRecorded ? 200 : 0, reason: providerArrivalRecorded ? 'Provider arrival recorded; same visit charge applies' : 'No provider arrival record available; no cancellation fee assessed', providerArrivalRecorded, feeStatus: providerArrivalRecorded ? 'Due — collection not automated' : 'No fee' } : null,
      };
      const result = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Cancelled', problem_description_c: writeCancellationDetails(request.problem_description_c, cancellation) });
      if (!result.data?.length) {
        toast.error(result.messages?.[0] ?? 'This request could not be cancelled. Refresh the page and try again.');
        return;
      }
      toast.success(isPunctureCancellation ? (providerArrivalRecorded ? 'Request cancelled. ₹200 visit/cancellation fee recorded as due; collection is not automated.' : 'Request cancelled. No cancellation fee applied because provider arrival was not recorded.') : 'Request cancelled. The cancellation details and offer history have been preserved.');
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
      {isDriverRequest && driverBookingQuote && <Card className="mb-4 border-primary/30 p-5"><div className="flex items-center gap-2"><ApperIcon name="CarTaxiFront" size={20} /><h2 className="font-heading text-lg font-semibold">LOCAL Driver Travel Quotation</h2></div><p className="mt-1 text-sm text-muted-foreground">Review the travel requirements and charges recorded by LOCAL Customer Care.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Travel type</p><p className="font-medium">{driverBookingQuote.travelType}</p></div><div><p className="text-xs text-muted-foreground">Date, pickup time and duration</p><p className="font-medium">{driverBookingQuote.schedule}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Route and requirements</p><p className="font-medium">{driverBookingQuote.tripDetails}</p></div><div><p className="text-xs text-muted-foreground">Night halt</p><p className="font-medium">{driverBookingQuote.nightHalt}</p></div><div><p className="text-xs text-muted-foreground">Terms / additional details</p><p className="font-medium">{driverBookingQuote.terms || 'No additional terms recorded'}</p></div></div><div className="mt-4 overflow-hidden rounded-md border"><div className="flex justify-between border-b px-3 py-2"><span>Driver service charges</span><span>₹{Number(driverBookingQuote.serviceAmount).toLocaleString('en-IN')}</span></div><div className="flex justify-between border-b px-3 py-2"><span>Trip expenses / other charges</span><span>₹{Number(driverBookingQuote.otherCharges).toLocaleString('en-IN')}</span></div><div className="flex justify-between border-b px-3 py-2"><span>LOCAL convenience fee</span><span>₹25</span></div><div className="flex justify-between bg-muted px-3 py-3 font-bold"><span>Final quoted total</span><span>₹{Number(driverBookingQuote.customerTotal).toLocaleString('en-IN')}</span></div></div>{driverBookingQuoteApproved ? <p className="mt-3 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">You approved this quotation. LOCAL will now check availability and assign a driver.</p> : isCustomer && <Button className="mt-4 w-full" onClick={approveDriverBookingQuote} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> {working ? 'Saving approval…' : 'Approve Driver Quotation'}</Button>}{!isCustomer && !driverBookingQuoteApproved && <p className="mt-3 text-sm text-amber-700">Waiting for the customer to approve this quotation before driver assignment.</p>}</Card>}
      {relatedJob && request?.status_c === 'Confirmed' && (isCustomer || isTechnician) && (() => { const customerPhone = String(request?.customer_c?.phone_c ?? request?.customer_c?.Phone ?? request?.customer_c?.mobile_c ?? '').trim(); const providerRecord = relatedJob?.technician_c && typeof relatedJob.technician_c === 'object' ? relatedJob.technician_c : responses.find((item) => String(item.technician_c?.Id ?? item.technician_c) === String(relatedJob?.technician_c?.Id ?? relatedJob?.technician_c))?.technician_c; const providerPhone = String(providerRecord?.phone_c ?? providerRecord?.Phone ?? providerRecord?.mobile_c ?? '').trim(); const otherPartyName = isCustomer ? (providerRecord?.Name ?? 'Assigned Service Provider') : (request?.customer_c?.Name ?? 'Customer'); const otherPartyPhone = isCustomer ? providerPhone : customerPhone; return <Card className="mt-5 border border-primary/20 bg-primary/5 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><ApperIcon name="PhoneCall" size={22} /></div><div className="min-w-0 flex-1"><h2 className="font-heading text-lg font-semibold">Coordinate your confirmed booking</h2><p className="mt-1 text-sm text-muted-foreground">Contact details are available only to the customer and assigned provider after LOCAL confirms the booking. Tap Call only when you want to contact the other party.</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"><div><p className="font-semibold">{otherPartyName}</p><p className="text-sm text-muted-foreground">{otherPartyPhone ? 'Phone number available for this booking' : 'Contact number is not available in the linked profile yet.'}</p></div>{otherPartyPhone ? <Button asChild><a href={'tel:' + otherPartyPhone.replace(/[^+\\d]/g, '')}><ApperIcon name="Phone" size={16} /> Call {isCustomer ? 'Provider' : 'Customer'}</a></Button> : <Button variant="outline" disabled><ApperIcon name="PhoneOff" size={16} /> Call unavailable</Button>}</div><p className="mt-3 text-xs text-muted-foreground">For your privacy, LOCAL does not display the full number in the booking screen. Calls use the number stored in the profile; this is not masked calling.</p></div></div></Card>; })()}\n      {relatedJob && isCustomer && /flat tyre|flat tire|puncture/i.test(String(request?.Name ?? '') + ' ' + String(request?.required_capability_c?.Name ?? '') + ' ' + String(request?.problem_description_c ?? '')) && relatedJob.status_c === 'Assigned' && relatedJob.provider_travel_status_c === 'Arrived' && !relatedJob.service_start_otp_verified_at_c && <Card className="mt-5 border border-primary/30 bg-primary/5 p-5"><h2 className="font-heading text-lg font-semibold">Your service-start OTP</h2>{(() => { let otp = null; try { const parsed = JSON.parse(String(relatedJob.service_start_otp_c ?? '')); if (parsed && /^\\d{6}$/.test(String(parsed.code ?? '')) && parsed.expiresAt) otp = parsed; } catch { /* malformed or missing OTP */ } const valid = otp && Date.now() <= new Date(otp.expiresAt).getTime() && Number(otp.attempts ?? 0) < 5; return valid ? <><p className="mt-2 text-sm text-muted-foreground">Your Service Provider has recorded arrival. Share this code with them in person now. Work cannot start until the provider verifies it.</p><p className="mt-4 text-center font-mono text-3xl font-bold tracking-[0.35em]">{otp.code}</p><p className="mt-2 text-center text-xs text-muted-foreground">Expires {new Date(otp.expiresAt).toLocaleString('en-IN')}</p></> : <p className="mt-2 text-sm text-muted-foreground">The service-start OTP is missing or expired. Ask LOCAL Admin to resend it before work begins.</p>; })()}</Card>}
      {relatedJob && (user?.profile === 'Admin_c' || isCustomer || isTechnician) && (
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
          {isCustomer && isFlatPunctureRequest ? <section className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-4"><h3 className="font-semibold">Flat Tyre / Puncture</h3><p className="mt-1 text-sm text-muted-foreground">The final repair amount depends on the number of punctures found during inspection. You will approve the itemized total before any repair begins.</p><div className="mt-3 space-y-2 text-sm"><div className="flex items-center justify-between gap-3"><span>Puncture repair</span><strong>₹150 per puncture</strong></div><div className="flex items-center justify-between gap-3"><span>Visit charge (within 10 km)</span><strong>₹200</strong></div><div className="flex items-center justify-between gap-3"><span>LOCAL Platform Fee</span><strong>₹25</strong></div></div></section> : <div className="mt-3 rounded-md border border-border"><table className="w-full table-fixed text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="w-[58%] px-2 py-2 sm:px-3">Service item</th><th className="w-[12%] px-1 py-2 text-center sm:px-2">Qty.</th><th className="w-[30%] px-2 py-2 text-right sm:px-3">{isAcRequest ? 'Provider quote' : 'Menu price'}</th></tr></thead><tbody>{requestLineItems.map((item, index) => <tr key={item.name + '-' + index} className="border-t border-border"><td className="break-words px-2 py-2.5 font-medium sm:px-3">{item.name}</td><td className="px-1 py-2.5 text-center text-muted-foreground sm:px-2">{item.quantity}</td><td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums sm:px-3">{item.price == null ? '—' : '₹' + Number(item.price).toLocaleString('en-IN')}</td></tr>)}{isCarWashRequest && <tr className="border-t bg-muted/40"><td colSpan={2} className="px-2 py-3 font-semibold sm:px-3">{carWashQuote ? 'Final quote total' : 'Actual Price of Service'}</td><td className="whitespace-nowrap px-2 py-3 text-right text-base font-bold tabular-nums sm:px-3">₹{Number(carWashQuote ? carWashQuote.total : carWashMenuTotal).toLocaleString('en-IN')}</td></tr>}</tbody></table></div>}
          {isCarWashRequest && <section className="mt-4 rounded-xl border border-primary/20 p-4 space-y-3">
            <h3 className="font-semibold">LOCAL Customer Care quote</h3>
            {carWashQuote ? <>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><span>Customer Quoted Amount</span><strong>₹{Number(carWashQuote.serviceSubtotal).toLocaleString('en-IN')}</strong></div>
                {Number(carWashQuote.discount || 0) > 0 && <div className="flex justify-between gap-3"><span>Discount Offered</span><strong>−₹{Number(carWashQuote.discount).toLocaleString('en-IN')}</strong></div>}
                {Number(carWashQuote.pickupDropCharge || 0) > 0 && <div className="flex justify-between gap-3"><span>Pick up and drop</span><strong>+₹{Number(carWashQuote.pickupDropCharge).toLocaleString('en-IN')}</strong></div>}
                <div className="flex justify-between gap-3"><span>LOCAL Platform Fee</span><strong>₹{Number(carWashQuote.platformFee ?? 25).toLocaleString('en-IN')}</strong></div>
                <div className="flex justify-between border-t pt-2 text-base"><span className="font-bold">Final quote (v{carWashQuote.version || 1})</span><strong>₹{Number(carWashQuote.total).toLocaleString('en-IN')}</strong></div>
              </div>
              <p className="text-xs text-muted-foreground">{carWashQuoteApproved ? 'You approved this quote.' : carWashQuote.status === 'Sent to Customer' ? 'Please review the final amount before approving.' : 'Waiting for Customer Care to send the quote.'}</p>
              {isCustomer && !carWashQuoteApproved && carWashQuote.status === 'Sent to Customer' && <Button className="w-full" disabled={working} onClick={approveCarWashQuote}>Approve Final Quote — ₹{Number(carWashQuote.total).toLocaleString('en-IN')}</Button>}
              {carWashQuoteApproved && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Quote approved. LOCAL Customer Care can now assign the pickup-and-drop person.</p>}
            </> : <p className="text-sm text-muted-foreground">Customer Care will call you to confirm the service, ask whether Pickup &amp; Drop is required, and send your final quote here for approval.</p>}
          </section>}
          {isCarEssentialsRequest && <section className="mt-4 rounded-xl border p-4 space-y-3"><h3 className="font-semibold">Car Essentials itemized quote</h3>{carQuote ? <><div className="space-y-2">{carQuote.items.map((item, index) => <div key={index} className="flex justify-between gap-3 text-sm"><span>{item.name} × {item.quantity}</span><span>₹{Number(item.lineTotal).toLocaleString('en-IN')}</span></div>)}<div className="flex justify-between border-t pt-2 text-sm"><span>Home delivery charges</span><span>₹{Number(carQuote.deliveryCharge).toLocaleString('en-IN')}</span></div><div className="flex justify-between font-bold"><span>Total payable</span><span>₹{Number(carQuote.total).toLocaleString('en-IN')}</span></div></div><p className="text-xs text-muted-foreground">Quote status: {carQuote.providerApproved && carApproval?.quoteId === carQuote.quoteId && Number(carApproval?.total) === Number(carQuote.total) ? 'Customer and Service Provider approved — awaiting Admin booking confirmation' : carApproval?.quoteId === carQuote.quoteId && Number(carApproval?.total) === Number(carQuote.total) ? 'Customer approved — awaiting Service Provider confirmation' : carQuote.status === 'Sent to Customer' ? 'Admin reviewed — awaiting customer approval' : 'Submitted to Admin for review'}</p>{isCustomer && !carApproval && carQuote.status === 'Sent to Customer' && <Button className="w-full" onClick={approveCarEssentialsQuote} disabled={working}>Approve Quote &amp; Generate Delivery OTP</Button>}{isCustomer && !carApproval && carQuote.status !== 'Sent to Customer' && <p className="rounded-lg bg-muted p-3 text-sm">Your provider's quote is being reviewed by LOCAL Admin. You can approve it once Admin sends it to you.</p>}{isCustomer && carApproval?.quoteId === carQuote.quoteId && Number(carApproval?.total) === Number(carQuote.total) && <p className="rounded-lg bg-muted p-3 text-sm">Quote approved. Delivery OTP: <strong className="font-mono text-lg">{carApproval.otp}</strong>. Share it only after checking the products. This code expires in 24 hours.</p>}{isTechnician && carApproval?.quoteId === carQuote.quoteId && Number(carApproval?.total) === Number(carQuote.total) && carQuote.status === 'Sent to Customer' && !carQuote.providerApproved && <Button className="w-full" onClick={approveCustomerApprovedCarEssentialsQuote} disabled={working}>{working ? 'Confirming quote…' : 'Confirm Customer-Approved Quote'}</Button>}{isTechnician && carQuote.providerApproved && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">You confirmed the customer-approved quote. LOCAL Admin can now confirm the booking.</p>}</> : (isTechnician && centralAssignment) ? <><p className="text-sm text-muted-foreground">Enter a unit price for every requested product and the home-delivery charge. The total is calculated automatically and sent to Admin for review.</p>{requestLineItems.map((item, index) => <div key={index} className="grid grid-cols-[1fr_110px] items-center gap-3"><label className="text-sm">{item.name} × {item.quantity}</label><Input type="number" min="0.01" step="0.01" value={quotePrices[index] ?? ''} onChange={(event) => setQuotePrices((current) => ({ ...current, [index]: event.target.value }))} placeholder="Unit ₹" /></div>)}<div className="grid grid-cols-[1fr_110px] items-center gap-3"><label className="text-sm font-medium">Home delivery charge (₹)</label><Input type="number" min="0" step="0.01" value={deliveryCharge} onChange={(event) => setDeliveryCharge(event.target.value)} placeholder="₹" /></div><p className="text-sm font-semibold">Calculated total: ₹{(requestLineItems.reduce((sum, item, index) => sum + Number(quotePrices[index] || 0) * Number(item.quantity || 1), 0) + Number(deliveryCharge || 0)).toLocaleString('en-IN')}</p><Button className="w-full" onClick={() => submitCarEssentialsQuote(centralAssignment)} disabled={working}>{working ? 'Submitting quote…' : 'Submit Itemized Quote to Admin'}</Button></> : <p className="text-sm text-muted-foreground">Waiting for the assigned provider to accept and submit an itemized quote.</p>}</section>}
          {isRsaQuote && <section className="mt-4 rounded-xl border border-primary/25 p-4 space-y-3"><h3 className="font-semibold">{isFlatPunctureRequest ? 'Flat Tyre / Puncture Inspection Quote' : 'RSA Service Quote'}</h3>{rsaQuote ? <><div className="space-y-2 text-sm">{isFlatPunctureRequest && <div className="flex justify-between gap-3"><span>Punctures found × ₹150</span><strong>{Number(rsaQuote.punctureCount ?? 0)} × ₹150</strong></div>}<div className="flex justify-between gap-3"><span>{isFlatPunctureRequest ? 'Puncture repair charge' : 'Service charge'}</span><strong>₹{Number(rsaQuote.serviceCharge).toLocaleString('en-IN')}</strong></div><div className="flex justify-between gap-3"><span>{isFlatPunctureRequest ? 'Travel / visit charge' : 'Travel charge'}</span><strong>₹{Number(rsaQuote.travelCharge).toLocaleString('en-IN')}</strong></div>{Number(rsaQuote.extraCharge) > 0 && <div className="flex justify-between gap-3"><span>{isFlatPunctureRequest ? 'LOCAL Platform Fee' : 'Additional charges'}</span><strong>₹{Number(rsaQuote.extraCharge).toLocaleString('en-IN')}</strong></div>}<div className="flex justify-between gap-3 border-t pt-2 text-base font-bold"><span>Total payable</span><strong>₹{Number(rsaQuote.total).toLocaleString('en-IN')}</strong></div>{rsaQuote.eta && <p>Estimated arrival: {rsaQuote.eta}</p>}{rsaQuote.notes && <p className="whitespace-pre-wrap text-muted-foreground">Provider notes: {rsaQuote.notes}</p>}</div><p className="text-xs text-muted-foreground">Status: {rsaQuote.providerApproved && rsaApproval?.quoteId === rsaQuote.quoteId && Number(rsaApproval?.total) === Number(rsaQuote.total) ? 'Customer and provider approved — awaiting Admin booking confirmation' : rsaApproval?.quoteId === rsaQuote.quoteId && Number(rsaApproval?.total) === Number(rsaQuote.total) ? 'Customer approved — awaiting provider confirmation' : rsaQuote.status === 'Sent to Customer' ? 'Admin reviewed — awaiting customer approval' : 'Submitted to Admin for review'}</p>{isCustomer && rsaQuote.status === 'Sent to Customer' && !(rsaApproval?.quoteId === rsaQuote.quoteId && Number(rsaApproval?.total) === Number(rsaQuote.total)) && <Button className="w-full" onClick={approveRsaQuote} disabled={working}>Approve Quotation</Button>}{isCustomer && rsaQuote.status !== 'Sent to Customer' && <p className="rounded-lg bg-muted p-3 text-sm">The quotation is awaiting Admin review. You can approve it after LOCAL Admin sends it to you.</p>}{isTechnician && rsaApproval?.quoteId === rsaQuote.quoteId && Number(rsaApproval?.total) === Number(rsaQuote.total) && rsaQuote.status === 'Sent to Customer' && !rsaQuote.providerApproved && <Button className="w-full" onClick={confirmCustomerApprovedRsaQuote} disabled={working}>{working ? 'Confirming…' : 'Confirm Customer-Approved Quote'}</Button>}{isTechnician && rsaQuote.providerApproved && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">You confirmed the exact customer-approved quote. Admin can now confirm the booking.</p>}</> : isTechnician && centralAssignment ? <><p className="text-sm text-muted-foreground">{isFlatPunctureRequest ? 'Inspect the tyre first, then enter the actual number of punctures. LOCAL calculates ₹150 per puncture and adds the ₹25 Platform Fee. Travel is ₹200 within 10 km; if the customer is beyond 10 km, confirm the applicable travel charge with LOCAL Admin before submitting.' : 'Enter the service charge and travel charge separately. Include parts, fuel or towing-related additional costs where applicable. Customer approval is required before booking confirmation.'}</p>{isFlatPunctureRequest ? <><div className="grid grid-cols-[1fr_130px] items-center gap-3"><label className="text-sm">Punctures found</label><Input type="number" min="1" step="1" value={rsaPunctureCount} onChange={(event) => { setRsaPunctureCount(event.target.value); setRsaCalculatedTotal(null); }} /></div><div className="rounded-lg bg-muted p-3 text-sm">Repair charge: <strong>₹{(Math.max(0, Number.parseInt(rsaPunctureCount, 10) || 0) * 150).toLocaleString('en-IN')}</strong> (₹150 per puncture)</div></> : <div className="grid grid-cols-[1fr_130px] items-center gap-3"><label className="text-sm">Service charge (₹)</label><Input type="number" min="0.01" step="0.01" value={rsaServiceCharge} onChange={(event) => setRsaServiceCharge(event.target.value)} placeholder="Service ₹" /></div>}<div className="grid grid-cols-[1fr_130px] items-center gap-3"><label className="text-sm">{isFlatPunctureRequest ? 'Travel / visit charge (₹)' : 'Travel charge (₹)'}</label><Input type="number" min="0" step="0.01" value={rsaTravelCharge} onChange={(event) => { setRsaTravelCharge(event.target.value); setRsaCalculatedTotal(null); }} placeholder="Travel ₹" /></div>{isFlatPunctureRequest ? <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>LOCAL Platform Fee</span><strong>₹25</strong></div> : <div className="grid grid-cols-[1fr_130px] items-center gap-3"><label className="text-sm">Additional costs (₹)</label><Input type="number" min="0" step="0.01" value={rsaExtraCharge} onChange={(event) => setRsaExtraCharge(event.target.value)} placeholder="Extra ₹" /></div>}<div className="grid grid-cols-[1fr_130px] items-center gap-3"><label className="text-sm">Estimated arrival</label><Input value={rsaEta} onChange={(event) => setRsaEta(event.target.value)} placeholder="e.g. 25 minutes" /></div><div><label className="text-sm">Quote notes (optional)</label><Input className="mt-1" value={rsaQuoteNotes} onChange={(event) => setRsaQuoteNotes(event.target.value)} placeholder={isFlatPunctureRequest ? 'Inspection notes or tyre details' : 'Parts, fuel quantity, towing distance, etc.'} /></div><div className="rounded-lg bg-muted p-3"><p className="text-sm text-muted-foreground">Calculated total</p><p id="rsa-calculated-total-display" className="text-xl font-bold" aria-live="polite">₹{(rsaCalculatedTotal ?? 0).toLocaleString('en-IN')}</p></div><Button type="button" variant="outline" className="w-full" onClick={() => { const total = rsaCurrentTotal; setRsaCalculatedTotal(total); const totalDisplay = document.getElementById('rsa-calculated-total-display'); if (totalDisplay) totalDisplay.textContent = '₹' + total.toLocaleString('en-IN'); toast.success('Total calculated: ₹' + total.toLocaleString('en-IN')); }} disabled={working}><ApperIcon name="Calculator" size={16} /> Calculate Total</Button><Button className="w-full" onClick={() => submitRsaQuote(centralAssignment)} disabled={working || rsaCalculatedTotal === null || rsaCalculatedTotal !== rsaCurrentTotal}>{working ? 'Submitting quotation…' : 'Submit Quote to Admin'}</Button></> : <p className="text-sm text-muted-foreground">Waiting for Admin to assign a Service Provider.</p>}</section>}
          {user?.profile === 'Admin_c' && <section className="mt-4 rounded-xl border border-border bg-card p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ApperIcon name="ClipboardList" size={20} /></div>
              {isTechnician && isCarEssentialsRequest && centralAssignment && <section className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-4"><div className="flex items-center gap-2"><ApperIcon name="ContactRound" size={18} className="text-primary" /><h3 className="font-heading text-base font-semibold">Customer contact &amp; delivery details</h3></div><p className="mt-1 text-sm text-muted-foreground">Shared with the assigned Service Provider for fulfilment of this Car Essentials order.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Customer name</p><p className="mt-1 break-words font-medium">{carEssentialsCustomer?.Name || request.customer_c?.Name || 'Not available'}</p></div><div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Phone number</p>{carEssentialsCustomer?.phone_c ? <a className="mt-1 inline-flex items-center gap-2 font-medium text-primary underline" href={'tel:' + String(carEssentialsCustomer.phone_c).replace(/[^+\\d]/g, '')}><ApperIcon name="Phone" size={15} />{carEssentialsCustomer.phone_c}</a> : <p className="mt-1 text-sm">Not recorded in customer profile</p>}</div><div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Email address</p>{carEssentialsCustomer?.email_c ? <a className="mt-1 break-all font-medium text-primary underline" href={'mailto:' + carEssentialsCustomer.email_c}>{carEssentialsCustomer.email_c}</a> : <p className="mt-1 text-sm">Not recorded in customer profile</p>}</div><div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Delivery location</p><p className="mt-1 break-words font-medium">{request.location_c || carEssentialsCustomer?.location_c || 'Not recorded'}</p>{request.latitude_c != null && request.longitude_c != null && <a className="mt-1 inline-block text-sm text-primary underline" target="_blank" rel="noreferrer" href={'https://www.google.com/maps?q=' + request.latitude_c + ',' + request.longitude_c}>Open delivery location in Maps</a>}</div></div><p className="mt-3 text-xs text-muted-foreground">Use these details only to coordinate delivery for this LOCAL order.</p></section>}
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
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-heading text-xl font-semibold">{responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))) ? (isCustomer ? 'LOCAL-assigned Service Provider' : 'Central LOCAL assignment') : isFixedRateDriverRequest ? (isCustomer ? 'Drivers who accepted' : 'Your driver response') : isTechnician ? tr('Your offer', language) : tr('Service Provider offers', language)}</h2><p className="mt-1 text-sm text-muted-foreground">{responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? ''))) ? 'LOCAL assigns a capability-matched provider. The provider accepts or declines; there are no competing quotes or negotiations.' : isFixedRateDriverRequest ? (isCustomer ? 'Choose one available driver to continue. The booking is not confirmed until you select a driver.' : (responses.length ? 'Your availability response is recorded. Wait for the customer to select you.' : 'Accept this request to share your availability. No price quote is required.')) : isTechnician ? (responses.length ? 'Your submitted quote is shown below.' : 'You have not submitted a quote for this request yet.') : responses.length + ' ' + tr(responses.length === 1 ? 'quote' : 'quotes', language) + ' ' + tr('Each Service Provider sets their own price.', language)}</p></div>{isTechnician && isFixedRateDriverRequest && !responses.length && <Button size="sm" onClick={acceptDriverRequest} disabled={working}><ApperIcon name="CheckCircle" size={15} /> I’m Available — Accept Request</Button>}{isTechnician && !isCarEssentialsRequest && responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending') && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => acceptCentralAssignment(responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending'))} disabled={working}><ApperIcon name="CheckCircle" size={15} /> Accept Assignment</Button><Button size="sm" variant="outline" onClick={() => declineCentralAssignment(responses.find((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Pending'))} disabled={working}>Decline</Button></div>}{acceptedPunctureResponseNeedingRetry && <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3"><p className="text-sm">Your assignment was accepted, but booking confirmation may not have finished. Retry to create or recover the job.</p><Button className="mt-2" size="sm" onClick={() => acceptCentralAssignment(acceptedPunctureResponseNeedingRetry)} disabled={working}><ApperIcon name="RefreshCw" size={15} /> Retry Booking Confirmation</Button></div>}{isTechnician && responses.some((item) => /Central LOCAL assignment invitation/i.test(String(item.message_c ?? '')) && item.status_c === 'Selected') && <span className="rounded-full border border-success-border bg-success-muted px-3 py-1 text-xs font-semibold text-success">Accepted — awaiting LOCAL confirmation</span>}</div>
          <div className="mt-3 space-y-3">
            {responses.map((response) => {
              const historyText = String(response.negotiation_history_c ?? '');
              const vendorAccepted = response.status_c === 'Vendor Accepted' || (response.status_c === 'Pending' && response.negotiation_status_c === 'Agreed' && /Service Provider accepted customer offer/i.test(historyText));
              return (
              <div key={response.Id} className="border-l-4 border-primary bg-muted/30 p-4">
                <div className="flex flex-col gap-4">
                  <div className="min-w-0 w-full"><div className="flex flex-wrap items-center gap-2"><div className="font-medium">{response.technician_c?.Name ?? 'Service Provider'}</div><StatusBadge value={vendorAccepted ? 'Vendor Accepted' : response.status_c} /></div><div className="mt-1 text-sm text-muted-foreground">{response.availability_c}{isCustomer && response.provider_distance_label_c ? ' • ' + response.provider_distance_label_c + ' from your location' : ''}</div><p className="mt-2 break-words text-sm">{/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) ? (response.status_c === 'Selected' ? 'Provider accepted the assignment. LOCAL must verify visit details and confirm the booking.' : response.status_c === 'Declined' ? 'Provider declined. LOCAL can assign another eligible provider.' : 'LOCAL sent this assignment invitation. Waiting for the provider to accept or decline.') : isFixedRateDriverRequest ? 'Available for this driver request.' : (response.message_c || 'No additional message.')}</p></div>
                  <div className="w-full min-w-0">{(/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && isBikeMaintenanceRequest) ? (() => {
                    const quote = readBikeMaintenanceQuote(response.message_c);
                    const assigned = response.status_c === 'Selected';
                    return <div className="mt-3 rounded-lg border border-primary/30 bg-background p-4">
                      <div className="font-semibold">Bike Maintenance — Visit & Quotation</div>
                      {quote?.visitCompletedAt ? <p className="mt-1 text-xs text-muted-foreground">Visit completed: {new Date(quote.visitCompletedAt).toLocaleString('en-IN')}</p> : null}
                      {isTechnician && assigned && !quote?.visitCompletedAt && <div className="mt-3"><p className="text-sm text-muted-foreground">Visit the customer and inspect the bike before entering final charges.</p><Button className="mt-2 w-full" disabled={working} onClick={() => markBikeVisitCompleted(response)}>Mark Visit Completed</Button></div>}
                      {isTechnician && assigned && quote?.visitCompletedAt && quote.status !== 'Submitted to Admin' && quote.status !== 'Admin Approved' && quote.status !== 'Customer Approved' && <div className="bike-maintenance-quote-form mt-3 space-y-3">
                        <p className="text-sm text-muted-foreground">Enter each charge, then calculate the final bill. The ₹25 LOCAL convenience fee is added automatically.</p>
                        <div className="w-full min-w-0 overflow-hidden rounded-md border">
                          <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                            <colgroup><col className="w-[62%]" /><col className="w-[38%]" /></colgroup>
                            <thead className="bg-muted/50"><tr><th className="break-words border-b px-2 py-3 text-left font-semibold sm:px-3">Bike Maintenance — Item</th><th className="break-words border-b px-2 py-3 text-right font-semibold sm:px-3">Charge (₹)</th></tr></thead>
                            <tbody>
                              <tr><td className="break-words border-b px-2 py-3 sm:px-3">Labour charges</td><td className="border-b px-2 py-2 sm:px-3"><Input name="bike-labour" aria-label="Labour charges in rupees" type="number" min="0" step="0.01" value={bikeLabour} onChange={(event) => setBikeLabour(event.target.value)} className="w-full min-w-0 px-2 text-right" /></td></tr>
                              <tr><td className="break-words border-b px-2 py-3 sm:px-3">Spare parts</td><td className="border-b px-2 py-2 sm:px-3"><Input name="bike-parts" aria-label="Spare parts in rupees" type="number" min="0" step="0.01" value={bikeParts} onChange={(event) => setBikeParts(event.target.value)} className="w-full min-w-0 px-2 text-right" /></td></tr>
                              <tr><td className="break-words border-b px-2 py-3 sm:px-3">Other charges</td><td className="border-b px-2 py-2 sm:px-3"><Input name="bike-other" aria-label="Other charges in rupees" type="number" min="0" step="0.01" value={bikeOther} onChange={(event) => setBikeOther(event.target.value)} className="w-full min-w-0 px-2 text-right" /></td></tr>
                              <tr className="bg-muted/20"><td className="break-words px-2 py-3 font-semibold sm:px-3">Service subtotal</td><td className="px-2 py-2 sm:px-3"><Input name="bike-subtotal" aria-label="Service subtotal in rupees" type="number" min="0" step="0.01" value={bikeCalculatedSubtotal} onChange={(event) => { setBikeCalculatedSubtotal(event.target.value); setBikeBillCalculated(false); }} className="w-full min-w-0 px-2 text-right font-semibold" /></td></tr>
                              <tr><td className="break-words px-2 py-3 sm:px-3">LOCAL Platform Fee</td><td className="px-2 py-2 sm:px-3"><Input name="bike-platform-fee" aria-label="LOCAL Platform Fee in rupees" type="number" min="0" step="0.01" value={bikePlatformFee} onChange={(event) => { setBikePlatformFee(event.target.value); setBikeBillCalculated(false); }} className="w-full min-w-0 px-2 text-right" /></td></tr>
                              <tr className="border-t-2 bg-muted/40"><td className="break-words px-2 py-3 font-bold sm:px-3">Final customer bill</td><td className="px-2 py-2 sm:px-3"><div className="flex min-w-0 items-center gap-1"><Input name="bike-final-total" aria-label="Final customer bill in rupees" type="number" min="0" step="0.01" value={bikeCalculatedTotal} onChange={(event) => setBikeCalculatedTotal(event.target.value)} className="w-full min-w-0 px-2 text-right text-base font-bold" /><Button type="button" size="icon" variant="outline" aria-label="Recalculate final customer bill" title="Recalculate final customer bill" disabled={working} onClick={(event) => {
                                const form = event.currentTarget.closest('.bike-maintenance-quote-form');
                                const readAmount = (name) => {
                                  const raw = form?.querySelector('[name="' + name + '"]')?.value ?? '';
                                  return raw.trim() === '' ? NaN : Number(raw);
                                };
                                const labour = readAmount('bike-labour');
                                const parts = readAmount('bike-parts');
                                const other = readAmount('bike-other');
                                const fee = readAmount('bike-platform-fee');
                                if ([labour, parts, other, fee].some((value) => !Number.isFinite(value) || value < 0) || labour + parts + other <= 0) {
                                  toast.error('Enter valid non-negative labour, parts, other charges and platform fee before calculating.');
                                  return;
                                }
                                const subtotal = labour + parts + other;
                                const total = subtotal + fee;
                                setBikeLabour(String(labour));
                                setBikeParts(String(parts));
                                setBikeOther(String(other));
                                setBikeCalculatedSubtotal(String(subtotal));
                                setBikePlatformFee(String(fee));
                                setBikeCalculatedTotal(String(total));
                                setBikeBillCalculated(true);
                                toast.success('Final customer bill calculated: ₹' + total.toLocaleString('en-IN') + '.');
                              }}><ApperIcon name="RefreshCw" size={16} /></Button></div></td></tr>
                            </tbody>
                          </table>
                        </div>
                        
                        <Button className="w-full" disabled={working} onClick={(event) => {
                          const form = event.currentTarget.closest('.bike-maintenance-quote-form');
                          submitBikeMaintenanceQuote(response, {
                            labour: form?.querySelector('[name="bike-labour"]')?.value ?? '',
                            parts: form?.querySelector('[name="bike-parts"]')?.value ?? '',
                            other: form?.querySelector('[name="bike-other"]')?.value ?? '',
                            fee: form?.querySelector('[name="bike-platform-fee"]')?.value ?? bikePlatformFee,
                            notes: '',
                          });
                        }}>Submit Quote to Customer Care</Button>
                      </div>}
                      {quote && ['Submitted to Admin', 'Admin Approved', 'Customer Approved'].includes(quote.status) && <div className="mt-3 space-y-2 text-sm">{(quote.items || []).map((item, index) => <div key={index} className="flex justify-between gap-3"><span>{item.name}</span><span>₹{Number(item.amount).toLocaleString('en-IN')}</span></div>)}{quote.notes && <p className="rounded bg-muted/30 p-2 text-muted-foreground">{quote.notes}</p>}<div className="flex justify-between border-t pt-2"><span>Service subtotal</span><span>₹{Number(quote.serviceTotal || 0).toLocaleString('en-IN')}</span></div><div className="flex justify-between"><span>LOCAL convenience fee</span><span>₹25</span></div><div className="flex justify-between font-bold"><span>Customer total</span><span>₹{Number(quote.customerTotal || 0).toLocaleString('en-IN')}</span></div><p className="text-xs text-muted-foreground">Status: {quote.status}</p></div>}
                      {user?.profile === 'Admin_c' && quote?.status === 'Submitted to Admin' && <div className="mt-3 space-y-2 rounded-md border p-3"><p className="text-sm">Review the quote, then call the customer and explain the full amount before recording their decision.</p><Button className="w-full" disabled={working} onClick={() => saveBikeMaintenanceQuoteStatus(response, { status: 'Admin Approved', adminApprovedAt: new Date().toISOString(), adminApprovedBy: user?.emailAddress ?? user?.email ?? 'Admin' }, 'Quotation approved. Call the customer to obtain consent.')}>Approve Quotation</Button></div>}
                      {user?.profile === 'Admin_c' && quote?.status === 'Admin Approved' && <div className="mt-3 space-y-2 rounded-md border border-success/30 p-3"><p className="text-sm">After speaking to the customer, record their explicit consent to the quoted total of ₹{Number(quote.customerTotal).toLocaleString('en-IN')}.</p><Button className="w-full" disabled={working} onClick={() => saveBikeMaintenanceQuoteStatus(response, { status: 'Customer Approved', customerConsentAt: new Date().toISOString(), customerConsentRecordedBy: user?.emailAddress ?? user?.email ?? 'Admin' }, 'Customer consent recorded. Proceed to LOCAL booking confirmation.')}>Record Customer Consent</Button></div>}
                      {quote?.status === 'Customer Approved' && <p className="mt-3 rounded-md bg-success/10 p-3 text-sm text-success">Admin-approved quote and customer consent are recorded. Repair may proceed at the approved price.</p>}
                    </div>;
                  })() : (/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && isCarEssentialsRequest) ? (() => { const responseQuote = readCarEssentialsQuote(response.message_c); return <div className="mt-3 rounded-lg border border-primary/30 bg-background p-3"><div className="font-semibold">Car Essentials itemized quote</div>{responseQuote ? <><div className="mt-2 space-y-1 text-sm">{responseQuote.items.map((item, idx) => <div key={idx} className="flex justify-between gap-3"><span>{item.name} × {item.quantity}</span><span>₹{Number(item.lineTotal).toLocaleString('en-IN')}</span></div>)}<div className="flex justify-between border-t pt-2"><span>Home delivery</span><span>₹{Number(responseQuote.deliveryCharge).toLocaleString('en-IN')}</span></div><div className="flex justify-between font-bold"><span>Total quote</span><span>₹{Number(responseQuote.total).toLocaleString('en-IN')}</span></div></div><p className="mt-2 text-xs text-muted-foreground">Status: {responseQuote.status || 'Submitted to Admin'}</p></> : isTechnician && ['Pending', 'Selected'].includes(response.status_c) ? <><p className="mt-1 text-sm text-muted-foreground">Enter a unit price for every requested product and your home-delivery charge. Submitting this quote also records your acceptance of the assignment, then sends the itemized quote to LOCAL Admin for review.</p>{requestLineItems.map((item, index) => <div key={index} className="mt-2 grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2"><label className="break-words text-sm">{item.name} × {item.quantity}</label><Input type="number" min="0.01" step="0.01" value={quotePrices[index] ?? ''} onChange={(event) => { const value = event.target.value; const nextPrices = { ...quotePrices, [index]: value }; setQuotePrices(nextPrices); setQuoteCalculated(false); const itemsTotal = requestLineItems.reduce((sum, lineItem, lineIndex) => sum + (Number.parseFloat(String(nextPrices[lineIndex] ?? '').replace(/,/g, '')) || 0) * Number(lineItem.quantity || 1), 0); setQuoteTotal(itemsTotal + (Number.parseFloat(String(deliveryCharge ?? '').replace(/,/g, '')) || 0)); }} placeholder="Unit price ₹" /></div>)}<div className="mt-2 grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2"><label className="text-sm font-medium">Home delivery (₹)</label><Input type="number" min="0" step="0.01" value={deliveryCharge} onChange={(event) => { const value = event.target.value; setDeliveryCharge(value); setQuoteCalculated(false); const itemsTotal = requestLineItems.reduce((sum, lineItem, lineIndex) => sum + (Number.parseFloat(String(quotePrices[lineIndex] ?? '').replace(/,/g, '')) || 0) * Number(lineItem.quantity || 1), 0); setQuoteTotal(itemsTotal + (Number.parseFloat(String(value ?? '').replace(/,/g, '')) || 0)); }} placeholder="Delivery ₹" /></div><Button type="button" variant="outline" className="mt-3 w-full" size="sm" onClick={(event) => { const box = event.currentTarget.closest('.rounded-lg'); const fields = Array.from(box?.querySelectorAll('input') ?? []); const nextPrices = {}; requestLineItems.forEach((item, index) => { nextPrices[index] = String(fields[index]?.value ?? ''); }); const nextDelivery = String(fields[requestLineItems.length]?.value ?? ''); const itemsTotal = requestLineItems.reduce((sum, item, index) => sum + (Number.parseFloat(String(nextPrices[index] ?? '').replace(/,/g, '')) || 0) * Number(item.quantity || 1), 0); const total = itemsTotal + (Number.parseFloat(nextDelivery.replace(/,/g, '')) || 0); setQuotePrices(nextPrices); setDeliveryCharge(nextDelivery); setQuoteTotal(total); setQuoteCalculated(true); const totalLabel = box?.querySelector('[data-quote-total]'); if (totalLabel) totalLabel.textContent = 'Total: ₹' + total.toLocaleString('en-IN'); toast.success('Total recalculated: ₹' + total.toLocaleString('en-IN')); }}>Press to Calculate Total Amount</Button><p data-quote-total className="mt-2 text-sm font-semibold">Total: ₹{quoteTotal.toLocaleString('en-IN')}</p><Button className="mt-3 w-full" size="sm" disabled={working || !quoteCalculated} onClick={() => submitCarEssentialsQuote(response)}>{working ? 'Submitting quote…' : 'Submit Itemized Quote'}</Button></> : <p className="mt-2 text-sm text-muted-foreground">Accept the assignment above or enter the quote here to accept and submit it in one step.</p>}</div>; })() : /Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) ? <div className="font-medium">Central assignment — no quote requested</div> : isFixedRateDriverRequest ? <><div className="font-heading text-xl font-semibold">{/hourly driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? '₹300 minimum' : '₹100/hour'}</div><div className="mt-1 max-w-xs text-xs text-muted-foreground">{/hourly driver/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? '')) ? 'First 2 hours; then ₹100/hour after the first 2 hours. Night halt ₹300 if applicable.' : '8 AM–10 PM. Night halt ₹300 if applicable.'}</div></> : <div className="font-heading text-2xl font-semibold">₹{Number(response.proposed_price_c ?? 0).toLocaleString('en-IN')}</div>}{!isFixedRateDriverRequest && response.original_proposed_price_c != null && Number(response.original_proposed_price_c) !== Number(response.proposed_price_c) && <div className="mt-1 text-xs text-muted-foreground">{tr('Original quote', language)} ₹{Number(response.original_proposed_price_c).toLocaleString('en-IN')}</div>}{isCustomer && response.status_c === 'Pending' && !/Central LOCAL assignment invitation/i.test(String(response.message_c ?? '')) && !vendorAccepted && !relatedJob && <div className="mt-3 flex flex-wrap gap-2 md:justify-end"><Button size="sm" disabled={working} onClick={() => confirmTechnician(response)}>{isFixedRateDriverRequest ? 'Choose this driver' : tr('Confirm service provider', language)}</Button></div>}
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