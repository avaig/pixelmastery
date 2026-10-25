import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getLanguage, tr } from '@/services/i18n';
import { getCapabilityName } from '@/services/providerMatching';
import { getCapabilityCatalog } from '@/services/capabilityCatalog';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/customer/bike-care',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const SERVICES = [
  {
    id: 'rsa',
    title: 'Bike Repair & Roadside Assistance',
    capability: 'Bike Roadside Assistance',
    icon: 'Wrench',
    description: 'Roadside help coordinated by LOCAL Customer Care.',
  },
  {
    id: 'maintenance',
    title: 'Bike Maintenance',
    capability: 'Bike Mechanic',
    icon: 'Settings',
    description: 'Routine maintenance arranged by LOCAL Customer Care.',
  },
];

function getServiceHours() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const isOpen = (hour > 9 || (hour === 9 && minute >= 0)) && hour < 19;
  return { isOpen, hour };
}

export default function BikeCareAssistance() {
  const language = getLanguage();
  const user = useSelector((state) => state.user.user);
  const [selectedService, setSelectedService] = useState('');
  const [address, setAddress] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('local_service_location_c') || 'null');
      return saved?.label || '';
    } catch {
      return '';
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const { isOpen } = useMemo(() => getServiceHours(), []);
  const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();

  const { data: customer, loading: customerLoading } = useFetch(async () => {
    if (!email) return null;
    const result = await sdk.table('customer_profiles_c')
      .select(['Id', 'Name', 'email_c', 'phone_c', 'location_c', 'latitude_c', 'longitude_c'])
      .page(1, 1000)
      .fetch();
    if (!result.success) throw new Error(result.message || 'Could not load your customer profile.');
    return (result.data ?? []).find((record) => String(record.email_c || '').trim().toLowerCase() === email) ?? null;
  }, [email]);

  const { data: category } = useFetch(
    () => sdk.table('service_categories_c')
      .select(['Id', 'Name', 'status_c'])
      .where(eq('Name', 'Bike Assistance'))
      .page(1, 1)
      .fetch()
      .then((result) => result.data?.[0] ?? null),
    [],
  );

  const { data: capabilities } = useFetch(() => getCapabilityCatalog(), []);
  const selected = SERVICES.find((service) => service.id === selectedService) ?? null;
  const requiredCapability = capabilities?.find((item) => item.Name === (selected ? selected.capability : ''));

  function toggleService(serviceId) {
    if (submittedRequest) return;
    setSelectedService((current) => current === serviceId ? '' : serviceId);
  }

  async function submitRequest() {
    if (!selected) {
      toast.error('Please select Bike RSA or Bike Maintenance.');
      return;
    }
    const currentHour = new Date().getHours();
    if (currentHour < 9 || currentHour >= 19) {
      toast.error('Bike RSA and Maintenance requests can only be submitted from 9:00 AM to 7:00 PM.');
      return;
    }
    if (!customer?.Id) {
      toast.error('Your customer profile could not be found. Please complete your profile before submitting.');
      return;
    }
    if (!category?.Id || !requiredCapability?.Id) {
      toast.error('Bike service setup is incomplete. Please contact LOCAL Customer Care.');
      return;
    }
    const confirmedAddress = String(address || customer.location_c || '').trim();
    if (!confirmedAddress) {
      toast.error('Please enter your service location.');
      return;
    }

    setSubmitting(true);
    try {
      const locationData = (() => {
        try {
          return JSON.parse(window.localStorage.getItem('local_service_location_c') || 'null');
        } catch {
          return null;
        }
      })();
      const result = await sdk.table('service_requests_c').create({
        Name: 'BIKE • ' + selected.title,
        customer_c: customer.Id,
        service_category_c: category.Id,
        required_capability_c: requiredCapability.Id,
        problem_description_c: selected.title + '. Customer requested a callback from LOCAL Customer Care. No bike model details or bidding are required. Central Dispatch should call the customer to confirm availability, service charges and next steps. Confirm the full price, including the ₹25 LOCAL Platform Fee, before confirming payment.',
        location_c: confirmedAddress,
        service_area_c: 'Prayagraj',
        latitude_c: Number.isFinite(Number(locationData?.latitude)) ? Number(locationData.latitude) : (Number.isFinite(Number(customer.latitude_c)) ? Number(customer.latitude_c) : null),
        longitude_c: Number.isFinite(Number(locationData?.longitude)) ? Number(locationData.longitude) : (Number.isFinite(Number(customer.longitude_c)) ? Number(customer.longitude_c) : null),
        status_c: 'Open',
        preferred_time_c: 'ASAP',
        requested_at_c: new Date().toISOString(),
        scheduled_at_c: null,
        service_mode_c: 'Normal',
        pricing_mode_c: 'Provider Quote',
        pricing_mode_description_c: 'Callback-first request. LOCAL Customer Care will confirm availability and price before the booking is confirmed. Service hours: 9:00 AM–7:00 PM. LOCAL Platform Fee: ₹25 per booking.',
      });
      if (!result.data?.length) {
        toast.error(result.messages?.[0] || 'Your request could not be submitted. Please try again.');
        return;
      }
      setSubmittedRequest({ id: result.data[0].Id, service: selected.title });
      toast.success('Your request has been sent to LOCAL Central Dispatch.');
    } catch (error) {
      toast.error(error?.message || 'Your request could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto -mt-2 max-w-5xl sm:mt-0">
      <div className="mb-3 text-center sm:mb-5">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary sm:mb-3 sm:size-14">
          <ApperIcon name="Bike" size={28} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {tr('Bike Care & Assistance', language)}
        </h1>
      </div>

      {submittedRequest ? (
        <Card className="rounded-2xl border border-emerald-200 p-5 text-center shadow-sm">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <ApperIcon name="CheckCircle2" size={30} />
          </div>
          <h2 className="text-lg font-bold text-foreground">Request submitted successfully</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your request for {submittedRequest.service} has been sent to LOCAL Central Dispatch.</p>
          <p className="mt-2 text-sm text-muted-foreground">Request reference: <span className="font-semibold text-foreground">{submittedRequest.id}</span></p>
          <p className="mt-3 text-sm text-muted-foreground">LOCAL Customer Care will call you to confirm availability, the full price and payment steps.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
            {SERVICES.map((service) => {
              const isSelected = selectedService === service.id;
              return (
                <button
                  key={service.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleService(service.id)}
                  className="w-full text-left"
                >
                  <Card className={`flex min-h-[88px] flex-row items-center gap-3 rounded-2xl border p-3 shadow-sm transition-all sm:min-h-[96px] sm:gap-4 sm:p-4 ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/70 hover:border-primary/40 hover:shadow-md'}`}>
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#132F55] text-white sm:size-14">
                      <ApperIcon name={service.icon} size={27} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-base font-bold leading-snug sm:text-lg">{tr(service.title, language)}</div>
                      {isSelected && <p className="mt-1 text-xs text-muted-foreground">Selected — tap again to unselect</p>}
                    </div>
                    <ApperIcon name={isSelected ? 'CheckSquare' : 'Square'} size={24} className={`ml-auto shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  </Card>
                </button>
              );
            })}
          </div>

          <Card className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <ApperIcon name="Clock" size={20} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <p className="font-bold text-amber-900">Bike RSA & Maintenance: 9:00 AM – 7:00 PM only</p>
                <p className="mt-1 text-sm text-amber-800">{isOpen ? 'Requests can be submitted during service hours. LOCAL Customer Care will call to confirm availability and price.' : 'Service requests are currently closed. Please return between 9:00 AM and 7:00 PM.'}</p>
              </div>
            </div>
          </Card>

          {selected && (
            <Card className="mt-4 rounded-2xl border border-primary/20 p-4 shadow-sm sm:p-5">
              <h2 className="text-lg font-bold text-foreground">Confirm Your Request</h2>
              <div className="mt-3 rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected service</p>
                <p className="mt-1 font-semibold text-foreground">{selected.title}</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm font-medium text-foreground">Customer name</p>
                  <Input value={customer?.Name || user?.fullName || user?.name || ''} readOnly placeholder={customerLoading ? 'Loading your profile…' : 'Name not available'} />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-foreground">Registered mobile</p>
                  <Input value={customer?.phone_c || ''} readOnly placeholder="Mobile number not available in profile" />
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-sm font-medium text-foreground">Service location</p>
                <Input value={address || customer?.location_c || ''} onChange={(event) => setAddress(event.target.value)} placeholder="Enter your service location" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">No bike model details needed. LOCAL Customer Care will call you to confirm availability and the complete price, including the ₹25 LOCAL Platform Fee, before booking or payment.</p>
              <Button className="mt-4 w-full" disabled={!isOpen || submitting || customerLoading || !customer?.Id || !String(address || customer?.location_c || '').trim()} onClick={submitRequest}>
                {submitting ? <><ApperIcon name="LoaderCircle" size={17} className="mr-2 animate-spin" />Submitting request…</> : <><ApperIcon name="Send" size={17} className="mr-2" />Confirm & Submit Request</>}
              </Button>
              {!isOpen && <p className="mt-2 text-center text-sm font-medium text-amber-700">Submission is disabled outside service hours.</p>}
            </Card>
          )}
        </>
      )}

      <div className="mt-7 sm:mt-8">
        <Button type="button" variant="outline" className="w-full" disabled title="Customer Care phone number has not been configured">
          <ApperIcon name="Phone" size={17} />
          Call Customer Care
        </Button>
      </div>
    </div>
  );
}
