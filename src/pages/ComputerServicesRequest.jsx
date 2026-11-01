import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { getLocalServiceAreaStatus, getServiceAreaMessage } from '@/services/serviceArea';
import { getCustomerProfile } from '@/services/customerProfile';

const { eq } = window.ApperSDK.CoreSDK;
const DEVICE_TYPES = ['Laptop', 'Desktop Computer', 'Both'];
const PROBLEMS = [
  'Not starting / Power issue',
  'Slow performance',
  'Windows / Software problem',
  'Internet / Wi-Fi issue',
  'Hardware / Repair issue',
  'Data recovery / Backup',
  'New computer setup / Installation',
  'Other',
];
const CONTACT_TIMES = ['Anytime', 'Morning', 'Afternoon', 'Evening'];

export const route = {
  path: '/customer/home-services/computer-services',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function ComputerServicesRequest() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const [deviceType, setDeviceType] = useState('Laptop');
  const [problem, setProblem] = useState('');
  const [details, setDetails] = useState('');
  const [contactTime, setContactTime] = useState('Anytime');
  const [saving, setSaving] = useState(false);

  const { data: customer, loading: customerLoading, error: customerError } = useFetch(
    () => getCustomerProfile(user?.userId),
    [user?.userId],
  );

  const { data: homeCategory } = useFetch(async () => {
    const result = await sdk.table('service_categories_c')
      .select(['Id', 'Name', 'status_c'])
      .where(eq('Name', 'Home Services'))
      .page(1, 10)
      .fetch();
    if (!result.success) throw new Error(result.message);
    return (result.data ?? []).find((item) => !item.status_c || item.status_c === 'Active') ?? null;
  }, []);

  const { data: capabilities } = useFetch(async () => {
    const result = await sdk.table('service_capabilities_c')
      .select(['Id', 'Name', 'status_c'])
      .page(1, 200)
      .fetch();
    if (!result.success) throw new Error(result.message);
    return result.data ?? [];
  }, []);

  async function submitRequest(event) {
    event.preventDefault();
    if (saving) return;
    if (!getLocalServiceAreaStatus().serviceable) {
      toast.error(getServiceAreaMessage());
      return;
    }
    if (!customer?.Id) {
      toast.error('Your customer profile could not be matched. Please complete your profile first.');
      return;
    }
    if (!String(customer.location_c ?? '').trim()) {
      toast.error('Please add your service location to your customer profile first.');
      navigate('/customer/profile');
      return;
    }
    if (!homeCategory?.Id) {
      toast.error('Home Services is not configured yet. Please contact LOCAL Customer Care.');
      return;
    }
    if (!problem) {
      toast.error('Please select the computer problem you are facing.');
      return;
    }

    const capability = (capabilities ?? []).find((item) =>
      String(item.Name ?? '').trim().toLowerCase() === 'computer services'
      && (!item.status_c || item.status_c === 'Active')
    );
    const requestDetails = {
      version: 1,
      type: 'COMPUTER_SERVICE_CALLBACK',
      service: 'Computer Services',
      deviceType,
      problem,
      additionalDetails: details.trim(),
      preferredContactTime: contactTime,
      callbackRequested: true,
      workflow: ['New Request', 'Customer Contacted', 'Requirement Confirmed', 'Technician Identified', 'Appointment Confirmed', 'In Progress', 'Completed', 'Payment Pending', 'Paid / Closed'],
      currentStage: 'New Request',
      assignmentMode: 'LOCAL Customer Care managed',
    };

    setSaving(true);
    try {
      const result = await sdk.table('service_requests_c').create({
        Name: 'Computer Services • ' + problem,
        customer_c: customer.Id,
        service_category_c: homeCategory.Id,
        ...(capability?.Id ? { required_capability_c: capability.Id } : {}),
        device_type_c: deviceType,
        problem_description_c: 'LOCAL_COMPUTER_SERVICE_REQUEST_JSON:' + JSON.stringify(requestDetails),
        location_c: String(customer.location_c).trim(),
        service_area_c: 'Prayagraj',
        status_c: 'Open',
        preferred_time_c: 'ASAP',
        requested_at_c: new Date().toISOString(),
        service_mode_c: 'Normal',
        pricing_mode_c: 'Provider Quote',
        pricing_mode_description_c: 'Computer Services callback request. LOCAL Customer Care contacts the customer, confirms the issue, identifies a suitable technician and confirms appointment and estimate before work begins.',
      });
      if (!result.data?.length) {
        toast.error(result.messages?.[0] || 'Your request could not be submitted. Please try again.');
        return;
      }
      toast.success('Your Computer Services request has been sent to LOCAL Customer Care.');
      navigate('/requests/' + result.data[0].Id);
    } catch (error) {
      toast.error(error?.message || 'Your request could not be submitted. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-6">
      <Button type="button" variant="ghost" className="-ml-3" onClick={() => navigate('/customer/home-services')}>
        <ApperIcon name="ArrowLeft" size={16} /> Home Services
      </Button>
      <div>
        <p className="text-sm font-semibold text-primary">LOCAL Home Services</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Computer Service Request</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tell us a little about the issue. LOCAL Customer Care will contact you to understand the requirement and arrange suitable assistance.</p>
      </div>
      <Card className="p-4 sm:p-6">
        <form onSubmit={submitRequest} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">1. Device Type <span className="text-destructive">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DEVICE_TYPES.map((item) => <label key={item} className={'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ' + (deviceType === item ? 'border-primary bg-primary/5 font-semibold' : 'border-border')}>
                <input type="radio" name="deviceType" value={item} checked={deviceType === item} onChange={() => setDeviceType(item)} /> {item}
              </label>)}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">2. What problem are you facing? <span className="text-destructive">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROBLEMS.map((item) => <label key={item} className={'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ' + (problem === item ? 'border-primary bg-primary/5 font-semibold' : 'border-border')}>
                <input type="radio" name="computerProblem" value={item} checked={problem === item} onChange={() => setProblem(item)} /> {item}
              </label>)}
            </div>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="computer-details" className="text-sm font-medium">3. Additional Details <span className="font-normal text-muted-foreground">(Optional)</span></label>
            <Textarea id="computer-details" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Briefly describe the issue, if you wish." rows={3} maxLength={1000} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">4. Preferred Contact Time <span className="font-normal text-muted-foreground">(Optional)</span></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CONTACT_TIMES.map((item) => <label key={item} className={'flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm ' + (contactTime === item ? 'border-primary bg-primary/5 font-semibold' : 'border-border')}>
                <input type="radio" name="contactTime" value={item} checked={contactTime === item} onChange={() => setContactTime(item)} /> {item}
              </label>)}
            </div>
          </fieldset>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-sm font-semibold">Customer Details</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">Name: </span>{customerLoading ? 'Loading…' : customer?.Name || 'Not available'}</p>
              <p><span className="text-muted-foreground">Mobile: </span>{customerLoading ? 'Loading…' : customer?.phone_c || 'Not available'}</p>
              <p className="sm:col-span-2"><span className="text-muted-foreground">Saved Location: </span>{customerLoading ? 'Loading…' : customer?.location_c || 'Please add your address in My Profile'}</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">No technical specifications or documents are required now. LOCAL Customer Care will contact you if more information is needed.</p>
          <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => navigate('/customer/home-services')}>Cancel</Button>
            <Button type="submit" disabled={saving || customerLoading || !customer?.Id || !problem}>
              {saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Sending…</> : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
