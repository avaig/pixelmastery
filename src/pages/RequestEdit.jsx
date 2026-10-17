import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/local/EntityPages';
import { toast } from 'sonner';

const { eq } = window.ApperSDK.CoreSDK;
const REQUEST_FIELDS = ['Id', 'Name', 'customer_c', 'service_category_c', 'required_capability_c', 'problem_description_c', 'location_c', 'latitude_c', 'longitude_c', 'status_c', 'preferred_time_c', 'scheduled_at_c', 'service_mode_c'];

function readWashDecisions(description) {
  const marker = 'CAR_WASH_DECISIONS_JSON:';
  const start = String(description ?? '').indexOf(marker);
  if (start < 0) return [];
  const jsonStart = start + marker.length;
  const jsonEnd = String(description).indexOf(']', jsonStart);
  if (jsonEnd < 0) return [];
  try {
    const parsed = JSON.parse(String(description).slice(jsonStart, jsonEnd + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function replaceWashDecisions(description, decisions) {
  const marker = 'CAR_WASH_DECISIONS_JSON:';
  const source = String(description ?? '');
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const jsonStart = start + marker.length;
  const jsonEnd = source.indexOf(']', jsonStart);
  if (jsonEnd < 0) return source;
  return source.slice(0, jsonStart) + JSON.stringify(decisions) + source.slice(jsonEnd + 1);
}

function isCarWash(request) {
  return /car wash/i.test(String(request?.Name ?? '')) || /Car Wash services/i.test(String(request?.problem_description_c ?? ''));
}

export const route = {
  path: '/requests/:id/edit',
  layout: 'owner',
  access: "profile === 'Customer_c' || profile === 'Admin_c'",
};

export default function RequestEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const [location, setLocation] = useState('');
  const [timing, setTiming] = useState('ASAP');
  const [scheduledAt, setScheduledAt] = useState('');
  const [decisions, setDecisions] = useState([]);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, run } = useFetch(async () => {
    const [requestRes, profileRes, offersRes, jobsRes] = await Promise.all([
      sdk.table('service_requests_c').select(REQUEST_FIELDS).get(id),
      sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c']).page(1, 1000).fetch(),
      sdk.table('technician_responses_c').select(['Id', 'request_c', 'status_c']).where(eq('request_c', id)).page(1, 100).fetch(),
      sdk.table('jobs_c').select(['Id', 'request_c', 'status_c']).where(eq('request_c', id)).page(1, 10).fetch(),
    ]);
    if (!requestRes.success || !requestRes.data) throw new Error(requestRes.message || 'This service request could not be found.');
    if (!profileRes.success || !offersRes.success || !jobsRes.success) throw new Error('Booking details could not be loaded. Please retry.');
    const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
    const customer = (profileRes.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === email);
    const request = requestRes.data;
    const requestCustomerId = String(request.customer_c?.Id ?? request.customer_c ?? '');
    const isAdmin = user?.profile === 'Admin_c';
    if (!isAdmin && (!customer?.Id || requestCustomerId !== String(customer.Id))) {
      throw new Error('You can edit only your own service bookings.');
    }
    return { request, offers: offersRes.data ?? [], jobs: jobsRes.data ?? [], customer };
  }, [id, user?.profile, user?.emailAddress, user?.email]);

  const request = data?.request;
  const wash = isCarWash(request);
  const hasOffers = Boolean(data?.offers?.length);
  const hasJob = Boolean(data?.jobs?.length);
  const canChangeServices = !hasOffers && !hasJob && ['Open', 'Quoted', 'Negotiating'].includes(String(request?.status_c ?? 'Open'));
  const initialDescription = String(request?.problem_description_c ?? '');

  useEffect(() => {
    if (!request) return;
    setLocation(String(request.location_c ?? ''));
    const storedTiming = String(request.preferred_time_c ?? 'ASAP');
    setTiming(['Scheduled', 'Schedule for Later'].includes(storedTiming) ? 'Scheduled' : storedTiming === 'ASAP' ? 'ASAP' : storedTiming);
    setScheduledAt(request.scheduled_at_c ? new Date(request.scheduled_at_c).toISOString().slice(0, 16) : '');
    setDecisions(readWashDecisions(request.problem_description_c));
  }, [request?.Id]);

  const includedTotal = useMemo(() => decisions.reduce((sum, item) => {
    if (String(item.decision ?? 'included').toLowerCase() !== 'included') return sum;
    return sum + Number(item.listedUnitPrice ?? 0) * Math.max(1, Number(item.quantity ?? 1));
  }, 0), [decisions]);
  const includedCount = decisions.filter((item) => String(item.decision ?? 'included').toLowerCase() === 'included').length;

  function toggleItem(index) {
    setDecisions((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, decision: String(item.decision ?? 'included').toLowerCase() === 'included' ? 'excluded' : 'included' }
      : item));
  }

  async function save(event) {
    event.preventDefault();
    if (!request) return;
    if (!location.trim()) {
      toast.error('Enter the service location.');
      return;
    }
    if (timing === 'Scheduled') {
      const parsed = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        toast.error('Choose a future date and time.');
        return;
      }
    }
    if (location.trim() !== String(request.location_c ?? '').trim()) {
      toast.error('To keep nearby-provider matching accurate, please update the confirmed location from your customer dashboard before changing this booking address.');
      return;
    }
    setSaving(true);
    try {
      let description = initialDescription;
      if (wash && canChangeServices && decisions.length) {
        const nextDecisions = decisions.map((item) => ({ ...item }));
        description = replaceWashDecisions(description, nextDecisions);
        const total = nextDecisions.reduce((sum, item) => String(item.decision ?? 'included').toLowerCase() === 'included'
          ? sum + Number(item.listedUnitPrice ?? 0) * Math.max(1, Number(item.quantity ?? 1))
          : sum, 0);
        description = description.replace(/(Menu Total:\\s*₹?)[\\d,]+/i, '$1' + total.toLocaleString('en-IN'));
        description = description.replace(/(Customer Car Wash total offer:\\s*₹?)[\\d,]+/i, '$1' + total.toLocaleString('en-IN'));
      }
      const patch = {
        Id: request.Id,
        location_c: request.location_c,
        latitude_c: request.latitude_c,
        longitude_c: request.longitude_c,
        preferred_time_c: timing === 'Scheduled' ? 'Scheduled' : 'ASAP',
        scheduled_at_c: timing === 'Scheduled' ? new Date(scheduledAt).toISOString() : null,
      };
      if (wash && canChangeServices && decisions.length) {
        patch.problem_description_c = description;
        patch.Name = 'CAR • Car Wash (' + includedCount + ' items)';
      }
      const result = await sdk.table('service_requests_c').update(patch);
      if (!result.data?.length) {
        toast.error(result.messages?.[0] ?? 'Your booking was not updated.');
        return;
      }
      toast.success('Booking updated.');
      navigate('/requests/' + request.Id);
    } catch (err) {
      toast.error(err.message || 'Could not update the booking.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <div className="mx-auto max-w-3xl space-y-4"><div className="h-8 w-64 animate-pulse rounded bg-muted" /><Card className="h-72 animate-pulse bg-muted" /></div>;
  }
  if (error || !request) {
    return <Card className="mx-auto max-w-3xl border-l-4 border-destructive p-6"><h2 className="font-semibold">Booking unavailable</h2><p className="mt-2 text-sm text-muted-foreground">{error?.message || 'This booking could not be found.'}</p><Button asChild className="mt-4" variant="outline"><Link to="/requests">Back to Service Requests</Link></Button></Card>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Customer booking"
        title="Edit Booking"
        description="Update your selected services and booking details."
        action={<Button variant="outline" asChild><Link to={'/requests/' + request.Id}><ApperIcon name="ArrowLeft" size={16} /> Back to booking</Link></Button>}
      />
      {(hasOffers || hasJob) && <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><div className="flex items-center gap-2 font-semibold"><ApperIcon name="Info" size={17} />Service changes are locked</div><p className="mt-1 text-muted-foreground">Providers have already responded or a job exists. To avoid changing the scope of an offer already made, selected services cannot be changed here. You can still review your booking details below.</p></div>}
      <form onSubmit={save} className="space-y-5">
        {wash && <Card className="space-y-4 p-5 md:p-6">
          <div><h2 className="text-lg font-semibold">Your selected Car Wash services</h2><p className="mt-1 text-sm text-muted-foreground">{canChangeServices ? 'Remove any item you no longer need. The total updates automatically.' : 'These items are shown for reference because providers have already responded.'}</p></div>
          {decisions.length ? <div className="space-y-3">
            {decisions.map((item, index) => {
              const included = String(item.decision ?? 'included').toLowerCase() === 'included';
              const lineTotal = Number(item.listedUnitPrice ?? 0) * Math.max(1, Number(item.quantity ?? 1));
              return <div key={String(item.id ?? item.title ?? index) + '-' + index} className={'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ' + (included ? 'border-border' : 'border-dashed opacity-60')}>
                <div className="min-w-0 flex-1"><div className="font-medium">{item.title || item.id || 'Car Wash service'}</div><div className="mt-1 text-sm text-muted-foreground">{item.variant || 'Standard'} · Qty {item.quantity ?? 1}</div><div className="mt-1 font-semibold">₹{lineTotal.toLocaleString('en-IN')}</div></div>
                {canChangeServices && <Button type="button" size="sm" variant={included ? 'outline' : 'default'} onClick={() => toggleItem(index)}>{included ? 'Remove' : 'Add back'}</Button>}
                {!canChangeServices && <span className="text-sm text-muted-foreground">{included ? 'Included' : 'Removed'}</span>}
              </div>;
            })}
          </div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Detailed cart items are unavailable for this older request. The original request details will be preserved.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><div className="text-sm text-muted-foreground">Selected-service total</div><div className="text-2xl font-bold">₹{includedTotal.toLocaleString('en-IN')}</div></div><div className="text-sm text-muted-foreground">{includedCount} selected item{includedCount === 1 ? '' : 's'}</div></div>
        </Card>}
        <Card className="space-y-5 p-5 md:p-6">
          <div><h2 className="text-lg font-semibold">Service location</h2><p className="mt-1 text-sm text-muted-foreground">LOCAL uses your confirmed coordinates to find nearby help. Change your saved location from the customer dashboard to keep distance matching accurate.</p></div>
          <div className="space-y-2"><Label htmlFor="booking-location">Confirmed location</Label><Input id="booking-location" value={location} onChange={(event) => setLocation(event.target.value)} disabled /></div>
          <div className="space-y-2"><Label>When do you need the service?</Label><div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setTiming('ASAP')} className={'flex items-start gap-3 rounded-xl border p-4 text-left transition ' + (timing !== 'Scheduled' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}><ApperIcon name="Zap" size={20} /><span><span className="block font-semibold">Book Now</span><span className="mt-1 block text-sm text-muted-foreground">Request nearby providers now</span></span></button>
            <button type="button" onClick={() => setTiming('Scheduled')} className={'flex items-start gap-3 rounded-xl border p-4 text-left transition ' + (timing === 'Scheduled' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}><ApperIcon name="CalendarClock" size={20} /><span><span className="block font-semibold">Schedule for later</span><span className="mt-1 block text-sm text-muted-foreground">Choose a date and time</span></span></button>
          </div></div>
          {timing === 'Scheduled' && <div className="space-y-2"><Label htmlFor="scheduled-at">Preferred date and time</Label><Input id="scheduled-at" type="datetime-local" min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required /><p className="text-xs text-muted-foreground">This is a request, not a confirmed appointment. A Service Provider must accept it.</p></div>}
        </Card>
        <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" asChild><Link to={'/requests/' + request.Id}>Cancel</Link></Button><Button type="submit" disabled={saving}>{saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Saving…</> : <><ApperIcon name="Save" size={16} /> Save changes</>}</Button></div>
      </form>
    </div>
  );
}