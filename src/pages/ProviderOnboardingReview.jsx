import { useEffect, useState } from 'react';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/local/EntityPages';
import { toast } from 'sonner';
import FilePicker from '@/components/FilePicker';

export const route = {
  path: '/admin/provider-onboarding',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export const nav = {
  to: '/admin/provider-onboarding',
  label: 'Provider onboarding',
  icon: 'ClipboardCheck',
  order: 2,
  profiles: ['Admin_c'],
  section: 'Admin',
};

const fields = ['Id', 'Name', 'email_c', 'phone_c', 'provider_type_c', 'preferred_language_c', 'current_address_c', 'emergency_contact_c', 'business_name_c', 'business_address_c', 'experience_c', 'service_area_c', 'identity_document_type_c', 'identity_document_status_c', 'pan_status_c', 'bank_status_c', 'driving_licence_status_c', 'vehicle_documents_status_c', 'business_document_status_c', 'background_check_status_c', 'training_status_c', 'terms_accepted_c', 'verification_status_c', 'review_notes_c', 'profile_photo_c', 'status_c'];

const { eq } = window.ApperSDK.CoreSDK;

function StatusTag({ value }) {
  const normalized = String(value || 'Not started').trim();
  const tone = ['Approved', 'Verified', 'Active'].includes(normalized)
    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
    : ['Corrections requested', 'Submitted', 'In progress'].includes(normalized)
      ? 'border-amber-300 bg-amber-50 text-amber-700'
      : normalized === 'Pending'
        ? 'border-slate-300 bg-slate-100 text-slate-700'
        : normalized === 'Rejected' || normalized === 'Suspended'
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-slate-300 bg-white text-slate-600';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>{normalized}</span>;
}

function ReviewField({ label, value }) {
  return <div className="min-w-0 rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-medium">{value === true ? 'Accepted' : value === false ? 'Not accepted' : value || 'Not provided'}</div></div>;
}

export default function ProviderOnboardingReview() {
  const [filter, setFilter] = useState('Needs review');
  const [activeId, setActiveId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [serviceNames, setServiceNames] = useState({});
  const [serviceCatalogError, setServiceCatalogError] = useState('');
  const [serviceStatusOverrides, setServiceStatusOverrides] = useState({});
  const [resettingProviders, setResettingProviders] = useState(false);
  const { data: capabilityAssignments, run: reloadAssignments } = useFetch(
    () => sdk.table('service_provider_capabilities_c')
      .select(['Id', 'technician_c', 'capability_c', 'status_c'])
      .page(1, 1000)
      .fetch()
      .then((res) => {
        if (!res.success) throw new Error(res.message || 'Could not load provider capability assignments.');
        return res.data ?? [];
      }),
    [],
  );
  const { data, loading, error, run } = useFetch(
    () => sdk.table('technician_profiles_c').select(fields).orderByDesc('CreatedOn').page(1, 100).fetch().then((res) => {
      if (!res.success) throw new Error(res.message || 'Could not load provider applications.');
      return res.data ?? [];
    }),
    [],
  );
  const providers = data ?? [];
  useEffect(() => {
    let mounted = true;
    Promise.resolve()
      .then(() => sdk.table('service_capabilities_c').select(['Id', 'Name']).page(1, 200).fetch())
      .then((res) => {
        if (!res?.success) throw new Error(res?.message || 'Service names are unavailable.');
        const names = Object.fromEntries((res.data ?? []).map((item) => [String(item.Id), String(item.Name ?? '').trim()]).filter((entry) => entry[1]));
        if (mounted) {
          setServiceNames(names);
          setServiceCatalogError('');
        }
      })
      .catch((err) => {
        if (mounted) {
          setServiceNames({});
          setServiceCatalogError(err?.message || 'Service names are unavailable; provider review remains usable.');
        }
      });
    return () => { mounted = false; };
  }, []);
  const filtered = providers.filter((provider) => {
    const status = provider.verification_status_c || (provider.status_c === 'Active' ? 'Approved' : 'Draft');
    if (filter === 'Needs review') return ['Submitted', 'In review', 'Corrections requested', 'Draft'].includes(status);
    if (filter === 'Approved') return status === 'Approved';
    return true;
  });
  const active = providers.find((provider) => String(provider.Id) === String(activeId)) ?? filtered[0] ?? null;

  async function resetProviderRegistrations() {
    const confirmation = window.prompt('This permanently removes all provider profiles and capability assignments, but preserves customer accounts and all requests, offers, jobs and bookings. Type RESET PROVIDERS to continue.');
    if (confirmation !== 'RESET PROVIDERS') return;

    setResettingProviders(true);
    try {
      const [providerResult, capabilityResult] = await Promise.all([
        sdk.table('technician_profiles_c').select(['Id']).page(1, 1000).fetch(),
        sdk.table('service_provider_capabilities_c').select(['Id']).page(1, 1000).fetch(),
      ]);
      if (!providerResult.success || !capabilityResult.success) {
        throw new Error('Could not safely read both provider tables. No records were deleted.');
      }
      const providerRows = providerResult.data ?? [];
      const capabilityRows = capabilityResult.data ?? [];
      if (providerRows.length < Number(providerResult.total ?? providerRows.length) || capabilityRows.length < Number(capabilityResult.total ?? capabilityRows.length)) {
        throw new Error('The reset was stopped because a table has more than 1,000 rows. No records were deleted.');
      }

      if (capabilityRows.length) {
        const removedCapabilities = await sdk.table('service_provider_capabilities_c').remove(capabilityRows.map((row) => row.Id));
        if (removedCapabilities.data?.length !== capabilityRows.length) {
          throw new Error(removedCapabilities.messages?.[0] || 'Not all capability assignments could be removed. Provider profiles were not deleted.');
        }
      }
      if (providerRows.length) {
        const removedProviders = await sdk.table('technician_profiles_c').remove(providerRows.map((row) => row.Id));
        if (removedProviders.data?.length !== providerRows.length) {
          throw new Error(removedProviders.messages?.[0] || 'Some provider profiles could not be removed. Check the Admin onboarding list before retrying.');
        }
      }

      for (const key of ['local_demo_provider_onboarding_applications_v1', 'local_demo_provider_capabilities_v1', 'local_demo_provider_profile_v1']) {
        window.localStorage.removeItem(key);
      }
      setActiveId('');
      setNote('');
      setServiceStatusOverrides({});
      await Promise.all([run(), reloadAssignments()]);
      toast.success(`Provider reset complete: ${providerRows.length} profiles and ${capabilityRows.length} capability assignments removed. Customer records and marketplace history were not targeted.`);
    } catch (err) {
      toast.error(err.message || 'Provider reset failed. Review the lists before retrying.');
      await Promise.all([run(), reloadAssignments()]);
    } finally {
      setResettingProviders(false);
    }
  }

  async function setServiceStatus(capabilityId, status) {
    if (!active) return;
    setSaving(true);
    try {
      const storageKey = 'local_demo_provider_onboarding_applications_v1';
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      const isSaved = Array.isArray(saved) && saved.some((item) => String(item.Id) === String(active.Id));
      setServiceStatusOverrides((current) => ({ ...current, [String(active.Id)]: { ...(current[String(active.Id)] || {}), [String(capabilityId)]: status } }));
      let updatedApplication = null;
      if (isSaved) {
        const updated = saved.map((item) => String(item.Id) === String(active.Id)
          ? { ...item, _demoServiceStatuses: { ...(item._demoServiceStatuses || {}), [String(capabilityId)]: status } }
          : item);
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
        updatedApplication = updated.find((item) => String(item.Id) === String(active.Id));
      }
      setActiveId(String(active.Id));
      const linksRes = await sdk.table('service_provider_capabilities_c').select(['Id', 'technician_c', 'capability_c', 'status_c']).page(1, 1000).fetch();
      const links = (linksRes.data ?? []).filter((link) => {
        const providerId = link.technician_c?.Id ?? link.technician_c_id ?? link.technician_c;
        const serviceId = link.capability_c?.Id ?? link.capability_c_id ?? link.capability_c;
        return String(providerId) === String(active.Id) && String(serviceId) === String(capabilityId);
      });
      if (links.length) {
        const profileApproved = active.verification_status_c === 'Approved' || active.status_c === 'Active';
        const updatedLinks = await sdk.table('service_provider_capabilities_c').update(links.map((link) => ({ Id: link.Id, status_c: status === 'Approved' ? (profileApproved ? 'Active' : 'Approved') : 'Pending' })));
        if (!updatedLinks.data?.length) throw new Error(updatedLinks.messages?.[0] || 'Could not save capability review status.');
        setServiceStatusOverrides((current) => ({ ...current, [String(active.Id)]: { ...(current[String(active.Id)] || {}), [String(capabilityId)]: status } }));
      }
      await reloadAssignments();
      setNote(active.review_notes_c || '');
      toast.success((serviceNames[String(capabilityId)] || 'Service') + ' marked ' + status.toLowerCase() + '.');
      await run();
      if (updatedApplication) {
        // Keep the visible card in sync immediately; the data adapter can return stale demo rows.
        setActiveId(String(active.Id));
      }
    } catch (err) {
      toast.error(err.message || 'Could not update service approval.');
    } finally {
      setSaving(false);
    }
  }

  async function markVerified(field) {
    if (!active) return;
    setSaving(true);
    try {
      const result = await sdk.table('technician_profiles_c').update({ Id: active.Id, [field]: 'Verified' });
      const storageKey = 'local_demo_provider_onboarding_applications_v1';
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      const isSavedDemoApplication = Array.isArray(saved) && saved.some((item) => String(item.Id) === String(active.Id));
      if (isSavedDemoApplication) {
        window.localStorage.setItem(storageKey, JSON.stringify(saved.map((item) => String(item.Id) === String(active.Id) ? { ...item, [field]: 'Verified' } : item)));
      }
      if (!result.data?.length && !isSavedDemoApplication) {
        toast.error(result.messages?.[0] ?? 'Document status could not be updated.');
        return;
      }
      toast.success('Verification status updated.');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not update verification status.');
    } finally {
      setSaving(false);
    }
  }

  async function decide(status) {
    if (!active) return;
    if (status === 'Approved') {
      const missing = [];
      if (active.identity_document_status_c !== 'Verified') missing.push('identity document');
      if (active.bank_status_c !== 'Verified') missing.push('bank / UPI payout details');
      if (!active.terms_accepted_c) missing.push('provider terms and privacy consent');
      if (active.provider_type_c === 'Business' && active.business_document_status_c !== 'Verified' && active.business_document_status_c !== 'Not applicable') missing.push('business authorization');
      if (active.driving_licence_status_c !== 'Not applicable' && active.driving_licence_status_c !== 'Verified') missing.push('driving licence');
      if (active.vehicle_documents_status_c !== 'Not applicable' && active.vehicle_documents_status_c !== 'Verified') missing.push('vehicle documents');
      if (missing.length) {
        toast.error('Cannot approve yet. Verify: ' + missing.join(', ') + '.');
        return;
      }
    }
    if (status !== 'Approved' && !note.trim()) {
      toast.error('Add a review note before requesting corrections or rejecting an application.');
      return;
    }
    setSaving(true);
    try {
      const currentSaved = JSON.parse(window.localStorage.getItem('local_demo_provider_onboarding_applications_v1') || '[]');
      const savedApplication = Array.isArray(currentSaved) ? currentSaved.find((item) => String(item.Id) === String(active.Id)) : null;
      const decisionPatch = {
        verification_status_c: status,
        status_c: status === 'Approved' ? 'Active' : status === 'Rejected' ? 'Suspended' : 'Pending',
        review_notes_c: note.trim(),
      };
      const result = await sdk.table('technician_profiles_c').update({ Id: active.Id, ...decisionPatch });
      // Persist the admin decision for demo submissions so it survives switching demo accounts/reloads.
      const storageKey = 'local_demo_provider_onboarding_applications_v1';
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) {
        const updated = saved.map((item) => String(item.Id) === String(active.Id) ? { ...item, ...decisionPatch } : item);
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
      }
      if (!result.data?.length && !saved.some((item) => String(item.Id) === String(active.Id))) {
        toast.error(result.messages?.[0] ?? 'The review decision was not saved.');
        return;
      }
      const linksRes = await sdk.table('service_provider_capabilities_c')
        .select(['Id', 'technician_c', 'capability_c', 'status_c'])
        .page(1, 1000)
        .fetch();
      const links = (linksRes.data ?? []).filter((link) => String(link.technician_c?.Id ?? link.technician_c_id ?? link.technician_c) === String(active.Id));
      if (links.length) {
        await sdk.table('service_provider_capabilities_c').update(
          links.map((link) => ({
            Id: link.Id,
            status_c: status === 'Approved' && (link.status_c === 'Approved' || savedApplication?._demoServiceStatuses?.[String(link.capability_c?.Id ?? link.capability_c)] === 'Approved') ? 'Active' : 'Pending',
          })),
        );
      }
      toast.success(status === 'Approved' ? 'Provider profile approved. Only individually approved services are enabled.' : status === 'Corrections requested' ? 'Corrections requested. The provider can edit and resubmit.' : 'Application rejected.');
      setNote('');
      await run();
    } catch (err) {
      toast.error(err.message || 'Could not save review decision.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin · Provider operations" title="Service provider onboarding" description="Review applications, verify the documents relevant to each provider, and record activation decisions." />
      <Card className="border-destructive/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-medium">Start provider registration fresh</h2>
            <p className="mt-1 text-sm text-muted-foreground">Permanently removes provider profiles and service-capability assignments. Customer accounts, catalogue, requests, offers, bookings, jobs and login accounts are preserved.</p>
            <p className="mt-1 text-xs text-muted-foreground">A confirmation phrase is required. This also clears demo onboarding records saved in this browser only.</p>
          </div>
          <Button variant="destructive" disabled={resettingProviders} onClick={resetProviderRegistrations}>
            <ApperIcon name="Trash2" size={16} />
            {resettingProviders ? 'Resetting providers…' : 'Reset provider registrations'}
          </Button>
        </div>
      </Card>
      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Provider applications could not be loaded from the database: {error.message || String(error)}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Needs review', providers.filter((item) => ['Submitted', 'In review', 'Corrections requested', 'Draft'].includes(item.verification_status_c || (item.status_c === 'Active' ? 'Approved' : 'Draft'))).length], ['Approved', providers.filter((item) => (item.verification_status_c || (item.status_c === 'Active' ? 'Approved' : 'Draft')) === 'Approved').length], ['Total profiles', providers.length]].map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-2 font-heading text-3xl font-semibold">{value}</div></Card>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {['Needs review', 'Approved', 'All profiles'].map((value) => <Button key={value} type="button" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{value}</Button>)}
      </div>
      {loading && !data ? <Card className="h-64 animate-pulse bg-muted" /> : error ? <Card className="p-6"><p className="font-medium">Could not load provider applications.</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={run}>Retry</Button></Card> : (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-3">
            <div className="border-b border-border px-2 pb-3 pt-2 font-medium">Applications ({filtered.length})</div>
            <div className="mt-2 space-y-2">
              {filtered.map((provider) => {
                const status = provider.verification_status_c || (provider.status_c === 'Active' ? 'Approved' : 'Draft');
                return <button key={provider.Id} type="button" onClick={() => { setActiveId(provider.Id); setNote(provider.review_notes_c || ''); }} className={`w-full rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${String(active?.Id) === String(provider.Id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                  <div className="flex items-start justify-between gap-2"><span className="font-medium">{provider.Name}</span><ApperIcon name="ChevronRight" size={16} /></div>
                  <div className="mt-1 text-xs text-muted-foreground">{provider.business_name_c || provider.provider_type_c || 'Provider'} · {provider.service_area_c || 'Service area not set'}</div>
                  <div className="mt-2"><StatusTag value={status} /></div>
                </button>;
              })}
              {!filtered.length && <p className="px-2 py-8 text-sm text-muted-foreground">No applications in this view.</p>}
            </div>
          </Card>
          <Card className="p-5">
            {active ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">{active.Name}</h2><p className="mt-1 text-sm text-muted-foreground">{active.email_c} · {active.phone_c}</p></div><StatusTag value={active.verification_status_c || (active.status_c === 'Active' ? 'Approved' : 'Draft')} /></div>
                <section className="space-y-3"><h3 className="font-medium">Live profile photograph</h3><p className="text-sm text-muted-foreground">Review the submitted profile photo. Camera capture alone is not proof of liveness or identity match.</p><div className="max-w-sm rounded-lg border border-border p-3">{(() => { try { const photo = JSON.parse(active.profile_photo_c || '[]'); return <FilePicker value={Array.isArray(photo) ? photo : []} readOnly maxFiles={1} fieldConfig={{ supportedExtensions: 'jpg,jpeg,png', supportMultipleValues: false }} />; } catch { return <p className="text-sm text-muted-foreground">No readable photo attachment is available for this application.</p>; } })()}</div></section>
                <section><h3 className="mb-3 font-medium">Basic profile</h3><div className="grid gap-3 sm:grid-cols-2"><ReviewField label="Provider type" value={active.provider_type_c} /><ReviewField label="Preferred language" value={active.preferred_language_c} /><ReviewField label="Current address" value={active.current_address_c} /><ReviewField label="Emergency contact" value={active.emergency_contact_c} /><ReviewField label="Service area" value={active.service_area_c} /><ReviewField label="Experience" value={active.experience_c} /></div></section>
                {active.provider_type_c === 'Business' && <section><h3 className="mb-3 font-medium">Business details</h3><div className="grid gap-3 sm:grid-cols-2"><ReviewField label="Business name" value={active.business_name_c} /><ReviewField label="Business address" value={active.business_address_c} /><ReviewField label="Business authorization" value={active.business_document_status_c} /></div></section>}
                <section>
                  <h3 className="mb-3 font-medium">Verification checklist</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-border p-3"><ReviewField label="Identity type" value={active.identity_document_type_c} /><div className="mt-2 flex items-center justify-between gap-2"><StatusTag value={active.identity_document_status_c} /><Button size="sm" variant="outline" disabled={saving} onClick={() => markVerified('identity_document_status_c')}>Mark verified</Button></div></div>
                    <ReviewField label="PAN status" value={active.pan_status_c} />
                    <div className="rounded-md border border-border p-3"><ReviewField label="Bank / UPI payout" value={active.bank_status_c} /><div className="mt-2 flex items-center justify-between gap-2"><StatusTag value={active.bank_status_c} /><Button size="sm" variant="outline" disabled={saving} onClick={() => markVerified('bank_status_c')}>Mark verified</Button></div></div>
                    <div className="rounded-md border border-border p-3"><ReviewField label="Driving licence" value={active.driving_licence_status_c} /><div className="mt-2 flex items-center justify-between gap-2"><StatusTag value={active.driving_licence_status_c} /><Button size="sm" variant="outline" disabled={saving || active.driving_licence_status_c === 'Not applicable'} onClick={() => markVerified('driving_licence_status_c')}>Mark verified</Button></div></div>
                    <div className="rounded-md border border-border p-3"><ReviewField label="Vehicle documents" value={active.vehicle_documents_status_c} /><div className="mt-2 flex items-center justify-between gap-2"><StatusTag value={active.vehicle_documents_status_c} /><Button size="sm" variant="outline" disabled={saving || active.vehicle_documents_status_c === 'Not applicable'} onClick={() => markVerified('vehicle_documents_status_c')}>Mark verified</Button></div></div>
                    {active.provider_type_c === 'Business' && <div className="rounded-md border border-border p-3"><ReviewField label="Business authorization" value={active.business_document_status_c} /><div className="mt-2 flex items-center justify-between gap-2"><StatusTag value={active.business_document_status_c} /><Button size="sm" variant="outline" disabled={saving} onClick={() => markVerified('business_document_status_c')}>Mark verified</Button></div></div>}
                    <ReviewField label="Background check" value={active.background_check_status_c} />
                    <ReviewField label="Safety / service training" value={active.training_status_c} />
                    <ReviewField label="Terms accepted" value={active.terms_accepted_c} />
                  </div>
                </section>
                <section className="space-y-3">
                  <div><h3 className="font-medium">Service-by-service approval</h3><p className="mt-1 text-sm text-muted-foreground">Approve only services whose requirements you have checked. Profile approval alone does not activate a service.</p></div>
                  <div className="space-y-2">
                    {Array.from(new Set([
                      ...(active._demoCapabilityIds ?? []).map(String),
                      ...(capabilityAssignments ?? []).filter((link) => String(link.technician_c?.Id ?? link.technician_c_id ?? link.technician_c ?? '') === String(active.Id)).map((link) => String(link.capability_c?.Id ?? link.capability_c_id ?? link.capability_c ?? '')),
                    ].filter(Boolean))).map((id) => {
                      const linked = (capabilityAssignments ?? []).find((link) => String(link.technician_c?.Id ?? link.technician_c_id ?? link.technician_c ?? '') === String(active.Id) && String(link.capability_c?.Id ?? link.capability_c_id ?? link.capability_c ?? '') === String(id));
                      const serviceStatus = serviceStatusOverrides[String(active.Id)]?.[String(id)] || active._demoServiceStatuses?.[String(id)] || (['Approved', 'Active'].includes(String(linked?.status_c ?? '')) ? 'Approved' : 'Pending');
                      const linkedCapabilityName = typeof linked?.capability_c === 'object' ? linked.capability_c?.Name ?? linked.capability_c?.name : '';
                      const demoCapability = (active._demoCapabilities ?? []).find((item) => String(item.Id ?? item.id ?? item) === String(id));
                      const serviceName = serviceNames[String(id)] || linkedCapabilityName || demoCapability?.Name || ('Service capability (' + String(id).slice(0, 8) + ')');
                      return <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                        <div><div className="font-medium">{serviceName}</div><div className="mt-1"><StatusTag value={serviceStatus} /></div></div>
                        <div className="flex gap-2"><Button size="sm" disabled={saving || active.verification_status_c === 'Rejected'} onClick={() => setServiceStatus(id, 'Approved')}>Approve service</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => setServiceStatus(id, 'Pending')}>Keep pending</Button></div>
                      </div>;
                    })}
                    {serviceCatalogError && <p role="status" className="text-sm text-amber-700">Some service names could not be loaded from the catalogue: {serviceCatalogError}. Showing the available capability reference where possible.</p>}
                    {!(active._demoCapabilityIds ?? []).length && !(capabilityAssignments ?? []).some((link) => String(link.technician_c?.Id ?? link.technician_c_id ?? link.technician_c ?? '') === String(active.Id)) && <p className="text-sm text-muted-foreground">No service capabilities have been selected for this application.</p>}
                  </div>
                </section>
                <section className="space-y-2"><Label htmlFor="review-note">Review note</Label><Textarea id="review-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record verification, missing documents or corrections required." /></section>
                <div className="flex flex-wrap gap-2 border-t border-border pt-4"><Button disabled={saving} onClick={() => decide('Approved')}>{saving ? 'Saving…' : 'Approve profile'}</Button><Button disabled={saving} variant="outline" onClick={() => decide('Corrections requested')}>Request corrections</Button><Button disabled={saving} variant="destructive" onClick={() => decide('Rejected')}>Reject application</Button></div>
                <p className="text-xs text-muted-foreground">Approving here activates the provider profile. Verify documents and applicable service requirements outside this demo before approving; selected service-level activation must also be checked before real bookings.</p>
              </div>
            ) : <div className="py-16 text-center text-sm text-muted-foreground">Choose an application to review.</div>}
          </Card>
        </div>
      )}
    </div>
  );
}
