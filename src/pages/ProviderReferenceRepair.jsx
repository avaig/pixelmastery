import { useState } from 'react';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export const route = {
  path: '/admin/provider-reference-repair',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export const nav = {
  to: '/admin/provider-reference-repair',
  label: 'Repair Provider Links',
  icon: 'Wrench',
  order: 8,
  profiles: ['Admin_c'],
  section: 'Admin',
};

const OFFER_FIELDS = ['Id', 'Name', 'request_c', 'technician_c', 'status_c', 'proposed_price_c'];
const PROFILE_FIELDS = ['Id', 'Name', 'email_c', 'status_c', 'verification_status_c'];
const JOB_FIELDS = ['Id', 'Name', 'response_c', 'technician_c', 'status_c'];

function idOf(value) {
  return value && typeof value === 'object' ? value.Id ?? value.id ?? '' : value ?? '';
}

function labelOf(value) {
  return value && typeof value === 'object' ? value.Name ?? '' : '';
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\\s+/g, ' ');
}

export default function ProviderReferenceRepair() {
  const [selectedProfiles, setSelectedProfiles] = useState({});
  const [savingId, setSavingId] = useState('');
  const { data, loading, error, run } = useFetch(async () => {
    const [offersRes, profilesRes, jobsRes] = await Promise.all([
      sdk.table('technician_responses_c').select(OFFER_FIELDS).orderByDesc('CreatedOn').page(1, 200).fetch(),
      sdk.table('technician_profiles_c').select(PROFILE_FIELDS).page(1, 1000).fetch(),
      sdk.table('jobs_c').select(JOB_FIELDS).page(1, 1000).fetch(),
    ]);
    if (!offersRes.success) throw new Error(offersRes.messages?.[0] || offersRes.message || 'Could not load technician offers.');
    if (!profilesRes.success) throw new Error(profilesRes.messages?.[0] || profilesRes.message || 'Could not load current provider profiles. Admin access is required.');
    if (!jobsRes.success) throw new Error(jobsRes.messages?.[0] || jobsRes.message || 'Could not load jobs to preserve existing assignments.');
    const offers = offersRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const profileIds = new Set(profiles.map((profile) => String(profile.Id)));
    const needsRepair = offers.filter((offer) => {
      const providerId = idOf(offer.technician_c);
      return !providerId || !profileIds.has(String(providerId));
    }).map((offer) => {
      const oldName = labelOf(offer.technician_c) || String(offer.Name ?? '').split(' • ')[0].trim();
      const matches = profiles.filter((profile) => normalized(profile.Name) === normalized(oldName));
      const linkedJobs = jobs.filter((job) => String(idOf(job.response_c)) === String(offer.Id));
      return { ...offer, oldProviderName: oldName, linkedJobs, nameMatches: matches };
    });
    return { needsRepair, profiles, totalOffers: offers.length };
  }, []);

  const rows = data?.needsRepair ?? [];
  const profiles = data?.profiles ?? [];

  async function repair(offer) {
    const providerId = selectedProfiles[offer.Id] || (offer.nameMatches?.length === 1 ? offer.nameMatches[0].Id : '');
    if (!providerId) {
      toast.error('Select the correct current Service Provider profile before repairing this offer.');
      return;
    }
    const provider = profiles.find((item) => String(item.Id) === String(providerId));
    if (!provider) {
      toast.error('The selected provider profile is no longer available. Refresh the page.');
      return;
    }
    const confirmation = window.confirm('Link offer "' + offer.Name + '" to current provider "' + provider.Name + '"? This also updates any jobs linked to this offer.');
    if (!confirmation) return;
    setSavingId(offer.Id);
    try {
      const offerUpdate = await sdk.table('technician_responses_c').update({ Id: offer.Id, technician_c: provider.Id });
      if (!offerUpdate.data?.length) throw new Error(offerUpdate.messages?.[0] || offerUpdate.message || 'The offer reference could not be repaired.');
      const linkedJobIds = (offer.linkedJobs ?? []).map((job) => job.Id);
      if (linkedJobIds.length) {
        const jobUpdate = await sdk.table('jobs_c').update(linkedJobIds.map((Id) => ({ Id, technician_c: provider.Id })));
        if (jobUpdate.data?.length !== linkedJobIds.length) {
          toast.warning('Offer reference repaired, but not every linked job was updated. Review the Jobs page before confirming new bookings.');
        }
      }
      toast.success('Provider reference repaired for ' + provider.Name + '.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not repair the provider reference.');
      await run();
    } finally {
      setSavingId('');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Admin maintenance</div>
        <h1 className="mt-2 font-heading text-3xl font-semibold">Repair Provider Links</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This tool finds offers whose saved Service Provider reference no longer matches a current provider profile. Repair only when you can verify the provider's identity.
        </p>
      </div>
      <Card className="border-l-4 border-highlight p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Offers checked</div>
            <div className="mt-1 font-heading text-2xl font-semibold">{data?.totalOffers ?? '—'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Offers needing repair</div>
            <div className="mt-1 font-heading text-2xl font-semibold">{rows.length}</div>
          </div>
          <Button variant="outline" onClick={run} disabled={loading || Boolean(savingId)}>
            <ApperIcon name="RefreshCw" size={16} /> Refresh scan
          </Button>
        </div>
      </Card>
      {loading && !data ? <Card className="p-8 text-sm text-muted-foreground">Checking provider and offer references…</Card> : error ? (
        <Card className="border-l-4 border-destructive p-5">
          <h2 className="font-semibold">Could not scan the records</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <p className="mt-2 text-sm text-muted-foreground">Open this page while signed in with the Admin account. It requires Admin read access to provider profiles.</p>
          <Button className="mt-4" variant="outline" onClick={run}>Retry scan</Button>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="border-l-4 border-success p-6">
          <div className="flex items-start gap-3">
            <ApperIcon name="CheckCircle2" size={22} className="text-success" />
            <div>
              <h2 className="font-semibold">No stale offer references found</h2>
              <p className="mt-1 text-sm text-muted-foreground">The visible offers all point to current provider records. If customer confirmation still fails, the failing reference is likely another booking lookup and needs the exact error details.</p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((offer) => {
            const currentSelection = selectedProfiles[offer.Id] || (offer.nameMatches?.length === 1 ? offer.nameMatches[0].Id : '');
            return (
              <Card key={offer.Id} className="border-l-4 border-destructive p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold">{offer.Name || 'Unnamed offer'}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Offer ID: {offer.Id}</p>
                    <p className="mt-1 text-sm">Saved provider: <strong>{offer.oldProviderName || 'Missing provider reference'}</strong></p>
                    <p className="mt-1 text-sm text-muted-foreground">Current saved provider ID: {String(idOf(offer.technician_c) || 'None')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Status: {offer.status_c || 'Unknown'} · ₹{Number(offer.proposed_price_c || 0).toLocaleString('en-IN')} · Linked jobs: {offer.linkedJobs.length}</p>
                  </div>
                  <span className="rounded-full border border-destructive/30 bg-destructive/5 px-3 py-1 text-xs font-medium text-destructive">Reference needs review</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <Label htmlFor={'provider-' + offer.Id}>Choose the verified current provider profile</Label>
                    <select
                      id={'provider-' + offer.Id}
                      className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={currentSelection}
                      onChange={(event) => setSelectedProfiles((current) => ({ ...current, [offer.Id]: event.target.value }))}
                    >
                      <option value="">Select provider — verify identity first</option>
                      {profiles.map((profile) => (
                        <option key={profile.Id} value={profile.Id}>
                          {profile.Name || 'Unnamed provider'} · {profile.email_c || 'No email'} · {profile.verification_status_c || profile.status_c || 'Status unknown'}
                        </option>
                      ))}
                    </select>
                    {offer.nameMatches?.length > 1 && <p className="mt-1 text-xs text-destructive">Multiple profiles share this name. Verify the email/identity before choosing.</p>}
                    {offer.nameMatches?.length === 1 && <p className="mt-1 text-xs text-muted-foreground">One exact-name match found; verify the profile before repairing.</p>}
                  </div>
                  <Button disabled={Boolean(savingId) || !currentSelection} onClick={() => repair(offer)}>
                    <ApperIcon name={savingId === offer.Id ? 'LoaderCircle' : 'Wrench'} size={16} className={savingId === offer.Id ? 'animate-spin' : ''} />
                    {savingId === offer.Id ? 'Repairing…' : 'Repair provider link'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
