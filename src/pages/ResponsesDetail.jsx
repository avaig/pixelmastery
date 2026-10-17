import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import { getBillingBreakdown, getBookingCommitmentAmount, getRemainingAmount } from '@/services/pricing';
import { getDistanceKm, formatDistance } from '@/services/providerMatching';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/responses/:id',
  layout: 'owner',
  access: "profile === 'Customer_c' || profile === 'ServiceProvider_c' || profile === 'Admin_c'",
};

export default function ResponsesDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const [working, setWorking] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [providerCounterPrice, setProviderCounterPrice] = useState('');

  const { data, loading, error, run } = useFetch(async () => {
    const responseRes = await sdk.table('technician_responses_c').select([
      'Id','Name','request_c','technician_c','proposed_price_c','original_proposed_price_c','final_agreed_price_c','negotiation_status_c','negotiation_history_c','availability_c','message_c','status_c'
    ]).get(id);
    if (!responseRes.data) throw new Error('Offer not found.');

    const requestId = responseRes.data.request_c?.Id ?? responseRes.data.request_c;
    const requestRes = await sdk.table('service_requests_c').select([
      'Id','Name','customer_c','service_category_c','location_c','latitude_c','longitude_c','status_c','preferred_time_c','service_mode_c','problem_description_c'
    ]).get(requestId);
    if (!requestRes.data) throw new Error('Related service request not found.');

    const providerId = responseRes.data.technician_c?.Id ?? responseRes.data.technician_c;
    if (user?.profile === 'ServiceProvider_c') {
      const providerRes = await sdk.table('technician_profiles_c').select(['Id', 'email_c', 'Name', 'latitude_c', 'longitude_c']).page(1, 1000).fetch();
      if (!providerRes.success) throw new Error(providerRes.message);
      const providerEmail = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
      const provider = (providerRes.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === providerEmail);
      if (!provider || String(provider.Id) !== String(providerId)) throw new Error('This offer is not available to this Service Provider.');
    }

    if (user?.profile === 'Customer_c') {
      const customerRes = await sdk.table('customer_profiles_c').select(['Id', 'email_c']).page(1, 1000).fetch();
      if (!customerRes.success) throw new Error(customerRes.message);
      const customerEmail = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
      const customer = (customerRes.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === customerEmail);
      const requestCustomerId = requestRes.data.customer_c?.Id ?? requestRes.data.customer_c;
      if (!customer || String(customer.Id) !== String(requestCustomerId)) throw new Error('This offer is not available for this customer.');
    }

    const providerRes = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c', 'latitude_c', 'longitude_c']).page(1, 1000).fetch();
    if (!providerRes.success) throw new Error(providerRes.message);
    const providerIdText = String(providerId);
    const matchedProvider = (providerRes.data ?? []).find((item) => String(item.Id) === providerIdText) ?? null;
    return { response: responseRes.data, request: requestRes.data, provider: matchedProvider };
  }, [id, user?.profile, user?.emailAddress, user?.email]);

  const response = data?.response;
  const request = data?.request;
  const providerProfile = data?.provider;
  const providerDistanceKm = getDistanceKm(providerProfile?.latitude_c, providerProfile?.longitude_c, request?.latitude_c, request?.longitude_c);
  const providerDistanceLabel = providerDistanceKm === null ? null : formatDistance(providerDistanceKm);
  const providerEtaMinutes = providerDistanceKm === null ? null : Math.max(5, Math.round((providerDistanceKm / 20) * 60));
  const isCustomer = user?.profile === 'Customer_c';
  const isProvider = user?.profile === 'ServiceProvider_c';
  const isAdmin = user?.profile === 'Admin_c';
  const message = response?.message_c ?? '';
  const isCounterOffer = message.startsWith('Customer counter-offer:');
  const isCarWashOffer = String(request?.Name ?? '').toLowerCase().includes('car wash');
  const carWashItems = (() => {
    if (!isCarWashOffer) return [];
    const description = String(request?.problem_description_c ?? '');
    const marker = 'CAR_WASH_DECISIONS_JSON:';
    const start = description.indexOf(marker);
    if (start < 0) return [];
    const jsonStart = start + marker.length;
    const end = description.indexOf(']', jsonStart);
    if (end < 0) return [];
    try { return JSON.parse(description.slice(jsonStart, end + 1)).map((item) => ({ name: item.name ?? item.label ?? item.serviceName ?? 'Car Wash service', quantity: Number(item.quantity ?? item.qty ?? 1), price: Number(item.unitPrice ?? item.listedUnitPrice ?? item.price ?? 0) })); } catch { return []; }
  })();
  const carWashMenuTotal = carWashItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  async function createJob() {
    const providerId = response.technician_c?.Id ?? response.technician_c;
    const finalPrice = Number(response.final_agreed_price_c ?? response.proposed_price_c);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) throw new Error('Enter or agree a valid service price before creating the job.');

    const existingRes = await sdk.table('jobs_c').select(['Id', 'request_c', 'response_c', 'technician_c', 'status_c']).where(eq('request_c', request.Id)).page(1, 10).fetch();
    if (!existingRes.success) throw new Error(existingRes.message ?? 'Could not check existing jobs.');
    let job = (existingRes.data ?? [])[0] ?? null;
    if (job) {
      const assignedProviderId = job.technician_c?.Id ?? job.technician_c;
      if (String(assignedProviderId ?? '') !== String(providerId)) throw new Error('This request already has a job assigned to a different Service Provider. Contact LOCAL support before changing the assignment.');
    } else {
      const completedJobsRes = await sdk.table('jobs_c').select(['Id', 'technician_c', 'status_c']).page(1, 1000).fetch();
      if (!completedJobsRes.success) throw new Error(completedJobsRes.message ?? 'Could not load Service Provider job history.');
      const completedJobsCount = (completedJobsRes.data ?? []).filter((item) => String(item.technician_c?.Id ?? item.technician_c) === String(providerId) && item.status_c === 'Completed').length;
      const isCarWashBooking = String(request.Name ?? '').toLowerCase().includes('car wash');
      const isAcBooking = /AC Technician/i.test(String(request.Name ?? '') + ' ' + String(request.problem_description_c ?? ''));
      const calculatedBilling = getBillingBreakdown(finalPrice, request.service_mode_c ?? 'Normal', completedJobsCount, 0, 0);
      const billing = isCarWashBooking || isAcBooking
        ? { ...calculatedBilling, servicePrice: finalPrice, bookingCommitment: 0, remainingServiceAmount: finalPrice, customerPayableNow: 0, localServiceFee: 0 }
        : calculatedBilling;
      const jobRes = await sdk.table('jobs_c').create({
        Name: request.Name + ' • ' + (response.technician_c?.Name ?? 'Service Provider'),
        request_c: request.Id,
        response_c: response.Id,
        customer_c: request.customer_c?.Id ?? request.customer_c,
        technician_c: providerId,
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
        scheduled_at_c: request.scheduled_at_c || new Date(Date.now() + 3600000).toISOString(),
        status_c: 'Assigned',
        payment_status_c: 'Unpaid',
        payment_method_c: null,
        payment_reference_c: null,
      });
      job = jobRes.data?.[0] ?? null;
      if (!job) {
        const retryRes = await sdk.table('jobs_c').select(['Id', 'request_c', 'response_c', 'technician_c', 'status_c']).where(eq('request_c', request.Id)).page(1, 10).fetch();
        if (retryRes.success) job = (retryRes.data ?? [])[0] ?? null;
        if (!job) throw new Error(jobRes.messages?.filter(Boolean).join(' | ') || jobRes.message || 'Job creation failed. No offer/request status was changed. Refresh and retry.');
      }
    }

    const history = String(response.negotiation_history_c ?? '').trim();
    const alreadyRecorded = /Customer selected Service Provider|Final agreed price locked/i.test(history);
    const agreedHistory = alreadyRecorded ? history : (history ? history + '\n' : '') + new Date().toLocaleString('en-IN') + ' — Final agreed price locked at ₹' + finalPrice.toLocaleString('en-IN');
    const responseUpdate = await sdk.table('technician_responses_c').update({ Id: response.Id, status_c: 'Selected', final_agreed_price_c: finalPrice, negotiation_status_c: 'Agreed', negotiation_history_c: agreedHistory });
    if (!responseUpdate.data?.length) throw new Error('Job exists, but offer status could not be synchronized: ' + (responseUpdate.messages?.filter(Boolean).join(' | ') || responseUpdate.message || 'update not confirmed') + '. Retry to finish synchronization.');
    const requestUpdate = await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Confirmed' });
    if (!requestUpdate.data?.length) throw new Error('Job exists, but request status could not be synchronized: ' + (requestUpdate.messages?.filter(Boolean).join(' | ') || requestUpdate.message || 'update not confirmed') + '. Retry to finish synchronization.');
    const otherResponses = await sdk.table('technician_responses_c').select(['Id', 'status_c']).where(eq('request_c', request.Id)).page(1, 100).fetch();
    if (otherResponses.success) {
      const otherPendingIds = (otherResponses.data ?? []).filter((item) => String(item.Id) !== String(response.Id) && item.status_c === 'Pending').map((item) => item.Id);
      if (otherPendingIds.length) await sdk.table('technician_responses_c').update(otherPendingIds.map((responseId) => ({ Id: responseId, status_c: 'Declined' })));
    }
    toast.success(job.status_c === 'Assigned' ? 'Service Provider confirmed. Job is now Assigned.' : 'Existing booking found and statuses synchronized.');
    navigate('/jobs/' + job.Id);
    return true;
  }
  async function acceptCustomerOffer() {
    setWorking(true);
    try {
      if (!isCounterOffer && !isCarWashOffer) {
        toast.error('This is a service provider offer. The customer must confirm it.');
        return;
      }
      // Provider acceptance agrees to the customer's counter-offer; it must not
      // create the job. The customer creates the job by confirming the booking.
      const price = Number(response.proposed_price_c);
      if (!Number.isFinite(price) || price <= 0) throw new Error('The customer offer does not contain a valid price.');
      const history = String(response.negotiation_history_c ?? '').trim();
      const acceptedAlready = /Service Provider accepted customer offer/i.test(history);
      const nextHistory = acceptedAlready ? history : (history ? history + '\\n' : '') + new Date().toLocaleString('en-IN') + ' — Service Provider accepted customer offer at ₹' + price.toLocaleString('en-IN');
      const update = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        final_agreed_price_c: price,
        negotiation_status_c: 'Agreed',
        negotiation_history_c: nextHistory,
        message_c: 'Service Provider accepted customer offer: ₹' + price.toLocaleString('en-IN'),
      });
      if (!update.data?.length) throw new Error(update.messages?.filter(Boolean).join(' | ') || update.message || 'Could not save your acceptance. Please refresh and try again.');
      toast.success('Offer accepted. The customer can now confirm the booking.');
      await run();
    } catch (err) {
      toast.error(err.message ?? 'Could not accept the customer offer.');
    } finally {
      setWorking(false);
    }
  }

  async function confirmProvider() {
    setWorking(true);
    try {
      await createJob();
    } catch (err) {
      toast.error(err.message ?? 'Could not confirm the service provider.');
    } finally {
      setWorking(false);
    }
  }

  async function negotiate() {
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
      const res = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        proposed_price_c: price,
        status_c: 'Pending',
        negotiation_status_c: 'Negotiating',
        negotiation_history_c: nextHistory,
        message_c: 'Customer counter-offer: ₹' + price.toLocaleString('en-IN'),
      });
      if (!res.data?.length) throw new Error(res.messages?.[0] ?? 'Counter-offer was not saved.');
      await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Negotiating' });
      toast.success('Counter-offer sent to the service provider.');
      setCounterPrice('');
      run();
    } catch (err) {
      toast.error(err.message ?? 'Could not send counter-offer.');
    } finally {
      setWorking(false);
    }
  }

  async function providerCounter() {
    const price = Number(providerCounterPrice);
    if (!price || price <= 0) {
      toast.error('Enter a valid counter price.');
      return;
    }
    setWorking(true);
    try {
      const previousPrice = Number(response.proposed_price_c ?? 0);
      const history = String(response.negotiation_history_c ?? '').trim();
      const nextHistory = (history ? history + '\n' : '') + new Date().toLocaleString('en-IN') + ' — Service Provider counter-offer: ₹' + price.toLocaleString('en-IN') + ' (previous ₹' + previousPrice.toLocaleString('en-IN') + ')';
      const res = await sdk.table('technician_responses_c').update({
        Id: response.Id,
        proposed_price_c: price,
        status_c: 'Pending',
        negotiation_status_c: 'Negotiating',
        negotiation_history_c: nextHistory,
        message_c: 'Service Provider counter-offer: ₹' + price.toLocaleString('en-IN'),
      });
      if (!res.data?.length) throw new Error(res.messages?.[0] ?? 'Provider counter-offer was not saved.');
      await sdk.table('service_requests_c').update({ Id: request.Id, status_c: 'Negotiating' });
      toast.success('Counter-offer sent to customer.');
      setProviderCounterPrice('');
      run();
    } catch (err) {
      toast.error(err.message ?? 'Could not send counter-offer.');
    } finally {
      setWorking(false);
    }
  }

  async function declineOffer() {
    setWorking(true);
    try {
      const res = await sdk.table('technician_responses_c').update({ Id: response.Id, status_c: 'Declined' });
      if (!res.data?.length) throw new Error(res.messages?.[0] ?? 'Offer status could not be updated.');
      toast.success('Offer declined.');
      run();
    } catch (err) {
      toast.error(err.message ?? 'Could not update offer.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" />;
  if (error || !response || !request) return <Card className="border-l-4 border-destructive p-6">This offer could not be found. <Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card>;

  return (
    <div>
      <PageHeader
        eyebrow="Service Provider offer"
        title={response.Name}
        description={request.Name + ' • ' + request.location_c + ' • ' + request.preferred_time_c}
        action={<Button asChild variant="outline"><Link to={'/requests/' + request.Id}><ApperIcon name="ArrowLeft" size={16} /> Back to request</Link></Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-l-4 border-primary p-5">
          <div className="grid gap-4">
            <div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Booking</div><div className="mt-1 font-semibold">{request.Name}</div></div>
            <div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Customer</div><div className="mt-1 font-medium">{request.customer_c?.Name ?? 'Customer'}</div></div>
            <div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Customer location</div><div className="mt-1 font-medium">{request.location_c || 'Address not available'}</div></div>
            {isCarWashOffer && <div className="rounded-md bg-muted/40 p-3"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Distance & arrival estimate</div>{providerDistanceLabel ? <div className="mt-1 font-semibold">{providerDistanceLabel} away{providerEtaMinutes !== null ? ' · approx. ' + providerEtaMinutes + ' min' : ''}</div> : <div className="mt-1 text-sm text-muted-foreground">Distance unavailable — provider or customer coordinates are missing.</div>}<div className="mt-1 text-xs text-muted-foreground">Straight-line distance; ETA is approximate and does not include live traffic.</div></div>}
            <div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Booking status</div><div className="mt-1"><StatusBadge value={response.status_c === 'Pending' && response.negotiation_status_c === 'Agreed' ? 'Job Accepted' : response.status_c} /></div></div>
          </div>
        </Card>

        <Card className="border-l-4 border-highlight p-5">
          {isCarWashOffer && carWashItems.length > 0 && (
            <div className="mb-6 rounded-lg border border-border bg-background p-4">
              <h2 className="font-heading text-lg font-semibold">Car Wash services requested</h2>
              <div className="mt-3 overflow-hidden rounded-md border border-border">
                <table className="w-full table-fixed text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="w-[58%] px-2 py-2 sm:px-3">Service item</th><th className="w-[12%] px-1 py-2 text-center sm:px-2">Qty.</th><th className="w-[30%] px-2 py-2 text-right sm:px-3">Menu price</th></tr></thead><tbody>{carWashItems.map((item, index) => <tr key={item.name + '-' + index} className="border-t border-border"><td className="break-words px-2 py-2.5 font-medium sm:px-3">{item.name}</td><td className="px-1 py-2.5 text-center text-muted-foreground sm:px-2">{item.quantity}</td><td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums sm:px-3">₹{(item.price * item.quantity).toLocaleString('en-IN')}</td></tr>)}<tr className="border-t bg-muted/40"><td colSpan={2} className="px-2 py-3 font-semibold sm:px-3">Actual Price of Service</td><td className="whitespace-nowrap px-2 py-3 text-right text-base font-bold tabular-nums sm:px-3">₹{carWashMenuTotal.toLocaleString('en-IN')}</td></tr></tbody></table>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">The customer and provider negotiate one overall booking total. Pickup &amp; Drop is included in the total and cannot be negotiated separately.</p>
            </div>
          )}
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Service Provider</div>
              <div className="mt-2 text-xl font-semibold">{providerProfile?.Name ?? response.technician_c?.Name ?? 'Service Provider'}</div>
              <div className="mt-2 text-sm text-muted-foreground">{response.availability_c}</div>
            </div>
            <div className="text-left md:text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{isCounterOffer ? 'Customer counter-offer' : isCarWashOffer ? 'Car Wash total offer / counter-offer' : 'Proposed price'}</div>
              <div className="font-heading text-3xl font-semibold">₹{Number(response.proposed_price_c ?? 0).toLocaleString('en-IN')}</div>
              {response.original_proposed_price_c != null && Number(response.original_proposed_price_c) !== Number(response.proposed_price_c) && <div className="mt-1 text-xs text-muted-foreground">Original quote ₹{Number(response.original_proposed_price_c).toLocaleString('en-IN')}</div>}
            </div>
          </div>
          <p className="mt-5 border-t border-border pt-5 text-sm leading-7">{response.message_c || 'No additional message.'}</p>

          {response.status_c === 'Pending' && (
            <div className="mt-6 border-t border-border pt-5">
              {isCustomer && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={declineOffer} disabled={working}>Decline offer</Button>
                  <div className="flex min-w-[280px] flex-1 gap-2">
                    <Input type="number" min="1" value={counterPrice} onChange={(event) => setCounterPrice(event.target.value)} placeholder="Counter price" />
                    <Button variant="outline" onClick={negotiate} disabled={working}>Negotiate</Button>
                  </div>
                  <Button onClick={confirmProvider} disabled={working}>Confirm Service Provider</Button>
                </div>
              )}

              {isProvider && response.negotiation_status_c === 'Agreed' && (
                <div className="rounded-lg border border-success-border bg-success-muted p-4 text-sm text-success">You accepted the customer's price of ₹{Number(response.final_agreed_price_c ?? response.proposed_price_c).toLocaleString('en-IN')}. Waiting for the customer to confirm the booking.</div>
              )}
              {isProvider && response.negotiation_status_c !== 'Agreed' && (isCounterOffer || isCarWashOffer) && (
                <div className="space-y-3">
                  <Button className="w-full sm:w-auto" onClick={acceptCustomerOffer} disabled={working}><ApperIcon name="Check" size={16} /> {working ? 'Accepting…' : 'Accept ₹' + Number(response.proposed_price_c ?? 0).toLocaleString('en-IN')}</Button>
                  <details className="rounded-lg border border-border p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Make a counter-offer or decline</summary>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="number" min="1" value={providerCounterPrice} onChange={(event) => setProviderCounterPrice(event.target.value)} placeholder="Your total counter-offer (₹)"/><Button variant="outline" onClick={providerCounter} disabled={working || !providerCounterPrice.trim()}>Send counter-offer</Button><Button variant="outline" onClick={declineOffer} disabled={working}>Decline</Button></div>
                  </details>
                </div>
              )}

              {isProvider && response.negotiation_status_c !== 'Agreed' && !isCounterOffer && !isCarWashOffer && (
                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Your offer is waiting for the customer. You can counter or leave the current quote unchanged.
                  </div>
                  <div className="flex min-w-[280px] gap-2">
                    <Input type="number" min="1" value={providerCounterPrice} onChange={(event) => setProviderCounterPrice(event.target.value)} placeholder="Counter price" />
                    <Button variant="outline" onClick={providerCounter} disabled={working}>Counter-offer</Button>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={confirmProvider} disabled={working}>Confirm Service Provider & Create Job</Button>
                  <Button variant="outline" onClick={declineOffer} disabled={working}>Decline Offer</Button>
                </div>
              )}
            </div>
          )}

          {response.negotiation_history_c && (
            <details className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">View negotiation history</summary>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-5 text-muted-foreground">{response.negotiation_history_c}</pre>
            </details>
          )}

          {response.status_c === 'Selected' && (
            <div className="mt-6 rounded-md border border-success-border bg-success-muted p-4 text-sm text-success">
              This offer has been accepted and a job has been created.
            </div>
          )}
          {response.status_c === 'Declined' && (
            <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              This offer has been declined.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
