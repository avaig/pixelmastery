import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { PageHeader } from '@/components/local/EntityPages';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import ApperIcon from '@/components/ApperIcon';
import { getCapabilityCatalog } from '@/services/capabilityCatalog';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/service-provider/capabilities',
  layout: 'owner',
  access: "profile === 'ServiceProvider_c'",
};

export const nav = {
  to: '/service-provider/capabilities',
  label: 'My Services',
  icon: 'Layers3',
  order: 7,
  profiles: ['ServiceProvider_c'],
  section: 'Account',
};

export default function ProviderCapabilities() {
  const user = useSelector((state) => state.user.user);
  const email = user?.emailAddress ?? user?.email ?? '';
  const [busyId, setBusyId] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: profile, run: reloadProfile } = useFetch(
    () => sdk.table('technician_profiles_c')
      .select(['Id', 'email_c', 'verification_status_c', 'status_c'])
      .where(eq('email_c', email)).page(1, 1).fetch()
      .then((res) => res.data?.[0] ?? null),
    [email],
  );
  const { data: capabilities, loading: capabilitiesLoading, error: capabilitiesError, run: reloadCapabilities } = useFetch(
    () => getCapabilityCatalog(),
    [],
  );
  const { data: allLinks, run: reloadLinks } = useFetch(
    () => profile?.Id
      ? sdk.table('service_provider_capabilities_c')
        .select(['Id', 'technician_c', 'capability_c', 'status_c']).page(1, 1000).fetch()
        .then((res) => (res.data ?? []).filter((link) => {
          const linkedProvider = link.technician_c?.Id ?? link.technician_c_id ?? link.technician_c;
          return String(linkedProvider ?? '') === String(profile.Id);
        }))
      : Promise.resolve([]),
    [profile?.Id],
  );
  const links = allLinks ?? [];
  const selected = useMemo(() => new Map((links ?? []).map((link) => [
    String(link.capability_c?.Id ?? link.capability_c),
    link,
  ])), [links]);
  const approved = profile?.verification_status_c === 'Approved' || profile?.status_c === 'Active';

  useEffect(() => {
    const stored = JSON.parse(window.localStorage.getItem('local_demo_provider_capability_selections_v1') || '{}');
    const forEmail = stored[email];
    if (profile?.Id && Array.isArray(forEmail)) {
      // The SDK relation table is the source of truth when records exist; browser storage is demo-only fallback.
      if (!(links ?? []).length) return;
    }
  }, [email, profile?.Id, links]);

  async function toggle(capability) {
    if (!profile?.Id) {
      toast.error('Complete your basic provider profile first.');
      return;
    }
    const key = String(capability.Id);
    const existing = selected.get(key);
    setBusyId(key);
    setSaving(true);
    try {
      if (existing) {
        const result = await sdk.table('service_provider_capabilities_c').remove({ Id: existing.Id });
        if (!result.success && !result.data?.length) throw new Error(result.messages?.[0] || 'Could not remove this service.');
      } else {
        const result = await sdk.table('service_provider_capabilities_c').create({
          Name: 'Provider capability',
          technician_c: profile.Id,
          capability_c: capability.Id,
          status_c: 'Pending',
        });
        if (!result.data?.length) throw new Error(result.messages?.[0] || 'Could not add this service.');
      }
      const stored = JSON.parse(window.localStorage.getItem('local_demo_provider_capability_selections_v1') || '{}');
      const prior = Array.isArray(stored[email]) ? stored[email] : [];
      stored[email] = existing ? prior.filter((id) => String(id) !== key) : [...new Set([...prior, key])];
      window.localStorage.setItem('local_demo_provider_capability_selections_v1', JSON.stringify(stored));
      toast.success(existing ? 'Service removed and saved.' : 'Service submitted for eligibility review. It will not receive requests until approved.');
      await reloadLinks();
      await reloadCapabilities();
      await reloadProfile();
    } catch (error) {
      toast.error(error.message || 'Could not save service selection.');
    } finally {
      setSaving(false);
      setBusyId('');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Service provider · Services" title="My Services" description="Manage the services you offer using LOCAL’s existing catalogue. New capabilities remain pending until eligibility checks are complete; existing approved services are kept separate." />
      {!profile && <Card className="p-4 text-sm text-muted-foreground">Please submit your provider profile first. You can manage services as soon as your profile record exists.</Card>}
      {profile && !approved && <Card className="flex gap-3 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><ApperIcon name="ShieldCheck" size={20} />Your profile is awaiting verification. You can manage your service list now; new services will be available for requests after LOCAL approves your profile.</Card>}
      {capabilitiesLoading && <Card className="p-5 text-sm text-muted-foreground">Loading LOCAL service catalogue…</Card>}
      {capabilitiesError && <Card className="border-destructive/40 p-5 text-sm"><div className="font-semibold text-destructive">LOCAL could not load the service catalogue.</div><p className="mt-2">{capabilitiesError.message || String(capabilitiesError)}</p><button type="button" className="mt-3 rounded-md border px-3 py-2 font-medium" onClick={() => reloadCapabilities()}>Retry loading services</button></Card>}
      {!capabilitiesLoading && !capabilitiesError && (capabilities ?? []).length === 0 && <Card className="p-5 text-sm"><div className="font-semibold">No services are configured yet.</div><p className="mt-1 text-muted-foreground">The catalogue is empty in the connected database. LOCAL needs its service records restored before providers can select services.</p><button type="button" className="mt-3 rounded-md border px-3 py-2 font-medium" onClick={() => reloadCapabilities()}>Retry loading services</button></Card>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(capabilities ?? []).map((capability) => {
          const key = String(capability.Id);
          const link = selected.get(key);
          const isSelected = Boolean(link);
          return (
            <button key={key} type="button" disabled={!profile?.Id || saving} onClick={() => toggle(capability)} aria-pressed={isSelected} className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-medium">{capability.Name}</div><div className="mt-1 text-sm text-muted-foreground">{capability.vehicle_type_c || 'Service'}{capability.description_c ? ` · ${capability.description_c}` : ''}</div></div>
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{busyId === key ? <ApperIcon name="LoaderCircle" size={14} className="animate-spin" /> : isSelected ? <ApperIcon name="Check" size={14} /> : <ApperIcon name="Plus" size={14} />}</span>
              </div>
              <div className="mt-3 text-xs font-medium">{isSelected ? (link.status_c === 'Active' ? 'Approved · Active' : 'Added · Pending eligibility review') : 'Tap to add'}</div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Changes save automatically. Removing a service stops future matching for that service; it does not delete completed jobs or history.</p>
    </div>
  );
}
