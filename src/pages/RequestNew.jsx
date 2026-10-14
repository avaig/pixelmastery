import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import LookupSelect from '@/components/local/LookupSelect';
import { PageHeader } from '@/components/local/EntityPages';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/requests/new',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export default function RequestNew() {
  const user = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const [form, setForm] = useState({ Name: '', service_category_c: '', problem_description_c: '', preferred_time_c: 'ASAP' });
  const [saving, setSaving] = useState(false);
  const { data: customer } = useFetch(() => sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c']).where(eq('email_c', user?.emailAddress ?? user?.email ?? '')).page(1, 1).fetch().then((res) => res.data?.[0] ?? null), [user?.emailAddress, user?.email]);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!customer?.Id) {
      toast.error('Customer profile could not be matched.');
      return;
    }
    const required = [['Name', 'Request title'], ['service_category_c', 'Service category'], ['problem_description_c', 'Problem description']];
    const missing = required.find(([key]) => !String(form[key] ?? '').trim());
    if (missing) {
      toast.error(missing[1] + ' is required.');
      return;
    }
    if (!customer.location_c || customer.latitude_c == null || customer.longitude_c == null) {
      toast.error('Your saved location is not available. Please set your location from the Customer dashboard first.');
      return;
    }
    setSaving(true);
    try {
      const res = await sdk.table('service_requests_c').create({
        Name: form.Name,
        customer_c: customer.Id,
        service_category_c: form.service_category_c,
        problem_description_c: form.problem_description_c,
        location_c: customer.location_c,
        latitude_c: Number(customer.latitude_c),
        longitude_c: Number(customer.longitude_c),
        status_c: 'Open',
        preferred_time_c: form.preferred_time_c,
      });
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'Request was not created.');
        return;
      }
      toast.success('Service request created.');
      navigate('/requests/' + res.data[0].Id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Marketplace request" title="Request a service" description="Choose a category, describe the problem, and let Service Providers quote their own price. No customer budget is requested." />
      <Card className="border-l-4 border-primary p-5 md:p-7">
        <form onSubmit={submit} className="grid gap-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div><Label htmlFor="Name">Request title *</Label><Input id="Name" value={form.Name} onChange={(event) => setValue('Name', event.target.value)} placeholder="AC not cooling" className="mt-2" /></div>
            <div><Label>Service category *</Label><div className="mt-2"><LookupSelect targetTable="service_categories_c" value={form.service_category_c} onChange={(value) => setValue('service_category_c', value)} label="service category" /></div></div>
            <div className="md:col-span-2 min-w-0"><Label htmlFor="problem">Problem description *</Label><Textarea id="problem" value={form.problem_description_c} onChange={(event) => setValue('problem_description_c', event.target.value)} placeholder="Tell the Service Provider what is happening, what you tried, and anything important." rows={5} className="mt-2 w-full max-w-full min-w-0 box-border resize-y overflow-x-hidden" /></div>
            <div><Label>Preferred time *</Label><Select value={form.preferred_time_c} onValueChange={(value) => setValue('preferred_time_c', value)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{['ASAP', 'Within 1 hour', 'Today', 'Tomorrow'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="outline" onClick={() => navigate('/requests')}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Creating…</> : <><ApperIcon name="Send" size={16} /> Submit request</>}</Button></div>
        </form>
      </Card>
    </div>
  );
}