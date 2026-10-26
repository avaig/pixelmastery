import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { getLanguage, tr } from '@/services/i18n';

const { eq } = window.ApperSDK.CoreSDK;

const APPLIANCES = [
  'Geyser',
  'RO Purifier',
  'Fridge',
  'Washing Machine',
  'BLDC Fan',
  'Mixer Grinder',
  'Microwave & OTG',
  'Chimney',
  'Oil Heater & Blowers',
  'Press',
  'Cooler',
  'LED Light',
  'Inverter',
];

const SERVICES = [
  { id: 'tax', title: 'GST & Tax Filing', subtitle: 'Filing and consultation', icon: 'ReceiptText', capability: 'GST & Tax Filing' },
  { id: 'computer', title: 'Computer Services', subtitle: 'Desktop & Laptop · Installation and service', icon: 'MonitorCog', capability: 'Computer Services' },
  { id: 'ac', title: 'AC Technician', subtitle: 'Window & Split AC · Installation and service', icon: 'Snowflake', capability: 'AC Technician — Split & Window AC' },
];

export const route = {
  path: '/customer/home-services',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function HomeServices() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
  const [selectedAppliances, setSelectedAppliances] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittingService, setSubmittingService] = useState('');

  const { data: customer } = useFetch(
    async () => {
      if (!email) return null;
      const result = await sdk.table('customer_profiles_c')
        .select(['Id', 'Name', 'email_c', 'phone_c', 'location_c'])
        .page(1, 1000)
        .fetch();
      if (!result.success) throw new Error(result.message);
      return (result.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === email) ?? null;
    },
    [email],
  );

  const { data: homeCategory } = useFetch(
    async () => {
      const result = await sdk.table('service_categories_c')
        .select(['Id', 'Name', 'status_c'])
        .where(eq('Name', 'Home Services'))
        .page(1, 10)
        .fetch();
      if (!result.success) throw new Error(result.message);
      return (result.data ?? []).find((item) => !item.status_c || item.status_c === 'Active') ?? null;
    },
    [],
  );

  const { data: capabilities } = useFetch(
    async () => {
      const result = await sdk.table('service_capabilities_c')
        .select(['Id', 'Name', 'vehicle_type_c', 'status_c'])
        .page(1, 200)
        .fetch();
      if (!result.success) throw new Error(result.message);
      return result.data ?? [];
    },
    [],
  );

  const selectedSummary = useMemo(() => selectedAppliances.join(', '), [selectedAppliances]);

  function toggleAppliance(name) {
    setSelectedAppliances((current) => (
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    ));
  }

  async function requestCallback(service) {
    if (submitting) return;
    if (!customer?.Id) {
      toast.error('Your customer profile could not be matched. Please complete your profile first.');
      return;
    }
    if (!homeCategory?.Id) {
      toast.error('Home Services is not configured yet. Please contact LOCAL Customer Care.');
      return;
    }
    if (!String(customer.location_c ?? '').trim()) {
      toast.error('Please add your service location to your customer profile before requesting a callback.');
      navigate('/customer/profile');
      return;
    }
    if (service.id === 'appliances' && selectedAppliances.length === 0) {
      toast.error('Select at least one appliance.');
      return;
    }

    const serviceName = service.id === 'appliances' ? 'Home Appliances' : service.title;
    const capabilityName = service.capability || '';
    const capability = (capabilities ?? []).find((item) => (
      String(item.Name ?? '').trim().toLowerCase() === capabilityName.toLowerCase()
      && (!item.status_c || item.status_c === 'Active')
    ));

    const requestDetails = {
      version: 1,
      type: 'HOME_SERVICE_CALLBACK',
      service: serviceName,
      selectedAppliances: service.id === 'appliances' ? selectedAppliances : [],
      callbackRequested: true,
      customerCareWorkflow: ['New', 'Contacted', 'Appointment Booked', 'Technician Assigned', 'In Progress', 'Completed', 'Payment Pending', 'Paid'],
      customerCareNotes: '',
      callOutcome: 'Not Called',
      appointmentConfirmed: false,
      technicianCapabilityCheckRequired: true,
      paymentStatus: 'Not Due',
    };

    setSubmitting(true);
    setSubmittingService(service.id);
    try {
      const result = await sdk.table('service_requests_c').create({
        Name: service.id === 'appliances' ? 'Home Appliances • ' + selectedAppliances.join(', ') : service.title,
        customer_c: customer.Id,
        service_category_c: homeCategory.Id,
        ...(capability?.Id ? { required_capability_c: capability.Id } : {}),
        problem_description_c: 'LOCAL_HOME_SERVICE_CALLBACK_JSON:' + JSON.stringify(requestDetails),
        location_c: String(customer.location_c).trim(),
        service_area_c: 'Prayagraj',
        status_c: 'Open',
        preferred_time_c: 'ASAP',
        requested_at_c: new Date().toISOString(),
        service_mode_c: 'Normal',
        pricing_mode_c: 'Provider Quote',
        pricing_mode_description_c: 'Callback request. LOCAL Customer Care calls the customer, records requirements, books an appointment, assigns a technician with matching capabilities, confirms completion, and records payment.',
      });

      if (!result.data?.length) {
        toast.error(result.messages?.[0] || 'Your callback request could not be created. Please try again.');
        return;
      }

      toast.success('Callback requested. LOCAL Customer Care will contact you.');
      setSelectedAppliances([]);
      navigate('/requests/' + result.data[0].Id);
    } catch (error) {
      toast.error(error.message || 'Your callback request could not be created. Please try again.');
    } finally {
      setSubmitting(false);
      setSubmittingService('');
    }
  }

  function renderCallbackButton(service) {
    return (
      <Button
        type="button"
        className="mt-4 min-h-11 w-full"
        onClick={() => requestCallback(service)}
        disabled={submitting || (service.id === 'appliances' && selectedAppliances.length === 0)}
      >
        <ApperIcon name="PhoneCall" size={16} />
        {submittingService === service.id ? 'Requesting callback…' : 'Request a Call Back'}
      </Button>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/')}>
            <ApperIcon name="ArrowLeft" size={17} />
            Back to LOCAL
          </Button>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">LOCAL · Home Service</span>
        </div>

        <header className="max-w-2xl space-y-2">
          <p className="text-sm font-semibold text-primary">Local needs. Local solutions.</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">What service do you need?</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Choose a service and request a callback. Our Customer Care team will understand the details and arrange the right help.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Home service categories">
          {SERVICES.map((service, index) => (
            <Card key={service.id} className="flex h-full flex-col rounded-xl border-border p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ApperIcon name={service.icon} size={27} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">0{index + 1}</p>
                  <h2 className="mt-1 text-lg font-semibold">{service.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{service.subtitle}</p>
                </div>
              </div>
              <div className="mt-auto">{renderCallbackButton(service)}</div>
            </Card>
          ))}

          <Card className="rounded-xl border-border p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ApperIcon name="HousePlug" size={27} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">04</p>
                <h2 className="mt-1 text-lg font-semibold">Home Appliances</h2>
                <p className="mt-1 text-sm text-muted-foreground">Select one or more appliances that need attention.</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {APPLIANCES.map((appliance) => {
                const selected = selectedAppliances.includes(appliance);
                return (
                  <button
                    key={appliance}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleAppliance(appliance)}
                    className={'flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' + (
                      selected
                        ? 'border-primary bg-primary/10 font-semibold text-foreground'
                        : 'border-border bg-background hover:border-primary/50 hover:bg-accent'
                    )}
                  >
                    <ApperIcon name={selected ? 'CheckCircle2' : 'Circle'} size={16} className={selected ? 'shrink-0 text-primary' : 'shrink-0 text-muted-foreground'} />
                    <span className="leading-tight">{appliance}</span>
                  </button>
                );
              })}
            </div>

            {selectedAppliances.length > 0 && (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="font-semibold">{selectedAppliances.length} selected:</span> {selectedSummary}
              </p>
            )}
            {renderCallbackButton({ id: 'appliances' })}
          </Card>
        </section>

        <section className="rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ApperIcon name="Headset" size={22} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold">What happens next?</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Request received → Customer Care calls you → appointment booked → suitable technician assigned → work completed → payment recorded.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                No detailed form is needed now. Please discuss the problem and appointment time with Customer Care on the call.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}