import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { getLanguage, tr } from '@/services/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/customer/ambulance',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function AmbulanceRequest() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [creating, setCreating] = useState(false);
  const language = getLanguage();

  const { data: customer } = useFetch(
    () =>
      sdk
        .table('customer_profiles_c')
        .select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c'])
        .where(eq('email_c', user?.emailAddress ?? user?.email ?? ''))
        .page(1, 1)
        .fetch()
        .then((res) => res.data?.[0] ?? null),
    [user?.emailAddress, user?.email],
  );

  function useDemoLocation() {
    setLocation({
      text: customer?.location_c ?? 'Naini, Prayagraj',
      latitude: customer?.latitude_c ?? 25.382,
      longitude: customer?.longitude_c ?? 81.875,
    });
    toast.success('Demo location added.');
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error(tr('Browser location is not available.', language));
      return;
    }
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          text: 'Current location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLoadingLocation(false);
      },
      () => {
        setLoadingLocation(false);
        toast.error(tr('Location permission was not granted.', language));
      },
    );
  }

  async function requestAmbulance() {
    if (!customer?.Id || !location) {
      toast.error(tr('Please confirm your location first.', language));
      return;
    }
    setCreating(true);
    try {
      const res = await sdk.table('emergency_requests_c').create({
        Name: 'Ambulance',
        customer_c: customer.Id,
        service_mode_c: 'Emergency',
        emergency_type_c: 'Ambulance',
        injury_status_c: null,
        location_c: location.text,
        latitude_c: Number(location.latitude),
        longitude_c: Number(location.longitude),
        emergency_status_c: 'Open',
        assigned_technician_c: null,
        agreed_price_c: null,
        notes_c: 'Emergency medical assistance requested.',
      });
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'Ambulance request could not be created.');
        return;
      }
      toast.success('Ambulance request created. Finding nearby ambulance assistance...');
      navigate('/emergency/select-provider?serviceMode=Emergency&emergencyType=Ambulance&customerId=' + customer.Id + '&latitude=' + location.latitude + '&longitude=' + location.longitude + '&location=' + encodeURIComponent(location.text));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex justify-start">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/customer')}
          className="flex size-10 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition hover:border-primary hover:text-primary"
        >
          <ApperIcon name="ArrowLeft" size={19} />
        </button>
      </div>
      <div className="mb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {tr('Emergency', language)}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          🚑 {tr('Emergency Medical Help', language)}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {tr('Share your location to find nearby ambulance assistance.', language)}
        </p>
      </div>
      <Card className="mx-auto max-w-2xl border-2 border-destructive/30 p-7">
        <div className="flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ApperIcon name="Ambulance" size={36} />
          </div>
          <div>
            <div className="text-lg font-semibold">{tr('Emergency Medical Help', language)}</div>
            <div className="mt-1 text-sm text-muted-foreground">{tr('We will use your location to show available ambulance assistance.', language)}</div>
          </div>
        </div>
        <div className="mt-6 grid gap-3">
          <Button size="lg" variant="destructive" onClick={useCurrentLocation} disabled={loadingLocation}>
            <ApperIcon name="LocateFixed" size={18} />
            {loadingLocation ? tr('Getting location…', language) : tr('Share current location', language)}
          </Button>
          <Button size="lg" variant="outline" onClick={useDemoLocation}>
            <ApperIcon name="MapPin" size={18} />
            {tr('Use demo location', language)}
          </Button>
        </div>
        {location && (
          <div className="mt-5 rounded-xl border border-success-border bg-success-muted p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <ApperIcon name="MapPinCheck" size={18} />
              {tr('Location confirmed', language)}
            </div>
            <div className="mt-1 text-sm text-success">{location.text}</div>
            <Button className="mt-4 w-full" variant="destructive" onClick={requestAmbulance} disabled={creating}>
              <ApperIcon name="Ambulance" size={17} />
              {creating ? tr('Requesting ambulance…', language) : 'Find LOCAL Ambulance Providers'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}