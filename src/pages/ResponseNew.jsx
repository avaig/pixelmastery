import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import LookupSelect from '@/components/local/LookupSelect';
import ApperIcon from '@/components/ApperIcon';
import { PageHeader } from '@/components/local/EntityPages';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { getProviderCapabilities, providerCanHandleRequest, getDistanceKm, formatDistance } from '@/services/providerMatching';

const { eq } = window.ApperSDK.CoreSDK;

export const route = { path: '/responses/new', layout: 'owner', access: "profile === 'ServiceProvider_c' || profile === 'Admin_c'" };

export default function ResponseNew() {
  const user = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestId = params.get('requestId') ?? '';
  const [form, setForm] = useState({ Name: '', request_c: requestId, technician_c: '', proposed_price_c: '', availability_c: 'Available Now', message_c: '' });
  const [saving, setSaving] = useState(false);
  const [profileLookupExpired, setProfileLookupExpired] = useState(false);
  const [washItemPrices, setWashItemPrices] = useState({});
  const [showWashCounter, setShowWashCounter] = useState(false);
  const providerEmail = String(user?.emailAddress ?? user?.email ?? user?.email_c ?? user?.username ?? '').trim().toLowerCase();
  const { data: technician, loading: technicianLoading, error: technicianError, run: reloadTechnician } = useFetch(() => {
    if (!providerEmail) return Promise.resolve(null);
    const profileLookup = sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c', 'latitude_c', 'longitude_c']).page(1, 100).fetch().then((res) => {
      if (!res?.success) throw new Error(res?.messages?.[0] || res?.message || 'Could not load Service Provider profile.');
      return (res.data ?? []).find((profile) => String(profile.email_c ?? '').trim().toLowerCase() === providerEmail) ?? null;
    });
    const timeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error('Profile lookup timed out. Please retry.')), 8000));
    return Promise.race([profileLookup, timeout]);
  }, [providerEmail]);
  useEffect(() => {
    if (!technicianLoading) { setProfileLookupExpired(false); return; }
    const timer = window.setTimeout(() => setProfileLookupExpired(true), 9000);
    return () => window.clearTimeout(timer);
  }, [technicianLoading]);
  const { data: request } = useFetch(() => requestId ? sdk.table('service_requests_c').select(['Id', 'Name', 'problem_description_c', 'required_capability_c', 'preferred_time_c', 'scheduled_at_c', 'location_c', 'latitude_c', 'longitude_c', 'service_mode_c', 'pricing_mode_c', 'status_c']).get(requestId).then((res) => res.data) : Promise.resolve(null), [requestId]);
  const providerDistanceKm = getDistanceKm(technician?.latitude_c, technician?.longitude_c, request?.latitude_c, request?.longitude_c);
  const providerDistanceLabel = providerDistanceKm === null ? null : formatDistance(providerDistanceKm);
  const providerEtaMinutes = providerDistanceKm === null ? null : Math.max(5, Math.round((providerDistanceKm / 20) * 60));
  const requestDescription = String(request?.problem_description_c ?? '');
  const isCarWashRequest = /car wash/i.test(String(request?.Name ?? '')) || /Car Wash services/i.test(requestDescription);\n  const isEmergencyRequest = String(request?.service_mode_c ?? '').trim().toLowerCase() === 'urgent' || (/battery jump start|battery assistance|flat tyre|puncture|out of fuel|towing required|vehicle recovery|ambulance|emergency|roadside assistance|key locked|lockout/i.test(String(request?.Name ?? '') + ' ' + requestDescription) && ['asap', 'book now', 'urgent'].includes(String(request?.preferred_time_c ?? '').trim().toLowerCase()));
  let washItems = [];
  try { const marker = 'CAR_WASH_DECISIONS_JSON:'; const start = requestDescription.indexOf(marker); const jsonStart = start >= 0 ? start + marker.length : -1; const jsonEnd = jsonStart >= 0 ? requestDescription.indexOf(']', jsonStart) + 1 : -1; if (jsonStart >= 0 && jsonEnd > jsonStart) washItems = JSON.parse(requestDescription.slice(jsonStart, jsonEnd)); } catch { washItems = []; }
  const washMenuTotal = washItems.reduce((sum, item) => sum + (Number(item.listedUnitPrice ?? 0) * Number(item.quantity ?? 1)), 0);
  let customerWashOffer = washMenuTotal;
  try { const marker = 'CUSTOMER_CAR_WASH_OFFER_JSON:'; const start = requestDescription.indexOf(marker); if (start >= 0) { const jsonStart = start + marker.length; const jsonEnd = requestDescription.indexOf('}', jsonStart) + 1; if (jsonEnd > jsonStart) customerWashOffer = Number(JSON.parse(requestDescription.slice(jsonStart, jsonEnd)).customerOffer ?? washMenuTotal); } } catch { customerWashOffer = washMenuTotal; }
  const washOfferTotal = customerWashOffer;

  useEffect(() => {
    if (request?.preferred_time_c === 'Scheduled') setForm((current) => ({ ...current, availability_c: 'Available at requested time' }));
    if (technician?.Id && !form.technician_c) setForm((current) => ({ ...current, technician_c: technician.Id }));
    // Response names are generated from the provider and request when saved; no user-entered offer title is needed.
  }, [technician, request]);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (isEmergencyRequest) {\n      toast.error('This is an urgent request. Return to the request details and use the direct-accept action; do not send a quote.');\n      navigate('/requests/' + encodeURIComponent(request.Id));\n      return;\n    }\n    if (request?.preferred_time_c === 'Scheduled' && form.availability_c !== 'Available at requested time') {
      toast.error('You must confirm availability at the requested time before sending an offer.');
      return;
    }
    if (!form.request_c || !form.technician_c || (!isCarWashRequest && !form.proposed_price_c)) {
      toast.error('Request, service provider and price are required.');
      return;
    }
    if (isCarWashRequest && !washItems.length) {
      toast.error('The Car Wash booking has no selected services.');
      return;
    }
    if (user?.profile === 'ServiceProvider_c' && request?.required_capability_c) {
      const capabilities = await getProviderCapabilities(form.technician_c);
      const eligible = providerCanHandleRequest(request, capabilities);
      if (!eligible) {
        toast.error('This request is not matched to one of your selected capabilities.');
        return;
      }
    }
    setSaving(true);
    try {
      const finalOfferPrice = isCarWashRequest ? (form.proposed_price_c.trim() === '' ? washOfferTotal : Number(form.proposed_price_c)) : Number(form.proposed_price_c);
      const washOfferBreakdown = [];
      const responseMessage = isCarWashRequest ? (Number(finalOfferPrice) === Number(washOfferTotal) ? 'Customer offer accepted: ₹' : 'Service Provider counter-offer: ₹') + finalOfferPrice.toLocaleString('en-IN') + (form.message_c ? '\\n' + form.message_c : '') : (form.message_c || null);
      const res = await sdk.table('technician_responses_c').create({
        Name: (technician?.Name ? technician.Name + ' • ' : '') + String(request?.Name ?? 'Service request') + (isCarWashRequest ? ' booking response' : ' quote'),
        request_c: form.request_c,
        technician_c: form.technician_c,
        proposed_price_c: finalOfferPrice,
        original_proposed_price_c: finalOfferPrice,
        final_agreed_price_c: null,
        negotiation_status_c: 'Not Started',
        negotiation_history_c: new Date().toLocaleString('en-IN') + (isCarWashRequest ? ' — Customer total offer: ₹' : ' — Service Provider quote: ₹') + finalOfferPrice.toLocaleString('en-IN'),
        availability_c: form.availability_c,
        message_c: responseMessage,
        status_c: 'Pending',
      });
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'Offer was not created.');
        return;
      }
      const reqRes = await sdk.table('service_requests_c').update({ Id: form.request_c, status_c: 'Quoted' });
      if (!reqRes.data?.length) toast.warning('Offer created, but request status was not updated.');
      toast.success('Offer sent to customer.');
      navigate('/responses/' + res.data[0].Id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Service Provider flow" title={isCarWashRequest ? 'Respond to Car Wash booking' : 'Submit your quote'} description={isCarWashRequest ? 'Review the selected services and respond with one total booking price.' : 'Review the request, enter one total price, and confirm when you can attend.'} />
      <Card className="border-l-4 border-highlight p-5 md:p-7">
        <form onSubmit={submit} className="grid gap-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div><Label>Service request</Label><div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm font-medium">{request?.Name ?? (requestId ? 'Loading request…' : 'Choose a request from Service Requests first')}</div>{request?.location_c && <div className="mt-2 text-xs text-muted-foreground">Customer location: {request.location_c}{providerDistanceLabel ? ' • ' + providerDistanceLabel + ' away' : ''}{providerEtaMinutes !== null ? ' • approx. ' + providerEtaMinutes + ' min travel' : ''}</div>}{!requestId && <div className="mt-2"><LookupSelect targetTable="service_requests_c" value={form.request_c} onChange={(value) => setValue('request_c', value)} label="service request" /></div>}</div>
            <div><Label>Service Provider *</Label><div className="mt-2">{user?.profile === 'Admin_c' ? <LookupSelect targetTable="technician_profiles_c" value={form.technician_c} onChange={(value) => setValue('technician_c', value)} label="service provider" /> : <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">{technicianLoading && !profileLookupExpired ? 'Loading your Service Provider profile…' : technician?.Name ?? (technicianError || profileLookupExpired ? <span className="flex flex-wrap items-center justify-between gap-2"><span>Profile could not be loaded. Retry or check your Service Provider account email.</span><Button type="button" size="sm" variant="outline" onClick={() => { setProfileLookupExpired(false); reloadTechnician(); }}>Retry</Button></span> : 'No Service Provider profile found for this login. Please contact LOCAL support.')}</div>}</div></div>

            {isCarWashRequest ? <div className="md:col-span-2 rounded-lg border border-primary/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Car Wash booking summary</h3><p className="mt-1 text-sm text-muted-foreground">Review the selected services and decide on one total booking price.</p></div><div className="rounded-lg bg-primary/5 px-4 py-3"><div className="text-xs text-muted-foreground">Customer's total offer</div><div className="text-2xl font-bold">₹{washOfferTotal.toLocaleString('en-IN')}</div></div></div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground"><span>{request?.location_c || 'Customer location unavailable'}</span>{providerDistanceLabel && <span>• {providerDistanceLabel} away</span>}{providerEtaMinutes !== null && <span>• Approx. {providerEtaMinutes} min travel estimate</span>}</div><p className="mt-1 text-xs text-muted-foreground">Distance is straight-line; travel time is a rough estimate, not live traffic navigation.</p><div className="mt-3 overflow-x-auto rounded-md border"><table className="w-full table-fixed text-left text-sm"><thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="w-[58%] px-2 py-2 sm:px-3">Selected service</th><th className="w-[12%] px-1 py-2 text-center">Qty.</th><th className="w-[30%] px-2 py-2 text-right sm:px-3">Menu price</th></tr></thead><tbody>{washItems.map((item) => <tr key={item.id} className="border-t"><td className="break-words px-2 py-2.5 font-medium sm:px-3">{item.title}{item.variant && item.variant !== 'Fixed' ? ' — ' + item.variant : ''}</td><td className="px-1 py-2.5 text-center text-muted-foreground">{item.quantity}</td><td className="whitespace-nowrap px-2 py-2.5 text-right font-medium sm:px-3">₹{(Number(item.listedUnitPrice) * Number(item.quantity || 1)).toLocaleString('en-IN')}</td></tr>)}<tr className="border-t bg-muted/40"><td colSpan={2} className="px-2 py-3 font-semibold sm:px-3">Actual Price of Service</td><td className="whitespace-nowrap px-2 py-3 text-right text-base font-bold sm:px-3">₹{washMenuTotal.toLocaleString('en-IN')}</td></tr></tbody></table></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Button type="submit" className="w-full" disabled={saving || showWashCounter} onClick={() => setValue('proposed_price_c', String(washOfferTotal))}><ApperIcon name="Check" size={16}/> {saving ? 'Accepting…' : 'Accept ₹' + washOfferTotal.toLocaleString('en-IN')}</Button><Button type="button" variant="outline" className="w-full" onClick={() => { setShowWashCounter((value) => !value); setValue('proposed_price_c', ''); }}><ApperIcon name="MessageSquare" size={16}/> {showWashCounter ? 'Cancel counter-offer' : 'Make a counter-offer'}</Button></div>{showWashCounter && <div className="mt-4 rounded-lg border p-4"><Label htmlFor="price">Your total counter-offer (₹)</Label><Input id="price" type="number" min="1" value={form.proposed_price_c} onChange={(event) => setValue('proposed_price_c', event.target.value)} placeholder="Enter one total price" className="mt-2"/><p className="mt-1 text-xs text-muted-foreground">Enter one price for the complete booking, including Pickup &amp; Drop if selected.</p><Button type="submit" className="mt-3 w-full" disabled={saving || !form.proposed_price_c.trim() || Number(form.proposed_price_c) <= 0}>{saving ? 'Sending…' : 'Send counter-offer'}</Button></div>}</div> : <div><Label htmlFor="price">Proposed price (₹) *</Label><Input id="price" type="number" min="0" value={form.proposed_price_c} onChange={(event) => setValue('proposed_price_c', event.target.value)} placeholder="650" className="mt-2" /></div>}
            <div><Label>{request?.preferred_time_c === 'Scheduled' ? 'Appointment availability *' : 'When can you attend? *'}</Label>{request?.preferred_time_c === 'Scheduled' ? <div className="mt-2 rounded-md border border-border bg-muted/30 p-3"><div className="text-sm font-medium">Requested: {request.scheduled_at_c ? new Date(request.scheduled_at_c).toLocaleString('en-IN') : 'Scheduled time'}</div><Select value={form.availability_c} onValueChange={(value) => setValue('availability_c', value)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{['Available at requested time', 'Cannot attend requested time'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Confirm only if you can attend at the requested time.</p></div> : <Select value={form.availability_c} onValueChange={(value) => setValue('availability_c', value)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{['Available Now', 'Within 1 hour', 'Today', 'Tomorrow'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>}</div>
            <div className="md:col-span-2"><Label htmlFor="message">Optional note</Label><Textarea id="message" value={form.message_c} onChange={(event) => setValue('message_c', event.target.value)} placeholder="Add a note only if needed (optional)" rows={2} className="mt-2" /></div>
          </div>
          <div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="outline" onClick={() => navigate(requestId ? '/requests/' + requestId : '/responses')}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Sending…</> : <><ApperIcon name="Send" size={16} /> Submit quote</>}</Button></div>
        </form>
      </Card>
    </div>
  );
}