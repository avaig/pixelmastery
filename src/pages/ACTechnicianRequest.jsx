import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { PageHeader } from '@/components/local/EntityPages';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const { eq } = window.ApperSDK.CoreSDK;

const AC_TYPES = ['Split AC', 'Window AC'];
const SERVICE_TYPES = [
  'General servicing',
  'Repair / not cooling',
  'Installation / uninstallation',
  'Gas-related issue',
  'Other issue',
];

function createGroup(id) {
  return {
    id,
    acType: 'Split AC',
    quantity: 1,
    serviceType: 'General servicing',
    notes: '',
  };
}

export const route = {
  path: '/customer/home-services/ac-technician',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function ACTechnicianRequest() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
  const [groups, setGroups] = useState([createGroup(1)]);
  const [nextGroupId, setNextGroupId] = useState(2);
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [accessInstructions, setAccessInstructions] = useState('');
  const [serviceTiming, setServiceTiming] = useState('ASAP');
  const [scheduledAt, setScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: customer } = useFetch(
    async () => {
      if (!email) return null;
      const result = await sdk.table('customer_profiles_c')
        .select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c'])
        .page(1, 1000)
        .fetch();
      if (!result.success) throw new Error(result.message);
      return (result.data ?? []).find((item) => String(item.email_c ?? '').trim().toLowerCase() === email) ?? null;
    },
    [email],
  );

  const { data: homeCategory } = useFetch(
    () => sdk.table('service_categories_c')
      .select(['Id', 'Name', 'status_c'])
      .where(eq('Name', 'Home Services'))
      .page(1, 1)
      .fetch()
      .then((result) => result.data?.[0] ?? null),
    [],
  );

  const { data: capabilities } = useFetch(
    () => sdk.table('service_capabilities_c')
      .select(['Id', 'Name', 'vehicle_type_c', 'status_c'])
      .where(eq('status_c', 'Active'))
      .page(1, 200)
      .fetch()
      .then((result) => result.data ?? []),
    [],
  );

  const selectedTypes = useMemo(
    () => [...new Set(groups.map((group) => group.acType))],
    [groups],
  );
  const requiredCapabilityName = selectedTypes.length > 1
    ? 'AC Technician — Split & Window AC'
    : selectedTypes[0] === 'Window AC'
      ? 'AC Technician — Window AC'
      : 'AC Technician — Split AC';
  const requiredCapability = (capabilities ?? []).find((item) => item.Name === requiredCapabilityName);
  const totalUnits = groups.reduce((sum, group) => sum + Number(group.quantity || 0), 0);

  function updateGroup(id, field, value) {
    setGroups((current) => current.map((group) => (
      group.id === id ? { ...group, [field]: value } : group
    )));
  }

  function addGroup() {
    if (groups.length >= 8) {
      toast.error('You can add up to 8 AC service groups in one booking.');
      return;
    }
    setGroups((current) => [...current, createGroup(nextGroupId)]);
    setNextGroupId((current) => current + 1);
  }

  function useDemoLocation() {
    setLocation({
      text: customer?.location_c || 'Naini, Prayagraj',
      latitude: Number(customer?.latitude_c ?? 25.382),
      longitude: Number(customer?.longitude_c ?? 81.875),
    });
    toast.success('Demo location added. Please confirm the service address.');
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Browser location is not available. Use the demo location for testing.');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          text: customer?.location_c || 'Current location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        toast.error('Location permission was not granted. You can use the demo location for testing.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function createRequest() {
    if (!customer?.Id) {
      toast.error('Your customer profile could not be matched. Please complete your profile first.');
      return;
    }
    if (!homeCategory?.Id) {
      toast.error('Home Services is not configured yet. Please try again later.');
      return;
    }
    if (!requiredCapability?.Id) {
      toast.error('The required AC capability is not configured yet. Please try again later.');
      return;
    }
    if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
      toast.error('Confirm your location before requesting an AC technician.');
      return;
    }
    if (!location.text.trim()) {
      toast.error('Enter the service address.');
      return;
    }
    if (groups.length === 0 || groups.some((group) => !Number.isInteger(Number(group.quantity)) || Number(group.quantity) < 1 || Number(group.quantity) > 20)) {
      toast.error('Each AC group must have a quantity between 1 and 20.');
      return;
    }
    if (serviceTiming === 'Scheduled') {
      const selectedDate = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(selectedDate.getTime()) || selectedDate.getTime() <= Date.now()) {
        toast.error('Choose a future date and time for the scheduled service.');
        return;
      }
    }

    setCreating(true);
    try {
      const bookingDetails = {
        version: 1,
        totalUnits,
        groups: groups.map(({ id, ...group }) => ({
          acType: group.acType,
          quantity: Number(group.quantity),
          serviceType: group.serviceType,
          notes: group.notes.trim(),
        })),
        serviceAddress: location.text.trim(),
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        accessInstructions: accessInstructions.trim(),
      };
      const requestDescription = 'LOCAL_AC_REQUEST_JSON:' + JSON.stringify(bookingDetails);
      const result = await sdk.table('service_requests_c').create({
        Name: 'AC Technician • ' + totalUnits + ' AC unit' + (totalUnits === 1 ? '' : 's'),
        customer_c: customer.Id,
        service_category_c: homeCategory.Id,
        required_capability_c: requiredCapability.Id,
        problem_description_c: requestDescription,
        location_c: location.text.trim(),
        service_area_c: 'Prayagraj',
        latitude_c: Number(location.latitude),
        longitude_c: Number(location.longitude),
        status_c: 'Open',
        preferred_time_c: serviceTiming,
        requested_at_c: new Date().toISOString(),
        scheduled_at_c: serviceTiming === 'Scheduled' ? new Date(scheduledAt).toISOString() : null,
        service_mode_c: 'Normal',
        pricing_mode_c: 'Provider Quote',
        pricing_mode_description_c: 'Nearby eligible AC technicians can respond with availability, visit charge and an estimate. Final repair work requires customer approval.',
      });
      if (!result.data?.length) {
        toast.error(result.messages?.[0] || 'The AC service request could not be created.');
        return;
      }
      toast.success('Your AC service request has been created.');
      navigate('/requests/' + result.data[0].Id);
    } catch (error) {
      toast.error(error.message || 'The AC service request could not be created.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Home Services · AC Technician"
        title="Book an AC Technician"
        description="Add all the AC units you need serviced at one address. LOCAL will look for nearby providers with the required capabilities."
        action={<Button type="button" variant="outline" onClick={() => navigate('/customer/home-services')}><ApperIcon name="ArrowLeft" size={16} /> Home Services</Button>}
      />

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ApperIcon name="Snowflake" size={23} />
          </div>
          <div>
            <h2 className="font-heading text-lg font-semibold">Your AC units</h2>
            <p className="mt-1 text-sm text-muted-foreground">You can include Split ACs and Window ACs in the same booking. Add a separate group when the service needed is different.</p>
          </div>
        </div>

        <div className="space-y-4">
          {groups.map((group, index) => (
            <section key={group.id} className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">AC group {index + 1}</h3>
                {groups.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))}>
                    <ApperIcon name="Trash2" size={15} /> Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor={'ac-type-' + group.id} className="text-sm font-medium">AC type</label>
                  <select id={'ac-type-' + group.id} value={group.acType} onChange={(event) => updateGroup(group.id, 'acType', event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {AC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={'ac-qty-' + group.id} className="text-sm font-medium">Number of units</label>
                  <Input id={'ac-qty-' + group.id} type="number" min="1" max="20" step="1" value={group.quantity} onChange={(event) => updateGroup(group.id, 'quantity', event.target.value === '' ? '' : Number(event.target.value))} className="mt-1" />
                </div>
                <div>
                  <label htmlFor={'ac-service-' + group.id} className="text-sm font-medium">Service required</label>
                  <select id={'ac-service-' + group.id} value={group.serviceType} onChange={(event) => updateGroup(group.id, 'serviceType', event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {SERVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor={'ac-notes-' + group.id} className="text-sm font-medium">Problem details (optional)</label>
                <Textarea id={'ac-notes-' + group.id} value={group.notes} onChange={(event) => updateGroup(group.id, 'notes', event.target.value)} placeholder="For example, one unit is not cooling or making noise." maxLength={500} className="mt-1 min-h-20" />
              </div>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={addGroup} disabled={groups.length >= 8}><ApperIcon name="Plus" size={16} /> Add another AC group</Button>
          <div className="rounded-lg bg-muted px-4 py-2 text-sm">
            Total units: <span className="font-semibold tabular-nums">{totalUnits}</span>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold">Service address</h2>
          <p className="mt-1 text-sm text-muted-foreground">Location helps LOCAL find suitable nearby technicians. Confirm coordinates before sending the request.</p>
        </div>
        {location ? (
          <div className="space-y-3 rounded-lg border border-success-border bg-success-muted p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-success"><ApperIcon name="MapPinCheck" size={18} /> Location confirmed</div>
            <label htmlFor="ac-address" className="text-sm font-medium text-foreground">Full service address / locality</label>
            <Input id="ac-address" value={location.text} onChange={(event) => setLocation((current) => ({ ...current, text: event.target.value }))} placeholder="House, street, locality" className="bg-background" />
            <p className="text-xs text-success/90">Coordinates: {Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setLocation(null)}>Change location</Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" onClick={useCurrentLocation} disabled={locationLoading}><ApperIcon name="LocateFixed" size={17} /> {locationLoading ? 'Getting location…' : 'Use current location'}</Button>
            <Button type="button" variant="outline" onClick={useDemoLocation}><ApperIcon name="MapPin" size={17} /> Use demo location</Button>
          </div>
        )}
        <div>
          <label htmlFor="ac-access" className="text-sm font-medium">Access instructions (optional)</label>
          <Textarea id="ac-access" value={accessInstructions} onChange={(event) => setAccessInstructions(event.target.value)} placeholder="Floor, gate, parking or access details" maxLength={500} className="mt-1 min-h-20" />
        </div>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold">When do you need the service?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your requested time is not confirmed until a provider accepts the booking.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={serviceTiming === 'ASAP' ? 'default' : 'outline'} onClick={() => setServiceTiming('ASAP')}><ApperIcon name="Zap" size={16} /> Book Now</Button>
          <Button type="button" variant={serviceTiming === 'Scheduled' ? 'default' : 'outline'} onClick={() => setServiceTiming('Scheduled')}><ApperIcon name="CalendarClock" size={16} /> Schedule for Later</Button>
        </div>
        {serviceTiming === 'Scheduled' && (
          <div>
            <label htmlFor="ac-scheduled-time" className="text-sm font-medium">Choose date and time</label>
            <Input id="ac-scheduled-time" type="datetime-local" min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1" />
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">No repair work begins until you approve the provider's final estimate.</p>
        <Button type="button" size="lg" onClick={createRequest} disabled={creating || !location || totalUnits < 1}>
          <ApperIcon name="Send" size={17} /> {creating ? 'Creating request…' : 'Find LOCAL AC Technicians'}
        </Button>
      </div>
    </div>
  );
}
