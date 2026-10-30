import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useFunction } from '@/hooks/useFunction';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import FilePicker from '@/components/FilePicker';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import { getBillingBreakdown, getBookingCommitmentAmount, calculateDriverOnDemandTariff } from '@/services/pricing';
import { getLanguage, tr } from '@/services/i18n';
import { createNotification } from '@/services/notifications';

const { eq } = window.ApperSDK.CoreSDK;

// Scannable static UPI QR rebuilt from the VPA printed on the customer's supplied Paytm QR.
// This is not payment-gateway verification; keep all payment simulation labels explicit.
const LOCAL_PAYTM_UPI_QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAR8AAAEfCAIAAAD3NVUaAAAFNklEQVR42u3dwW7bMBRFwarQ//9yuuhGCwEhRN/3SGtm3Vi24gMKDEsePz8/f4CAv24BqAvUBagL1AXqAtQF6gJ1AeoCdYG6AHWBukBdgLpAXaAuQF2gLlAXoC5QF6gLUBeoC9QFPHImXvQ4jtU+5/h2+bdv/vbHx/9l4i4lLlT2mlt/Q4xd4MkQ1AWoC9QF6gKeOcuuVHaE7Phsb2JOfJep6sTfGL7vG2LsAk+GoC5AXaAuUBfwQWfv5cvWiY//+O1bSiwzn3xL4/czMfm+y+x52fs0doG6QF2AukBdoC7gV6dbUCAx/V22nr134byxC1AXqAvUBagL1AVf49Uz8okV5b3z1+NXL1uMb+wC1AXqAtQF6gJ1Af81z8j3zuFOXj1xsmvZpjeJFfpln8jYBZ4MAXWBugB1gbpgR3Uz8mXHaU6+pQU3k+ldyz/5L7f+hhi7QF2gLkBdoC5QF/BBh51Ghm5T63L4xLmyk69ZdtStsQtQF6gL1AWoC9QFXyOyRn6XNd1lb37y1iV+fHIvmvHXLPsuJX7c2AWeDEFdgLpAXaAu4INWPNm1bDOZybc0bpe/RpT9hWP86gsen2vsAnWBugB1gbpAXcAzkRn53rXSZWu6xy/Uu7n85I/3znQnfu9lE/rGLvBkCOoC1AXqAnUBV3X7yC84pd77MXvf0rgFD7A1doEnQ0BdoC5AXaAu2NGx4N7fk6/p0NHH93Nc7+46vV9FYxd4MgR1AeoCdYG6gGead61JTJiWXX3rzeUT93NS4rP3/j3A2AWeDEFdgLpAXaAu4Or4voXJveuvb715MX7i1k3+jaHsd2TsAk+GoC5AXaAuUBdw1byP/K3EuuYFN1Qpe5/ft5re2AXqAtQF6gLUBeqCHUV2rSlbAZ1YKz35MbfeZWVc79L1XQ4VMHaBJ0NQF6AuUBeoC7hq3ke+9zUTM8iTf05IrPrfZe5+wbN/jV3gyRDUBagL1AXqAj7oXPA9bb0suuyG3Oo9KXfSgv8VwNgF6gJ1AeoCdYG6gA9q3rUmYcGdcBIrtbfesSdxl3qXwxu7QF2gLkBdoC5QF/CrujXyiT1JEpPaZYuyy46lHX/NyTe/4DR94qto7AJPhqAuQF2gLlAX8MzRuytI2dRq4hTWxPY4C/73gsnf5oJn1ZZd3dgFngxBXYC6QF2gLuDqKDsxdZc9SRKz0olPtOCJqYmvzeTvqPdQAWMXeDIEdQHqAnWBuoCrY+uFyYmp/3FlG6q8ZI+X7zuS19gF6gJ1AeoCdYG6gKu6k10Ta7p7N5Mpu1Dv1H/vRjqJr+Lk78jYBZ4MQV2AukBdoC7gmWOX5caRD9+6cL53E/zJG9K7Z06CGXnwZAioC9QF6gLUBWlH74bgZRZcpT7+Prc+QjZxfK595MGTIaAuUBegLlAX7Ogsu9KC25GXfcyyo27Hb0jvhvW9h82WfRWNXaAuUBegLlAXqAu4Onsv33voaNlW7L2TxZOvueC2M4mTBqyRB0+GgLpAXaAuQF2Qdr75w0+ebnr7472nsJbtQZSY5R+/S2Wf3dgFngxBXYC6QF2gLuCDXj0j33sSadmkdu+FynbCWXCa3tgF6gJ1AeoCdYG6gKvmGfneCdPetee3EkeeTq7Qf8k5vcYu8GQIqAvUBeoC1AVpdTPyC07sLrj+uvc1E3P3vWfA9v42jV3gyRDUBagL1AXqAq6OBXffBmMXoC5QF6gLUBeoC9QFqAvUBeoC1AXqAnUB6gJ1gboAdYG6QF2AukBdoC5AXaAuUBegLlAXvNk/idwXRi93zfsAAAAASUVORK5CYII=';

export const route = { path: '/jobs/:id', layout: 'owner', access: "profile === 'Customer_c' || profile === 'ServiceProvider_c' || profile === 'Admin_c'" };

function formatTimestamp(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-IN');
}

function readCarEssentialsApproval(description) {
  const marker = 'LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:';
  const source = String(description ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  const raw = source.slice(index + marker.length).trim().replace(/^(?:\\\\n|\\n|\\r\\n|\\r)+/, '');
  const objectStart = raw.indexOf('{');
  if (objectStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = objectStart; i < raw.length; i += 1) {
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
        try {
          const approval = JSON.parse(raw.slice(objectStart, i + 1));
          return approval && approval.approved === true ? approval : null;
        } catch { return null; }
      }
    }
  }
  return null;
}

export default function JobsDetail() {
  const { id } = useParams();
  const user = useSelector((state) => state.user.user);
  const [working, setWorking] = useState(false);
  const [driverTripDraft, setDriverTripDraft] = useState({ actualStart: '', actualEnd: '', distanceKm: '', otherApprovedCharges: '0', notes: '' });
  const [providerOtpDraft, setProviderOtpDraft] = useState('');
  const [liveLocation, setLiveLocation] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [showDemoQr, setShowDemoQr] = useState(false);
  const [carWashExtraDescription, setCarWashExtraDescription] = useState('');
  const [carWashExtraPrice, setCarWashExtraPrice] = useState('');
  const [carWashExtraQuantity, setCarWashExtraQuantity] = useState('1');
  const [carWashReceiptFiles, setCarWashReceiptFiles] = useState([]);
  const [paymentTimingDraft, setPaymentTimingDraft] = useState('');
  const [acDiagnosisDraft, setAcDiagnosisDraft] = useState('');
  const [acEstimateDraft, setAcEstimateDraft] = useState('');
  const [acEstimateNotesDraft, setAcEstimateNotesDraft] = useState('');
  const [inspectionDraft, setInspectionDraft] = useState({ registration: '', notes: '', photos: [] });
  const { invoke: sendInvoiceEmail, loading: emailingInvoice } = useFunction(import.meta.env.VITE_EMAIL_LOCAL_INVOICE);
  const { data: job, loading, error, run } = useFetch(() => sdk.table('jobs_c').select([
    'Id','Name','request_c','response_c','customer_c','technician_c','agreed_price_c','original_provider_quote_c','payment_timing_c','booking_commitment_amount_c','remaining_amount_c','local_service_fee_amount_c','customer_discount_amount_c','customer_tax_amount_c','customer_payable_now_c','provider_completed_jobs_count_c','provider_commission_rate_c','provider_commission_amount_c','provider_settlement_amount_c','billing_status_c','service_mode_c','scheduled_at_c','status_c','payment_status_c','payment_method_c','payment_reference_c','pickup_photos_c','progress_photos_c','return_photos_c','pickup_confirmed_at_c','returned_at_c','completion_requested_at_c','customer_completion_confirmed_at_c','dispute_status_c','dispute_note_c','payout_status_c','admin_review_note_c','ac_diagnosis_c','ac_estimate_amount_c','ac_estimate_status_c','ac_estimate_notes_c','vehicle_condition_report_c','vehicle_condition_status_c','vehicle_condition_confirmed_at_c','original_car_wash_price_c','car_wash_extra_items_c','car_wash_revision_status_c','car_wash_revision_number_c','car_wash_customer_approval_at_c','provider_latitude_c','provider_longitude_c','provider_location_updated_at_c','provider_travel_status_c','service_start_otp_c','service_start_otp_verified_at_c'
  ]).get(id).then((res) => {
    if (!res.success) throw new Error(res.message);
    return res.data ?? null;
  }), [id]);
  const requestId = job?.request_c?.Id ?? job?.request_c ?? '';
  const { data: serviceRequest } = useFetch(() => requestId
    ? sdk.table('service_requests_c').select(['Id', 'Name', 'problem_description_c', 'location_c', 'latitude_c', 'longitude_c', 'customer_c']).get(requestId).then((res) => res.data ?? null)
    : Promise.resolve(null), [requestId]);

  const approvedCarWashQuote = (() => {
    const description = String(serviceRequest?.problem_description_c ?? '');
    const quoteMarker = 'LOCAL_CAR_WASH_QUOTE_JSON:';
    const approvalMarker = 'LOCAL_CAR_WASH_APPROVAL_JSON:';
    const extractJsonAfter = (marker, stopMarkers = []) => {
      const index = description.lastIndexOf(marker);
      if (index < 0) return null;
      let raw = description.slice(index + marker.length);
      for (const stopMarker of stopMarkers) {
        const stopIndex = raw.indexOf(stopMarker);
        if (stopIndex >= 0) raw = raw.slice(0, stopIndex);
      }
      raw = raw.replace(/^(?:\\\\n|\\n|\\r\\n)+/, '').trim();
      const objectStart = raw.indexOf('{');
      if (objectStart < 0) return null;
      raw = raw.slice(objectStart);
      let depth = 0;
      let inString = false;
      let escaped = false;
      let end = -1;
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
        } else if (ch === '"') inString = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      if (end < 0) return null;
      try { return JSON.parse(raw.slice(0, end)); } catch { return null; }
    };
    const quote = extractJsonAfter(quoteMarker, [approvalMarker]);
    const approval = extractJsonAfter(approvalMarker);
    if (!quote || !approval || approval.approved !== true || String(approval.quoteId) !== String(quote.quoteId) || Number(approval.total) !== Number(quote.total) || !Number.isFinite(Number(quote.total))) return null;
    return quote;
  })();
  const isProvider = user?.profile === 'ServiceProvider_c';
  const isCustomer = user?.profile === 'Customer_c';
  const isAdmin = user?.profile === 'Admin_c';
  const isCarWash = /car\s*wash/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? ''));
  const isCarService = /car service|service package|economy service|normal service|major service|point checkup/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? ''));
  const isCarCare = isCarWash || isCarService;
  const isCarEssentialsDelivery = /car essentials delivery|car essentials/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? '') + ' ' + String(serviceRequest?.Name ?? '') + ' ' + String(serviceRequest?.problem_description_c ?? ''));
  const carEssentialsApproval = isCarEssentialsDelivery ? readCarEssentialsApproval(serviceRequest?.problem_description_c) : null;
  const jobDeliveryOtp = String(job?.service_start_otp_c ?? '').trim();
  const approvalDeliveryOtp = String(carEssentialsApproval?.otp ?? '').trim();
  const carEssentialsDeliveryOtp = /^\d{6}$/.test(jobDeliveryOtp) ? jobDeliveryOtp : /^\d{6}$/.test(approvalDeliveryOtp) ? approvalDeliveryOtp : '';
  const isPickupDrop = /Pickup\s*&\s*Drop/i.test(String(serviceRequest?.problem_description_c ?? '')) || /Pickup\s*&\s*Drop/i.test(String(job?.response_c ?? ''));
  const isAcService = /AC Technician/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? '')) || String(serviceRequest?.problem_description_c ?? '').includes('LOCAL_AC_REQUEST_JSON:');
  const isDriverBooking = /car driver on demand|driver on demand|hourly driver|full[- ]day driver|outstation driver|emergency driver|scheduled driver|professional car driver/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? '') + ' ' + String(serviceRequest?.Name ?? '') + ' ' + String(serviceRequest?.problem_description_c ?? ''));
  const driverTripCompletion = (() => {
    const note = String(job?.admin_review_note_c ?? '');
    const marker = 'LOCAL_DRIVER_TRIP_COMPLETION_JSON:';
    const index = note.lastIndexOf(marker);
    if (index < 0) return null;
    const raw = note.slice(index + marker.length).split(/\\r?\\n/)[0].trim();
    try { return JSON.parse(raw); } catch { return null; }
  })();
  const driverTripReview = (() => {
    const note = String(job?.admin_review_note_c ?? '');
    const marker = 'LOCAL_DRIVER_TRIP_REVIEW_JSON:';
    const index = note.lastIndexOf(marker);
    if (index < 0) return null;
    const raw = note.slice(index + marker.length).split(/\\r?\\n/)[0].trim();
    try { return JSON.parse(raw); } catch { return null; }
  })();
  const driverBillApprovedForCustomer = Boolean(driverTripReview?.approved === true && driverTripReview?.customerConsentRecorded === true);
  const driverActualStartDate = driverTripDraft.actualStart ? new Date(driverTripDraft.actualStart) : null;
  const driverActualEndDate = driverTripDraft.actualEnd ? new Date(driverTripDraft.actualEnd) : null;
  const driverActualTimesValid = Boolean(driverActualStartDate && driverActualEndDate && !Number.isNaN(driverActualStartDate.getTime()) && !Number.isNaN(driverActualEndDate.getTime()) && driverActualEndDate > driverActualStartDate);
  const driverActualDurationHours = driverActualTimesValid ? (driverActualEndDate.getTime() - driverActualStartDate.getTime()) / 3600000 : 0;
  const driverActualTariffPreview = (() => { if (!driverActualTimesValid) return null; try { return calculateDriverOnDemandTariff({ pickupDate: driverTripDraft.actualStart.slice(0, 10), pickupTime: driverTripDraft.actualStart.slice(11, 16), durationHours: driverActualDurationHours }); } catch { return null; } })();
  const driverApprovedEstimate = (() => { const description = String(serviceRequest?.problem_description_c ?? ''); const marker = 'LOCAL_DRIVER_BOOKING_QUOTE_JSON:'; const index = description.lastIndexOf(marker); if (index < 0) return Number(job?.original_provider_quote_c ?? 0); try { const quote = JSON.parse(description.slice(index + marker.length).split(/\\r?\\n/)[0]); return Number(quote?.customerTotal ?? job?.original_provider_quote_c ?? 0); } catch { return Number(job?.original_provider_quote_c ?? 0); } })();
  const isBatteryJumpStart = /battery jump start/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? '') + ' ' + String(serviceRequest?.Name ?? '') + ' ' + String(serviceRequest?.problem_description_c ?? ''));
  const batteryJumpStartTotal = Math.max(0, Number(job?.agreed_price_c ?? 0)) + 25;
  const savedServicePrice = Number(job?.agreed_price_c ?? 0);
  const hasValidServicePrice = Number.isFinite(savedServicePrice) && savedServicePrice > 0;
  const finalServicePayable = hasValidServicePrice ? savedServicePrice + 25 : 0;
  const isPayAfterCompletion = isCarWash || isCarService || isAcService;
  const language = getLanguage();
  const completedJobsBeforeThisBooking = Number(job?.provider_completed_jobs_count_c ?? 0);
  const billing = getBillingBreakdown(job?.agreed_price_c ?? 0, job?.service_mode_c ?? 'Normal', completedJobsBeforeThisBooking, job?.customer_discount_amount_c ?? 0, job?.customer_tax_amount_c ?? 0);
  const displayLookup = (value) => value?.Name ?? value?.name ?? value?.Id ?? value ?? '—';
  const displayMoney = (value) => '₹' + Number(value ?? 0).toLocaleString('en-IN');
  const isPaid = job?.payment_status_c === 'Final Payment Paid';
  let carWashItems = [];
  try { carWashItems = job?.car_wash_extra_items_c ? JSON.parse(job.car_wash_extra_items_c) : []; } catch { carWashItems = []; }
  if (!Array.isArray(carWashItems)) carWashItems = [];
  const carWashBasePrice = Number(job?.original_car_wash_price_c ?? job?.original_provider_quote_c ?? job?.agreed_price_c ?? 0);
  const carWashApprovedExtras = carWashItems.filter((item) => item.status === 'Approved' && !/(discount|negotiation|pick\s*up|pickup|platform\s*fee)/i.test(String(item.description ?? '').trim()));
  const carWashPendingExtras = carWashItems.filter((item) => item.status === 'Pending' && !/(discount|negotiation|pick\s*up|pickup|platform\s*fee)/i.test(String(item.description ?? '').trim()));
  const carWashExtrasTotal = carWashApprovedExtras.reduce((sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1), 0);
  const carWashQuoteMathSubtotal = approvedCarWashQuote ? Number(approvedCarWashQuote.total) + Number(approvedCarWashQuote.discount ?? 0) - Number(approvedCarWashQuote.pickupDropCharge ?? 0) - Number(approvedCarWashQuote.platformFee ?? 25) : null;
  const carWashQuoteSubtotalIsConsistent = approvedCarWashQuote && Number.isFinite(carWashQuoteMathSubtotal) && Math.abs(carWashQuoteMathSubtotal - Number(approvedCarWashQuote.serviceSubtotal ?? 0)) < 0.01;
  const carWashDisplayedQuoteSubtotal = approvedCarWashQuote ? (carWashQuoteSubtotalIsConsistent ? Number(approvedCarWashQuote.serviceSubtotal) : carWashBasePrice) : carWashBasePrice;
  const carWashServiceTotal = isCarWash ? (approvedCarWashQuote ? carWashDisplayedQuoteSubtotal - Number(approvedCarWashQuote.discount ?? 0) + Number(approvedCarWashQuote.pickupDropCharge ?? 0) : carWashBasePrice + carWashExtrasTotal) : Number(job?.agreed_price_c ?? 0);
  const carWashPlatformFee = isCarWash ? Number(approvedCarWashQuote?.platformFee ?? 25) : 0;
  const carWashCustomerTotal = isCarWash && approvedCarWashQuote ? Number(approvedCarWashQuote.total) + carWashExtrasTotal : carWashServiceTotal + carWashPlatformFee;
  const displayedAgreedPrice = isCarWash && approvedCarWashQuote ? carWashServiceTotal : Number(job?.agreed_price_c ?? 0);
  const displayedAmountDue = isCarWash && approvedCarWashQuote ? Number(approvedCarWashQuote.total) + carWashExtrasTotal : Number(job?.customer_payable_now_c ?? job?.agreed_price_c ?? 0);
  const awaitingSince = job?.completion_requested_at_c ? new Date(job.completion_requested_at_c).getTime() : 0;
  const adminReviewDue = (job?.status_c === 'Awaiting Customer Confirmation' || (isCarEssentialsDelivery && job?.provider_travel_status_c === 'Delivered — Awaiting Customer Confirmation')) && awaitingSince > 0 && Date.now() - awaitingSince >= 24 * 60 * 60 * 1000;
  let savedInspection = null;
  try { savedInspection = job?.vehicle_condition_report_c ? JSON.parse(job.vehicle_condition_report_c) : null; } catch { savedInspection = null; }
  const inspectionStatus = job?.vehicle_condition_status_c ?? 'Not Started';
  const requiredVehicleViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'];
  const parsePhotoField = (value) => { try { const parsed = value ? JSON.parse(value) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; } };
  const pickupPhotos = parsePhotoField(job?.pickup_photos_c);
  const returnPhotos = parsePhotoField(job?.return_photos_c);
  const savedVehiclePhotos = [
    ...(Array.isArray(savedInspection?.photos) ? savedInspection.photos : []),
    ...pickupPhotos,
    ...returnPhotos,
  ].filter((photo, index, all) => all.findIndex((item) => item.view === photo.view) === index);
  const hasSixBeforePhotos = requiredVehicleViews.every((view) => savedVehiclePhotos.some((photo) => photo.view === 'pre-' + view && photo.data));
  const hasSixAfterPhotos = requiredVehicleViews.every((view) => savedVehiclePhotos.some((photo) => photo.view === 'post-' + view && photo.data));
  // Do not poll the detail page on a timer: repeated fetches were disrupting
  // customer/provider workflows while they were entering data or confirming jobs.
  // The record loads on entry and refreshes after successful saves via updateJob().

  useEffect(() => {
    if ((!isCustomer && !isProvider && !isAdmin) || !job?.Id || job.status_c !== 'Assigned' || job.service_start_otp_c || job.service_start_otp_verified_at_c || isCarEssentialsDelivery) return;
    // Ensure an assigned booking has an OTP even if the customer has not opened the booking yet. The provider UI never displays the code, and arrival/inspection plus verification are still required to start service.
    void generateServiceStartOtp();
  }, [job?.Id, job?.status_c, job?.service_start_otp_c, job?.service_start_otp_verified_at_c, isCustomer, isProvider, isAdmin, isCarEssentialsDelivery]);

  useEffect(() => {
    if (savedInspection) setInspectionDraft({
      registration: savedInspection.registration ?? '',
      notes: savedInspection.notes ?? '',
      photos: [
        ...(Array.isArray(savedInspection.photos) ? savedInspection.photos : []),
        ...parsePhotoField(job?.pickup_photos_c),
        ...parsePhotoField(job?.return_photos_c),
      ].filter((photo, index, all) => all.findIndex((item) => item.view === photo.view) === index),
    });
  }, [job?.Id, job?.vehicle_condition_report_c, job?.pickup_photos_c, job?.return_photos_c]);

  async function notifyJobParticipants(values) {
    const changes = [];
    if (values.status_c && values.status_c !== job?.status_c) {
      changes.push({ type: 'Job', key: 'status', message: 'Booking status updated: ' + values.status_c + '.' });
    }
    if (values.payment_status_c && values.payment_status_c !== job?.payment_status_c) {
      changes.push({ type: 'Payment', key: 'payment', message: 'Payment status updated: ' + values.payment_status_c + '.' });
    }
    if (values.provider_travel_status_c && values.provider_travel_status_c !== job?.provider_travel_status_c) {
      changes.push({ type: 'Job', key: 'travel', message: 'Service Provider update: ' + values.provider_travel_status_c + '.' });
    }
    if (!changes.length) return;

    const participants = [];
    if (isProvider || isAdmin) {
      const customerId = job?.customer_c?.Id ?? job?.customer_c ?? serviceRequest?.customer_c?.Id ?? serviceRequest?.customer_c;
      if (customerId) participants.push({ table: 'customer_profiles_c', id: customerId });
    }
    if (isCustomer || isAdmin) {
      const providerId = job?.technician_c?.Id ?? job?.technician_c;
      if (providerId) participants.push({ table: 'technician_profiles_c', id: providerId });
    }

    for (const participant of participants) {
      try {
        const profileResult = await sdk.table(participant.table).select(['Id', 'Owner']).get(participant.id);
        if (!profileResult.success || !profileResult.data) continue;
        const recipientUserId = profileResult.data.Owner?.Id ?? profileResult.data.Owner;
        if (!recipientUserId) continue;
        for (const change of changes) {
          await createNotification({
            recipientUserId,
            title: change.type === 'Payment' ? 'Payment update' : 'Booking update',
            message: change.message,
            type: change.type,
            actionUrl: '/jobs/' + job.Id,
            relatedRecordId: job.Id,
            relatedType: 'jobs_c',
            eventKey: 'job-' + job.Id + '-' + change.key + '-' + String(values.status_c ?? values.payment_status_c ?? values.provider_travel_status_c),
          });
        }
      } catch (notificationError) {
        console.warn('LOCAL notification could not be created:', notificationError);
      }
    }
  }

  async function updateJob(values, successMessage) {
    if (working) return;
    if (values.status_c === 'In Progress' && isCarCare && !job.service_start_otp_verified_at_c && !values.service_start_otp_verified_at_c) {
      toast.error('Service start is locked. The customer must confirm the vehicle condition and the provider must verify the service-start OTP first.');
      return;
    }
    if (values.status_c === 'In Progress' && isProvider && !job.service_start_otp_verified_at_c && !values.service_start_otp_verified_at_c) {
      toast.error('Service start is locked. The Service Provider must verify the customer’s booking OTP first.');
      return;
    }
    setWorking(true);
    let refreshAfterSave = false;
    try {
      const res = await Promise.race([
        sdk.table('jobs_c').update({ Id: job.Id, ...values }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('The job update has not responded within 30 seconds. It may still have saved. Refresh the job and check its status before retrying to avoid duplicate submissions.')), 30000)),
      ]);
      if (!res?.success || !res.data?.length) throw new Error(res?.messages?.[0] ?? res?.message ?? 'Job could not be updated. Please retry.');
      toast.success(successMessage);
      await notifyJobParticipants(values);
      refreshAfterSave = true;
    } catch (err) {
      toast.error(err.message ?? 'Job update failed. Please retry.');
    } finally {
      setWorking(false);
      if (refreshAfterSave) run();
    }
  }

  async function addInspectionPhotos(event, view) {
    const file = Array.from(event.target.files ?? []).find((item) => item.type.startsWith('image/'));
    if (!file) return;
    setWorking(true);
    try {
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the selected photo.'));
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => reject(new Error('The selected file is not a readable image.'));
          image.onload = () => {
            // The current Apper storage adapter can return attachment metadata without a public URL.
            // Keep a compact image preview as a fallback so the workflow does not depend on URL resolution.
            const scale = Math.min(1, 192 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) { reject(new Error('Photo compression is not supported by this browser.')); return; }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.16));
          };
          image.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });
      const optimizedBlob = await (await fetch(encoded)).blob();
      const optimizedFile = new File([optimizedBlob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      const uploaded = await sdk.storage.upload(optimizedFile);
      if (!uploaded) throw new Error('Photo upload did not return a saved file reference.');
      const photoFile = {
        ...uploaded,
        name: uploaded.name ?? uploaded.Name ?? optimizedFile.name,
        type: uploaded.type ?? uploaded.Type ?? 'image/jpeg',
      };
      let imageUrl = photoFile.url ?? photoFile.Url ?? photoFile.previewUrl ?? photoFile.preview_url ?? photoFile.downloadUrl ?? photoFile.download_url ?? '';
      if (!imageUrl) {
        try {
          const preview = await sdk.storage.preview(photoFile);
          imageUrl = preview?.url ?? '';
        } catch { /* use compact embedded preview below */ }
      }
      if (!imageUrl) {
        try {
          const download = await sdk.storage.download(photoFile);
          imageUrl = download?.url ?? '';
        } catch { /* use compact embedded preview below */ }
      }
      // A data URL is a reliable fallback for the memory/demo storage adapter.
      if (!imageUrl) imageUrl = encoded;
      const photo = {
        view,
        name: photoFile.name,
        data: imageUrl,
        fileId: photoFile.Id ?? photoFile.id ?? null,
        type: photoFile.type,
        size: photoFile.size ?? photoFile.Size ?? optimizedFile.size,
      };
      setInspectionDraft((current) => ({ ...current, photos: [...current.photos.filter((item) => item.view !== view), photo] }));
      toast.success(view.replace(/^pre-/, '').replace(/^post-/, '') + ' photo uploaded.');
    } catch (err) {
      toast.error(err?.message ?? 'Photo upload failed. Please retry.');
    } finally {
      setWorking(false);
      event.target.value = '';
    }
  }

  async function saveVehicleInspection() {
    if (!inspectionDraft.registration.trim()) { toast.error('Enter the vehicle registration number.'); return; }
    const requiredViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'];
    const missingViews = requiredViews.filter((view) => !inspectionDraft.photos.some((photo) => photo.view === 'pre-' + view && photo.data));
    if (missingViews.length) { toast.error('Upload all six pre-service photographs: ' + missingViews.join(', ') + '.'); return; }
    const inspectedAt = new Date().toISOString();
    const photoRefs = inspectionDraft.photos.filter((photo) => photo.view?.startsWith('pre-')).map(({ view, name, data, fileId, type, size }) => ({ view, name, data, fileId, type, size }));
    const report = { registration: inspectionDraft.registration.trim(), notes: inspectionDraft.notes.trim(), customerName: displayLookup(job.customer_c), version: 4, inspectedAt, inspectedBy: displayLookup(job.technician_c), stage: 'Vehicle handover', confirmedAt: null };
    const photosJson = JSON.stringify(photoRefs);
    if (photosJson.length > 60000) { toast.error('The six compressed photo previews are still too large to save safely. Please upload smaller image files or contact LOCAL support.'); return; }
    await updateJob({ vehicle_condition_report_c: JSON.stringify(report), pickup_photos_c: photosJson, vehicle_condition_status_c: 'Awaiting Customer Confirmation' }, 'Vehicle condition report saved and shared with the customer.');
  }

  function readServiceStartOtp(value) {
    try {
      const parsed = JSON.parse(String(value ?? ''));
      if (parsed && typeof parsed === 'object' && /^\d{6}$/.test(String(parsed.code ?? '')) && parsed.expiresAt) return parsed;
    } catch { /* A missing or malformed OTP is not accepted. */ }
    return null;
  }

  async function generateServiceStartOtp() {
    if ((!isAdmin && !isCustomer && !isProvider) || isCarEssentialsDelivery || job.status_c !== 'Assigned') return;
    if (job.service_start_otp_verified_at_c) { toast.error('This OTP has already been used. The service has started; a new start OTP cannot be issued.'); return; }
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const code = String((random[0] % 900000) + 100000);
    const now = new Date();
    // Keep the code available for normal and scheduled bookings; verification still requires arrival/inspection.
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const otpRecord = JSON.stringify({ code, expiresAt, attempts: 0, generatedAt: now.toISOString() });
    await updateJob({ service_start_otp_c: otpRecord, service_start_otp_verified_at_c: null }, job.service_start_otp_c ? 'Previous OTP invalidated. A new 24-hour service-start OTP was issued.' : 'Service-start OTP generated for this booking and shown to the customer.');
  }

  async function confirmVehicleInspection() {
    if (!savedInspection) return;
    const confirmedAt = new Date().toISOString();
    const compactReport = { registration: savedInspection.registration ?? '', notes: savedInspection.notes ?? '', customerName: savedInspection.customerName ?? displayLookup(job.customer_c), version: 4, inspectedAt: savedInspection.inspectedAt ?? null, inspectedBy: savedInspection.inspectedBy ?? displayLookup(job.technician_c), stage: savedInspection.stage ?? 'Vehicle handover', confirmedAt };
    const inspectionApprovalUpdates = { vehicle_condition_report_c: JSON.stringify(compactReport), vehicle_condition_status_c: 'Confirmed', vehicle_condition_confirmed_at_c: confirmedAt };
    await updateJob(inspectionApprovalUpdates, 'Vehicle condition report confirmed. Admin can now issue the service-start OTP.');
  }

  function printVehicleInspection() {
    if (!savedInspection) return;
    const localLogoUrl = `${window.location.origin}/local-logo.svg`;
    const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const photos = savedVehiclePhotos.map((photo) => `<figure><img src="${photo.data}" style="max-width:220px;max-height:160px;object-fit:contain"><figcaption>${safe(photo.view || photo.name)}</figcaption></figure>`).join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast.error('Allow pop-ups to print or save the report as PDF.'); return; }
    w.document.write(`<!doctype html><html><head><title>LOCAL Vehicle Condition Report</title><style>body{font:14px Arial,sans-serif;margin:28px;color:#172033}.report-header{display:flex;align-items:center;gap:20px;border-bottom:2px solid #5b21b6;padding-bottom:14px;margin-bottom:18px}.brand-logo{display:block;width:170px;max-height:64px;height:auto;object-fit:contain;object-position:left center}h1{color:#102c4d;font-size:22px;margin:0}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}section{margin:18px 0} .photos{display:flex;flex-wrap:wrap;gap:12px}</style></head><body><header class="report-header"><img class="brand-logo" src="${localLogoUrl}" alt="LOCAL — Happy to Help"><h1>Vehicle Condition Report</h1></header><p>Job: ${safe(job.Name)}</p><p>Inspection time: ${safe(formatTimestamp(savedInspection.inspectedAt))}</p><p>Service Provider: ${safe(savedInspection.inspectedBy)}</p><table><tr><th>Customer Name</th><td>${safe(savedInspection.customerName || displayLookup(job.customer_c))}</td><th>Registration</th><td>${safe(savedInspection.registration)}</td></tr></table><section><h2>Condition notes</h2><p>${safe(savedInspection.notes || '—')}</p></section><section><h2>Handover photographs</h2><div class="photos">${photos || 'No photographs attached.'}</div></section><p>Customer confirmation status: ${safe(inspectionStatus)} ${savedInspection.confirmedAt ? 'at ' + safe(formatTimestamp(savedInspection.confirmedAt)) : ''}</p><p>This report records the vehicle condition observed at handover. It is not a mechanical diagnosis or guarantee.</p><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  async function submitAcEstimate() {
    const diagnosis = acDiagnosisDraft.trim();
    const amount = Number(acEstimateDraft);
    if (!diagnosis) {
      toast.error('Enter the AC diagnosis before submitting the estimate.');
      return;
    }
    if (acEstimateDraft === '' || !Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid estimate amount of ₹0 or more.');
      return;
    }
    await updateJob({ ac_diagnosis_c: diagnosis, ac_estimate_amount_c: amount, ac_estimate_notes_c: acEstimateNotesDraft.trim(), ac_estimate_status_c: 'Pending Customer Approval' }, 'Diagnosis and estimate sent to the customer for approval.');
  }

  async function approveAcEstimate() {
    const amount = Number(job.ac_estimate_amount_c);
    if (!Number.isFinite(amount) || amount < 0 || !job.ac_diagnosis_c) {
      toast.error('The Service Provider must submit a diagnosis and valid estimate first.');
      return;
    }
    const calculated = getBillingBreakdown(amount, job.service_mode_c ?? 'Normal', Number(job.provider_completed_jobs_count_c ?? 0), 0, 0);
    await updateJob({ ac_estimate_status_c: 'Approved', agreed_price_c: amount, remaining_amount_c: amount, booking_commitment_amount_c: 0, local_service_fee_amount_c: 0, customer_discount_amount_c: 0, customer_tax_amount_c: 0, customer_payable_now_c: 0, provider_commission_rate_c: calculated.providerCommissionRate, provider_commission_amount_c: calculated.providerCommission, provider_settlement_amount_c: calculated.providerSettlement, billing_status_c: 'Ready for Confirmation', payment_status_c: 'Unpaid' }, 'Estimate approved. The Service Provider can proceed with the agreed work.');
  }

  async function declineAcEstimate() {
    await updateJob({ ac_estimate_status_c: 'Declined' }, 'Estimate declined. The Service Provider can revise and resubmit it.');
  }

  async function submitCarWashExtra() {
    if (!isProvider || !isCarWash) return;
    const description = carWashExtraDescription.trim();
    const unitPrice = Number(carWashExtraPrice);
    const quantity = Number(carWashExtraQuantity);
    if (!description) { toast.error('Describe the additional service or part.'); return; }
    if (carWashExtraPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isInteger(quantity) || quantity < 1) { toast.error('Enter a valid price and quantity.'); return; }
    if (carWashPendingExtras.length) { toast.error('A revised bill is already awaiting customer approval.'); return; }
    const originalPrice = Number(job.original_car_wash_price_c ?? job.original_provider_quote_c ?? job.agreed_price_c ?? 0);
    const revision = Number(job.car_wash_revision_number_c ?? 0) + 1;
    const receipts = Array.isArray(carWashReceiptFiles) ? carWashReceiptFiles.map((file) => ({
      Id: file.Id ?? file.id ?? null,
      Name: file.Name ?? file.name ?? 'Purchase receipt',
      Type: file.Type ?? file.type ?? '',
      Size: file.Size ?? file.size ?? 0,
      url: file.url ?? file.Url ?? file.previewUrl ?? file.preview_url ?? file.downloadUrl ?? file.download_url ?? null,
      path: file.path ?? null,
    })) : [];
    const item = { id: 'extra-' + Date.now(), description, unitPrice, quantity, status: 'Pending', proposedAt: new Date().toISOString(), proposedBy: displayLookup(job.technician_c), revision, receipts };
    const nextItems = [...carWashItems, item];
    await updateJob({ original_car_wash_price_c: originalPrice, car_wash_extra_items_c: JSON.stringify(nextItems), car_wash_revision_status_c: 'Pending Customer Approval', car_wash_revision_number_c: revision, car_wash_customer_approval_at_c: null, local_service_fee_amount_c: 25 }, 'Revised Car Wash bill sent to the customer. Do not perform the extra work until approved.');
    setCarWashExtraDescription('');
    setCarWashExtraPrice('');
    setCarWashExtraQuantity('1');
    setCarWashReceiptFiles([]);
  }

  async function respondToCarWashRevision(approve) {
    if (!isCustomer || !isCarWash || !carWashPendingExtras.length) return;
    const now = new Date().toISOString();
    const pendingIds = new Set(carWashPendingExtras.map((item) => item.id));
    const nextItems = carWashItems.map((item) => pendingIds.has(item.id) ? { ...item, status: approve ? 'Approved' : 'Rejected', customerRespondedAt: now } : item);
    const approvedExtras = nextItems.filter((item) => item.status === 'Approved').reduce((sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1), 0);
    const basePrice = Number(job.original_car_wash_price_c ?? job.original_provider_quote_c ?? job.agreed_price_c ?? 0);
    const serviceTotal = basePrice + approvedExtras;
    const calculated = getBillingBreakdown(serviceTotal, job.service_mode_c ?? 'Normal', Number(job.provider_completed_jobs_count_c ?? 0), Number(job.customer_discount_amount_c ?? 0), Number(job.customer_tax_amount_c ?? 0));
    await updateJob({ car_wash_extra_items_c: JSON.stringify(nextItems), car_wash_revision_status_c: approve ? 'Approved' : 'Rejected', car_wash_customer_approval_at_c: now, agreed_price_c: serviceTotal, local_service_fee_amount_c: 25, customer_payable_now_c: serviceTotal + 25, provider_commission_rate_c: calculated.providerCommissionRate, provider_commission_amount_c: calculated.providerCommission, provider_settlement_amount_c: calculated.providerSettlement, billing_status_c: 'Ready for Confirmation' }, approve ? 'Revised bill approved. The Service Provider may now perform the additional work.' : 'Additional work declined. The original agreed service remains unchanged.');
  }

  async function confirmCustomerCompletion() {
    if (isCarEssentialsDelivery && job.provider_travel_status_c !== 'Delivered — Awaiting Customer Confirmation') {
      toast.error('Delivery confirmation is available only after the Service Provider verifies the delivery OTP.');
      return;
    }
    if (isCarCare && (!hasSixBeforePhotos || !hasSixAfterPhotos)) {
      toast.error('Completion confirmation is locked until all six before-service and all six after-service vehicle photos are saved to this job.');
      return;
    }
    if (job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review') {
      toast.error('This job has an open dispute. Admin review is required before completion.');
      return;
    }
    const alreadyPaidAtConfirmation = isPaid;
    await updateJob({ customer_completion_confirmed_at_c: new Date().toISOString(), status_c: 'Completed', payment_status_c: alreadyPaidAtConfirmation ? 'Final Payment Paid' : 'Balance Pending', billing_status_c: alreadyPaidAtConfirmation ? 'Final Paid' : (isCarEssentialsDelivery ? 'Payment Due After Delivery' : 'Ready for Confirmation'), payout_status_c: alreadyPaidAtConfirmation ? 'Pending Release' : 'Not Eligible' }, alreadyPaidAtConfirmation ? 'Completion confirmed. Your full payment was already recorded.' : 'Completion confirmed. The full final payment is now due.');
  }

  async function reportIssue() {
    const note = window.prompt('Describe the damage, missing vehicle, or incomplete service issue:');
    if (!note || !note.trim()) return;
    await updateJob({ dispute_status_c: 'Open', dispute_note_c: note.trim(), payout_status_c: 'On Hold' }, 'Issue reported. Settlement is on hold for review.');
  }

  async function savePaymentTiming(timing) {
    const storedTiming = timing === 'confirmation' ? 'Pay at confirmation' : 'Pay after completion';
    setPaymentTimingDraft(timing);
    await updateJob({ payment_timing_c: storedTiming }, timing === 'confirmation' ? 'Full-payment-at-confirmation selected.' : 'Full payment after service completion selected. No advance or partial payment will be collected.');
  }

  async function emailInvoiceToCustomer(paymentAmount = Number(job?.agreed_price_c ?? 0), paymentReference = job?.payment_reference_c ?? '') {
    const email = String(user?.emailAddress ?? user?.email ?? user?.Email ?? user?.email_c ?? '').trim();
    if (!email) {
      toast.warning('Payment is recorded, but the customer email address is not available in this session.');
      return false;
    }
    const invoiceNumber = 'LOCAL-' + String(job.Id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
    try {
      const result = await sendInvoiceEmail({
        email,
        invoiceNumber,
        customerName: displayLookup(job.customer_c),
        serviceName: String(job.Name ?? 'LOCAL Service'),
        amount: paymentAmount,
        paymentReference,
        paidAt: new Date().toLocaleString('en-IN'),
      });
      if (result?.success === true) {
        toast.success('Invoice details emailed to the customer.');
        return true;
      }
      // useFunction can return undefined after showing its own error toast. Never claim delivery without an explicit success response.
      toast.warning('Payment is recorded, but invoice delivery was not confirmed. Check the email service configuration.');
      return false;
    } catch (err) {
      const message = String(err?.message ?? '');
      if (/not configured|RESEND_API_KEY|LOCAL_INVOICE_FROM/i.test(message)) {
        toast.warning('Payment is recorded, but invoice email is not configured. Configure RESEND_API_KEY and LOCAL_INVOICE_FROM to enable delivery.');
      } else {
        toast.warning('Payment is recorded, but invoice email could not be sent. Check the email service configuration and try again.');
      }
      return false;
    }
  }

  async function simulatePayment() {
    setWorking(true);
    try {
      const isFinalBalancePayment = !isCarCare && !isAcService && job.status_c === 'Completed' && job.payment_status_c !== 'Final Payment Paid';
      const serviceAmount = Number(job.agreed_price_c ?? job.remaining_amount_c ?? 0);
      if ((isFinalBalancePayment || job.status_c === 'Completed') && (!Number.isFinite(serviceAmount) || serviceAmount <= 0)) {
        toast.error('Payment is blocked because this job has no valid agreed service price. LOCAL Admin must record the agreed amount before payment can proceed.');
        return;
      }
      const amount = isCarWash ? Number(job.agreed_price_c ?? job.original_car_wash_price_c ?? 0) + 25 : isCarService || isBatteryJumpStart && isFinalBalancePayment || isCarCare || isAcService || isFinalBalancePayment ? serviceAmount + 25 : Number(job.customer_payable_now_c ?? billing.customerPayableNow);
      const calculated = getBillingBreakdown(job.agreed_price_c, job.service_mode_c ?? 'Normal', Number(job.provider_completed_jobs_count_c ?? 0), Number(job.customer_discount_amount_c ?? 0), 0);
      const reference = 'DEMO-' + paymentMethod.toUpperCase().replace(' ', '-') + '-' + String(Date.now()).slice(-6);
      const values = (isCarCare || isAcService || isFinalBalancePayment) ? {
        remaining_amount_c: 0,
        local_service_fee_amount_c: 25,
        customer_payable_now_c: amount,
        billing_status_c: 'Final Paid',
        payment_status_c: 'Final Payment Paid',
        payment_method_c: paymentMethod,
        payment_reference_c: reference,
        payout_status_c: job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review' ? 'On Hold' : 'Pending Release',
      } : {
        booking_commitment_amount_c: calculated.bookingCommitment,
        remaining_amount_c: calculated.remainingServiceAmount,
        local_service_fee_amount_c: calculated.localServiceFee,
        customer_discount_amount_c: calculated.discount,
        customer_tax_amount_c: calculated.applicableTax,
        customer_payable_now_c: calculated.customerPayableNow,
        provider_commission_rate_c: calculated.providerCommissionRate,
        provider_commission_amount_c: calculated.providerCommission,
        provider_settlement_amount_c: calculated.providerSettlement,
        billing_status_c: 'Booking Paid',
        payment_status_c: 'Booking Commitment & Convenience Fee Paid',
        payment_method_c: paymentMethod,
        payment_reference_c: reference,
      };
      const res = await sdk.table('jobs_c').update({ Id: job.Id, ...values });
      if (!res.data?.length) throw new Error(res.messages?.[0] ?? 'Demo payment could not be recorded.');
      toast.success('Demo payment recorded. No real money was charged.');
      setShowDemoQr(false);
      run();
      if (isCustomer) {
        // Send payment/invoice details after every successful customer payment flow,
        // regardless of service category. Delivery still depends on configured email sender.
        await emailInvoiceToCustomer(amount, reference);
      }
    } catch (err) {
      toast.error(err.message ?? 'Demo payment could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  function printInvoice() {
    const invoiceNumber = 'LOCAL-' + String(job.Id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
    const customerName = displayLookup(job.customer_c);
    const providerName = displayLookup(job.technician_c);
    const customerEmail = user?.emailAddress ?? user?.email ?? user?.Email ?? user?.email_c ?? 'Registered email on customer account';
    const serviceName = String(job.Name ?? 'LOCAL Service');
    const servicePrice = Number(job.agreed_price_c ?? 0);
    let acGroups = [];
    try {
      const description = String(serviceRequest?.problem_description_c ?? '');
      const marker = 'LOCAL_AC_REQUEST_JSON:';
      const markerIndex = description.indexOf(marker);
      if (markerIndex >= 0) {
        const payload = JSON.parse(description.slice(markerIndex + marker.length));
        acGroups = Array.isArray(payload.groups) ? payload.groups : [];
      }
    } catch {
      acGroups = [];
    }
    const localFee = Number(job.local_service_fee_amount_c ?? 0);
    const discount = isCarWash && approvedCarWashQuote ? Number(approvedCarWashQuote.discount ?? 0) : Number(job.customer_discount_amount_c ?? 0);
    const tax = Number(job.customer_tax_amount_c ?? 0);
    const bookingCommitment = Number(job.booking_commitment_amount_c ?? 0);
    // Battery Jump Start follows the no-advance policy; ignore legacy calculated commitment fields unless a real payment was recorded.
    const bookingPaid = isBatteryJumpStart ? 0 : bookingCommitment;
    const finalPaid = Number(job.remaining_amount_c === 0 ? job.customer_payable_now_c ?? 0 : 0);
    const platformFee = isCarWash && approvedCarWashQuote ? Number(approvedCarWashQuote.platformFee ?? 25) : 25;
    const totalPayable = isCarWash && approvedCarWashQuote ? Number(approvedCarWashQuote.total) + carWashExtrasTotal : Math.max(0, servicePrice - discount + tax + platformFee);
    const totalPaid = Math.min(totalPayable, bookingPaid + finalPaid);
    const balance = Math.max(0, totalPayable - totalPaid);
    const money = (value) => '₹' + Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const safe = (value) => String(value ?? '—').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const acServiceRows = acGroups.map((group) => `<tr><td>${safe(group.acType + ' — ' + group.serviceType + (group.notes ? ': ' + group.notes : ''))} × ${safe(group.quantity)}</td><td>Included in agreed total</td></tr>`).join('');
    const carWashInvoiceRows = isCarWash ? `${approvedCarWashQuote ? `<tr><td>Customer Quoted Amount</td><td>${money(approvedCarWashQuote.serviceSubtotal)}</td></tr>${Number(approvedCarWashQuote.pickupDropCharge ?? 0) > 0 ? `<tr><td>Pick up and drop</td><td>${money(approvedCarWashQuote.pickupDropCharge)}</td></tr>` : ''}` : `<tr><td>Original fixed Car Wash package</td><td>${money(carWashBasePrice)}</td></tr>`}${carWashApprovedExtras.map((item) => `<tr><td>Additional service / part — ${safe(item.description)} × ${safe(item.quantity)}</td><td>${money(Number(item.unitPrice) * Number(item.quantity))}</td></tr>`).join('')}` : '';
    const serviceRows = isCarWash ? carWashInvoiceRows : isAcService && acServiceRows ? `${acServiceRows}<tr><td>Agreed AC service total</td><td>${money(servicePrice)}</td></tr>` : `<tr><td>Service Offered — ${safe(serviceName)}</td><td>${money(servicePrice)}</td></tr>`;
    const invoiceWindow = window.open('', '_blank', 'width=900,height=700');
    if (!invoiceWindow) {
      toast.error('Please allow pop-ups to generate your invoice.');
      return;
    }
    invoiceWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(invoiceNumber)} - LOCAL Invoice</title><style>
      body{font-family:Arial,sans-serif;color:#21152f;margin:0;padding:28px;background:#fff}
      .wrap{max-width:760px;margin:auto}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #5b21b6;padding-bottom:14px}
      .brand-logo{display:block;width:160px;max-height:58px;height:auto;object-fit:contain;object-position:left center}.muted{color:#666174;font-size:12px;line-height:1.5}
      h1{font-size:20px;margin:20px 0 8px}.meta,.parties{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px;background:#f8f5fc;padding:13px 15px;margin:14px 0;border-radius:6px}
      .parties{grid-template-columns:1fr 1fr}.label{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#777;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin:12px 0 16px}th{background:#4b1a78;color:white;text-align:left}td,th{padding:10px;border:1px solid #e2d8eb;font-size:13px}td:last-child,th:last-child{text-align:right}
      .total{font-weight:bold;background:#f1eaf9}.paid{font-weight:bold;background:#eaf7ee}.notice{margin-top:22px;padding:12px;background:#fff8e7;border:1px solid #e7c66b;font-size:11px;line-height:1.6}
      .actions{margin:18px 0}.actions button{background:#4b1a78;color:white;border:0;border-radius:6px;padding:10px 16px;cursor:pointer}
      @media print{body{padding:0}.actions{display:none}.wrap{max-width:none}}
    </style></head><body><div class="wrap">
      <div class="top"><div><img class="brand-logo" src="${window.location.origin}/local-logo.svg" alt="LOCAL — Happy to Help"></div><div style="text-align:right"><strong>INVOICE &amp; PAYMENT RECEIPT</strong><div class="muted">Status: ${safe(job.payment_status_c === 'Final Payment Paid' ? 'PAID (DEMO)' : 'PAYMENT PENDING')}</div></div></div>
      <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
      <h1>Invoice &amp; booking details</h1><div class="meta">
      <div><div class="label">Invoice number</div><strong>${safe(invoiceNumber)}</strong></div>
      <div><div class="label">Invoice date</div><strong>${safe(new Date().toLocaleDateString('en-IN'))}</strong></div>
      <div><div class="label">Payment method</div><strong>${safe(job.payment_method_c ?? '—')}</strong></div>
      <div><div class="label">Service</div><strong>${safe(serviceName)}</strong></div>
      <div><div class="label">Payment reference</div><strong>${safe(job.payment_reference_c ?? '—')}</strong></div>
      <div><div class="label">Service status</div><strong>${safe(job.status_c ?? 'Completed')}</strong></div></div>
      <div class="parties"><div><div class="label">Customer</div><strong>${safe(customerName)}</strong><div class="muted">${safe(customerEmail)}</div></div><div><div class="label">Service provider</div><strong>${safe(providerName)}</strong><div class="muted">LOCAL service provider</div></div></div>
      <h1>Payment summary</h1><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${serviceRows}
      ${discount > 0 ? `<tr><td>Discount</td><td>−${money(discount)}</td></tr>` : ''}
      ${tax > 0 ? `<tr><td>Applicable taxes</td><td>${money(tax)}</td></tr>` : ''}
      <tr><td>LOCAL Platform Fee</td><td>${money(platformFee)}</td></tr>
      <tr class="total"><td>Total payable</td><td>${money(totalPayable)}</td></tr>
      <tr class="paid"><td>Payment received</td><td>${money(totalPaid)}</td></tr>
      <tr class="total"><td>Balance due</td><td>${money(balance)}</td></tr>
      </tbody></table>
      <div class="notice"><strong>DEMO RECEIPT — NOT A TAX INVOICE.</strong><br>Demo transaction only; no real money was charged. Tax treatment and legal supplier details must be confirmed before live billing.</div>
      <p class="muted" style="margin-top:22px">LOCAL — Happy To Help · Generated from the completed job record.</p>
    </div></body></html>`);
    invoiceWindow.document.close();
    invoiceWindow.focus();
  }

  async function setStatus(status) {
    await updateJob({ status_c: status }, 'Job status changed to ' + status + '.');
  }

  async function submitDriverTripCompletion() {
    if (!isProvider || !isDriverBooking || job.status_c !== 'In Progress') return;
    const { actualStart, actualEnd, distanceKm, otherApprovedCharges: extrasText, notes } = driverTripDraft;
    if (!actualStart || !actualEnd || !String(distanceKm).trim() || !String(notes).trim()) { toast.error('Enter actual start time, actual end time, distance and completion notes before submitting.'); return; }
    const start = new Date(actualStart);
    const end = new Date(actualEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) { toast.error('Actual end time must be later than actual start time.'); return; }
    const durationHours = (end.getTime() - start.getTime()) / 3600000;
    let tariff;
    try { tariff = calculateDriverOnDemandTariff({ pickupDate: actualStart.slice(0, 10), pickupTime: actualStart.slice(11, 16), durationHours }); }
    catch (error) { toast.error(error.message || 'Could not calculate final tariff from actual trip times.'); return; }
    const extrasAmount = Number(extrasText);
    if (!Number.isFinite(extrasAmount) || extrasAmount < 0) { toast.error('Additional charges must be ₹0 or more.'); return; }
    const finalServiceAmount = Number(tariff.serviceAmount) + extrasAmount;
    const finalCustomerTotal = finalServiceAmount + 25;
    const duration = durationHours.toFixed(2) + ' hours';
    const nightHaltAmount = Number(tariff.nightCharge || 0) + Number(tariff.additionalNightAmount || 0);
    const marker = 'LOCAL_DRIVER_TRIP_COMPLETION_JSON:';
    const reviewMarker = 'LOCAL_DRIVER_TRIP_REVIEW_JSON:';
    const existing = String(job.admin_review_note_c ?? '').split(marker)[0].split(reviewMarker)[0].trimEnd();
    const completion = { submittedAt: new Date().toISOString(), actualStartAt: start.toISOString(), actualEndAt: end.toISOString(), duration: String(duration).trim(), durationHours, distanceKm: String(distanceKm).trim(), tariff, nightHaltAmount, otherApprovedCharges: extrasAmount, notes: String(notes).trim(), serviceAmount: finalServiceAmount, localFee: 25, customerTotal: finalCustomerTotal, quoteType: 'Final Quotation', calculatedFrom: 'Driver-submitted actual start/end timestamps' };
    await updateJob({ agreed_price_c: finalServiceAmount, remaining_amount_c: finalServiceAmount, local_service_fee_amount_c: 25, customer_payable_now_c: finalCustomerTotal, payment_status_c: 'Balance Pending', billing_status_c: 'Ready for Confirmation', payout_status_c: 'Not Eligible', status_c: 'Completed', returned_at_c: new Date().toISOString(), completion_requested_at_c: new Date().toISOString(), admin_review_note_c: existing + (existing ? '\\n' : '') + marker + JSON.stringify(completion) }, 'Trip completion submitted to LOCAL Customer Care for review. The customer will not be asked to pay until Admin approves the bill and records customer consent.');
  }

  async function startProviderTravel() {
    if ((!isProvider && !isAdmin) || job.status_c !== 'Assigned') return;
    if (!navigator.geolocation) { toast.error('This browser does not support location sharing.'); return; }
    await updateJob({ provider_travel_status_c: 'On The Way' }, 'Travel started. Allow location access so the customer can track your latest position.');
  }

  async function markProviderArrived() {
    if (!isProvider || job.provider_travel_status_c !== 'On The Way') return;
    if (job.service_start_otp_verified_at_c) { toast.error('This booking OTP has already been used.'); return; }
    let otpRecord = job.service_start_otp_c;
    const currentOtp = readServiceStartOtp(otpRecord);
    if (!currentOtp || Date.now() > new Date(currentOtp.expiresAt).getTime() || Number(currentOtp.attempts ?? 0) >= 5) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const now = new Date();
      otpRecord = JSON.stringify({ code: String((random[0] % 900000) + 100000), expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), attempts: 0, generatedAt: now.toISOString() });
    }
    await updateJob({ provider_travel_status_c: 'Arrived', service_start_otp_c: otpRecord }, 'Arrival recorded. The customer can now view the service-start OTP on their booking. Verify the code before beginning work.');
  }

  async function generateCarEssentialsDeliveryOtp() {
    if (!isAdmin || !isCarEssentialsDelivery || job.status_c !== 'Assigned') return;
    if (!['Ready for Delivery', 'Out for Delivery'].includes(job.provider_travel_status_c)) { toast.error('Generate the delivery OTP only after the Service Provider has prepared the order.'); return; }
    setWorking(true);
    try {
      // Some older test bookings have duplicate job rows for the same request/assignment.
      // Customer and provider may open different row IDs, so use one OTP across those siblings.
      const requestId = job.request_c?.Id ?? job.request_c;
      const responseId = job.response_c?.Id ?? job.response_c;
      const requestResult = await sdk.table('service_requests_c').select(['Id', 'problem_description_c']).get(requestId);
      if (!requestResult.success || !requestResult.data) throw new Error(requestResult.message || 'Could not load the customer request OTP.');
      const description = String(requestResult.data.problem_description_c ?? '');
      const marker = 'LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:';
      const markerIndex = description.lastIndexOf(marker);
      let approval = readCarEssentialsApproval(description);
      if (!approval || !approval.quoteId || !Number.isFinite(Number(approval.total))) throw new Error('The customer-approved quote record is missing or unreadable. Open the service request and confirm that the quote was approved before generating a delivery OTP.');
      const otp = /^\d{6}$/.test(String(approval.otp ?? '')) && approval.otpUsed !== true && (!approval.otpExpiresAt || Date.now() <= new Date(approval.otpExpiresAt).getTime()) ? String(approval.otp) : String(Math.floor(100000 + Math.random() * 900000));
      if (String(approval.otp ?? '') !== otp) {
        const updatedApproval = { ...approval, otp, otpExpiresAt: approval.otpExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), otpUsed: false };
        const updatedDescription = description.slice(0, markerIndex) + marker + JSON.stringify(updatedApproval);
        const requestSaved = await sdk.table('service_requests_c').update({ Id: requestId, problem_description_c: updatedDescription });
        if (!requestSaved.success || !requestSaved.data?.length) throw new Error(requestSaved.messages?.[0] || 'Could not save the authoritative customer delivery OTP.');
        approval = updatedApproval;
      }
      const related = await sdk.table('jobs_c').select(['Id', 'request_c', 'response_c', 'service_start_otp_c', 'service_start_otp_verified_at_c']).where(eq('request_c', requestId)).page(1, 100).fetch();
      if (!related.success) throw new Error(related.message || 'Could not check related booking records.');
      const siblings = (related.data ?? []).filter((item) => String(item.Id) === String(job.Id) || (responseId && String(item.response_c?.Id ?? item.response_c ?? '') === String(responseId)));
      if (!siblings.some((item) => String(item.Id) === String(job.Id))) throw new Error('This job could not be matched to its accepted provider assignment. Refresh and try again.');
      for (const sibling of siblings) {
        const saved = await sdk.table('jobs_c').update({ Id: sibling.Id, service_start_otp_c: otp, service_start_otp_verified_at_c: sibling.service_start_otp_verified_at_c ?? null });
        if (!saved.success || !saved.data?.length) throw new Error(saved.messages?.[0] || 'Could not synchronize the customer-approved delivery OTP across this booking. Refresh before retrying.');
      }
      toast.success('Delivery OTP synchronized from the customer-approved request to the booking records. Refresh both screens before retrying.');
      await run();
    } catch (error) {
      toast.error(error.message || 'Could not synchronize the delivery OTP.');
    } finally {
      setWorking(false);
    }
  }

  async function verifyCarEssentialsDeliveryOtp() {
    if (!isProvider || !isCarEssentialsDelivery || job.status_c !== 'Assigned' || job.provider_travel_status_c !== 'Out for Delivery') return;
    if (providerOtpDraft.length !== 6 || !Array.from(providerOtpDraft).every((digit) => digit >= '0' && digit <= '9')) {
      toast.error('Enter the six-digit delivery OTP shared by the customer.');
      return;
    }
    setWorking(true);
    try {
      // Always validate against the latest database values. Older test bookings can
      // have duplicate job rows, so the customer may see a different row's OTP.
      const requestId = job.request_c?.Id ?? job.request_c;
      const responseId = job.response_c?.Id ?? job.response_c;
      const technicianId = job.technician_c?.Id ?? job.technician_c;
      const requestResult = await sdk.table('service_requests_c').select(['Id', 'problem_description_c']).get(requestId);
      if (!requestResult.success || !requestResult.data) throw new Error(requestResult.message || 'Could not load the customer-approved delivery OTP.');
      const approval = readCarEssentialsApproval(requestResult.data.problem_description_c);
      if (!approval || String(approval.otp) !== providerOtpDraft) {
        toast.error('This code does not match the current customer-approved delivery OTP. Ask the customer to open the job screen and refresh.');
        return;
      }
      if (approval.otpExpiresAt && Date.now() > new Date(approval.otpExpiresAt).getTime()) {
        toast.error('The delivery OTP has expired. Please contact LOCAL Admin to issue a replacement.');
        return;
      }
      if (approval.otpUsed === true) {
        toast.error('This delivery OTP has already been used. Refresh the booking or contact LOCAL Admin.');
        return;
      }
      const related = await sdk.table('jobs_c')
        .select(['Id', 'request_c', 'response_c', 'technician_c', 'service_start_otp_c', 'service_start_otp_verified_at_c'])
        .where(eq('request_c', requestId)).page(1, 100).fetch();
      if (!related.success) throw new Error(related.message || 'Could not refresh the delivery OTP. Please retry.');
      const sameProviderJobs = (related.data ?? []).filter((item) => {
        const itemResponseId = item.response_c?.Id ?? item.response_c;
        const itemTechnicianId = item.technician_c?.Id ?? item.technician_c;
        return String(item.Id) === String(job.Id) ||
          (String(itemTechnicianId ?? '') === String(technicianId ?? '') &&
            (String(itemResponseId ?? '') === String(responseId ?? '') || !itemResponseId || !responseId));
      });
      const currentRecord = sameProviderJobs.find((item) => String(item.Id) === String(job.Id));
      if (!currentRecord) throw new Error('This job could not be matched to the current provider assignment. Refresh and try again.');
      // The request approval is the authoritative OTP source. Older job rows may not
      // have been synchronized yet, so do not reject a valid customer-approved code.
      const now = new Date().toISOString();
      // Reconcile this provider row to the exact code the customer has, then mark delivery.
      const result = await sdk.table('jobs_c').update({
        Id: job.Id,
        service_start_otp_c: providerOtpDraft,
        service_start_otp_verified_at_c: now,
        provider_travel_status_c: 'Delivered — Awaiting Customer Confirmation',
        completion_requested_at_c: now,
        billing_status_c: 'Delivered — Awaiting Customer Confirmation',
      });
      if (!result?.success || !result.data?.length) throw new Error(result?.messages?.[0] || result?.message || 'Delivery could not be recorded. Refresh the job and retry.');
      // Mark the request-side OTP used so it cannot be reused on another duplicate job.
      const updatedApproval = { ...approval, otpUsed: true, otpUsedAt: now };
      const description = String(requestResult.data.problem_description_c ?? '');
      const marker = 'LOCAL_CAR_ESSENTIALS_APPROVAL_JSON:';
      const markerIndex = description.lastIndexOf(marker);
      if (markerIndex >= 0) {
        const updatedDescription = description.slice(0, markerIndex) + marker + JSON.stringify(updatedApproval);
        const approvalSaved = await sdk.table('service_requests_c').update({ Id: requestId, problem_description_c: updatedDescription });
        if (!approvalSaved.success || !approvalSaved.data?.length) toast.error('Delivery was recorded, but the OTP usage record could not be updated. Notify LOCAL Admin.');
      }
      toast.success('Delivery OTP verified. Order marked delivered; waiting for customer receipt confirmation.');
      setProviderOtpDraft('');
      await run();
    } catch (error) {
      toast.error(error.message || 'Could not verify the delivery OTP. Please refresh and retry.');
    } finally {
      setWorking(false);
    }
  }

  async function verifyServiceStartOtp() {
    if ((!isProvider && !isAdmin) || (isCarCare ? inspectionStatus !== 'Confirmed' : job.provider_travel_status_c !== 'Arrived')) return;
    if (providerOtpDraft.length !== 6 || !Array.from(providerOtpDraft).every((digit) => digit >= '0' && digit <= '9')) {
      toast.error('Enter the six-digit OTP shown in the customer’s LOCAL app.');
      return;
    }
    const otpRecord = readServiceStartOtp(job.service_start_otp_c);
    if (!otpRecord) { toast.error('No active service-start OTP exists. Ask the customer to refresh the booking or contact LOCAL Admin for a resend.'); return; }
    if (otpRecord.expiresAt && Date.now() > new Date(otpRecord.expiresAt).getTime()) { toast.error('This OTP has expired. Ask LOCAL Admin to issue a new code.'); return; }
    if (Number(otpRecord.attempts ?? 0) >= 5) { toast.error('This OTP is locked after five incorrect attempts. Ask LOCAL Admin to issue a new code.'); return; }
    if (providerOtpDraft !== String(otpRecord.code)) {
      const updatedOtp = JSON.stringify({ ...otpRecord, attempts: Number(otpRecord.attempts ?? 0) + 1 });
      await updateJob({ service_start_otp_c: updatedOtp }, 'Incorrect OTP attempt recorded.');
      toast.error('Incorrect OTP. Please check the customer-shared code.');
      return;
    }
    await updateJob({ service_start_otp_verified_at_c: new Date().toISOString(), status_c: 'In Progress' }, 'OTP verified. Service start recorded.');
    setProviderOtpDraft('');
  }

  useEffect(() => {
    if (!job?.Id || job.status_c === 'Completed' || job.status_c === 'Cancelled' || isCarEssentialsDelivery) return;
    let active = true;
    let locationBusy = false;
    const readLatestLocation = async () => {
      try {
        const result = await sdk.table('jobs_c').select(['Id','provider_latitude_c','provider_longitude_c','provider_location_updated_at_c','provider_travel_status_c','service_start_otp_verified_at_c','status_c']).get(job.Id);
        if (active && result.success && result.data) setLiveLocation(result.data);
      } catch { /* Keep the last known location visible if a refresh fails. */ }
    };
    const publishProviderLocation = () => {
      if (!active || !isProvider || job.provider_travel_status_c !== 'On The Way' || locationBusy || !navigator.geolocation) return;
      locationBusy = true;
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const now = new Date().toISOString();
          const result = await sdk.table('jobs_c').update({ Id: job.Id, provider_latitude_c: position.coords.latitude, provider_longitude_c: position.coords.longitude, provider_location_updated_at_c: now });
          if (active && result.data?.length) setLiveLocation((current) => ({ ...(current ?? job), provider_latitude_c: position.coords.latitude, provider_longitude_c: position.coords.longitude, provider_location_updated_at_c: now, provider_travel_status_c: 'On The Way' }));
        } catch { /* Location can retry on the next interval. */ }
        finally { locationBusy = false; }
      }, () => { locationBusy = false; }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
    };
    readLatestLocation();
    if (isCustomer || isAdmin) {
      const poll = window.setInterval(readLatestLocation, 5000);
      return () => { active = false; window.clearInterval(poll); };
    }
    if (isProvider && job.provider_travel_status_c === 'On The Way') {
      publishProviderLocation();
      const poll = window.setInterval(publishProviderLocation, 10000);
      return () => { active = false; window.clearInterval(poll); };
    }
    return () => { active = false; };
  }, [job?.Id, job?.status_c, job?.provider_travel_status_c, isProvider, isCustomer, isAdmin, isCarEssentialsDelivery]);

  async function recordProviderSettlement() {
    if (!isAdmin || !isPaid || job.status_c !== 'Completed' || !job.customer_completion_confirmed_at_c) {
      toast.error('Settlement can be recorded only after customer payment and completion are confirmed.');
      return;
    }
    if (job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review') {
      toast.error('Resolve the open dispute before recording provider settlement.');
      return;
    }
    const reference = window.prompt('Enter the bank/UPI payout reference for the provider settlement:');
    if (!reference || !reference.trim()) return;
    await updateJob({ payout_status_c: 'Released', admin_review_note_c: [job.admin_review_note_c, 'Provider settlement recorded by Admin on ' + new Date().toLocaleString('en-IN') + '; payout reference: ' + reference.trim()].filter(Boolean).join('\n') }, 'Provider settlement recorded as paid. This records an external payout; it does not transfer money automatically.');
  }

  async function approveDriverFinalBillAndRecordConsent() {
    if (!isAdmin || !isDriverBooking || !driverTripCompletion || job.status_c !== 'Completed') return;
    const consent = window.confirm('Have you called the customer, explained the final trip bill including all additional charges and the ₹25 LOCAL convenience fee, and received their explicit approval? Choose OK only after the customer agrees.');
    if (!consent) return;
    const consentNote = window.prompt('Record how customer consent was obtained (e.g. phone call) and any brief notes:');
    if (!consentNote || !consentNote.trim()) {
      toast.error('Record the customer consent method before approving this bill.');
      return;
    }
    const marker = 'LOCAL_DRIVER_TRIP_REVIEW_JSON:';
    const existing = String(job.admin_review_note_c ?? '').split(marker)[0].trimEnd();
    const review = { approved: true, customerConsentRecorded: true, reviewedAt: new Date().toISOString(), reviewedBy: displayLookup(user?.Name ?? user?.name ?? user?.emailAddress ?? 'LOCAL Admin'), customerTotal: Number(driverTripCompletion.customerTotal), consentMethodAndNotes: consentNote.trim() };
    await updateJob({ admin_review_note_c: existing + (existing ? '\\n' : '') + marker + JSON.stringify(review), billing_status_c: 'Payment Due After Delivery', payment_status_c: 'Balance Pending' }, 'Final trip bill approved and customer consent recorded. The final payment is now available to the customer.');
  }

  async function returnDriverFinalBillForCorrection() {
    if (!isAdmin || !isDriverBooking || !driverTripCompletion) return;
    const reason = window.prompt('Explain what the driver must correct in the final trip bill:');
    if (!reason || !reason.trim()) return;
    const marker = 'LOCAL_DRIVER_TRIP_REVIEW_JSON:';
    const existing = String(job.admin_review_note_c ?? '').split(marker)[0].trimEnd();
    const review = { approved: false, customerConsentRecorded: false, returnedAt: new Date().toISOString(), returnedBy: displayLookup(user?.Name ?? user?.name ?? user?.emailAddress ?? 'LOCAL Admin'), correctionReason: reason.trim() };
    await updateJob({ admin_review_note_c: existing + (existing ? '\\n' : '') + marker + JSON.stringify(review), status_c: 'In Progress', payment_status_c: 'Balance Pending', billing_status_c: 'Ready for Confirmation' }, 'Final bill returned to the driver for correction. Customer payment remains locked.');
  }

  async function adminResolveCompletion() {
    const note = window.prompt('Admin review note (required):');
    if (!note || !note.trim()) return;
    await updateJob({ status_c: 'Completed', customer_completion_confirmed_at_c: new Date().toISOString(), payment_status_c: 'Balance Pending', payout_status_c: 'Not Eligible', admin_review_note_c: note.trim() }, 'Admin review recorded. Customer payment remains due.');
  }

  if (loading) return <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" />;
  if (error || !job) return <Card className="border-l-4 border-destructive p-6">This job could not be found. <Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card>;

  return (
    <div>
      <PageHeader
        eyebrow={tr('Job', language)}
        title={job.Name}
        description={isCarWash ? 'Car Wash evidence, customer confirmation and post-return payment.' : isAcService ? 'AC service progress, customer confirmation and post-service payment.' : tr('Manage the confirmed service job and its progress.', language)}
        action={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => run()} disabled={loading}><ApperIcon name="RefreshCw" size={16} className={loading ? 'animate-spin' : ''} /> Refresh</Button><Button asChild variant="outline"><Link to="/jobs"><ApperIcon name="ArrowLeft" size={16} /> {tr('Back to jobs', language)}</Link></Button></div>}
      />
      <Card className="border-l-4 border-success p-5 md:p-7">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            [tr('Service request', language), displayLookup(job.request_c)],
            [tr('Accepted offer', language), displayLookup(job.response_c)],
            [tr('Customer', language), displayLookup(job.customer_c)],
            [tr('Service Provider', language), displayLookup(job.technician_c)],
            [tr('Original provider quote', language), displayMoney(job.original_provider_quote_c ?? job.agreed_price_c)],
            [tr('Final agreed price', language), displayMoney(displayedAgreedPrice)],
            ...(isBatteryJumpStart ? [[tr('Service amount due after completion', language), displayMoney(job.agreed_price_c)], [tr('LOCAL Platform Fee', language), displayMoney(25)], [tr('Total due after completion', language), displayMoney(batteryJumpStartTotal)]] : isPayAfterCompletion ? [[tr('Amount due after customer confirmation', language), displayMoney(displayedAmountDue)]] : [[tr('Remaining amount', language), displayMoney(job.remaining_amount_c ?? billing.remainingServiceAmount)], [tr('Convenience Fee', language), displayMoney(job.local_service_fee_amount_c ?? billing.localServiceFee)], [tr('Customer discount', language), displayMoney(job.customer_discount_amount_c ?? billing.discount)], [tr('Applicable tax', language), job.customer_tax_amount_c == null ? tr('To be calculated as applicable', language) : displayMoney(job.customer_tax_amount_c)]]),
            ...(isProvider || isAdmin ? [[tr('Provider completed jobs before booking', language), String(job.provider_completed_jobs_count_c ?? 0)], [tr('LOCAL provider commission', language), displayMoney(job.provider_commission_amount_c ?? billing.providerCommission)], [tr('Provider settlement', language), displayMoney(job.provider_settlement_amount_c ?? billing.providerSettlement)]] : []),
            [tr('Billing status', language), <StatusBadge value={job.billing_status_c ?? 'Ready for Confirmation'} />],
            [tr('Scheduled for', language), formatTimestamp(job.scheduled_at_c)],
            [tr('Job status', language), <StatusBadge value={job.status_c} />],
            [tr('Payment status', language), <StatusBadge value={job.payment_status_c ?? 'Unpaid'} />],
            ...(job.payment_method_c ? [['Payment method', job.payment_method_c]] : []),
            ...(job.payment_reference_c ? [['Payment reference', job.payment_reference_c]] : []),
            ...(isCarCare ? [['Payout status', <StatusBadge value={job.payout_status_c ?? 'Not Eligible'} />], ['Dispute status', <StatusBadge value={job.dispute_status_c ?? 'None'} />]] : []),
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
              <div className="mt-2 text-sm leading-6">{value}</div>
            </div>
          ))}
        </div>

        {!isCarEssentialsDelivery && (isProvider || isCustomer || isAdmin) && job.status_c !== 'Completed' && job.status_c !== 'Cancelled' && <section className="mt-7 rounded-xl border border-border p-4 md:p-5">
          <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><ApperIcon name="MapPinned" size={22} /></div><div className="min-w-0 flex-1"><h2 className="font-heading text-lg font-semibold">{isCarCare ? (isPickupDrop ? 'Pick-up & Drop tracking and service-start OTP' : 'Service-start OTP confirmation') : 'Live provider tracking & service-start OTP'}</h2><p className="mt-1 text-sm text-muted-foreground">{isCarCare && !isPickupDrop ? 'Workshop Visit: travel tracking is not required. The customer must confirm vehicle condition and the provider must verify the OTP before service starts.' : 'Location sharing runs only while the provider is travelling. Customer verification is required before service can start.'}</p></div>{isPickupDrop && <StatusBadge value={(liveLocation?.provider_travel_status_c ?? job.provider_travel_status_c) || 'Not Started'} />}</div>
          {(isProvider || isAdmin) && job.status_c === 'Assigned' && (job.provider_travel_status_c ?? liveLocation?.provider_travel_status_c) !== 'On The Way' && <div className="mt-4"><Button onClick={startProviderTravel} disabled={working || (isCarCare && inspectionStatus !== 'Confirmed')}><ApperIcon name="Navigation" size={16} /> {working ? 'Starting…' : 'Start Travel & Share Location'}</Button>{isCarCare && inspectionStatus !== 'Confirmed' && <p className="mt-2 text-xs text-muted-foreground">For Pick-up & Drop, confirm the vehicle condition report before starting travel.</p>}</div>}
          {!isPickupDrop && !isCarCare && (isProvider || isAdmin) && job.status_c === 'Assigned' && job.provider_travel_status_c !== 'Arrived' && <p className="mt-3 text-sm text-muted-foreground">Reach the customer and use the single “I Have Arrived” button below to record arrival and enable the service-start process.</p>}
          {(isProvider || isAdmin) && (job.provider_travel_status_c ?? liveLocation?.provider_travel_status_c) === 'On The Way' && <div className="mt-4 space-y-3"><p className="text-sm">Location sharing is active. Keep this job screen open and allow location access. The latest position is saved about every 10 seconds while this page is active.</p>{serviceRequest?.location_c && <div className="rounded-md border bg-background p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Customer destination & landmark</p><p className="mt-1 font-medium">{serviceRequest.location_c}</p>{serviceRequest.problem_description_c && serviceRequest.problem_description_c.split('LOCAL_RSA_APPROVAL_JSON:')[0].trim() && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">Booking instructions: {serviceRequest.problem_description_c.split('LOCAL_RSA_APPROVAL_JSON:')[0].trim()}</p>}{serviceRequest.latitude_c != null && serviceRequest.longitude_c != null && <a className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary underline" href={`https://www.google.com/maps/dir/?api=1&destination=${serviceRequest.latitude_c},${serviceRequest.longitude_c}&travelmode=driving`} target="_blank" rel="noreferrer"><ApperIcon name="Navigation" size={16} /> Navigate to customer in Google Maps</a>}</div>}<Button onClick={markProviderArrived} disabled={working}><ApperIcon name="MapPinCheck" size={16} /> {working ? 'Saving…' : 'I Have Arrived'}</Button></div>}
          {isCustomer && job.status_c === 'Assigned' && (job.provider_travel_status_c ?? liveLocation?.provider_travel_status_c) === 'Arrived' && !job.service_start_otp_verified_at_c && !isCarEssentialsDelivery && <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4"><h3 className="font-semibold">Your service-start OTP</h3>{(() => { const otp = readServiceStartOtp(job.service_start_otp_c); const valid = otp && Date.now() <= new Date(otp.expiresAt).getTime() && Number(otp.attempts ?? 0) < 5; return valid ? <><p className="mt-1 text-sm text-muted-foreground">Share this six-digit code with your Service Provider in person only after they arrive. The provider must verify it before starting work.</p><p className="mt-3 text-center font-mono text-3xl font-bold tracking-[0.35em]" aria-label="Service-start OTP">{otp.code}</p><p className="mt-2 text-center text-xs text-muted-foreground">Expires {formatTimestamp(otp.expiresAt)}</p></> : <p className="mt-1 text-sm text-muted-foreground">Your OTP is not available or has expired. Please contact LOCAL Admin to resend it.</p>; })()}</div>}
          {isAdmin && job.status_c === 'Assigned' && !job.service_start_otp_verified_at_c && !isCarEssentialsDelivery && <div className="mt-4 rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h3 className="font-semibold">Service-start OTP support</h3><p className="mt-1 text-sm text-muted-foreground">The customer can see the OTP on this booking. Admin can resend it if the customer’s code is missing, expired, or locked. Each code is valid for 24 hours; resending invalidates the previous code.</p><Button className="mt-3" onClick={generateServiceStartOtp} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> Resend / Replace OTP</Button>{(() => { const otp = readServiceStartOtp(job.service_start_otp_c); return otp && otp.expiresAt && Date.now() <= new Date(otp.expiresAt).getTime() && Number(otp.attempts ?? 0) < 5 ? <p className="mt-2 text-sm">Current code expires {formatTimestamp(otp.expiresAt)} · attempts {otp.attempts}/5</p> : null; })()}</div>}
          {(isProvider || isAdmin) && (isCarCare ? inspectionStatus === 'Confirmed' && job.status_c === 'Assigned' : (job.provider_travel_status_c ?? liveLocation?.provider_travel_status_c) === 'Arrived') && !job.service_start_otp_verified_at_c && <div className="mt-4 rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h3 className="font-semibold">Verify customer service-start OTP</h3><p className="mt-1 text-sm text-muted-foreground">Enter the six-digit code provided by the customer. Service cannot start until the current, unexpired code matches.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={providerOtpDraft} onChange={(event) => setProviderOtpDraft(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-center text-lg tracking-[0.3em] sm:max-w-48" placeholder="6-digit OTP" aria-label="Admin-issued service-start OTP" /><Button onClick={verifyServiceStartOtp} disabled={working || providerOtpDraft.length !== 6}><ApperIcon name="ShieldCheck" size={16} /> Verify & Start Service</Button></div></div>}
          {isCustomer && (liveLocation?.provider_travel_status_c ?? job.provider_travel_status_c) === 'On The Way' && <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4"><div className="flex items-center gap-2 font-semibold"><ApperIcon name="Navigation" size={17} /> Your Service Provider is on the way</div>{liveLocation?.provider_latitude_c != null && liveLocation?.provider_longitude_c != null ? <><p className="mt-2 text-sm text-muted-foreground">Last location update: {formatTimestamp(liveLocation.provider_location_updated_at_c)}</p><a className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary underline" href={`https://www.google.com/maps/dir/?api=1&origin=${liveLocation.provider_latitude_c},${liveLocation.provider_longitude_c}&destination=${serviceRequest?.latitude_c ?? ''},${serviceRequest?.longitude_c ?? ''}&travelmode=driving`} target="_blank" rel="noreferrer"><ApperIcon name="MapPinned" size={16} /> View provider route and road ETA in Google Maps</a></> : <p className="mt-2 text-sm text-muted-foreground">Waiting for the provider's first GPS update. Location permission and an active internet connection are required.</p>}<p className="mt-2 text-xs text-muted-foreground">This trial view refreshes the latest saved position every 5 seconds. It is not a turn-by-turn moving map yet.</p></div>}
          {isCustomer && job.status_c === 'Assigned' && !job.service_start_otp_verified_at_c && !isCarEssentialsDelivery && <div className="mt-4 rounded-lg border border-success-border bg-success-muted p-4">{(() => { const otp = readServiceStartOtp(job.service_start_otp_c); const activeOtp = otp && (!otp.expiresAt || Date.now() <= new Date(otp.expiresAt).getTime()) && Number(otp.attempts ?? 0) < 5; return <><div className="flex items-center gap-2 font-semibold text-success"><ApperIcon name="ShieldCheck" size={18} /> Service-start OTP {activeOtp ? 'ready' : 'being prepared'}</div><p className="mt-1 text-sm text-muted-foreground">Your OTP is available before arrival. Share it only when your assigned Service Provider is physically present and you are ready for the service to begin. The provider cannot start until arrival/inspection requirements are met and the code is verified.</p>{activeOtp ? <><p className="mt-3 text-center text-3xl font-bold tracking-[0.35em] text-success">{otp.code}</p>{otp.expiresAt && <p className="mt-1 text-center text-xs text-muted-foreground">Valid until {formatTimestamp(otp.expiresAt)}</p>}</> : <p className="mt-3 text-sm font-medium text-highlight">If the code does not appear after refreshing, contact LOCAL Admin for a resend.</p>}<p className="mt-2 text-center text-xs text-muted-foreground">Visible in the LOCAL app; automatic SMS/WhatsApp delivery is not connected yet.</p></>; })()}</div>}
          {(isCustomer || isAdmin) && (liveLocation?.provider_travel_status_c ?? job.provider_travel_status_c) === 'Arrived' && !liveLocation?.provider_latitude_c && <p className="mt-3 text-sm text-muted-foreground">Provider marked arrival. GPS location is unavailable or has not been recorded yet.</p>}
          {(liveLocation?.service_start_otp_verified_at_c ?? job.service_start_otp_verified_at_c) && <p className="mt-4 rounded-lg border border-success-border bg-success-muted p-3 text-sm font-medium text-success">Service-start OTP verified at {formatTimestamp(liveLocation?.service_start_otp_verified_at_c ?? job.service_start_otp_verified_at_c)}. Job status: {liveLocation?.status_c ?? job.status_c}.</p>}
        </section>}

        {(isCustomer || isAdmin) && isPaid && (
          <div className="mt-7 rounded-lg border border-success-border bg-success-muted p-4">
            <div className="font-semibold text-success">Invoice available</div>
            <p className="mt-1 text-sm text-success">{isAdmin ? 'Final payment is recorded. Generate a printable invoice / payment receipt for this service.' : 'Your final payment is recorded. Generate a printable invoice / payment receipt for this service.'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={printInvoice}>
                <ApperIcon name="FileDown" size={16} /> Download Invoice / Save as PDF
              </Button>
              {isCustomer && <Button type="button" variant="outline" onClick={() => emailInvoiceToCustomer(Number(job.customer_payable_now_c ?? job.agreed_price_c ?? 0), job.payment_reference_c ?? '')} disabled={emailingInvoice}>
                <ApperIcon name="Mail" size={16} /> {emailingInvoice ? 'Emailing invoice…' : 'Email Invoice'}
              </Button>}
            </div>
            <p className="mt-2 text-xs text-success">Invoice email uses the configured LOCAL email service. If email sending is not configured, the app will show a warning rather than claim delivery.</p>
          </div>
        )}

        {isCarWash && (isProvider || isCustomer || isAdmin) && (
          <section className="mt-7 space-y-4 border-t border-border pt-5">
            <div>
              <h2 className="font-heading text-xl font-semibold">Car Wash Bill & Additional Work</h2>
              <p className="mt-1 text-sm text-muted-foreground">The original package price stays fixed. Any additional service or part must be proposed in LOCAL and approved by the customer before work begins.</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              {approvedCarWashQuote ? <>
                <div className="flex items-center justify-between gap-3 text-sm"><span>Customer Quoted Amount</span><strong>{displayMoney(carWashDisplayedQuoteSubtotal)}</strong></div>
                {Number(approvedCarWashQuote.discount ?? 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span>Discount Offered</span><strong>−{displayMoney(approvedCarWashQuote.discount)}</strong></div>}
                {Number(approvedCarWashQuote.pickupDropCharge ?? 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span>Pick up and drop</span><strong>+{displayMoney(approvedCarWashQuote.pickupDropCharge)}</strong></div>}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm"><span>LOCAL Platform Fee</span><strong>{displayMoney(approvedCarWashQuote.platformFee ?? 25)}</strong></div>
              </> : <>
                <div className="flex items-center justify-between gap-3"><span className="text-sm">Original fixed Car Wash price</span><strong>{displayMoney(carWashBasePrice)}</strong></div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm"><span>LOCAL Platform Fee</span><strong>{displayMoney(25)}</strong></div>
              </>}
              {carWashApprovedExtras.map((item) => <div key={item.id} className="mt-2 flex items-start justify-between gap-3 text-sm"><span>{item.description} × {item.quantity}</span><strong>{displayMoney(Number(item.unitPrice) * Number(item.quantity))}</strong></div>)}
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3"><span className="font-semibold">Total payable</span><strong className="text-xl">{displayMoney(carWashCustomerTotal)}</strong></div>
              {carWashPendingExtras.length > 0 && <div className="mt-4 rounded-md border border-highlight/30 bg-highlight/5 p-3"><p className="font-semibold">Revised bill awaiting customer approval</p>{carWashPendingExtras.map((item) => <div key={item.id} className="mt-2 flex items-start justify-between gap-3 text-sm"><span>{item.description} × {item.quantity}</span><strong>{displayMoney(Number(item.unitPrice) * Number(item.quantity))}</strong></div>)}<p className="mt-2 text-xs text-muted-foreground">Do not perform the proposed additional work until the customer approves it in LOCAL.</p>{isCustomer && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => respondToCarWashRevision(true)} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> Approve revised bill</Button><Button variant="outline" onClick={() => respondToCarWashRevision(false)} disabled={working}>Decline extra work</Button></div>}</div>}
              {carWashItems.filter((item) => item.status === 'Rejected').map((item) => <p key={item.id} className="mt-2 text-xs text-muted-foreground">Declined: {item.description} — not included in the bill.</p>)}
              {carWashItems.filter((item) => item.receipts?.length).map((item) => <div key={`receipt-${item.id}`} className="mt-2 rounded-md border border-border/70 p-3"><p className="text-xs font-semibold">Purchase receipt · {item.description}</p><div className="mt-1 space-y-1">{item.receipts.map((receipt, index) => <div key={`${item.id}-${receipt.Id ?? receipt.Name}-${index}`} className="flex items-center gap-2 text-sm"><ApperIcon name="FileText" size={14} /><span className="truncate">{receipt.Name ?? 'Purchase receipt'}</span>{receipt.url && <a className="text-primary underline" href={receipt.url} target="_blank" rel="noreferrer">Open</a>}</div>)}</div><p className="mt-1 text-xs text-muted-foreground">Attached to the job for reference.</p></div>)}
              {isProvider && job.status_c !== 'Completed' && job.status_c !== 'Cancelled' && <div className="mt-4 border-t border-border pt-4"><h3 className="font-semibold">Propose additional service / part</h3><p className="mt-1 text-sm text-muted-foreground">If you discussed the extra over a phone call, record the exact item and price here. The customer must approve it in the app before you begin the extra work.</p><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_90px]"><div><label className="mb-1 block text-sm font-medium">Service / part description</label><input value={carWashExtraDescription} onChange={(event) => setCarWashExtraDescription(event.target.value)} maxLength={180} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. Purchased cleaning compound" /></div><div><label className="mb-1 block text-sm font-medium">Unit price (₹)</label><input type="number" min="0" step="1" value={carWashExtraPrice} onChange={(event) => setCarWashExtraPrice(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="150" /></div><div><label className="mb-1 block text-sm font-medium">Quantity</label><input type="number" min="1" step="1" value={carWashExtraQuantity} onChange={(event) => setCarWashExtraQuantity(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div></div><div className="mt-4 rounded-md border border-dashed border-border p-3"><label className="mb-1 block text-sm font-medium">Purchase bill / receipt</label><p className="mb-3 text-xs text-muted-foreground">Upload a receipt photo or PDF for any purchased part. The attachment is saved with this job and shared with the customer for review.</p><FilePicker value={carWashReceiptFiles} onChange={setCarWashReceiptFiles} maxFiles={3} fieldConfig={{ supportedExtensions: 'pdf,jpg,jpeg,png', supportMultipleValues: true, maxValue: 10240 }} /></div><Button className="mt-3" onClick={submitCarWashExtra} disabled={working || carWashPendingExtras.length > 0}><ApperIcon name="Send" size={16} /> Send revised bill for approval</Button></div>}
            </div>
            {job.status_c === 'Completed' && !isPaid && isProvider && <div className="rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h3 className="font-semibold">Payment status: Awaiting customer payment</h3><p className="mt-1 text-sm text-muted-foreground">The customer sees this same bill and the same demo QR placeholder. No real payment is collected in this test phase.</p><div className="mx-auto my-4 flex w-fit flex-col items-center rounded-md border bg-white p-3"><img src={LOCAL_PAYTM_UPI_QR} alt="Scannable Paytm UPI QR code for 8587034884@ptsbi" className="h-44 w-44 object-contain" /><p className="mt-2 text-xs font-semibold text-slate-900">Scan with any UPI app</p><p className="text-xs text-slate-600">8587034884@ptsbi</p></div><p className="text-xs text-muted-foreground">This is a non-scannable test placeholder, not a payment request.</p></div>}
            {job.status_c === 'Completed' && isPaid && isProvider && <div className="rounded-lg border border-success-border bg-success-muted p-4"><h3 className="font-semibold text-success">Payment Successful</h3><p className="mt-1 text-sm text-success">The shared job record confirms demo payment of {displayMoney(job.customer_payable_now_c)}. No real money was collected.</p></div>}
          </section>
        )}

        {isCarCare && (isProvider || isAdmin || (isCustomer && !savedInspection)) && (
          <section className="mt-7 space-y-4 border-t border-border pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">Vehicle Handover — Customer Confirmation Required</h2><p className="mt-1 text-sm text-muted-foreground">To start the job, upload all six vehicle photos, enter the registration number and condition notes, then send the report to the customer. Do not start the service until the customer confirms the photos and condition report.</p></div><StatusBadge value={inspectionStatus} /></div>
            {isProvider && inspectionStatus !== 'Confirmed' && job.status_c === 'Assigned' && (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div><div className="mb-1 text-sm font-medium">Customer Name</div><div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">{displayLookup(job.customer_c)}</div></div>
                <div><label className="mb-1 block text-sm font-medium">Vehicle registration number *</label><input value={inspectionDraft.registration} onChange={(event) => setInspectionDraft((current) => ({ ...current, registration: event.target.value.toUpperCase() }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. UP70 AB 1234" /></div>
                <div><label className="mb-1 block text-sm font-medium">Condition notes *</label><textarea value={inspectionDraft.notes} onChange={(event) => setInspectionDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} maxLength={2000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Record existing marks, accessories, keys, documents or any other observations." /></div>
                <div><div className="mb-2 text-sm font-semibold">Upload 6 Vehicle Photos Before Starting</div><p className="mb-3 text-xs text-muted-foreground">Each photo is required: Front, Back, Right side, Left side, Odometer and Boot Space. The customer must confirm these before you can start the service. Take the same six photos again after service.</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'].map((view) => { const photo = inspectionDraft.photos.find((item) => item.view === 'pre-' + view); return <div key={view} className="rounded-lg border border-border p-3"><div className="mb-2 flex items-center justify-between gap-2"><label className="text-sm font-semibold">{view} — before service <span className="text-destructive">*</span></label><span className={`text-xs font-medium ${photo ? 'text-success' : 'text-highlight'}`}>{photo ? 'Uploaded' : 'Required'}</span></div>{photo ? <img src={photo.data} alt={`${view} before service`} className="h-36 w-full rounded-md border object-cover" /> : <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">{view} photo required</div>}<label className="relative mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"><ApperIcon name="Camera" size={16} />{photo ? 'Replace Photo' : 'Upload Photo'}<input type="file" accept="image/*" capture="environment" onChange={(event) => addInspectionPhotos(event, 'pre-' + view)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${photo ? 'Replace' : 'Upload'} ${view} before-service photo`} /></label></div>; })}</div></div>
                <Button onClick={saveVehicleInspection} disabled={working} className="w-full max-w-full whitespace-normal break-words text-center leading-snug [&_svg]:shrink-0"><ApperIcon name="ClipboardCheck" size={16} /> {working ? 'Saving…' : 'Send handover details to customer'}</Button>
              </div>
            )}
            {savedInspection && !isCustomer && <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4"><div className="grid gap-3 sm:grid-cols-2"><div><div className="text-xs font-semibold uppercase text-muted-foreground">Customer Name</div><p className="mt-1 text-sm">{savedInspection.customerName || displayLookup(job.customer_c)}</p></div><div><div className="text-xs font-semibold uppercase text-muted-foreground">Registration</div><p className="mt-1 text-sm">{savedInspection.registration || 'Not recorded'}</p></div></div><div><div className="text-xs font-semibold uppercase text-muted-foreground">Condition notes</div><p className="mt-1 whitespace-pre-wrap text-sm">{savedInspection.notes || '—'}</p></div>{(savedInspection.photos ?? []).length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{savedInspection.photos.map((photo, index) => <div key={photo.name + index}><img src={photo.data} alt={photo.name} className="h-28 w-full rounded-md border object-cover" /><p className="mt-1 truncate text-xs text-muted-foreground">{photo.name}</p></div>)}</div>}<p className="text-xs text-muted-foreground">Submitted by {savedInspection.inspectedBy || 'Service Provider'} · {formatTimestamp(savedInspection.inspectedAt)}{savedInspection.confirmedAt ? ' · Customer confirmed ' + formatTimestamp(savedInspection.confirmedAt) : ''}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={printVehicleInspection}><ApperIcon name="FileDown" size={16} /> Print / Save report as PDF</Button>{isCustomer && inspectionStatus === 'Awaiting Customer Confirmation' && <Button onClick={confirmVehicleInspection} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> Confirm vehicle condition</Button>}</div>{isCustomer && inspectionStatus === 'Awaiting Customer Confirmation' && <p className="text-sm text-highlight">Please review the report and photographs. Confirm only if they accurately show the vehicle’s condition at handover.</p>}{inspectionStatus === 'Confirmed' && <p className="text-sm font-medium text-success">Vehicle condition report confirmed. The Service Provider can proceed.</p>}</div>}
            {!savedInspection && isCustomer && <p className="rounded-md border border-highlight/30 bg-highlight/5 p-3 text-sm">The Service Provider must complete the vehicle condition report before work begins.</p>}
          </section>
        )}

        {isAcService && (isProvider || isAdmin) && (
          <section className="mt-7 space-y-4 border-t border-border pt-5">
            <div><h2 className="font-heading text-xl font-semibold">AC service progress</h2><p className="mt-1 text-sm text-muted-foreground">Confirm arrival, diagnose the AC, get customer approval for the final estimate, then record completion. Payment is collected after the customer confirms the work.</p></div>
            {isProvider && job.status_c === 'Assigned' && <Button onClick={() => updateJob({ pickup_confirmed_at_c: new Date().toISOString(), status_c: 'In Progress' }, 'AC service started.')} disabled={working || !job.service_start_otp_verified_at_c}><ApperIcon name="Play" size={16} /> {working ? 'Saving…' : 'Start AC service'}</Button>}
            {isProvider && job.status_c === 'Assigned' && !job.service_start_otp_verified_at_c && <p className="text-sm text-highlight">Admin must issue the start OTP after arrival; verify it before starting AC service.</p>}
            {job.ac_diagnosis_c && <div className="rounded-lg border border-border bg-muted/30 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnosis</div><p className="mt-1 whitespace-pre-wrap text-sm">{job.ac_diagnosis_c}</p>{job.ac_estimate_notes_c && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{job.ac_estimate_notes_c}</p>}<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">Estimate: {displayMoney(job.ac_estimate_amount_c)}</span><StatusBadge value={job.ac_estimate_status_c ?? 'Not Submitted'} /></div></div>}
            {isProvider && job.status_c === 'In Progress' && job.ac_estimate_status_c !== 'Approved' && <div className="space-y-3 rounded-lg border border-border p-4"><h3 className="font-semibold">Diagnosis & estimate</h3><p className="text-sm text-muted-foreground">Enter the diagnosis and full estimate. Repair work must wait for customer approval.</p><div><label className="mb-1 block text-sm font-medium">AC diagnosis *</label><textarea value={acDiagnosisDraft || job.ac_diagnosis_c || ''} onChange={(event) => setAcDiagnosisDraft(event.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Example: indoor unit filter blocked; cooling coil needs cleaning" /></div><div><label className="mb-1 block text-sm font-medium">Final estimate (₹) *</label><input type="number" min="0" step="1" value={acEstimateDraft !== '' ? acEstimateDraft : job.ac_estimate_amount_c ?? ''} onChange={(event) => setAcEstimateDraft(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Enter total estimate" /></div><div><label className="mb-1 block text-sm font-medium">Parts / work notes (optional)</label><textarea value={acEstimateNotesDraft || job.ac_estimate_notes_c || ''} onChange={(event) => setAcEstimateNotesDraft(event.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Parts, labour, warranty or other details" /></div><Button onClick={submitAcEstimate} disabled={working}>{working ? 'Submitting…' : job.ac_estimate_status_c === 'Declined' ? 'Resubmit estimate for approval' : 'Submit estimate for approval'}</Button>{job.ac_estimate_status_c === 'Pending Customer Approval' && <p className="text-sm text-highlight">Waiting for the customer to approve or decline this estimate.</p>}</div>}
            {isProvider && job.status_c === 'In Progress' && job.ac_estimate_status_c === 'Approved' && <Button onClick={() => updateJob({ returned_at_c: new Date().toISOString(), completion_requested_at_c: new Date().toISOString(), status_c: 'Awaiting Customer Confirmation' }, 'AC service marked complete. Waiting for customer confirmation.')} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> {working ? 'Saving…' : 'Mark service complete'}</Button>}
            {isProvider && job.status_c === 'In Progress' && job.ac_estimate_status_c !== 'Approved' && <p className="text-sm text-muted-foreground">Service completion is locked until the customer approves the estimate.</p>}
            {job.status_c === 'Awaiting Customer Confirmation' && <p className="text-sm text-muted-foreground">Waiting for the customer to confirm the service or report an issue.</p>}
            {job.status_c === 'Completed' && <p className="text-sm text-success">Customer confirmation recorded. Final payment can now be completed.</p>}
          </section>
        )}
        {isAcService && isCustomer && (
          <section className="mt-7 space-y-4 border-t border-border pt-5">
            <div><h2 className="font-heading text-xl font-semibold">AC service and estimate approval</h2><p className="mt-1 text-sm text-muted-foreground">Review the diagnosis and approve the estimate before repair work proceeds. No advance payment is collected; final payment is due after you confirm completion.</p></div>
            {job.ac_diagnosis_c && <div className="rounded-lg border border-border p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service Provider diagnosis</div><p className="mt-1 whitespace-pre-wrap text-sm">{job.ac_diagnosis_c}</p>{job.ac_estimate_notes_c && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{job.ac_estimate_notes_c}</p>}<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-lg font-semibold">Estimate: {displayMoney(job.ac_estimate_amount_c)}</span><StatusBadge value={job.ac_estimate_status_c ?? 'Not Submitted'} /></div>{job.ac_estimate_status_c === 'Pending Customer Approval' && <div className="mt-4 flex flex-wrap gap-2"><Button onClick={approveAcEstimate} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> Approve estimate</Button><Button variant="destructive" onClick={declineAcEstimate} disabled={working}>Decline estimate</Button></div>}{job.ac_estimate_status_c === 'Declined' && <p className="mt-2 text-sm text-destructive">You declined this estimate. The Service Provider can revise and resubmit it.</p>}{job.ac_estimate_status_c === 'Approved' && <p className="mt-2 text-sm text-success">Estimate approved. Agreed total: {displayMoney(job.agreed_price_c)}.</p>}</div>}
            {!job.ac_diagnosis_c && <p className="text-sm text-muted-foreground">The Service Provider will share a diagnosis and estimate after inspecting your AC.</p>}
            {job.status_c === 'Awaiting Customer Confirmation' && <div className="flex flex-wrap gap-2"><Button onClick={confirmCustomerCompletion} disabled={working || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="CheckCircle2" size={16} /> Confirm completion</Button><Button variant="destructive" onClick={reportIssue} disabled={working}>Report an issue</Button></div>}
            {['Awaiting Customer Confirmation', 'In Progress'].includes(job.status_c) && <Button variant="outline" onClick={reportIssue} disabled={working}>Report an issue / request review</Button>}
            {job.status_c === 'Completed' && !isPaid && <div className="rounded-lg border border-highlight/30 bg-highlight/5 p-4"><div className="font-semibold">Final service payment due</div><p className="mt-1 text-sm text-muted-foreground">Agreed service price: {displayMoney(job.remaining_amount_c ?? job.agreed_price_c)}. No advance was collected.</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{['UPI', 'Card', 'Net Banking'].map((method) => <Button key={method} type="button" variant={paymentMethod === method ? 'default' : 'outline'} onClick={() => setPaymentMethod(method)} disabled={working}>{method}</Button>)}</div><Button className="mt-3" onClick={simulatePayment} disabled={working || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Processing…' : 'Pay final amount (Demo)'}</Button></div>}
            {isPaid && <div className="rounded-md border border-success-border bg-success-muted p-4"><p className="font-semibold text-success">Payment recorded</p><p className="mt-1 text-sm text-success">No real money was charged or transferred in this demo.</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={printInvoice}><ApperIcon name="FileDown" size={16} /> Download Invoice / Save as PDF</Button><Button type="button" variant="outline" onClick={() => emailInvoiceToCustomer(Number(job.agreed_price_c ?? 0), job.payment_reference_c ?? '')} disabled={emailingInvoice}><ApperIcon name="Mail" size={16} /> {emailingInvoice ? 'Emailing invoice…' : 'Email invoice details'}</Button></div><p className="mt-2 text-xs text-success">Invoice email delivery requires a configured email sender. The PDF can be saved locally.</p></div>}
          </section>
        )}
        {isCarEssentialsDelivery && (isProvider || isCustomer || isAdmin) && (
          <section className="mt-7 space-y-4 border-t border-border pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><ApperIcon name="PackageCheck" size={22} /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-xl font-semibold">Car Essentials Delivery — Order Progress</h2>
                <p className="mt-1 text-sm text-muted-foreground">Follow each step in order. The approved quote remains fixed at {displayMoney(job.agreed_price_c)} unless the customer approves a separate change.</p>
              </div>
              <StatusBadge value={job.status_c} />
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[['1', 'Booking confirmed', ['Assigned', 'In Progress', 'Completed'].includes(job.status_c)], ['2', 'Order prepared', ['Ready for Delivery', 'Out for Delivery', 'Delivered — Awaiting Customer Confirmation', 'Completed'].includes(job.provider_travel_status_c)], ['3', 'Out for delivery', ['Out for Delivery', 'Delivered — Awaiting Customer Confirmation', 'Completed'].includes(job.provider_travel_status_c)], ['4', 'Customer confirms receipt', job.status_c === 'Completed']].map(([number, label, complete]) => <li key={number} className={'rounded-lg border p-3 ' + (complete ? 'border-success-border bg-success-muted' : 'border-border bg-muted/20')}><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold">{complete ? <ApperIcon name="Check" size={15} /> : number}</span><span className="text-sm font-semibold">{label}</span></div></li>)}
            </ol>
            {isProvider && job.status_c === 'Assigned' && !['Ready for Delivery', 'Out for Delivery', 'Delivered — Awaiting Customer Confirmation', 'Delivered'].includes(job.provider_travel_status_c) && <div className="rounded-lg border border-border bg-muted/20 p-4"><h3 className="font-semibold">Next action: prepare the order</h3><p className="mt-1 text-sm text-muted-foreground">Check the vehicle compatibility, confirm all approved items are in stock, and pack the exact items listed in the approved quote. Do not change the agreed price or substitute products without customer approval.</p><Button className="mt-3" onClick={() => updateJob({ provider_travel_status_c: 'Ready for Delivery', billing_status_c: 'Order Ready for Delivery' }, 'Order marked ready for delivery. The customer can see the updated status.')} disabled={working}><ApperIcon name="PackageCheck" size={16} /> {working ? 'Saving…' : 'Mark Order Ready for Delivery'}</Button></div>}
            {isProvider && job.status_c === 'Assigned' && job.provider_travel_status_c === 'Ready for Delivery' && <div className="rounded-lg border border-border bg-muted/20 p-4"><h3 className="font-semibold">Next action: begin delivery</h3><p className="mt-1 text-sm text-muted-foreground">Take the order to the customer’s saved delivery location. Ask the customer to keep the LOCAL delivery OTP private until the items are physically handed over.</p><Button className="mt-3" onClick={() => updateJob({ provider_travel_status_c: 'Out for Delivery', billing_status_c: 'Out for Delivery' }, 'Delivery started. The customer can see that the order is on its way.')} disabled={working}><ApperIcon name="Truck" size={16} /> {working ? 'Saving…' : 'Start Delivery'}</Button></div>}
            {isProvider && job.status_c === 'Assigned' && job.provider_travel_status_c === 'Out for Delivery' && <div className="rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h3 className="font-semibold">Next action: verify delivery OTP</h3><p className="mt-1 text-sm text-muted-foreground">Enter the six-digit code only after you have handed the approved items to the customer. Successful verification records delivery and asks the customer to confirm receipt.</p>{!carEssentialsDeliveryOtp && <p className="mt-2 !text-sm !font-medium !tracking-normal !leading-5 text-highlight break-words">The delivery OTP has not been generated or synchronized yet. LOCAL Admin must open this job and select Generate / Synchronize Delivery OTP after the order is marked Out for Delivery.</p>}<div className="mt-3 flex flex-col gap-2 sm:flex-row"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={providerOtpDraft} onChange={(event) => setProviderOtpDraft(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-11 w-full rounded-md border-2 border-primary bg-background px-3 text-center text-lg font-semibold tracking-[0.3em] shadow-sm ring-2 ring-primary/15 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:max-w-56" placeholder="Enter 6-digit OTP" aria-label="Customer delivery OTP" disabled={!carEssentialsDeliveryOtp} /><Button onClick={verifyCarEssentialsDeliveryOtp} disabled={working || !carEssentialsDeliveryOtp || providerOtpDraft.length !== 6}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Verifying…' : 'Verify OTP & Mark Delivered'}</Button></div></div>}
            {isCustomer && job.status_c !== 'Completed' && job.status_c !== 'Cancelled' && job.provider_travel_status_c !== 'Delivered — Awaiting Customer Confirmation' && <div className="rounded-lg border border-success-border bg-success-muted p-4"><h3 className="font-semibold text-success">Your delivery OTP</h3><p className="mt-1 text-sm">Share this code with the Service Provider only after your order has physically arrived and you have checked the items.</p>{carEssentialsDeliveryOtp ? <p className="my-3 text-center font-mono text-4xl font-bold tracking-[0.35em] text-success" aria-label="Delivery OTP">{carEssentialsDeliveryOtp}</p> : <p className="mt-2 !text-sm !tracking-normal !leading-5 text-highlight break-words">The delivery OTP has not been generated or synchronized yet. Please contact LOCAL Admin to generate it for this approved order.</p>}{carEssentialsApproval?.otpExpiresAt && <p className="text-center text-xs text-muted-foreground">Valid until {formatTimestamp(carEssentialsApproval.otpExpiresAt)}</p>}<p className="text-xs text-muted-foreground">Share this code only after checking the delivered items. SMS/WhatsApp delivery is not connected yet.</p></div>}
            {isAdmin && isCarEssentialsDelivery && job.status_c === 'Assigned' && ['Ready for Delivery', 'Out for Delivery'].includes(job.provider_travel_status_c) && <div className="rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h3 className="font-semibold">Admin action: generate / synchronize delivery OTP</h3><p className="mt-1 text-sm text-muted-foreground">LOCAL Admin controls the delivery OTP. This also synchronizes older duplicate job records for the same request and accepted provider, so customer and provider screens show the same code.</p><Button className="mt-3" onClick={generateCarEssentialsDeliveryOtp} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Synchronizing…' : job.service_start_otp_c ? 'Synchronize Delivery OTP' : 'Generate Delivery OTP'}</Button></div>}
            {job.provider_travel_status_c === 'Delivered — Awaiting Customer Confirmation' && (isCustomer || isAdmin) && <div className="rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h3 className="font-semibold">Delivery recorded — customer confirmation required</h3><p className="mt-1 text-sm text-muted-foreground">The Service Provider verified the delivery OTP. Check that all approved items and quantities were received before confirming.</p>{isCustomer && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={confirmCustomerCompletion} disabled={working || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="CheckCircle2" size={16} /> Confirm Delivery Received</Button><Button variant="destructive" onClick={reportIssue} disabled={working}>Report Missing / Incorrect Items</Button></div>}</div>}
            {job.status_c === 'Completed' && <div className="rounded-lg border border-success-border bg-success-muted p-4"><h3 className="font-semibold text-success">Delivery confirmed</h3><p className="mt-1 text-sm text-success">The customer confirmed receipt. Final payment of {displayMoney(job.agreed_price_c)} is now due.</p></div>}
            {job.status_c === 'Cancelled' && <p className="rounded-lg border border-destructive/30 p-3 text-sm">This delivery job is cancelled. Contact LOCAL Admin if the order needs to be restored.</p>}
          </section>
        )}

        {isCarCare && (isProvider || isAdmin) && (
          <div className="mt-7 space-y-5 border-t border-border pt-5">
            <section>
              <h2 className="font-heading text-xl font-semibold">{isCarWash ? 'Car Wash job progress' : 'Car Service job progress'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Complete the vehicle handover details first. After the {isCarWash ? 'wash' : 'service'} is finished, upload all six required after-service photographs before marking the vehicle as returned.</p>
              {job.pickup_confirmed_at_c && <p className="mt-2 text-xs text-muted-foreground">Job started: {formatTimestamp(job.pickup_confirmed_at_c)}</p>}
              {isProvider && job.status_c === 'Assigned' && <Button className="mt-3" onClick={() => updateJob({ pickup_confirmed_at_c: new Date().toISOString(), status_c: 'In Progress' }, isCarWash ? 'Car Wash started.' : 'Car Service started.')} disabled={working || inspectionStatus !== 'Confirmed' || !job.service_start_otp_verified_at_c || (job.payment_timing_c === 'Pay at confirmation' && !isPaid)}><ApperIcon name="Play" size={16} /> {working ? 'Saving…' : (isCarWash ? 'Start Car Wash' : 'Start Car Service')}</Button>}
              {isProvider && job.status_c === 'Assigned' && inspectionStatus !== 'Confirmed' && <p className="mt-2 text-sm font-medium text-highlight">To start this job, send all six vehicle photos and the condition report to the customer for confirmation. Job start remains locked until the customer confirms.</p>}
              {isProvider && job.status_c === 'Assigned' && inspectionStatus === 'Confirmed' && job.payment_timing_c === 'Pay at confirmation' && !isPaid && <p className="mt-2 text-sm text-highlight">The customer chose to pay the full agreed amount before service starts. Wait until the full payment is recorded before starting the service.</p>}
              {isProvider && job.status_c === 'In Progress' && <div className="mt-4 space-y-4 rounded-lg border border-border p-4"><h3 className="font-semibold">{isCarWash ? 'Car Photos After Washing — 6 Photos Needed' : 'Car Service After-Work Photos — 6 Photos Needed'}</h3><p className="text-sm text-muted-foreground">Upload all six after-service photos before handing the car back to the customer.</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'].map((view) => { const photo = inspectionDraft.photos.find((item) => item.view === 'post-' + view); return <div key={view} className="rounded-lg border border-border p-3"><div className="mb-2 flex items-center justify-between gap-2"><label className="text-sm font-semibold">{view} photo — after service <span className="text-destructive">*</span></label><span className={`text-xs font-medium ${photo ? 'text-success' : 'text-highlight'}`}>{photo ? 'Uploaded' : 'Required'}</span></div>{photo ? <img src={photo.data} alt={`${view} after service`} className="h-36 w-full rounded-md border object-cover" /> : <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">{view} after-service photo required</div>}<label className="relative mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"><ApperIcon name="Camera" size={16} />{photo ? 'Replace Photo' : 'Upload Photo'}<input type="file" accept="image/*" capture="environment" onChange={(event) => addInspectionPhotos(event, 'post-' + view)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${photo ? 'Replace' : 'Upload'} ${view} after-service photo`} /></label></div>; })}</div><div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"><Button onClick={async () => { const requiredViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space']; const missing = requiredViews.filter((view) => !inspectionDraft.photos.some((photo) => photo.view === 'post-' + view && photo.data)); if (missing.length) { toast.error('Upload all six photos first: ' + missing.join(', ') + '.'); return; } const returnPhotosJson = JSON.stringify(inspectionDraft.photos.filter((photo) => photo.view?.startsWith('post-')).map(({ view, name, data, fileId, type, size }) => ({ view, name, data, fileId, type, size }))); if (returnPhotosJson.length > 60000) { toast.error('The six after-service photos exceed the safe save size. Please re-upload them; photos are now compressed more strongly.'); return; } await updateJob({ return_photos_c: returnPhotosJson }, 'After-service photos saved.'); }} disabled={working}><ApperIcon name="Camera" size={16} /> Save Photos</Button><Button onClick={() => { const requiredViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space']; const missing = requiredViews.filter((view) => !inspectionDraft.photos.some((photo) => photo.view === 'post-' + view && photo.data)); if (missing.length) { toast.error('Upload all six photos before returning the car: ' + missing.join(', ') + '.'); return; } const returnPhotosJson = JSON.stringify(inspectionDraft.photos.filter((photo) => photo.view?.startsWith('post-')).map(({ view, name, data, fileId, type, size }) => ({ view, name, data, fileId, type, size }))); if (returnPhotosJson.length > 60000) { toast.error('The six after-service photos exceed the safe save size. Please re-upload them; photos are now compressed more strongly.'); return; } const now = new Date().toISOString(); updateJob({ return_photos_c: returnPhotosJson, returned_at_c: now, completion_requested_at_c: now, status_c: 'Awaiting Customer Confirmation' }, 'Photos saved. Car marked as returned. Waiting for customer confirmation.'); }} disabled={working || !savedInspection}><ApperIcon name="CheckCircle2" size={16} /> {working ? 'Saving…' : 'Save Photos & Return Car'}</Button></div></div>}
              {isProvider && job.status_c === 'Awaiting Customer Confirmation' && <p className="mt-3 text-sm text-muted-foreground">Waiting for the customer to confirm completion or report an issue.</p>}
              {job.customer_completion_confirmed_at_c && <p className="mt-2 text-sm text-muted-foreground">Completion confirmed: {formatTimestamp(job.customer_completion_confirmed_at_c)}</p>}
            </section>
            {isAdmin && isCarCare && job.status_c === 'Completed' && isPaid && job.payout_status_c !== 'Released' && job.dispute_status_c !== 'Open' && job.dispute_status_c !== 'Under Review' && <section className="rounded-lg border border-success-border bg-success-muted p-4"><h3 className="font-semibold">Provider settlement</h3><p className="mt-1 text-sm">Customer payment is recorded. Provider payable: {displayMoney(job.provider_settlement_amount_c ?? billing.providerSettlement)}. After making the provider payout outside LOCAL, enter its reference to mark settlement as released.</p><Button className="mt-3" onClick={recordProviderSettlement} disabled={working}><ApperIcon name="Banknote" size={16} /> Record provider payout / settlement</Button></section>}
            {isAdmin && adminReviewDue && <section className="border-t border-border pt-5"><h3 className="font-semibold">Admin review required</h3><p className="mt-1 text-sm text-muted-foreground">Customer confirmation has been pending for at least 24 hours.</p><Button className="mt-3" onClick={adminResolveCompletion} disabled={working}>Complete after Admin review</Button><Button className="ml-2 mt-3" variant="outline" onClick={() => updateJob({ dispute_status_c: 'Under Review', payout_status_c: 'On Hold', admin_review_note_c: 'Admin review required after 24-hour customer response window.' }, 'Job placed under Admin review.')} disabled={working}>Hold for review</Button></section>}
            {(job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review') && <section className="rounded-md border border-destructive/30 bg-destructive/5 p-4"><p className="font-semibold text-destructive">Issue / dispute requires review</p><p className="mt-1 text-sm">{job.dispute_note_c || job.admin_review_note_c || 'Settlement is on hold pending review.'}</p>{isAdmin && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => updateJob({ dispute_status_c: 'Resolved', payout_status_c: isPaid ? 'Pending Release' : 'Not Eligible' }, 'Dispute marked resolved.')} disabled={working}>Mark dispute resolved</Button><Button variant="outline" onClick={() => updateJob({ payout_status_c: 'On Hold', dispute_status_c: 'Under Review' }, 'Settlement remains on hold.')} disabled={working}>Keep payout on hold</Button></div>}</section>}
          </div>
        )}

        {isProvider && ['Assigned', 'In Progress'].includes(job.status_c) && (() => { const customerRecord = serviceRequest?.customer_c && typeof serviceRequest.customer_c === 'object' ? serviceRequest.customer_c : job.customer_c && typeof job.customer_c === 'object' ? job.customer_c : null; const customerPhone = String(customerRecord?.phone_c ?? customerRecord?.Phone ?? customerRecord?.mobile_c ?? '').trim(); const customerName = customerRecord?.Name ?? displayLookup(job.customer_c) ?? 'Customer'; return <section className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><ApperIcon name="PhoneCall" size={22} /></div><div className="min-w-0 flex-1"><h2 className="font-heading text-lg font-semibold">Coordinate your confirmed booking</h2><p className="mt-1 text-sm text-muted-foreground">Contact the customer to coordinate arrival and service details. Customer contact information is shown only for the assigned booking.</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"><div><p className="font-semibold">{customerName}</p><p className="text-sm text-muted-foreground">{customerPhone ? 'Phone number available for this booking' : 'Contact number is not available in the linked profile yet.'}</p></div>{customerPhone ? <Button asChild><a href={'tel:' + customerPhone.replace(/[^+\\d]/g, '')}><ApperIcon name="Phone" size={16} /> Call Customer</a></Button> : <Button variant="outline" disabled><ApperIcon name="PhoneOff" size={16} /> Call unavailable</Button>}</div><p className="mt-3 text-xs text-muted-foreground">Calls use the number stored in the customer profile. This is not masked calling.</p></div></div></section>; })()}\n\n        {isCarCare && isCustomer && (
          <div className="mt-7 space-y-5 border-t border-border pt-5">
            <section className="space-y-4 rounded-lg border border-border p-4">
              <div><h2 className="font-heading text-xl font-semibold">Vehicle photo evidence</h2><p className="mt-1 text-sm text-muted-foreground">Review the six photos taken before and after the service. These records help both sides resolve condition or damage disputes. Completion confirmation and post-service payment remain locked if either set is incomplete.</p></div>
              <div className="grid gap-4 md:grid-cols-2">
                {[{ title: 'Before service', prefix: 'pre-', complete: hasSixBeforePhotos }, { title: 'After service', prefix: 'post-', complete: hasSixAfterPhotos }].map((group) => (
                  <div key={group.prefix} className="rounded-lg border border-border p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{group.title}</h3><StatusBadge value={group.complete ? '6 of 6 photos saved' : `${savedVehiclePhotos.filter((photo) => photo.view?.startsWith(group.prefix) && photo.data).length} of 6 photos`} /></div>
                    <div className="grid grid-cols-2 gap-2">{requiredVehicleViews.map((view) => { const photo = savedVehiclePhotos.find((item) => item.view === group.prefix + view && item.data); return <div key={view} className="rounded-md border border-border p-2"><div className="mb-1 text-xs font-medium">{view}</div>{photo ? <a href={photo.data} target="_blank" rel="noreferrer" aria-label={`Open ${view} ${group.title.toLowerCase()} photo`}><img src={photo.data} alt={`${view} ${group.title.toLowerCase()}`} className="h-24 w-full rounded object-cover" /></a> : <div className="flex h-24 items-center justify-center rounded bg-muted/50 text-center text-xs text-muted-foreground">Not uploaded</div>}</div>; })}</div>
                    {group.prefix === 'pre-' && savedInspection?.inspectedAt && <p className="mt-2 text-xs text-muted-foreground">Captured: {formatTimestamp(savedInspection.inspectedAt)}</p>}
                    {group.prefix === 'post-' && savedInspection?.postServicePhotosAt && <p className="mt-2 text-xs text-muted-foreground">Captured: {formatTimestamp(savedInspection.postServicePhotosAt)}</p>}
                  </div>
                ))}
              </div>
              {(!hasSixBeforePhotos || !hasSixAfterPhotos) && <p className="text-sm font-medium text-highlight">Evidence incomplete. The Service Provider must save all six photos before and after service before you can confirm completion.</p>}
            </section>
            {savedInspection && <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div><h2 className="font-heading text-xl font-semibold">Vehicle Handover — Customer Confirmation Required</h2><p className="mt-1 text-sm text-muted-foreground">Review the six before-service photos above, then confirm the vehicle registration and condition report below. Do not start the service until you confirm.</p></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><div className="text-xs font-semibold uppercase text-muted-foreground">Customer Name</div><p className="mt-1 text-sm">{savedInspection.customerName || displayLookup(job.customer_c)}</p></div><div><div className="text-xs font-semibold uppercase text-muted-foreground">Registration</div><p className="mt-1 text-sm">{savedInspection.registration || 'Not recorded'}</p></div></div>
              <div><div className="text-xs font-semibold uppercase text-muted-foreground">Condition notes</div><p className="mt-1 whitespace-pre-wrap text-sm">{savedInspection.notes || '—'}</p></div>
              <p className="text-sm text-muted-foreground">Submitted by {savedInspection.inspectedBy || 'Service Provider'} · {formatTimestamp(savedInspection.inspectedAt)}{savedInspection.confirmedAt ? ' · Customer confirmed ' + formatTimestamp(savedInspection.confirmedAt) : ''}</p>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={printVehicleInspection}><ApperIcon name="FileDown" size={16} /> Print / Save report as PDF</Button>{isCustomer && inspectionStatus === 'Awaiting Customer Confirmation' && <Button onClick={confirmVehicleInspection} disabled={working || !hasSixBeforePhotos}><ApperIcon name="CheckCircle2" size={16} /> Confirm vehicle condition</Button>}</div>
              {isCustomer && inspectionStatus === 'Awaiting Customer Confirmation' && <p className="text-sm text-highlight">Please review the report and all six before-service photographs. Confirm only if they accurately show the vehicle’s condition at handover.</p>}
              {inspectionStatus === 'Confirmed' && <p className="text-sm font-medium text-success">Vehicle condition report confirmed. The Service Provider can proceed.</p>}
            </section>}
            <section>
              {job.status_c === 'Assigned' && !isPaid && !isCarWash && !isCarEssentialsDelivery && <section className="rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h2 className="font-heading text-lg font-semibold">Choose when to pay</h2><p className="mt-1 text-sm text-muted-foreground">No booking fee or partial payment. Choose to pay the full agreed amount now, or pay the full amount after the car is returned and you confirm completion.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Button type="button" variant={(paymentTimingDraft === 'confirmation' || job.payment_timing_c === 'Pay at confirmation') ? 'default' : 'outline'} className="h-auto min-h-16 whitespace-normal py-3" onClick={() => savePaymentTiming('confirmation')} disabled={working}><ApperIcon name="CreditCard" size={17} /> Pay full amount before service starts</Button><Button type="button" variant={(paymentTimingDraft === 'after_completion' || !job.payment_timing_c || job.payment_timing_c === 'Pay after completion') ? 'default' : 'outline'} className="h-auto min-h-16 whitespace-normal py-3" onClick={() => savePaymentTiming('after_completion')} disabled={working}><ApperIcon name="Clock" size={17} /> Pay after service completion</Button></div>{(paymentTimingDraft === 'confirmation' || job.payment_timing_c === 'Pay at confirmation') && <div className="mt-4 rounded-lg border bg-background p-4"><p className="font-semibold">Full amount due now: {displayMoney(Number(job.agreed_price_c ?? 0) + (isCarService ? 25 : 0))}</p><p className="mt-1 text-sm text-muted-foreground">{isCarService && <>Service price {displayMoney(job.agreed_price_c)} + LOCAL Platform Fee {displayMoney(25)}. </>}Demo payment only. No real money will be collected.</p><Button className="mt-3 w-full sm:w-auto" onClick={() => setShowDemoQr(true)} disabled={working}><ApperIcon name="QrCode" size={16} /> Pay Now — {displayMoney(Number(job.agreed_price_c ?? 0) + (isCarService ? 25 : 0))}</Button>{showDemoQr && <div className="mt-4 rounded-lg border p-4"><div className="flex items-center gap-2 font-semibold"><ApperIcon name="QrCode" size={18} /> LOCAL UPI Payment</div><p className="mt-1 text-sm text-muted-foreground">Scan this UPI QR to pay the displayed amount. LOCAL does not automatically verify the transfer; payment status must be confirmed separately.</p><div className="mx-auto my-4 flex w-fit flex-col items-center rounded-md border bg-white p-3"><img src={LOCAL_PAYTM_UPI_QR} alt="Scannable Paytm UPI QR code for 8587034884@ptsbi" className="h-44 w-44 object-contain" /><p className="mt-2 text-xs font-semibold text-slate-900">Scan with any UPI app</p><p className="text-xs text-slate-600">8587034884@ptsbi</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button onClick={simulatePayment} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Recording demo…' : 'Simulate successful payment'}</Button><Button type="button" variant="outline" onClick={() => setShowDemoQr(false)} disabled={working}>Cancel</Button></div></div>}</div>}</section>}
              <h2 className="font-heading text-xl font-semibold">Your review and confirmation</h2>
              {job.status_c === 'Awaiting Customer Confirmation' ? <p className="mt-1 text-sm text-muted-foreground">Your Service Provider has marked the Car Wash service as returned. Confirm completion if everything is satisfactory, or report an issue.</p> : <p className="mt-1 text-sm text-muted-foreground">Completion confirmation and payment become available after the Service Provider marks the service returned.</p>}
              {job.customer_completion_confirmed_at_c && <p className="mt-2 text-sm text-muted-foreground">You confirmed completion on {formatTimestamp(job.customer_completion_confirmed_at_c)}.</p>}
              {job.status_c === 'Awaiting Customer Confirmation' && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={confirmCustomerCompletion} disabled={working || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="CheckCircle2" size={16} /> Confirm completion</Button><Button variant="destructive" onClick={reportIssue} disabled={working}>Report damage / issue</Button></div>}
              {['Awaiting Customer Confirmation', 'In Progress'].includes(job.status_c) && <Button className="mt-3" variant="outline" onClick={reportIssue} disabled={working}>Add comment / report an issue</Button>}
              {job.status_c === 'Completed' && !isPaid && <div className="mt-4 rounded-lg border border-highlight/30 bg-highlight/5 p-4"><p className="font-semibold">Full service payment due</p><p className="mt-1 text-sm text-muted-foreground">{!hasValidServicePrice ? 'Payment is blocked until LOCAL Admin records the agreed service price.' : isCarWash ? `Service amount ${displayMoney(carWashServiceTotal)} + LOCAL Convenience Fee ${displayMoney(25)} = Total ${displayMoney(carWashCustomerTotal)}.` : `Service amount ${displayMoney(savedServicePrice)} + LOCAL Convenience Fee ${displayMoney(25)} = Total ${displayMoney(finalServicePayable)}.`} No advance or partial payment was collected.</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{['UPI', 'Card', 'Net Banking'].map((method) => <Button key={method} type="button" variant={paymentMethod === method ? 'default' : 'outline'} onClick={() => setPaymentMethod(method)} disabled={working}>{method}</Button>)}</div><Button className="mt-3 w-full sm:w-auto" onClick={() => setShowDemoQr(true)} disabled={working || !hasValidServicePrice || carWashPendingExtras.length > 0 || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="QrCode" size={16} /> Pay Now — {displayMoney(isCarWash ? carWashCustomerTotal : finalServicePayable)}</Button></div>}
              {showDemoQr && job.status_c === 'Completed' && !isPaid && hasValidServicePrice && <div className="mt-4 rounded-lg border bg-background p-4"><div className="font-semibold">LOCAL UPI Payment · {displayMoney(isCarWash ? carWashCustomerTotal : finalServicePayable)}</div><p className="mt-1 text-sm text-muted-foreground">Scan this UPI QR to pay the displayed amount. LOCAL does not automatically verify the transfer; payment status must be confirmed separately.</p><div className="mx-auto my-4 flex w-fit flex-col items-center rounded-md border bg-white p-3"><img src={LOCAL_PAYTM_UPI_QR} alt="Scannable Paytm UPI QR code for 8587034884@ptsbi" className="h-44 w-44 object-contain" /><p className="mt-2 text-xs font-semibold text-slate-900">Scan with any UPI app</p><p className="text-xs text-slate-600">8587034884@ptsbi</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button onClick={simulatePayment} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Recording demo…' : 'Simulate successful payment'}</Button><Button type="button" variant="outline" onClick={() => setShowDemoQr(false)} disabled={working}>Cancel</Button></div></div>}
              {isPaid && <div className="mt-3 rounded-md border border-success-border bg-success-muted p-4"><p className="font-semibold text-success">Demo payment recorded</p><p className="mt-1 text-sm text-success">No real money was charged or transferred.</p></div>}
            </section>
          </div>
        )}

        {!isPayAfterCompletion && isCustomer && job.status_c === 'Completed' && job.payment_status_c !== 'Final Payment Paid' && (!isDriverBooking || driverBillApprovedForCustomer) && (
          <div className="mt-7 border-t border-border pt-5">
            <div className="rounded-lg border border-highlight/30 bg-highlight/5 p-4">
              <div className="flex items-center gap-2 font-semibold"><ApperIcon name="CreditCard" size={18} /> Final service payment due</div>
              <p className="mt-1 text-sm text-muted-foreground">The work has been marked completed. No advance or partial payment was collected. Pay the full service amount plus the LOCAL Platform Fee to finish the booking.</p>
              {!hasValidServicePrice ? <p className="mt-2 text-sm font-medium text-destructive">Payment amount pending confirmation. The agreed service price is missing or ₹0. LOCAL Admin must record the approved price before payment can proceed.</p> : <p className="mt-2 text-lg font-semibold">Amount due: {displayMoney(isBatteryJumpStart ? batteryJumpStartTotal : finalServicePayable)}</p>}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">{['UPI', 'Card', 'Net Banking'].map((method) => <Button key={method} type="button" variant={paymentMethod === method ? 'default' : 'outline'} onClick={() => setPaymentMethod(method)} disabled={working}>{method}</Button>)}</div>
              <Button className="mt-4" onClick={() => setShowDemoQr(true)} disabled={working || !hasValidServicePrice || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="QrCode" size={16} /> Pay Now — {displayMoney(isBatteryJumpStart ? batteryJumpStartTotal : finalServicePayable)}</Button>
              {showDemoQr && hasValidServicePrice && <div className="mt-4 rounded-lg border bg-background p-4"><div className="flex items-center gap-2 font-semibold"><ApperIcon name="QrCode" size={18} /> LOCAL UPI Payment · {displayMoney(isBatteryJumpStart ? batteryJumpStartTotal : finalServicePayable)}</div><p className="mt-1 text-sm text-muted-foreground">Scan this UPI QR using your UPI app. LOCAL does not automatically verify transfers; this screen records a demo payment only.</p><div className="mx-auto my-4 flex w-fit flex-col items-center rounded-md border bg-white p-3"><img src={LOCAL_PAYTM_UPI_QR} alt="LOCAL UPI payment QR code" className="h-44 w-44 object-contain" /><p className="mt-2 text-xs font-semibold text-slate-900">Scan with any UPI app</p><p className="text-xs text-slate-600">8587034884@ptsbi</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button onClick={simulatePayment} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Recording demo…' : 'Simulate successful payment'}</Button><Button type="button" variant="outline" onClick={() => setShowDemoQr(false)} disabled={working}>Cancel</Button></div></div>}
              {(job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review') && <p className="mt-2 text-sm text-destructive">Payment is unavailable while this job is under dispute review.</p>}
            </div>
          </div>
        )}
        {!isPayAfterCompletion && ['Booking Commitment & Convenience Fee Paid', 'Final Payment Paid'].includes(job.payment_status_c) && <div className="mt-7 rounded-md border border-success-border bg-success-muted p-4"><div className="flex items-center gap-2 text-sm font-semibold text-success"><ApperIcon name="BadgeCheck" size={17} /> {tr(job.payment_status_c === 'Final Payment Paid' ? 'Final payment recorded' : 'Booking payment recorded', language)}</div><p className="mt-1 text-sm text-success">{displayMoney(job.customer_payable_now_c ?? billing.customerPayableNow)} paid by demo {job.payment_method_c}. {job.payment_status_c === 'Final Payment Paid' ? 'The remaining balance is settled.' : `${tr('Remaining service amount', language)}: ${displayMoney(job.remaining_amount_c ?? billing.remainingServiceAmount)}.`}</p></div>}
        {!isPayAfterCompletion && <div className="mt-7 border-t border-border pt-5"><div className="text-sm font-semibold">{tr('Next action', language)}</div><p className="mt-1 text-sm text-muted-foreground">{tr('Keep the job status updated so both sides know where the service stands.', language)}</p><div className="mt-4 flex flex-wrap gap-2">
          {isProvider && job.status_c === 'Assigned' && !isCarEssentialsDelivery && <Button onClick={() => setStatus('In Progress')} disabled={working || (isCarCare && inspectionStatus !== 'Confirmed') || !job.service_start_otp_verified_at_c}><ApperIcon name="Play" size={16} /> {tr('Start job', language)}</Button>}
          {isProvider && isCarService && job.status_c === 'Assigned' && inspectionStatus !== 'Confirmed' && <p className="text-sm text-highlight">Complete the vehicle condition report and obtain customer confirmation before starting Car Service.</p>}
          {isProvider && job.status_c === 'Assigned' && !isCarEssentialsDelivery && !job.service_start_otp_verified_at_c && <p className="text-sm text-highlight">Verify the customer’s start-job OTP before starting this service.</p>}
          {isProvider && job.status_c === 'In Progress' && isDriverBooking && <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4"><h3 className="font-heading text-lg font-semibold">Actual Trip Statement — Final Quotation</h3><p className="mt-1 text-sm text-muted-foreground">Submit the actual trip start and end times. LOCAL calculates the final amount using the customer's approved hourly/night rates. This final quotation goes to LOCAL Admin for review before it is shared with the customer. The ₹25 LOCAL convenience fee is added automatically.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Actual start date & time *</label><input type="datetime-local" className="w-full rounded-md border border-input bg-background px-3 py-2" value={driverTripDraft.actualStart} disabled={working} onChange={e => setDriverTripDraft(v => ({...v,actualStart:e.target.value}))} /></div><div><label className="mb-1 block text-sm font-medium">Actual end date & time *</label><input type="datetime-local" className="w-full rounded-md border border-input bg-background px-3 py-2" value={driverTripDraft.actualEnd} disabled={working} min={driverTripDraft.actualStart || undefined} onChange={e => setDriverTripDraft(v => ({...v,actualEnd:e.target.value}))} /></div><div><label className="mb-1 block text-sm font-medium">Actual distance (km or N/A) *</label><input className="w-full rounded-md border border-input bg-background px-3 py-2" value={driverTripDraft.distanceKm} disabled={working} placeholder="e.g. 250" onChange={e => setDriverTripDraft(v => ({...v,distanceKm:e.target.value}))} /></div><div className="rounded-md border bg-background p-3 text-sm"><p className="font-medium">Automatic overtime & night charges</p><p className="mt-1 text-muted-foreground">Calculated from actual start/end times using the approved ₹50/hour and ₹100/hour rates, plus the ₹300 night charge when applicable.</p></div><div><label className="mb-1 block text-sm font-medium">Other customer-approved extra charges (₹)</label><input type="number" min="0" className="w-full rounded-md border border-input bg-background px-3 py-2" value={driverTripDraft.otherApprovedCharges} disabled={working} onChange={e => setDriverTripDraft(v => ({...v,otherApprovedCharges:e.target.value}))} /></div><div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">Trip completion notes and explanation for extra charges *</label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2" rows={3} value={driverTripDraft.notes} disabled={working} placeholder="Describe trip completion and explain any additional charges" onChange={e => setDriverTripDraft(v => ({...v,notes:e.target.value}))} /></div></div><div className="mt-4 overflow-hidden rounded-md border bg-background"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="px-3 py-2 text-left">Final bill component</th><th className="px-3 py-2 text-right">Amount (₹)</th></tr></thead><tbody><tr><td className="border-t px-3 py-2">Estimated quotation approved before ride</td><td className="border-t px-3 py-2 text-right">{displayMoney(driverApprovedEstimate)}</td></tr><tr><td className="border-t px-3 py-2">Actual working time</td><td className="border-t px-3 py-2 text-right">{driverActualTimesValid ? driverActualDurationHours.toFixed(2) + ' hours' : 'Enter actual start/end'}</td></tr><tr><td className="border-t px-3 py-2">Calculated base/overtime/night charges</td><td className="border-t px-3 py-2 text-right">{driverActualTariffPreview ? displayMoney(driverActualTariffPreview.serviceAmount) : '—'}</td></tr><tr><td className="border-t px-3 py-2">Other additional charges</td><td className="border-t px-3 py-2 text-right">{displayMoney(Number(driverTripDraft.otherApprovedCharges)||0)}</td></tr><tr><td className="border-t px-3 py-2">LOCAL convenience fee (fixed)</td><td className="border-t px-3 py-2 text-right">{displayMoney(25)}</td></tr><tr className="bg-muted font-bold"><td className="border-t px-3 py-3">Draft final customer bill</td><td className="border-t px-3 py-3 text-right">{driverActualTariffPreview ? displayMoney(driverActualTariffPreview.serviceAmount + Math.max(0,Number(driverTripDraft.otherApprovedCharges)||0) + 25) : 'Enter actual trip times'}</td></tr></tbody></table></div><p className="mt-3 text-sm text-muted-foreground">Trip-start OTP: {job.service_start_otp_verified_at_c ? 'verified' : 'not verified'}. Final quotation will be based on the actual times submitted above, not the original estimate.</p><Button className="mt-3 w-full" onClick={submitDriverTripCompletion} disabled={working || !job.service_start_otp_verified_at_c}><ApperIcon name="CheckCircle2" size={16} /> {working ? 'Submitting…' : 'Submit Trip Details to Admin'}</Button></div>}
          {isDriverBooking && job.status_c === 'Completed' && <div className="rounded-md border border-success-border bg-success-muted p-4 text-sm"><p className="font-semibold text-success">{driverBillApprovedForCustomer ? 'Final trip bill approved' : 'Trip completed — final bill awaiting LOCAL review'}</p>{driverTripCompletion ? <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background"><div className="border-b border-border px-3 py-3"><p className="font-semibold">LOCAL — Driver on Demand final bill</p><p className="mt-1 text-xs text-muted-foreground">Actual start: {driverTripCompletion.actualStartAt ? formatTimestamp(driverTripCompletion.actualStartAt) : 'Not recorded'} · Actual end: {driverTripCompletion.actualEndAt ? formatTimestamp(driverTripCompletion.actualEndAt) : 'Not recorded'}</p><p className="mt-1 text-xs text-muted-foreground">Actual working time: {driverTripCompletion.duration || '—'} · Distance: {driverTripCompletion.distanceKm || '—'}</p></div><div className="space-y-2 px-3 py-3"><div className="flex justify-between gap-4"><span>Base approved quotation</span><span className="font-medium">{displayMoney(Number(job.original_provider_quote_c ?? job.agreed_price_c ?? 0))}</span></div><div className="flex justify-between gap-4"><span>Base fare and additional/night hours</span><span className="font-medium">{displayMoney(Number(driverTripCompletion.tariff?.serviceAmount ?? driverTripCompletion.serviceAmount) - Number(driverTripCompletion.otherApprovedCharges ?? 0))}</span></div><div className="flex justify-between gap-4"><span>Other additional charges</span><span className="font-medium">{displayMoney(driverTripCompletion.otherApprovedCharges)}</span></div><div className="flex justify-between gap-4 border-t border-border pt-2"><span>Service subtotal</span><span className="font-medium">{displayMoney(driverTripCompletion.serviceAmount)}</span></div><div className="flex justify-between gap-4"><span>LOCAL convenience fee</span><span className="font-medium">{displayMoney(driverTripCompletion.localFee ?? 25)}</span></div><div className="flex justify-between gap-4 border-t border-border pt-3 text-base font-bold"><span>Final customer total</span><span>{displayMoney(driverTripCompletion.customerTotal ?? job.customer_payable_now_c ?? (Number(job.agreed_price_c || 0) + 25))}</span></div></div></div> : <p className="mt-2">The submitted trip details could not be loaded. Please contact LOCAL Customer Care.</p>}<p className="mt-3">{driverBillApprovedForCustomer ? 'LOCAL Admin has recorded your consent. Payment is available below.' : 'LOCAL Admin will review this bill and call you to confirm the final amount. Payment remains locked until your consent is recorded.'}</p></div>}
          {isAdmin && isDriverBooking && job.status_c === 'Completed' && driverTripCompletion && !driverBillApprovedForCustomer && <div className="mt-4 rounded-lg border border-highlight/40 bg-highlight/5 p-4"><h3 className="font-heading text-lg font-semibold">Driver trip bill — Admin review</h3><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p>Actual start: <strong>{driverTripCompletion.actualStartAt ? formatTimestamp(driverTripCompletion.actualStartAt) : 'Not recorded'}</strong></p><p>Actual end: <strong>{driverTripCompletion.actualEndAt ? formatTimestamp(driverTripCompletion.actualEndAt) : 'Not recorded'}</strong></p><p>Actual duration: <strong>{driverTripCompletion.duration}</strong></p><p>Distance: <strong>{driverTripCompletion.distanceKm}</strong></p><p>Approved base quotation: <strong>{displayMoney(Number(job.original_provider_quote_c ?? 0))}</strong></p><p>Night-halt charges: <strong>{displayMoney(driverTripCompletion.nightHaltAmount)}</strong></p><p>Other additional charges: <strong>{displayMoney(driverTripCompletion.otherApprovedCharges)}</strong></p><p>Service subtotal: <strong>{displayMoney(driverTripCompletion.serviceAmount)}</strong></p><p>LOCAL convenience fee: <strong>{displayMoney(25)}</strong></p><p className="text-base">Final customer bill: <strong>{displayMoney(driverTripCompletion.customerTotal)}</strong></p></div><p className="mt-3 text-sm text-muted-foreground">Call the customer, explain the bill and obtain explicit consent before approving. Approval and consent method are recorded on this job.</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={approveDriverFinalBillAndRecordConsent} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> Approve & Record Customer Consent</Button><Button variant="outline" onClick={returnDriverFinalBillForCorrection} disabled={working}>Return to Driver for Correction</Button></div></div>}
          {isProvider && job.status_c === 'In Progress' && !isDriverBooking && <Button onClick={() => setStatus('Completed')} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> Mark completed</Button>}
          {(isProvider || isCustomer || isAdmin) && ['Assigned', 'In Progress'].includes(job.status_c) && <Button variant="outline" onClick={() => setStatus('Cancelled')} disabled={working}>Cancel job</Button>}
          {isAdmin && job.status_c === 'Completed' && <Button variant="outline" onClick={() => setStatus('In Progress')} disabled={working}>Reopen job</Button>}
          {job.status_c === 'Completed' && <div className="rounded-md border border-success-border bg-success-muted px-4 py-2 text-sm text-success">Service completed successfully.</div>}
          {job.status_c === 'Cancelled' && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">This job is cancelled.</div>}
        </div></div>}
      </Card>
    </div>
  );
}
