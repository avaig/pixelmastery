import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { getEligibleRequests } from '@/services/providerMatching';

const { contains, eq, isIn, and } = window.ApperSDK.CoreSDK;

const FIELDS = ['Id', 'Name', 'customer_c', 'service_category_c', 'required_capability_c', 'location_c', 'latitude_c', 'longitude_c', 'status_c', 'preferred_time_c', 'requested_at_c', 'scheduled_at_c', 'CreatedOn'];

async function resolveProfileId(profile, email) {
  if (profile === 'Customer_c') {
    const res = await sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c']).where(eq('email_c', email ?? '')).page(1, 1).fetch();
    if (!res.success) throw new Error(res.message);
    return res.data?.[0]?.Id ?? null;
  }
  if (profile === 'ServiceProvider_c') {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const res = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c']).where(eq('email_c', email ?? '')).page(1, 1).fetch();
    if (!res.success) throw new Error(res.message);
    if (res.data?.[0]?.Id) return res.data[0].Id;
    // Mock and connected SDKs can differ in email filter behavior; resolve from a bounded profile list as a fallback.
    const fallback = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c']).page(1, 1000).fetch();
    if (!fallback.success) throw new Error(fallback.message);
    return (fallback.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === normalizedEmail)?.Id ?? null;
  }
  return null;
}

export const route = {
  path: '/requests',
  layout: 'owner',
  access: "profile === 'Customer_c' || profile === 'ServiceProvider_c' || profile === 'Admin_c'",
};

export const nav = {
  to: '/requests',
  label: 'Service Requests',
  icon: 'ClipboardList',
  order: 2,
  profiles: ['Customer_c', 'ServiceProvider_c', 'Admin_c'],
  section: 'Marketplace',
};

export default function RequestsList() {
  const user = useSelector((state) => state.user.user);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const { data, loading, error, run } = useFetch(async () => {
    let query = sdk.table('service_requests_c').select(FIELDS);
    const filters = [];
    const profile = user?.profile ?? '';
    const profileId = await resolveProfileId(profile, user?.emailAddress ?? user?.email);
    if (profile === 'Customer_c') {
      if (!profileId) return { rows: [], total: 0, hasMore: false };
      filters.push(eq('customer_c', profileId));
      // Customer Service Requests is the active negotiation queue only.
      // Once selected, a booking is followed from Jobs; the original request remains stored.
      filters.push(isIn('status_c', ['Open', 'Quoted', 'Negotiating']));
    }
    if (profile === 'ServiceProvider_c') {
      const eligible = await getEligibleRequests(profileId);
      const filtered = eligible
        .filter((request) => !search || String(request.Name ?? '').toLowerCase().includes(search.toLowerCase()))
        .filter((request) => status === 'all' || String(request.status_c ?? '').toLowerCase() === status.toLowerCase());
      const start = (page - 1) * 12;
      return { rows: filtered.slice(start, start + 12), total: filtered.length, hasMore: start + 12 < filtered.length };
    }
    if (search) filters.push(contains('Name', search));
    if (status !== 'all') filters.push(eq('status_c', status));
    if (filters.length) query = query.where(and(...filters));
    const res = await query.orderByDesc('CreatedOn').page(page, 1000).fetch();
    if (!res.success) throw new Error(res.message);
    // These two obsolete rental test requests must not appear in LOCAL's active request queue.
    const obsoleteDemoRequestIds = new Set(['r2000001-0000-4000-8000-000000000001', 'r2000001-0000-4000-8000-000000000002']);
    const obsoleteDemoRequestNames = new Set(['CAR • Emergency Car Rental', 'BIKE • Emergency Car Rental']);
    const visibleRows = (res.data ?? []).filter((request) => !obsoleteDemoRequestIds.has(request.Id) && !obsoleteDemoRequestNames.has(String(request.Name ?? '').trim()));
    const start = (page - 1) * 12;
    return { rows: visibleRows.slice(start, start + 12), total: visibleRows.length, hasMore: start + 12 < visibleRows.length };
  }, [user?.profile, user?.emailAddress, user?.email, search, status, page]);

  const rows = data?.rows ?? [];

  async function permanentlyDeleteRequest() {
    if (user?.profile !== 'Admin_c' || !deleteTarget?.Id || deleting) return;
    setDeleting(true);
    try {
      const jobsRes = await sdk.table('jobs_c').select(['Id', 'request_c', 'status_c']).where(eq('request_c', deleteTarget.Id)).page(1, 100).fetch();
      if (!jobsRes.success) throw new Error(jobsRes.message || 'Could not check linked jobs.');
      if ((jobsRes.data ?? []).length) throw new Error('This request has linked jobs. Permanent deletion is blocked to protect booking, payment and settlement history.');
      const offersRes = await sdk.table('technician_responses_c').select(['Id', 'request_c']).where(eq('request_c', deleteTarget.Id)).page(1, 200).fetch();
      if (!offersRes.success) throw new Error(offersRes.message || 'Could not check linked offers.');
      const offerIds = (offersRes.data ?? []).map((offer) => offer.Id).filter(Boolean);
      if (offerIds.length) {
        const removeOffers = await sdk.table('technician_responses_c').remove(offerIds.map((Id) => ({ Id })));
        if (removeOffers.data?.length !== offerIds.length) throw new Error(removeOffers.messages?.filter(Boolean).join(' | ') || 'Could not delete every linked offer. The request was kept.');
      }
      const removeRequest = await sdk.table('service_requests_c').remove([{ Id: deleteTarget.Id }]);
      if (!removeRequest.data?.length) throw new Error(removeRequest.messages?.filter(Boolean).join(' | ') || removeRequest.message || 'The request could not be permanently deleted.');
      toast.success('Service request and linked offers permanently deleted.');
      setDeleteTarget(null);
      if (rows.length === 1 && page > 1) setPage((value) => value - 1);
      await run();
    } catch (err) {
      toast.error(err.message || 'Permanent deletion failed.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Marketplace"
        title="Service Requests"
        description={user?.profile === 'ServiceProvider_c' ? 'Open local requests and send offers to customers.' : user?.profile === 'Customer_c' ? 'Active requests awaiting quotes, negotiation, or your Service Provider selection. Confirmed bookings are tracked under Jobs.' : 'Review every request flowing through LOCAL.'}
        action={null}
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row">
        <div className="relative min-w-0 flex-1"><ApperIcon name="Search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requests..." /></div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full md:w-52"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{user?.profile === 'ServiceProvider_c' ? 'All requests' : 'All visible statuses'}</SelectItem>
            {(user?.profile === 'ServiceProvider_c' || user?.profile === 'Customer_c'
              ? ['Open', 'Quoted', 'Negotiating']
              : ['Open', 'Quoted', 'Negotiating', 'Confirmed', 'Completed', 'Cancelled']
            ).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {loading && !data ? <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" /> : error ? <Card className="border-l-4 border-destructive p-6"><div className="font-medium">Could not load service requests.</div><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card> : (
        <div aria-busy={loading} className={loading ? 'pointer-events-none opacity-60' : ''}>
          <div className="space-y-3">
            {rows.map((request) => <div key={request.Id} className="flex flex-col gap-3 border-l-4 border-primary bg-card p-5 md:flex-row md:items-start md:justify-between"><Link to={'/requests/' + request.Id} className="min-w-0 flex-1 hover:text-primary"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-lg font-semibold">{request.Name}</h2><StatusBadge value={request.status_c} /></div><div className="mt-2 text-sm text-muted-foreground">{request.service_category_c?.Name ?? 'Service'} • {request.required_capability_c?.Name ?? 'Capability'} • {request.location_c}{user?.profile === 'ServiceProvider_c' && request.distance_label_c ? ' • ' + request.distance_label_c + ' away' : ''}</div><div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span>{request.preferred_time_c === 'Scheduled' && request.scheduled_at_c ? 'Scheduled for ' + new Date(request.scheduled_at_c).toLocaleString('en-IN') : request.preferred_time_c === 'ASAP' ? 'Book Now — need help now' : request.preferred_time_c}</span>{(request.requested_at_c || request.CreatedOn) && <span className="text-xs text-muted-foreground">• Requested {new Date(request.requested_at_c || request.CreatedOn).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>}</div></div><div className="text-sm font-semibold text-primary">Open request <ApperIcon name="ArrowUpRight" size={15} /></div></div></Link>{user?.profile === 'Admin_c' && <Button type="button" variant="destructive" size="sm" className="shrink-0" onClick={() => setDeleteTarget(request)} disabled={deleting}><ApperIcon name="Trash2" size={15} /> Delete permanently</Button>}</div>)}
            {!rows.length && <Card className="p-10 text-center"><div className="font-medium">{user?.profile === 'ServiceProvider_c' ? 'No matching open requests right now.' : 'No requests match the current view.'}</div>{user?.profile === 'ServiceProvider_c' && <p className="mt-2 text-sm text-muted-foreground">Only open requests matching your active service capabilities appear here. The sidebar badge may count all requests across LOCAL.</p>}</Card>}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{data?.total ?? rows.length} total</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
        </div>
      )}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service request permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleteTarget?.Name ?? 'this request'}” and its linked provider offers. This cannot be undone. Requests with linked jobs are protected and cannot be deleted here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep request</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); permanentlyDeleteRequest(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleting ? 'Deleting…' : 'Delete permanently'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}