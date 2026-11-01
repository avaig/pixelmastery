import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { getLocalServiceAreaStatus, getServiceAreaMessage } from '@/services/serviceArea';

const { eq } = window.ApperSDK.CoreSDK;

const TAX_SERVICES = [
  'GST Registration',
  'GST Return Filing',
  'GST Consultation',
  'Income Tax Return (ITR)',
  'Income Tax Consultation',
  'Other Tax-related Services',
];

export const route = {
  path: '/customer/home-services/gst-tax-filing',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function GstTaxFiling() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
  const [service, setService] = useState('');
  const [customerType, setCustomerType] = useState('Individual');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: customer, loading } = useFetch(async () => {
    if (!email) return null;
    const result = await sdk.table('customer_profiles_c')
      .select(['Id', 'Name', 'email_c', 'phone_c', 'location_c'])
      .page(1, 1000)
      .fetch();
    if (!result.success) throw new Error(result.message);
    return (result.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === email) ?? null;
  }, [email]);

  async function submitRequest(event) {
    event.preventDefault();
    if (saving) return;
    if (!getLocalServiceAreaStatus().serviceable) {
      toast.error(getServiceAreaMessage());
      return;
    }
    if (!customer?.Id) {
      toast.error('Please complete your customer profile before continuing.');
      return;
    }
    if (!String(customer.location_c ?? '').trim()) {
      toast.error('Please add your service location to your customer profile first.');
      navigate('/customer/profile');
      return;
    }
    if (!service) {
      toast.error('Please select the tax service you need.');
      return;
    }

    const payload = {
      version: 1,
      type: 'GST_TAX_MANAGED_SERVICE',
      service,
      customerType,
      additionalDetails: details.trim(),
      workflow: ['New Request', 'Customer Contacted', 'Requirement Confirmed', 'Professional Identified', 'Fee Shared', 'Awaiting Customer Approval', 'Approved', 'In Progress', 'Completed', 'Payment Pending', 'Paid / Closed'],
      currentStage: 'New Request',
      professionalAssignment: 'LOCAL Admin managed',
      paymentStatus: 'Not Due',
    };

    setSaving(true);
    try {
      const result = await sdk.table('service_requests_c').create({
        Name: 'GST & Tax Filing — ' + service,
        customer_c: customer.Id,
        problem_description_c: 'GST & Tax Filing request. Service: ' + service + '. Customer type: ' + customerType + '. Additional details: ' + (details.trim() || 'Not provided.') + '\n\nLOCAL_GST_TAX_REQUEST_JSON:' + JSON.stringify(payload),
        location_c: String(customer.location_c).trim(),
        service_area_c: 'Prayagraj',
        status_c: 'Open',
        preferred_time_c: 'ASAP',
        requested_at_c: new Date().toISOString(),
        service_mode_c: 'Normal',
        pricing_mode_c: 'Provider Quote',
        pricing_mode_description_c: 'LOCAL-managed tax service. Customer Care confirms scope, identifies a suitable verified professional, shares the complete fee and obtains customer approval before work begins. No provider bidding.',
      });
      if (!result.data?.length) {
        toast.error(result.messages?.[0] || 'Could not submit your request. Please try again.');
        return;
      }
      toast.success('Your GST & Tax request has been sent to LOCAL Customer Care.');
      navigate('/requests/' + result.data[0].Id);
    } catch (error) {
      toast.error(error?.message || 'Could not submit your request. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-6">
      <Link to="/customer/home-services" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ApperIcon name="ArrowLeft" size={16} /> Back to Home Services
      </Link>
      <div>
        <p className="text-sm font-semibold text-primary">LOCAL Home Services</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">GST &amp; Tax Filing</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tell us what help you need. LOCAL Customer Care will contact you to understand the requirement and arrange a suitable tax professional.</p>
      </div>
      <Card className="p-4 sm:p-6">
        <form onSubmit={submitRequest} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="gst-service">Which service do you need? *</Label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger id="gst-service"><SelectValue placeholder="Select a GST or tax service" /></SelectTrigger>
              <SelectContent>
                {TAX_SERVICES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gst-customer-type">Customer type *</Label>
            <Select value={customerType} onValueChange={setCustomerType}>
              <SelectTrigger id="gst-customer-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Individual">Individual</SelectItem>
                <SelectItem value="Business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Name</p><p className="mt-1 font-medium">{loading ? 'Loading…' : customer?.Name || 'Not available'}</p></div>
            <div><p className="text-xs text-muted-foreground">Mobile</p><p className="mt-1 font-medium">{customer?.phone_c || 'Not available'}</p></div>
            <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Saved service location</p><p className="mt-1 font-medium">{customer?.location_c || 'Please add your address in My Profile'}</p></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gst-details">Additional details (optional)</Label>
            <Textarea id="gst-details" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Briefly describe what assistance you need." rows={4} maxLength={1200} />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Please do not enter PAN, Aadhaar, GSTIN, bank details or upload financial documents here. LOCAL will explain the secure document-sharing process if required.</p>
          <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => navigate('/customer/home-services')}>Cancel</Button>
            <Button type="submit" disabled={saving || loading || !customer?.Id || !service}>
              {saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Sending…</> : 'Send Request to LOCAL'}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
