import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useFunction } from '@/hooks/useFunction';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import { getBillingBreakdown, getBookingCommitmentAmount } from '@/services/pricing';
import { getLanguage, tr } from '@/services/i18n';

export const route = { path: '/jobs/:id', layout: 'owner', access: "profile === 'Customer_c' || profile === 'ServiceProvider_c' || profile === 'Admin_c'" };

function formatTimestamp(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-IN');
}

export default function JobsDetail() {
  const { id } = useParams();
  const user = useSelector((state) => state.user.user);
  const [working, setWorking] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [showDemoQr, setShowDemoQr] = useState(false);
  const [paymentTimingDraft, setPaymentTimingDraft] = useState('');
  const [acDiagnosisDraft, setAcDiagnosisDraft] = useState('');
  const [acEstimateDraft, setAcEstimateDraft] = useState('');
  const [acEstimateNotesDraft, setAcEstimateNotesDraft] = useState('');
  const [inspectionDraft, setInspectionDraft] = useState({ registration: '', notes: '', photos: [] });
  const { invoke: sendInvoiceEmail, loading: emailingInvoice } = useFunction(import.meta.env.VITE_EMAIL_LOCAL_INVOICE);
  const { data: job, loading, error, run } = useFetch(() => sdk.table('jobs_c').select([
    'Id','Name','request_c','response_c','customer_c','technician_c','agreed_price_c','original_provider_quote_c','payment_timing_c','booking_commitment_amount_c','remaining_amount_c','local_service_fee_amount_c','customer_discount_amount_c','customer_tax_amount_c','customer_payable_now_c','provider_completed_jobs_count_c','provider_commission_rate_c','provider_commission_amount_c','provider_settlement_amount_c','billing_status_c','service_mode_c','scheduled_at_c','status_c','payment_status_c','payment_method_c','payment_reference_c','pickup_photos_c','progress_photos_c','return_photos_c','pickup_confirmed_at_c','returned_at_c','completion_requested_at_c','customer_completion_confirmed_at_c','dispute_status_c','dispute_note_c','payout_status_c','admin_review_note_c','ac_diagnosis_c','ac_estimate_amount_c','ac_estimate_status_c','ac_estimate_notes_c','vehicle_condition_report_c','vehicle_condition_status_c','vehicle_condition_confirmed_at_c'
  ]).get(id).then((res) => {
    if (!res.success) throw new Error(res.message);
    return res.data ?? null;
  }), [id]);
  const requestId = job?.request_c?.Id ?? job?.request_c ?? '';
  const { data: serviceRequest } = useFetch(() => requestId
    ? sdk.table('service_requests_c').select(['Id', 'Name', 'problem_description_c', 'location_c', 'latitude_c', 'longitude_c']).get(requestId).then((res) => res.data ?? null)
    : Promise.resolve(null), [requestId]);

  const isProvider = user?.profile === 'ServiceProvider_c';
  const isCustomer = user?.profile === 'Customer_c';
  const isAdmin = user?.profile === 'Admin_c';
  const isCarWash = /car\s*wash/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? ''));
  const isCarService = /car service|service package|economy service|normal service|major service|point checkup/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? ''));
  const isCarCare = isCarWash || isCarService;
  const isAcService = /AC Technician/i.test(String(job?.Name ?? '') + ' ' + String(job?.request_c?.Name ?? '')) || String(serviceRequest?.problem_description_c ?? '').includes('LOCAL_AC_REQUEST_JSON:');
  const isPayAfterCompletion = isCarWash || isAcService;
  const language = getLanguage();
  const completedJobsBeforeThisBooking = Number(job?.provider_completed_jobs_count_c ?? 0);
  const billing = getBillingBreakdown(job?.agreed_price_c ?? 0, job?.service_mode_c ?? 'Normal', completedJobsBeforeThisBooking, job?.customer_discount_amount_c ?? 0, job?.customer_tax_amount_c ?? 0);
  const displayLookup = (value) => value?.Name ?? value?.name ?? value?.Id ?? value ?? '—';
  const displayMoney = (value) => '₹' + Number(value ?? 0).toLocaleString('en-IN');
  const isPaid = job?.payment_status_c === 'Final Payment Paid';
  const awaitingSince = job?.completion_requested_at_c ? new Date(job.completion_requested_at_c).getTime() : 0;
  const adminReviewDue = job?.status_c === 'Awaiting Customer Confirmation' && awaitingSince > 0 && Date.now() - awaitingSince >= 24 * 60 * 60 * 1000;
  let savedInspection = null;
  try { savedInspection = job?.vehicle_condition_report_c ? JSON.parse(job.vehicle_condition_report_c) : null; } catch { savedInspection = null; }
  const inspectionStatus = job?.vehicle_condition_status_c ?? 'Not Started';
  const requiredVehicleViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'];
  const savedVehiclePhotos = Array.isArray(savedInspection?.photos) ? savedInspection.photos : [];
  const hasSixBeforePhotos = requiredVehicleViews.every((view) => savedVehiclePhotos.some((photo) => photo.view === 'pre-' + view && photo.data));
  const hasSixAfterPhotos = requiredVehicleViews.every((view) => savedVehiclePhotos.some((photo) => photo.view === 'post-' + view && photo.data));
  useEffect(() => {
    if (savedInspection) setInspectionDraft({ registration: savedInspection.registration ?? '', notes: savedInspection.notes ?? '', photos: Array.isArray(savedInspection.photos) ? savedInspection.photos : [] });
  }, [job?.Id, job?.vehicle_condition_report_c]);

  async function updateJob(values, successMessage) {
    if (working) return;
    setWorking(true);
    let refreshAfterSave = false;
    try {
      const res = await Promise.race([
        sdk.table('jobs_c').update({ Id: job.Id, ...values }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('The job update is taking too long. Please refresh the page and check the job status before trying again.')), 15000)),
      ]);
      if (!res?.success || !res.data?.length) throw new Error(res?.messages?.[0] ?? res?.message ?? 'Job could not be updated. Please retry.');
      toast.success(successMessage);
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
    const files = [file];
    const converted = await Promise.all(files.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({ name: file.name, data: canvas.toDataURL('image/jpeg', 0.62) });
        };
        image.onerror = () => resolve(null);
        image.src = String(reader.result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    })));
    setInspectionDraft((current) => ({ ...current, photos: [...current.photos.filter((photo) => photo.view !== view), ...converted.filter(Boolean).map((photo) => ({ ...photo, view }))] }));
    event.target.value = '';
  }

  async function saveVehicleInspection() {
    if (!inspectionDraft.registration.trim()) { toast.error('Enter the vehicle registration number.'); return; }
    const requiredViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'];
    const missingViews = requiredViews.filter((view) => !inspectionDraft.photos.some((photo) => photo.view === 'pre-' + view && photo.data));
    if (missingViews.length) { toast.error('Upload all six pre-service photographs: ' + missingViews.join(', ') + '.'); return; }
    const report = { ...inspectionDraft, customerName: displayLookup(job.customer_c), version: 3, inspectedAt: new Date().toISOString(), inspectedBy: displayLookup(job.technician_c), stage: 'Vehicle handover', confirmedAt: null };
    await updateJob({ vehicle_condition_report_c: JSON.stringify(report), vehicle_condition_status_c: 'Awaiting Customer Confirmation' }, 'Vehicle condition report saved and shared with the customer.');
  }

  async function confirmVehicleInspection() {
    if (!savedInspection) return;
    const confirmedAt = new Date().toISOString();
    await updateJob({ vehicle_condition_report_c: JSON.stringify({ ...savedInspection, confirmedAt }), vehicle_condition_status_c: 'Confirmed', vehicle_condition_confirmed_at_c: confirmedAt }, 'Vehicle condition report confirmed. The report is saved with this job.');
  }

  function printVehicleInspection() {
    if (!savedInspection) return;
    const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const photos = (savedInspection.photos ?? []).map((photo) => `<figure><img src="${photo.data}" style="max-width:220px;max-height:160px;object-fit:contain"><figcaption>${safe(photo.view || photo.name)}</figcaption></figure>`).join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast.error('Allow pop-ups to print or save the report as PDF.'); return; }
    w.document.write(`<!doctype html><html><head><title>LOCAL Vehicle Condition Report</title><style>body{font:14px Arial,sans-serif;margin:28px;color:#172033}h1{color:#102c4d}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}section{margin:18px 0} .photos{display:flex;flex-wrap:wrap;gap:12px}</style></head><body><h1>LOCAL — Vehicle Condition Report</h1><p>Job: ${safe(job.Name)}</p><p>Inspection time: ${safe(formatTimestamp(savedInspection.inspectedAt))}</p><p>Service Provider: ${safe(savedInspection.inspectedBy)}</p><table><tr><th>Customer Name</th><td>${safe(savedInspection.customerName || displayLookup(job.customer_c))}</td><th>Registration</th><td>${safe(savedInspection.registration)}</td></tr></table><section><h2>Condition notes</h2><p>${safe(savedInspection.notes || '—')}</p></section><section><h2>Handover photographs</h2><div class="photos">${photos || 'No photographs attached.'}</div></section><p>Customer confirmation status: ${safe(inspectionStatus)} ${savedInspection.confirmedAt ? 'at ' + safe(formatTimestamp(savedInspection.confirmedAt)) : ''}</p><p>This report records the vehicle condition observed at handover. It is not a mechanical diagnosis or guarantee.</p><script>window.onload=()=>window.print()</script></body></html>`);
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

  async function confirmCustomerCompletion() {
    if (isCarWash && (!hasSixBeforePhotos || !hasSixAfterPhotos)) {
      toast.error('Completion confirmation is locked until all six before-service and all six after-service vehicle photos are saved to this job.');
      return;
    }
    if (job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review') {
      toast.error('This job has an open dispute. Admin review is required before completion.');
      return;
    }
    const alreadyPaidAtConfirmation = isCarWash && isPaid;
    await updateJob({ customer_completion_confirmed_at_c: new Date().toISOString(), status_c: 'Completed', payment_status_c: alreadyPaidAtConfirmation ? 'Final Payment Paid' : 'Balance Pending', billing_status_c: alreadyPaidAtConfirmation ? 'Final Paid' : 'Ready for Confirmation', payout_status_c: alreadyPaidAtConfirmation ? 'Pending Release' : 'Not Eligible' }, alreadyPaidAtConfirmation ? 'Completion confirmed. Your full payment was already recorded.' : 'Completion confirmed. The full final payment is now due.');
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
    const email = user?.email ?? user?.Email ?? user?.email_c ?? '';
    if (!email) {
      toast.warning('Payment is recorded, but the customer email address is not available in this session.');
      return false;
    }
    const invoiceNumber = 'LOCAL-' + String(job.Id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
    try {
      await sendInvoiceEmail({
        email,
        invoiceNumber,
        customerName: displayLookup(job.customer_c),
        serviceName: String(job.Name ?? 'LOCAL Service'),
        amount: paymentAmount,
        paymentReference,
        paidAt: new Date().toLocaleString('en-IN'),
      });
      toast.success('Invoice details emailed to the customer.');
      return true;
    } catch (err) {
      toast.warning('Payment is recorded. Automatic email needs email-service configuration before it can be delivered.');
      return false;
    }
  }

  async function simulatePayment() {
    setWorking(true);
    try {
      const isFinalBalancePayment = !isCarWash && job.status_c === 'Completed' && job.payment_status_c !== 'Final Payment Paid';
      const amount = isCarWash || isFinalBalancePayment ? Number(job.agreed_price_c ?? job.remaining_amount_c ?? 0) : Number(job.customer_payable_now_c ?? billing.customerPayableNow);
      const calculated = getBillingBreakdown(job.agreed_price_c, job.service_mode_c ?? 'Normal', Number(job.provider_completed_jobs_count_c ?? 0), Number(job.customer_discount_amount_c ?? 0), 0);
      const reference = 'DEMO-' + paymentMethod.toUpperCase().replace(' ', '-') + '-' + String(Date.now()).slice(-6);
      const values = (isCarWash || isFinalBalancePayment) ? {
        remaining_amount_c: 0,
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
      if (isCustomer && (isCarWash || isFinalBalancePayment)) {
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
    const customerEmail = user?.email ?? user?.Email ?? user?.email_c ?? 'Registered email on customer account';
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
    const discount = Number(job.customer_discount_amount_c ?? 0);
    const tax = Number(job.customer_tax_amount_c ?? 0);
    const bookingCommitment = Number(job.booking_commitment_amount_c ?? 0);
    // The booking commitment is part of the agreed service price.
    const bookingPaid = bookingCommitment;
    const finalPaid = Number(job.remaining_amount_c === 0 ? job.customer_payable_now_c ?? 0 : 0);
    const totalPayable = Math.max(0, servicePrice - discount + tax);
    const totalPaid = Math.min(totalPayable, bookingPaid + finalPaid);
    const balance = Math.max(0, totalPayable - totalPaid);
    const money = (value) => '₹' + Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const safe = (value) => String(value ?? '—').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const acServiceRows = acGroups.map((group) => `<tr><td>${safe(group.acType + ' — ' + group.serviceType + (group.notes ? ': ' + group.notes : ''))} × ${safe(group.quantity)}</td><td>Included in agreed total</td></tr>`).join('');
    const serviceRows = isAcService && acServiceRows ? `${acServiceRows}<tr><td>Agreed AC service total</td><td>${money(servicePrice)}</td></tr>` : `<tr><td>Service Offered — ${safe(serviceName)}</td><td>${money(servicePrice)}</td></tr>`;
    const invoiceWindow = window.open('', '_blank', 'width=900,height=700');
    if (!invoiceWindow) {
      toast.error('Please allow pop-ups to generate your invoice.');
      return;
    }
    invoiceWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(invoiceNumber)} - LOCAL Invoice</title><style>
      body{font-family:Arial,sans-serif;color:#21152f;margin:0;padding:32px;background:#fff}
      .wrap{max-width:760px;margin:auto}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #5b21b6;padding-bottom:18px}
      .brand{font-size:30px;font-weight:800;letter-spacing:5px;color:#24103f}.muted{color:#666174;font-size:12px;line-height:1.6}
      h1{font-size:22px;margin:24px 0 8px}.meta,.parties{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#f8f5fc;padding:16px;margin:18px 0}
      .parties{grid-template-columns:1fr 1fr}.label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:5px}
      table{width:100%;border-collapse:collapse;margin:18px 0}th{background:#4b1a78;color:white;text-align:left}td,th{padding:11px;border:1px solid #e2d8eb;font-size:13px}td:last-child,th:last-child{text-align:right}
      .total{font-weight:bold;background:#f1eaf9}.paid{font-weight:bold;background:#eaf7ee}.notice{margin-top:22px;padding:12px;background:#fff8e7;border:1px solid #e7c66b;font-size:11px;line-height:1.6}
      .actions{margin:18px 0}.actions button{background:#4b1a78;color:white;border:0;border-radius:6px;padding:10px 16px;cursor:pointer}
      @media print{body{padding:0}.actions{display:none}.wrap{max-width:none}}
    </style></head><body><div class="wrap">
      <div class="top"><div><div class="brand">LOCAL</div><div class="muted">Happy To Help</div></div><div style="text-align:right"><strong>INVOICE &amp; PAYMENT RECEIPT</strong><div class="muted">Status: ${safe(job.payment_status_c === 'Final Payment Paid' ? 'PAID (DEMO)' : 'PAYMENT PENDING')}</div></div></div>
      <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
      <h1>Invoice details</h1><div class="meta">
      <div><div class="label">Invoice number</div><strong>${safe(invoiceNumber)}</strong></div>
      <div><div class="label">Invoice date</div><strong>${safe(new Date().toLocaleDateString('en-IN'))}</strong></div>
      <div><div class="label">Payment method</div><strong>${safe(job.payment_method_c ?? '—')}</strong></div>
      <div><div class="label">Service</div><strong>${safe(serviceName)}</strong></div>
      <div><div class="label">Payment reference</div><strong>${safe(job.payment_reference_c ?? '—')}</strong></div>
      <div><div class="label">Service status</div><strong>${safe(job.status_c ?? 'Completed')}</strong></div></div>
      <div class="parties"><div><div class="label">Customer</div><strong>${safe(customerName)}</strong><div class="muted">${safe(customerEmail)}</div></div><div><div class="label">Service provider</div><strong>${safe(providerName)}</strong><div class="muted">LOCAL service provider</div></div></div>
      <h1>Charges &amp; payment summary</h1><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${serviceRows}
      ${discount > 0 ? `<tr><td>Discount</td><td>−${money(discount)}</td></tr>` : ''}
      ${tax > 0 ? `<tr><td>Applicable taxes</td><td>${money(tax)}</td></tr>` : ''}
      <tr class="total"><td>Total Bill</td><td>${money(totalPayable)}</td></tr>
      <tr><td>Booking Payment</td><td>${money(bookingPaid)}</td></tr>
      <tr><td>Final Payment</td><td>${money(finalPaid)}</td></tr>
      <tr class="paid"><td>Total Paid</td><td>${money(totalPaid)}</td></tr>
      <tr class="total"><td>Balance Due</td><td>${money(balance)}</td></tr>
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
        action={<Button asChild variant="outline"><Link to="/jobs"><ApperIcon name="ArrowLeft" size={16} /> {tr('Back to jobs', language)}</Link></Button>}
      />
      <Card className="border-l-4 border-success p-5 md:p-7">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            [tr('Service request', language), displayLookup(job.request_c)],
            [tr('Accepted offer', language), displayLookup(job.response_c)],
            [tr('Customer', language), displayLookup(job.customer_c)],
            [tr('Service Provider', language), displayLookup(job.technician_c)],
            [tr('Original provider quote', language), displayMoney(job.original_provider_quote_c ?? job.agreed_price_c)],
            [tr('Final agreed price', language), displayMoney(job.agreed_price_c)],
            ...(!isPayAfterCompletion ? [[tr('Booking commitment', language), displayMoney(job.booking_commitment_amount_c ?? getBookingCommitmentAmount(job.agreed_price_c))], [tr('Remaining amount', language), displayMoney(job.remaining_amount_c ?? billing.remainingServiceAmount)], [tr('Convenience Fee', language), displayMoney(job.local_service_fee_amount_c ?? billing.localServiceFee)], [tr('Customer discount', language), displayMoney(job.customer_discount_amount_c ?? billing.discount)], [tr('Applicable tax', language), job.customer_tax_amount_c == null ? tr('To be calculated as applicable', language) : displayMoney(job.customer_tax_amount_c)], [tr('Customer payable now', language), displayMoney(job.customer_payable_now_c ?? billing.customerPayableNow)]] : [[tr('Amount due after customer confirmation', language), displayMoney(job.remaining_amount_c ?? job.agreed_price_c)]]),
            ...(isProvider || isAdmin ? [[tr('Provider completed jobs before booking', language), String(job.provider_completed_jobs_count_c ?? 0)], [tr('LOCAL provider commission', language), displayMoney(job.provider_commission_amount_c ?? billing.providerCommission)], [tr('Provider settlement', language), displayMoney(job.provider_settlement_amount_c ?? billing.providerSettlement)]] : []),
            [tr('Billing status', language), <StatusBadge value={job.billing_status_c ?? 'Ready for Confirmation'} />],
            [tr('Scheduled for', language), formatTimestamp(job.scheduled_at_c)],
            [tr('Job status', language), <StatusBadge value={job.status_c} />],
            [tr('Payment status', language), <StatusBadge value={job.payment_status_c ?? 'Unpaid'} />],
            ...(job.payment_method_c ? [['Payment method', job.payment_method_c]] : []),
            ...(job.payment_reference_c ? [['Payment reference', job.payment_reference_c]] : []),
            ...(isCarWash ? [['Payout status', <StatusBadge value={job.payout_status_c ?? 'Not Eligible'} />], ['Dispute status', <StatusBadge value={job.dispute_status_c ?? 'None'} />]] : []),
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
              <div className="mt-2 text-sm leading-6">{value}</div>
            </div>
          ))}
        </div>

        {isCustomer && isPaid && (
          <div className="mt-7 rounded-lg border border-success-border bg-success-muted p-4">
            <div className="font-semibold text-success">Invoice available</div>
            <p className="mt-1 text-sm text-success">Your final payment is recorded. Generate a printable invoice / payment receipt for this service.</p>
            <Button className="mt-3" onClick={printInvoice}>
              <ApperIcon name="FileDown" size={16} /> Download Invoice / Save as PDF
            </Button>
            <p className="mt-2 text-xs text-success">Basic demo version. Email delivery will be enabled after backend and email service setup.</p>
          </div>
        )}

        {isCarCare && (isProvider || isCustomer || isAdmin) && (
          <section className="mt-7 space-y-4 border-t border-border pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">Vehicle Handover — Customer Confirmation Required</h2><p className="mt-1 text-sm text-muted-foreground">To start the job, upload all six vehicle photos, enter the registration number and condition notes, then send the report to the customer. Do not start washing until the customer confirms the photos and condition report.</p></div><StatusBadge value={inspectionStatus} /></div>
            {isProvider && inspectionStatus !== 'Confirmed' && job.status_c === 'Assigned' && (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div><div className="mb-1 text-sm font-medium">Customer Name</div><div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">{displayLookup(job.customer_c)}</div></div>
                <div><label className="mb-1 block text-sm font-medium">Vehicle registration number *</label><input value={inspectionDraft.registration} onChange={(event) => setInspectionDraft((current) => ({ ...current, registration: event.target.value.toUpperCase() }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. UP70 AB 1234" /></div>
                <div><label className="mb-1 block text-sm font-medium">Condition notes *</label><textarea value={inspectionDraft.notes} onChange={(event) => setInspectionDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} maxLength={2000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Record existing marks, accessories, keys, documents or any other observations." /></div>
                <div><div className="mb-2 text-sm font-semibold">Upload 6 Vehicle Photos Before Starting</div><p className="mb-3 text-xs text-muted-foreground">Each photo is required: Front, Back, Right side, Left side, Odometer and Boot Space. The customer must confirm these before you can start washing. Take the same six photos again after washing.</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'].map((view) => { const photo = inspectionDraft.photos.find((item) => item.view === 'pre-' + view); return <div key={view} className="rounded-lg border border-border p-3"><div className="mb-2 flex items-center justify-between gap-2"><label className="text-sm font-semibold">{view} — before service <span className="text-destructive">*</span></label><span className={`text-xs font-medium ${photo ? 'text-success' : 'text-highlight'}`}>{photo ? 'Uploaded' : 'Required'}</span></div>{photo ? <img src={photo.data} alt={`${view} before service`} className="h-36 w-full rounded-md border object-cover" /> : <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">{view} photo required</div>}<label className="relative mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"><ApperIcon name="Camera" size={16} />{photo ? 'Replace Photo' : 'Upload Photo'}<input type="file" accept="image/*" capture="environment" onChange={(event) => addInspectionPhotos(event, 'pre-' + view)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${photo ? 'Replace' : 'Upload'} ${view} before-service photo`} /></label></div>; })}</div></div>
                <Button onClick={saveVehicleInspection} disabled={working} className="w-full max-w-full whitespace-normal break-words text-center leading-snug [&_svg]:shrink-0"><ApperIcon name="ClipboardCheck" size={16} /> {working ? 'Saving…' : 'Send handover details to customer'}</Button>
              </div>
            )}
            {savedInspection && <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4"><div className="grid gap-3 sm:grid-cols-2"><div><div className="text-xs font-semibold uppercase text-muted-foreground">Customer Name</div><p className="mt-1 text-sm">{savedInspection.customerName || displayLookup(job.customer_c)}</p></div><div><div className="text-xs font-semibold uppercase text-muted-foreground">Registration</div><p className="mt-1 text-sm">{savedInspection.registration || 'Not recorded'}</p></div></div><div><div className="text-xs font-semibold uppercase text-muted-foreground">Condition notes</div><p className="mt-1 whitespace-pre-wrap text-sm">{savedInspection.notes || '—'}</p></div>{(savedInspection.photos ?? []).length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{savedInspection.photos.map((photo, index) => <div key={photo.name + index}><img src={photo.data} alt={photo.name} className="h-28 w-full rounded-md border object-cover" /><p className="mt-1 truncate text-xs text-muted-foreground">{photo.name}</p></div>)}</div>}<p className="text-xs text-muted-foreground">Submitted by {savedInspection.inspectedBy || 'Service Provider'} · {formatTimestamp(savedInspection.inspectedAt)}{savedInspection.confirmedAt ? ' · Customer confirmed ' + formatTimestamp(savedInspection.confirmedAt) : ''}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={printVehicleInspection}><ApperIcon name="FileDown" size={16} /> Print / Save report as PDF</Button>{isCustomer && inspectionStatus === 'Awaiting Customer Confirmation' && <Button onClick={confirmVehicleInspection} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> Confirm vehicle condition</Button>}</div>{isCustomer && inspectionStatus === 'Awaiting Customer Confirmation' && <p className="text-sm text-highlight">Please review the report and photographs. Confirm only if they accurately show the vehicle’s condition at handover.</p>}{inspectionStatus === 'Confirmed' && <p className="text-sm font-medium text-success">Vehicle condition report confirmed. The Service Provider can proceed.</p>}</div>}
            {!savedInspection && isCustomer && <p className="rounded-md border border-highlight/30 bg-highlight/5 p-3 text-sm">The Service Provider must complete the vehicle condition report before work begins.</p>}
          </section>
        )}

        {isAcService && (isProvider || isAdmin) && (
          <section className="mt-7 space-y-4 border-t border-border pt-5">
            <div><h2 className="font-heading text-xl font-semibold">AC service progress</h2><p className="mt-1 text-sm text-muted-foreground">Confirm arrival, diagnose the AC, get customer approval for the final estimate, then record completion. Payment is collected after the customer confirms the work.</p></div>
            {isProvider && job.status_c === 'Assigned' && <Button onClick={() => updateJob({ pickup_confirmed_at_c: new Date().toISOString(), status_c: 'In Progress' }, 'AC service started.')} disabled={working}><ApperIcon name="Play" size={16} /> {working ? 'Saving…' : 'Start AC service'}</Button>}
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
        {isCarWash && (isProvider || isAdmin) && (
          <div className="mt-7 space-y-5 border-t border-border pt-5">
            <section>
              <h2 className="font-heading text-xl font-semibold">Car Wash job progress</h2>
              <p className="mt-1 text-sm text-muted-foreground">Complete the vehicle handover details first. After the Car Wash is finished, upload all six required photographs before marking the vehicle as returned.</p>
              {job.pickup_confirmed_at_c && <p className="mt-2 text-xs text-muted-foreground">Job started: {formatTimestamp(job.pickup_confirmed_at_c)}</p>}
              {isProvider && job.status_c === 'Assigned' && <Button className="mt-3" onClick={() => updateJob({ pickup_confirmed_at_c: new Date().toISOString(), status_c: 'In Progress' }, 'Car Wash started.')} disabled={working || inspectionStatus !== 'Confirmed' || (job.payment_timing_c === 'Pay at confirmation' && !isPaid)}><ApperIcon name="Play" size={16} /> {working ? 'Saving…' : 'Start Car Wash'}</Button>}
              {isProvider && job.status_c === 'Assigned' && inspectionStatus !== 'Confirmed' && <p className="mt-2 text-sm font-medium text-highlight">To start this job, send all six vehicle photos and the condition report to the customer for confirmation. Start Car Wash remains locked until the customer confirms.</p>}
              {isProvider && job.status_c === 'Assigned' && inspectionStatus === 'Confirmed' && job.payment_timing_c === 'Pay at confirmation' && !isPaid && <p className="mt-2 text-sm text-highlight">The customer chose to pay the full agreed amount before service starts. Wait until the full payment is recorded before starting the Car Wash.</p>}
              {isProvider && job.status_c === 'In Progress' && <div className="mt-4 space-y-4 rounded-lg border border-border p-4"><h3 className="font-semibold">Car Photos After Washing — 6 Photos Needed</h3><p className="text-sm text-muted-foreground">After washing the car, upload all six photos before handing the car back to the customer.</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space'].map((view) => { const photo = inspectionDraft.photos.find((item) => item.view === 'post-' + view); return <div key={view} className="rounded-lg border border-border p-3"><div className="mb-2 flex items-center justify-between gap-2"><label className="text-sm font-semibold">{view} photo — after service <span className="text-destructive">*</span></label><span className={`text-xs font-medium ${photo ? 'text-success' : 'text-highlight'}`}>{photo ? 'Uploaded' : 'Required'}</span></div>{photo ? <img src={photo.data} alt={`${view} after service`} className="h-36 w-full rounded-md border object-cover" /> : <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">{view} after-service photo required</div>}<label className="relative mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"><ApperIcon name="Camera" size={16} />{photo ? 'Replace Photo' : 'Upload Photo'}<input type="file" accept="image/*" capture="environment" onChange={(event) => addInspectionPhotos(event, 'post-' + view)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${photo ? 'Replace' : 'Upload'} ${view} after-service photo`} /></label></div>; })}</div><div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"><Button onClick={async () => { const requiredViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space']; const missing = requiredViews.filter((view) => !inspectionDraft.photos.some((photo) => photo.view === 'post-' + view && photo.data)); if (missing.length) { toast.error('Upload all six photos first: ' + missing.join(', ') + '.'); return; } await updateJob({ vehicle_condition_report_c: JSON.stringify({ ...savedInspection, photos: inspectionDraft.photos, postServicePhotosAt: new Date().toISOString() }) }, 'Photos saved.'); }} disabled={working}><ApperIcon name="Camera" size={16} /> Save Photos</Button><Button onClick={() => { const requiredViews = ['Front', 'Back', 'Right side', 'Left side', 'Odometer', 'Boot Space']; const missing = requiredViews.filter((view) => !inspectionDraft.photos.some((photo) => photo.view === 'post-' + view && photo.data)); if (missing.length) { toast.error('Upload all six photos before returning the car: ' + missing.join(', ') + '.'); return; } const now = new Date().toISOString(); updateJob({ vehicle_condition_report_c: JSON.stringify({ ...savedInspection, photos: inspectionDraft.photos, postServicePhotosAt: now }), returned_at_c: now, completion_requested_at_c: now, status_c: 'Awaiting Customer Confirmation' }, 'Photos saved. Car marked as returned. Waiting for customer confirmation.'); }} disabled={working || !savedInspection}><ApperIcon name="CheckCircle2" size={16} /> {working ? 'Saving…' : 'Save Photos & Return Car'}</Button></div></div>}
              {isProvider && job.status_c === 'Awaiting Customer Confirmation' && <p className="mt-3 text-sm text-muted-foreground">Waiting for the customer to confirm completion or report an issue.</p>}
              {job.customer_completion_confirmed_at_c && <p className="mt-2 text-sm text-muted-foreground">Completion confirmed: {formatTimestamp(job.customer_completion_confirmed_at_c)}</p>}
            </section>
            {isAdmin && adminReviewDue && <section className="border-t border-border pt-5"><h3 className="font-semibold">Admin review required</h3><p className="mt-1 text-sm text-muted-foreground">Customer confirmation has been pending for at least 24 hours.</p><Button className="mt-3" onClick={adminResolveCompletion} disabled={working}>Complete after Admin review</Button><Button className="ml-2 mt-3" variant="outline" onClick={() => updateJob({ dispute_status_c: 'Under Review', payout_status_c: 'On Hold', admin_review_note_c: 'Admin review required after 24-hour customer response window.' }, 'Job placed under Admin review.')} disabled={working}>Hold for review</Button></section>}
            {(job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review') && <section className="rounded-md border border-destructive/30 bg-destructive/5 p-4"><p className="font-semibold text-destructive">Issue / dispute requires review</p><p className="mt-1 text-sm">{job.dispute_note_c || job.admin_review_note_c || 'Settlement is on hold pending review.'}</p>{isAdmin && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => updateJob({ dispute_status_c: 'Resolved', payout_status_c: isPaid ? 'Pending Release' : 'Not Eligible' }, 'Dispute marked resolved.')} disabled={working}>Mark dispute resolved</Button><Button variant="outline" onClick={() => updateJob({ payout_status_c: 'On Hold', dispute_status_c: 'Under Review' }, 'Settlement remains on hold.')} disabled={working}>Keep payout on hold</Button></div>}</section>}
          </div>
        )}

        {isCarWash && isCustomer && (
          <div className="mt-7 space-y-5 border-t border-border pt-5">
            <section className="space-y-4 rounded-lg border border-border p-4">
              <div><h2 className="font-heading text-xl font-semibold">Vehicle photo evidence</h2><p className="mt-1 text-sm text-muted-foreground">Review the six photos taken before the wash and the six photos taken after it. These records help both sides resolve condition or damage disputes. Completion confirmation and post-service payment remain locked if either set is incomplete.</p></div>
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
            <section>
              {job.status_c === 'Assigned' && !isPaid && <section className="rounded-lg border border-highlight/30 bg-highlight/5 p-4"><h2 className="font-heading text-lg font-semibold">Choose when to pay</h2><p className="mt-1 text-sm text-muted-foreground">No booking fee or partial payment. Choose to pay the full agreed amount now, or pay the full amount after the car is returned and you confirm completion.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Button type="button" variant={(paymentTimingDraft === 'confirmation' || job.payment_timing_c === 'Pay at confirmation') ? 'default' : 'outline'} className="h-auto min-h-16 whitespace-normal py-3" onClick={() => savePaymentTiming('confirmation')} disabled={working}><ApperIcon name="CreditCard" size={17} /> Pay full amount before service starts</Button><Button type="button" variant={(paymentTimingDraft === 'after_completion' || !job.payment_timing_c || job.payment_timing_c === 'Pay after completion') ? 'default' : 'outline'} className="h-auto min-h-16 whitespace-normal py-3" onClick={() => savePaymentTiming('after_completion')} disabled={working}><ApperIcon name="Clock" size={17} /> Pay after service completion</Button></div>{(paymentTimingDraft === 'confirmation' || job.payment_timing_c === 'Pay at confirmation') && <div className="mt-4 rounded-lg border bg-background p-4"><p className="font-semibold">Full amount due now: {displayMoney(job.agreed_price_c)}</p><p className="mt-1 text-sm text-muted-foreground">Demo payment only. No real money will be collected.</p><Button className="mt-3 w-full sm:w-auto" onClick={() => setShowDemoQr(true)} disabled={working}><ApperIcon name="QrCode" size={16} /> Pay Now — {displayMoney(job.agreed_price_c)}</Button>{showDemoQr && <div className="mt-4 rounded-lg border p-4"><div className="flex items-center gap-2 font-semibold"><ApperIcon name="QrCode" size={18} /> LOCAL Demo Payment</div><p className="mt-1 text-sm text-muted-foreground">Test-only QR placeholder. It is not scannable and is not connected to Razorpay or any bank.</p><div className="mx-auto my-4 flex size-44 items-center justify-center rounded-md border-2 border-dashed bg-muted p-4 text-center"><div><ApperIcon name="QrCode" size={64} /><p className="mt-2 text-xs font-semibold">DEMO QR</p><p className="text-[10px] text-muted-foreground">Not scannable</p></div></div><div className="flex flex-col gap-2 sm:flex-row"><Button onClick={simulatePayment} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Recording demo…' : 'Simulate successful payment'}</Button><Button type="button" variant="outline" onClick={() => setShowDemoQr(false)} disabled={working}>Cancel</Button></div></div>}</div>}</section>}
              <h2 className="font-heading text-xl font-semibold">Your review and confirmation</h2>
              {job.status_c === 'Awaiting Customer Confirmation' ? <p className="mt-1 text-sm text-muted-foreground">Your Service Provider has marked the Car Wash service as returned. Confirm completion if everything is satisfactory, or report an issue.</p> : <p className="mt-1 text-sm text-muted-foreground">Completion confirmation and payment become available after the Service Provider marks the service returned.</p>}
              {job.customer_completion_confirmed_at_c && <p className="mt-2 text-sm text-muted-foreground">You confirmed completion on {formatTimestamp(job.customer_completion_confirmed_at_c)}.</p>}
              {job.status_c === 'Awaiting Customer Confirmation' && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={confirmCustomerCompletion} disabled={working || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="CheckCircle2" size={16} /> Confirm completion</Button><Button variant="destructive" onClick={reportIssue} disabled={working}>Report damage / issue</Button></div>}
              {['Awaiting Customer Confirmation', 'In Progress'].includes(job.status_c) && <Button className="mt-3" variant="outline" onClick={reportIssue} disabled={working}>Add comment / report an issue</Button>}
              {job.status_c === 'Completed' && !isPaid && <div className="mt-4 rounded-lg border border-highlight/30 bg-highlight/5 p-4"><p className="font-semibold">Full service payment due</p><p className="mt-1 text-sm text-muted-foreground">Final amount: {displayMoney(job.agreed_price_c)}. No advance or partial payment was collected.</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{['UPI', 'Card', 'Net Banking'].map((method) => <Button key={method} type="button" variant={paymentMethod === method ? 'default' : 'outline'} onClick={() => setPaymentMethod(method)} disabled={working}>{method}</Button>)}</div><Button className="mt-3 w-full sm:w-auto" onClick={() => setShowDemoQr(true)} disabled={working || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="QrCode" size={16} /> Pay Now — {displayMoney(job.agreed_price_c)}</Button></div>}
              {showDemoQr && job.status_c === 'Completed' && !isPaid && <div className="mt-4 rounded-lg border bg-background p-4"><div className="font-semibold">LOCAL Demo Payment · {displayMoney(job.agreed_price_c)}</div><p className="mt-1 text-sm text-muted-foreground">Test-only QR placeholder. It is not scannable and is not connected to Razorpay or any bank.</p><div className="mx-auto my-4 flex size-44 items-center justify-center rounded-md border-2 border-dashed bg-muted p-4 text-center"><div><ApperIcon name="QrCode" size={64} /><p className="mt-2 text-xs font-semibold">DEMO QR</p><p className="text-[10px] text-muted-foreground">Not scannable</p></div></div><div className="flex flex-col gap-2 sm:flex-row"><Button onClick={simulatePayment} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Recording demo…' : 'Simulate successful payment'}</Button><Button type="button" variant="outline" onClick={() => setShowDemoQr(false)} disabled={working}>Cancel</Button></div></div>}
              {isPaid && <div className="mt-3 rounded-md border border-success-border bg-success-muted p-4"><p className="font-semibold text-success">Demo payment recorded</p><p className="mt-1 text-sm text-success">No real money was charged or transferred.</p></div>}
            </section>
          </div>
        )}

        {!isPayAfterCompletion && isCustomer && job.status_c === 'Assigned' && !['Booking Commitment & Convenience Fee Paid', 'Final Payment Paid'].includes(job.payment_status_c) && (
          <div className="mt-7 border-t border-border pt-5">
            <div className="flex items-start gap-3"><div className="rounded-full bg-highlight/10 p-2 text-highlight"><ApperIcon name="CreditCard" size={18} /></div><div><div className="text-sm font-semibold">{tr('Booking commitment', language)}</div><p className="mt-1 text-sm text-muted-foreground">{tr('The booking payment is part of the final agreed service price. LOCAL’s provider fee is deducted from the Service Provider settlement and is not added to your bill.', language)}</p><p className="mt-1 text-sm font-medium">{tr('Pay now', language)}: {displayMoney(job.customer_payable_now_c ?? billing.customerPayableNow)}</p></div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">{['UPI', 'Card', 'Net Banking'].map((method) => <Button key={method} type="button" variant={paymentMethod === method ? 'default' : 'outline'} onClick={() => setPaymentMethod(method)} disabled={working}>{method}</Button>)}</div>
            <Button className="mt-4 w-full sm:w-auto" onClick={simulatePayment} disabled={working}><ApperIcon name="ShieldCheck" size={16} /> {tr('Pay', language)} {displayMoney(job.customer_payable_now_c ?? billing.customerPayableNow)} {tr('to confirm booking (Demo)', language)}</Button>
          </div>
        )}
        {!isPayAfterCompletion && isCustomer && job.status_c === 'Completed' && job.payment_status_c !== 'Final Payment Paid' && (
          <div className="mt-7 border-t border-border pt-5">
            <div className="rounded-lg border border-highlight/30 bg-highlight/5 p-4">
              <div className="flex items-center gap-2 font-semibold"><ApperIcon name="CreditCard" size={18} /> Final service payment due</div>
              <p className="mt-1 text-sm text-muted-foreground">The work has been marked completed. Pay the remaining service balance to finish the booking.</p>
              <p className="mt-2 text-lg font-semibold">Amount due: {displayMoney(job.remaining_amount_c ?? billing.remainingServiceAmount)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">{['UPI', 'Card', 'Net Banking'].map((method) => <Button key={method} type="button" variant={paymentMethod === method ? 'default' : 'outline'} onClick={() => setPaymentMethod(method)} disabled={working}>{method}</Button>)}</div>
              <Button className="mt-4" onClick={simulatePayment} disabled={working || job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review'}><ApperIcon name="ShieldCheck" size={16} /> {working ? 'Processing…' : `Pay ${displayMoney(job.remaining_amount_c ?? billing.remainingServiceAmount)} (Demo)`}</Button>
              {(job.dispute_status_c === 'Open' || job.dispute_status_c === 'Under Review') && <p className="mt-2 text-sm text-destructive">Payment is unavailable while this job is under dispute review.</p>}
            </div>
          </div>
        )}
        {!isPayAfterCompletion && ['Booking Commitment & Convenience Fee Paid', 'Final Payment Paid'].includes(job.payment_status_c) && <div className="mt-7 rounded-md border border-success-border bg-success-muted p-4"><div className="flex items-center gap-2 text-sm font-semibold text-success"><ApperIcon name="BadgeCheck" size={17} /> {tr(job.payment_status_c === 'Final Payment Paid' ? 'Final payment recorded' : 'Booking payment recorded', language)}</div><p className="mt-1 text-sm text-success">{displayMoney(job.customer_payable_now_c ?? billing.customerPayableNow)} paid by demo {job.payment_method_c}. {job.payment_status_c === 'Final Payment Paid' ? 'The remaining balance is settled.' : `${tr('Remaining service amount', language)}: ${displayMoney(job.remaining_amount_c ?? billing.remainingServiceAmount)}.`}</p></div>}
        {!isPayAfterCompletion && <div className="mt-7 border-t border-border pt-5"><div className="text-sm font-semibold">{tr('Next action', language)}</div><p className="mt-1 text-sm text-muted-foreground">{tr('Keep the job status updated so both sides know where the service stands.', language)}</p><div className="mt-4 flex flex-wrap gap-2">
          {isProvider && job.status_c === 'Assigned' && ['Booking Commitment & Convenience Fee Paid', 'Final Payment Paid'].includes(job.payment_status_c) && <Button onClick={() => setStatus('In Progress')} disabled={working || (isCarCare && inspectionStatus !== 'Confirmed')}><ApperIcon name="Play" size={16} /> {tr('Start job', language)}</Button>}
          {isProvider && isCarService && job.status_c === 'Assigned' && inspectionStatus !== 'Confirmed' && <p className="text-sm text-highlight">Complete the vehicle condition report and obtain customer confirmation before starting Car Service.</p>}
          {isProvider && job.status_c === 'Assigned' && !['Booking Commitment & Convenience Fee Paid', 'Final Payment Paid'].includes(job.payment_status_c) && <div className="rounded-md border border-highlight/30 bg-highlight/10 px-4 py-2 text-sm text-highlight">{tr('Waiting for the customer to complete the booking payment before the Service Provider can start the job.', language)}</div>}
          {isProvider && job.status_c === 'In Progress' && <Button onClick={() => setStatus('Completed')} disabled={working}><ApperIcon name="CheckCircle2" size={16} /> Mark completed</Button>}
          {(isProvider || isCustomer || isAdmin) && ['Assigned', 'In Progress'].includes(job.status_c) && <Button variant="outline" onClick={() => setStatus('Cancelled')} disabled={working}>Cancel job</Button>}
          {isAdmin && job.status_c === 'Completed' && <Button variant="outline" onClick={() => setStatus('In Progress')} disabled={working}>Reopen job</Button>}
          {job.status_c === 'Completed' && <div className="rounded-md border border-success-border bg-success-muted px-4 py-2 text-sm text-success">Service completed successfully.</div>}
          {job.status_c === 'Cancelled' && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">This job is cancelled.</div>}
        </div></div>}
      </Card>
    </div>
  );
}
