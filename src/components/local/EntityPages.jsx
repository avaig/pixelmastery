import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DetailSkeleton, ListSkeleton } from '@/components/PageSkeleton';
import { toast } from 'sonner';
import { entityConfig } from './entityConfig';

const { contains, eq, and } = window.ApperSDK.CoreSDK;

function lookupName(value) {
  if (value && typeof value === 'object') return value.Name ?? value.Id ?? '—';
  return value ?? '—';
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</div>}
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ value }) {
  const state = String(value ?? '—');
  const positive = ['Completed', 'Settled', 'Confirmed', 'Selected', 'Active'];
  const negative = ['Cancelled', 'Declined', 'Blocked', 'Suspended'];
  const attention = ['Negotiating', 'Quoted', 'Pending', 'In Progress', 'Payment Due'];
  const className = positive.includes(state)
    ? 'border-success-border bg-success-muted text-success'
    : negative.includes(state)
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : attention.includes(state)
        ? 'border-warning-border bg-warning-muted text-warning-foreground'
        : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={className}>{state}</Badge>;
}

function formatCell(value, field) {
  if (value == null || value === '') return '—';
  if (field.type === 'Lookup') return lookupName(value);
  if (field.type === 'Number') return new Intl.NumberFormat('en-IN').format(Number(value));
  if (field.type === 'DateTime') return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return String(value);
}

function getFields(config) {
  return config.fields.map((field) => field.key);
}

function columnLabel(config, key) {
  return config.fields.find((field) => field.key === key)?.label ?? key.replace(/_c$/, '').replace(/_/g, ' ');
}

const APPROVED_SERVICE_CATEGORY_NAMES = new Set(['Car Assistance', 'Bike Assistance']);

function getEntityRoute(entity, suffix = '') {
  const routeBase = entity === 'service_categories' ? 'categories' : entity;
  return '/' + routeBase + suffix;
}

// Service Categories is deliberately limited to the two current LOCAL customer-facing MVP verticals.
function isApprovedServiceCategory(record) {
  return APPROVED_SERVICE_CATEGORY_NAMES.has(String(record?.Name ?? '').trim());
}


export function EntityListPage({ entity }) {
  const config = entityConfig[entity];
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const isProviderList = entity === 'technicians';
  const fields = useMemo(() => getFields(config), [config]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, status]);

  useEffect(() => {
    const visibleIds = new Set((data?.rows ?? []).map((row) => String(row.Id)));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(String(id))));
  }, [data]);

  async function deleteSelectedProviders() {
    if (!isProviderList || !selectedIds.length || deletingSelected) return;
    const confirmation = window.confirm(`Permanently delete ${selectedIds.length} selected service provider profile(s) and their provider-to-service assignments? Customer accounts, jobs, requests and bookings will not be intentionally deleted.`);
    if (!confirmation) return;
    setDeletingSelected(true);
    try {
      const [providerResult, assignmentResult] = await Promise.all([
        sdk.table('technician_profiles_c').select(['Id']).page(1, 1000).fetch(),
        sdk.table('service_provider_capabilities_c').select(['Id', 'technician_c']).page(1, 1000).fetch(),
      ]);
      if (!providerResult.success || !assignmentResult.success) throw new Error('Could not verify provider records and assignments. Nothing was deleted.');
      const providerRows = providerResult.data ?? [];
      const assignmentRows = assignmentResult.data ?? [];
      if (providerRows.length < Number(providerResult.total ?? providerRows.length) || assignmentRows.length < Number(assignmentResult.total ?? assignmentRows.length)) {
        throw new Error('Deletion stopped because a provider table has more than 1,000 records. Nothing was deleted.');
      }
      const existingIds = new Set(providerRows.map((row) => String(row.Id)));
      const targets = selectedIds.map(String).filter((id) => existingIds.has(id));
      if (targets.length !== selectedIds.length) throw new Error('Some selected provider records are no longer available. Refresh the list and try again.');
      const targetSet = new Set(targets);
      const assignmentIds = assignmentRows.filter((row) => targetSet.has(String(row.technician_c?.Id ?? row.technician_c_id ?? row.technician_c ?? ''))).map((row) => row.Id);
      if (assignmentIds.length) {
        const removedAssignments = await sdk.table('service_provider_capabilities_c').remove(assignmentIds);
        if (!removedAssignments.data || removedAssignments.data.length !== assignmentIds.length) throw new Error(removedAssignments.messages?.[0] || 'Could not remove all service assignments. Provider profiles were not deleted; review assignment records before retrying.');
      }
      const removedProviders = await sdk.table('technician_profiles_c').remove(targets.map((id) => {
        const row = providerRows.find((item) => String(item.Id) === id);
        return row.Id;
      }));
      if (!removedProviders.data || removedProviders.data.length !== targets.length) throw new Error(removedProviders.messages?.[0] || 'Some provider profiles could not be deleted. Refresh the list and inspect the remaining records.');
      for (const key of ['local_demo_provider_onboarding_applications_v1', 'local_demo_provider_capabilities_v1', 'local_demo_provider_profile_v1']) {
        try {
          const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
          if (Array.isArray(saved)) window.localStorage.setItem(key, JSON.stringify(saved.filter((item) => !targetSet.has(String(item.Id)))));
        } catch { /* Ignore malformed optional demo cache; database deletion already succeeded. */ }
      }
      setSelectedIds([]);
      await run();
      toast.success(`Deleted ${targets.length} provider profile(s) and ${assignmentIds.length} service assignment(s). Customer and marketplace history was not targeted.`);
    } catch (error) {
      toast.error(error.message || 'Could not delete the selected providers.');
      await run();
    } finally {
      setDeletingSelected(false);
    }
  }

  const { data, loading, error, run } = useFetch(() => {
    let query = sdk.table(config.table).select(fields);
    const filters = [];
    if (search) filters.push(contains(config.searchField ?? 'Name', search));
    if (status !== 'all' && config.statusField) filters.push(eq(config.statusField, status));
    if (filters.length) query = query.where(and(...filters));

    const pageSize = entity === 'service_categories' ? 1000 : 12;
    return query.orderByDesc('CreatedOn').page(1, pageSize).fetch().then((res) => {
      if (!res.success) throw new Error(res.message);
      const sourceRows = res.data ?? [];
      const filteredRows = entity === 'service_categories'
        ? sourceRows.filter(isApprovedServiceCategory)
        : sourceRows;
      return {
        rows: entity === 'service_categories' ? filteredRows.slice(0, 12) : filteredRows,
        total: entity === 'service_categories' ? filteredRows.length : res.total,
        hasMore: entity === 'service_categories' ? false : res.hasMore,
      };
    });
  }, [entity, search, status, page]);

  const rows = data?.rows ?? [];
  const firstLoad = loading && data === undefined;

  return (
    <div>
      <PageHeader
        eyebrow={config.singular}
        title={config.label}
        description={'Manage ' + config.label.toLowerCase() + ' in the LOCAL marketplace.'}
        action={<Button asChild><Link to={getEntityRoute(entity, '/new')}><ApperIcon name="Plus" size={17} /> Add {config.singular}</Link></Button>}
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row">
        <div className="relative min-w-0 flex-1">
          <ApperIcon name="Search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Search ' + config.label.toLowerCase() + '...'} className="pl-9" />
        </div>
        {config.statusField && (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Filter status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {config.fields.find((field) => field.key === config.statusField)?.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {firstLoad ? (
        <ListSkeleton rows={8} />
      ) : error ? (
        <Card className="border-l-4 border-destructive p-6">
          <div className="font-medium">Could not load {config.label.toLowerCase()}.</div>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-4" variant="outline" onClick={run}>Retry</Button>
        </Card>
      ) : (
        <div aria-busy={loading} className={loading ? 'pointer-events-none opacity-60' : ''}>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {config.columns.map((column) => <th key={column} className="px-4 py-3 text-left font-medium text-muted-foreground">{columnLabel(config, column)}</th>)}
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.Id} className="border-l-4 border-primary border-b border-border last:border-b-0 hover:bg-accent">
                    {config.columns.map((column) => {
                      const field = config.fields.find((item) => item.key === column);
                      return <td key={column} className="max-w-xs px-4 py-3 align-top">{column === config.statusField ? <StatusBadge value={row[column]} /> : <span className={column === 'Name' ? 'font-medium' : 'text-muted-foreground'}>{formatCell(row[column], field)}</span>}</td>;
                    })}
                    <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(getEntityRoute(entity, '/' + row.Id))}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="p-10 text-center text-sm text-muted-foreground">No {config.label.toLowerCase()} match your filters.</div>}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{data?.total ?? rows.length} total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={!data?.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LookupControl({ field, value, onChange }) {
  const { data, loading } = useFetch(() => sdk.table(field.targetTable).select(['Id', 'Name']).orderByDesc('CreatedOn').page(1, 100).fetch().then((res) => {
    if (!res.success) throw new Error(res.message);
    return field.targetTable === 'service_categories_c'
      ? (res.data ?? []).filter(isApprovedServiceCategory)
      : res.data;
  }), [field.targetTable]);
  const options = data ?? [];
  return (
    <Select value={value || '__none__'} onValueChange={(next) => onChange(next === '__none__' ? '' : next)}>
      <SelectTrigger><SelectValue placeholder={loading ? 'Loading...' : 'Choose ' + field.label.toLowerCase()} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        {options.map((option) => <SelectItem key={option.Id} value={String(option.Id)}>{option.Name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function FieldControl({ field, value, onChange }) {
  if (field.type === 'LongText') return <Textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={5} />;
  if (field.type === 'Picklist') return <Select value={value || ''} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={'Choose ' + field.label.toLowerCase()} /></SelectTrigger><SelectContent>{field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>;
  if (field.type === 'Lookup') return <LookupControl field={field} value={String(value ?? '')} onChange={onChange} />;
  if (field.type === 'Number') return <Input type="number" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} placeholder={field.placeholder} />;
  if (field.type === 'DateTime') {
    const localValue = value ? new Date(value).toISOString().slice(0, 16) : '';
    return <Input type="datetime-local" value={localValue} onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : '')} />;
  }
  return <Input type={field.type === 'Email' ? 'email' : 'text'} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />;
}

function getInitialValue(field, record) {
  const value = record?.[field.key];
  if (field.type === 'Lookup') return value?.Id ?? value ?? '';
  return value ?? (field.type === 'Picklist' ? field.options?.[0] ?? '' : '');
}

function EntityForm({ entity, record, onSaved }) {
  const config = entityConfig[entity];
  const [form, setForm] = useState(() => Object.fromEntries(config.fields.map((field) => [field.key, getInitialValue(field, record)])));
  const [saving, setSaving] = useState(false);
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState([]);
  const { data: capabilityCatalog, loading: catalogLoading, error: catalogError } = useFetch(() => entity === 'technicians'
    ? sdk.table('service_capabilities_c').select(['Id', 'Name', 'vehicle_type_c', 'description_c', 'status_c']).page(1, 200).fetch().then((res) => {
      if (!res.success) throw new Error(res.message || 'Could not load service capabilities.');
      return (res.data ?? []).filter((item) => !item.status_c || item.status_c === 'Active');
    })
    : Promise.resolve([]), [entity]);
  const { data: capabilityAssignments, run: reloadCapabilityAssignments } = useFetch(() => entity === 'technicians' && record?.Id
    ? sdk.table('service_provider_capabilities_c').select(['Id', 'technician_c', 'capability_c', 'status_c']).page(1, 1000).fetch().then((res) => {
      if (!res.success) throw new Error(res.message || 'Could not load provider capability assignments.');
      return (res.data ?? []).filter((item) => String(item.technician_c?.Id ?? item.technician_c_id ?? item.technician_c ?? '') === String(record.Id));
    })
    : Promise.resolve([]), [entity, record?.Id]);
  useEffect(() => {
    if (entity === 'technicians' && capabilityAssignments) {
      setSelectedCapabilityIds(capabilityAssignments.map((item) => String(item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c ?? '')).filter(Boolean));
    }
  }, [entity, capabilityAssignments]);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const missing = config.fields.find((field) => field.required && (form[field.key] === '' || form[field.key] == null));
      if (missing) {
        toast.error(missing.label + ' is required.');
        return;
      }
      const payload = Object.fromEntries(config.fields.map((field) => [field.key, form[field.key] === '' ? null : form[field.key]]));
      const res = record ? await sdk.table(config.table).update({ Id: record.Id, ...payload }) : await sdk.table(config.table).create(payload);
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'The record was not saved.');
        return;
      }
      const savedRecord = res.data[0];
      if (entity === 'technicians') {
        const currentLinks = record ? (capabilityAssignments ?? []) : [];
        const selectedIds = new Set(selectedCapabilityIds.map(String));
        const existingIds = new Set(currentLinks.map((item) => String(item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c ?? '')).filter(Boolean));
        const removals = currentLinks.filter((item) => !selectedIds.has(String(item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c ?? '')));
        for (const link of removals) {
          const removed = await sdk.table('service_provider_capabilities_c').remove({ Id: link.Id });
          if (!removed.data?.length) throw new Error(removed.messages?.[0] || 'Provider details saved, but a capability could not be removed.');
        }
        for (const capabilityId of selectedIds) {
          if (existingIds.has(capabilityId)) continue;
          const added = await sdk.table('service_provider_capabilities_c').create({ technician_c: savedRecord.Id, capability_c: capabilityId, status_c: 'Pending' });
          if (!added.data?.length) throw new Error(added.messages?.[0] || 'Provider details saved, but a capability could not be added.');
        }
        await reloadCapabilityAssignments();
      }
      toast.success(record ? config.singular + ' updated.' : config.singular + ' created.');
      onSaved(savedRecord);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-5 md:grid-cols-2">
        {config.fields.map((field) => (
          <div key={field.key} className={field.type === 'LongText' ? 'md:col-span-2' : ''}>
            <Label htmlFor={field.key}>{field.label}{field.required ? ' *' : ''}</Label>
            <div className="mt-2"><FieldControl field={field} value={form[field.key]} onChange={(value) => setValue(field.key, value)} /></div>
          </div>
        ))}
      </div>
      {entity === 'technicians' && <section className="space-y-3 rounded-xl border border-border p-4 md:p-5">
        <div><h2 className="font-semibold">Service capabilities</h2><p className="mt-1 text-sm text-muted-foreground">Select all active catalogue services this provider is qualified to offer. New capabilities are saved as pending until reviewed.</p></div>
        {catalogLoading ? <p className="text-sm text-muted-foreground">Loading active capabilities…</p> : catalogError ? <p className="text-sm text-destructive">{catalogError.message}</p> : !capabilityCatalog?.length ? <p className="text-sm text-muted-foreground">No active capabilities found in the central catalogue.</p> : <div className="grid gap-3 md:grid-cols-2">
          {capabilityCatalog.map((capability) => {
            const capabilityId = String(capability.Id);
            const assignment = (capabilityAssignments ?? []).find((item) => String(item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c ?? '') === capabilityId);
            const isSelected = selectedCapabilityIds.includes(capabilityId);
            const status = assignment?.status_c === 'Active' ? 'Approved · Active' : assignment?.status_c === 'Approved' ? 'Approved · awaiting activation' : assignment ? 'Pending review' : 'Not assigned';
            return <label key={capabilityId} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50">
              <Checkbox checked={isSelected} onCheckedChange={(checked) => setSelectedCapabilityIds((current) => checked ? [...new Set([...current, capabilityId])] : current.filter((id) => id !== capabilityId))} />
              <span className="min-w-0 flex-1"><span className="block font-medium">{capability.Name}</span><span className="mt-1 block text-sm text-muted-foreground">{capability.vehicle_type_c || 'General'}{capability.description_c ? ' · ' + capability.description_c : ''}</span><Badge variant={assignment?.status_c === 'Active' ? 'default' : 'outline'} className="mt-2">{status}</Badge></span>
            </label>;
          })}
        </div>}
        <p className="text-xs text-muted-foreground">Removing a selected capability removes its provider assignment. Approval is managed separately from the provider profile status.</p>
      </section>}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
        <Button type="button" variant="outline" asChild><Link to={record ? getEntityRoute(entity, '/' + record.Id) : getEntityRoute(entity)}>Cancel</Link></Button>
        <Button type="submit" disabled={saving}>{saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Saving…</> : <><ApperIcon name="Save" size={16} /> Save</>}</Button>
      </div>
    </form>
  );
}

export function EntityFormPage({ entity, edit = false }) {
  const config = entityConfig[entity];
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: record, loading } = useFetch(() => edit ? sdk.table(config.table).select(getFields(config)).get(id).then((res) => res.data) : Promise.resolve(null), [id, edit], { initialLoading: edit });

  if (edit && loading) return <DetailSkeleton />;
  if (edit && !record) return <Card className="border-l-4 border-destructive p-6">Record not found.</Card>;

  return (
    <div>
      <PageHeader
        eyebrow={edit ? 'Edit ' + config.singular : 'New ' + config.singular}
        title={edit ? 'Edit ' + record.Name : 'Create ' + config.singular}
        description={edit ? 'Update the marketplace record and save the change.' : 'Add a new mock marketplace record.'}
      />
      <Card className="p-5 md:p-7">
        <EntityForm entity={entity} record={edit ? record : null} onSaved={(saved) => navigate(getEntityRoute(entity, '/' + saved.Id))} />
      </Card>
    </div>
  );
}

export function EntityDetailPage({ entity }) {
  const config = entityConfig[entity];
  const { id } = useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: record, loading, error } = useFetch(() => sdk.table(config.table).select(getFields(config)).get(id).then((res) => res.data), [id]);

  if (loading) return <DetailSkeleton />;
  if (error || !record) return <Card className="border-l-4 border-destructive p-6">This {config.singular.toLowerCase()} could not be found.</Card>;
  if (entity === 'service_categories' && !isApprovedServiceCategory(record)) {
    return (
      <Card className="border-l-4 border-warning p-6">
        <div className="font-medium">This Service Category is no longer part of the current LOCAL MVP.</div>
        <p className="mt-1 text-sm text-muted-foreground">Only Car Assistance and Bike Assistance are active customer-facing Service Categories.</p>
        <Button className="mt-4" variant="outline" asChild><Link to="/categories">Back to Service Categories</Link></Button>
      </Card>
    );
  }

  async function remove() {
    setDeleting(true);
    try {
      const res = await sdk.table(config.table).remove({ Id: record.Id });
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'The record was not deleted.');
        return;
      }
      toast.success(config.singular + ' deleted.');
      navigate(getEntityRoute(entity));
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={config.singular}
        title={record.Name}
        description="Full record view with edit and delete controls."
        action={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to={getEntityRoute(entity)}>
                <ApperIcon name="ArrowLeft" size={16} />
                Back
              </Link>
            </Button>
            <Button asChild>
              <Link to={getEntityRoute(entity, '/' + record.Id + '/edit')}>
                <ApperIcon name="Pencil" size={16} />
                Edit
              </Link>
            </Button>
          </div>
        }
      />
      <Card className="border-l-4 border-primary p-5 md:p-7">
        <div className="grid gap-6 md:grid-cols-2">
          {config.fields.map((field) => (
            <div key={field.key} className={field.type === 'LongText' ? 'md:col-span-2' : ''}>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{field.label}</div>
              <div className="mt-2 text-sm leading-6">{field.key === config.statusField ? <StatusBadge value={record[field.key]} /> : formatCell(record[field.key], field)}</div>
            </div>
          ))}
        </div>
      </Card>
      <div className="mt-6 flex justify-end">
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}><ApperIcon name="Trash2" size={16} /> Delete {config.singular}</Button>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {config.singular}?</AlertDialogTitle>
            <AlertDialogDescription>This will remove “{record.Name}” from the mock dataset. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}