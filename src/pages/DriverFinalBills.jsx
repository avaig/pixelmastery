import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/local/EntityPages';

export const route = {
  path: '/admin/driver-final-bills',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export const nav = {
  to: '/admin/driver-final-bills',
  label: 'Driver Final Bills',
  icon: 'ReceiptText',
  order: 3,
  profiles: ['Admin_c'],
  section: 'Admin',
};

function readDriverTripMetadata(note, marker) {
  const source = String(note ?? '');
  const index = source.lastIndexOf(marker);
  if (index < 0) return null;
  const raw = source.slice(index + marker.length);
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

const money = (value) => '₹' + Number(value ?? 0).toLocaleString('en-IN');

export default function DriverFinalBills() {
  const { data, loading, error, run } = useFetch(async () => {
    const result = await sdk.table('jobs_c')
      .select(['Id', 'Name', 'request_c', 'status_c', 'payment_status_c', 'admin_review_note_c'])
      .page(1, 2000).fetch();
    if (!result.success) throw new Error(result.messages?.[0] || 'Driver bills could not be loaded.');
    return result.data ?? [];
  }, []);
  const pendingBills = useMemo(() => (data ?? []).map((job) => {
    // The completion marker is the source of truth. Do not depend on a display name or
    // exact status label: older job records may have a generic name/status lookup.
    const completion = readDriverTripMetadata(job.admin_review_note_c, 'LOCAL_DRIVER_TRIP_COMPLETION_JSON:');
    const review = readDriverTripMetadata(job.admin_review_note_c, 'LOCAL_DRIVER_TRIP_REVIEW_JSON:');
    if (!completion || review?.approved === true) return null;
    return { job, completion, review };
  }).filter(Boolean), [data]);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader eyebrow="ADMIN" title="Driver Final Bills" description="Review trip completion details and share the final bill with the customer after recording consent." />
      <Card className="border-amber-200 bg-amber-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-800"><ApperIcon name="FileCheck2" size={22} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Awaiting Admin review</h2>
            <p className="mt-1 text-sm text-slate-600">Open a submitted bill, verify the final charges, call the customer and record explicit consent. The customer payment option remains locked until approval.</p>
          </div>
        </div>
      </Card>
      {loading && !data ? <div className="h-40 animate-pulse rounded-xl border bg-muted" /> : error ? <Card className="p-5"><p className="font-semibold">Could not load submitted bills.</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-3" variant="outline" onClick={run}>Retry</Button></Card> : pendingBills.length === 0 ? <Card className="p-8 text-center"><ApperIcon name="ClipboardCheck" size={34} className="mx-auto text-muted-foreground" /><h2 className="mt-3 font-semibold">No bills awaiting review</h2><p className="mt-1 text-sm text-muted-foreground">When a Service Provider submits trip completion details, the bill will appear here.</p><Button className="mt-4" variant="outline" onClick={run}>Refresh bills</Button></Card> : <div className="space-y-3">{pendingBills.map(({ job, completion }) => <Card key={job.Id} className="p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{job.Name || 'Driver on Demand trip'}</h2><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Awaiting review</span></div><p className="mt-2 text-sm text-slate-600">Trip duration: {completion.duration || '—'} · Distance: {completion.distanceKm || '—'}</p><p className="mt-1 text-sm text-slate-600">Service subtotal: {money(completion.serviceAmount)} · LOCAL fee: {money(completion.localFee ?? 25)}</p><p className="mt-1 text-lg font-bold text-slate-900">Customer total: {money(completion.customerTotal)}</p><p className="mt-1 text-xs text-muted-foreground">Submitted {completion.submittedAt ? new Date(completion.submittedAt).toLocaleString('en-IN') : 'for review'}</p></div><Button asChild className="shrink-0"><Link to={'/jobs/' + job.Id}><ApperIcon name="ClipboardCheck" size={16} /> Review bill & share</Link></Button></div></Card>)}</div>}
      <div className="flex justify-start"><Button variant="outline" asChild><Link to="/admin/dispatch"><ApperIcon name="ArrowLeft" size={16} /> Back to Central Dispatch</Link></Button></div>
    </div>
  );
}
