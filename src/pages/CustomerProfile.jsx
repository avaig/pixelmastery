import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { PageHeader } from '@/components/local/EntityPages';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getCustomerProfile } from '@/services/customerProfile';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/customer/profile',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export const nav = {
  to: '/customer/profile',
  label: 'My Profile',
  icon: 'UserRound',
  order: 8,
  profiles: ['Customer_c'],
  section: 'Account',
};

export default function CustomerProfile() {
  const user = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const [form, setForm] = useState({ Name: '', email_c: '', phone_c: '', location_c: '', notes_c: '' });
  const [saving, setSaving] = useState(false);
  const { data: customer, loading, error: customerError } = useFetch(
    () => getCustomerProfile(user?.userId),
    [user?.userId],
  );

  useEffect(() => {
    if (customer) setForm({ Name: customer.Name ?? '', email_c: customer.email_c ?? '', phone_c: customer.phone_c ?? '', location_c: customer.location_c ?? '', notes_c: customer.notes_c ?? '' });
    if (!customer && user) setForm((current) => ({ ...current, email_c: user.emailAddress ?? user.email ?? '' }));
  }, [customer, user]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (!form.Name.trim() || !form.phone_c.trim()) {
      toast.error('Name and phone are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { Name: form.Name.trim(), email_c: String(user?.emailAddress ?? user?.email ?? form.email_c).trim().toLowerCase(), phone_c: form.phone_c.trim(), location_c: form.location_c.trim(), notes_c: form.notes_c || null, status_c: customer?.status_c ?? 'Active' };
      const res = customer
        ? await sdk.table('customer_profiles_c').update({ Id: customer.Id, ...payload })
        : await sdk.table('customer_profiles_c').create({ ...payload, Owner: user?.userId });
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'Profile was not saved.');
        return;
      }
      toast.success(customer ? 'Profile updated.' : 'Customer profile created.');
      navigate('/customer');
    } catch (error) {
      toast.error(error?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Account" title={customer ? 'My profile' : 'Complete your profile'} description="Save your contact details and an optional default address. You can choose a different service location for every booking." />
      <Card className="max-w-3xl border-l-4 border-primary p-5 md:p-7">
        <form onSubmit={save} className="grid gap-5">
          {loading ? <div className="h-40 animate-pulse rounded-md bg-muted" /> : (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div><Label htmlFor="customer-name">Full name *</Label><Input id="customer-name" value={form.Name} onChange={(event) => update('Name', event.target.value)} placeholder="Aarav Sharma" className="mt-2" /></div>
                <div><Label htmlFor="customer-email">Email</Label><Input id="customer-email" value={form.email_c} readOnly className="mt-2 bg-muted/30" /></div>
                <div><Label htmlFor="customer-phone">Phone *</Label><Input id="customer-phone" value={form.phone_c} onChange={(event) => update('phone_c', event.target.value)} placeholder="+91 98765 43210" className="mt-2" /></div>
                <div>
                  <Label htmlFor="customer-location">Default address (optional)</Label>
                  <Input id="customer-location" value={form.location_c} onChange={(event) => update('location_c', event.target.value)} placeholder="e.g. Home, Naini, Prayagraj" className="mt-2" />
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">For convenience only. When booking, you can choose your current location or enter another address, including while travelling.</p>
                </div>
              </div>
              <div><Label htmlFor="customer-notes">Notes (optional)</Label><Input id="customer-notes" value={form.notes_c} onChange={(event) => update('notes_c', event.target.value)} placeholder="Any useful note about your default address" className="mt-2" /></div>
              <div className="flex justify-end border-t border-border pt-5"><Button type="submit" disabled={saving}>{saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Saving…</> : <><ApperIcon name="Save" size={16} /> Save profile</>}</Button></div>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}