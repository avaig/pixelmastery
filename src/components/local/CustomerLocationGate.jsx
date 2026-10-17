import { useState } from 'react';
import ApperIcon from '@/components/ApperIcon';

const SERVICE_CENTER = { latitude: 25.382, longitude: 81.875, label: 'Naini, Prayagraj' };
const SERVICE_RADIUS_KM = 25;
const LOCATION_KEY = 'local_service_location_c';
// Versioned so an old completion flag from earlier testing cannot silently bypass
// the location gate for customers after this flow update.
const CHECK_KEY = 'local_location_check_complete_v2';

function distanceKm(a, b) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function reverseGeocode(latitude, longitude) {
  try {
    const response = await fetch(
      'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='
        + latitude + '&longitude=' + longitude + '&localityLanguage=en'
    );
    if (!response.ok) return 'Current location';
    const data = await response.json();
    return [data.locality, data.city || data.localityInfo?.administrative?.[0]?.name, data.principalSubdivision]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 2)
      .join(', ') || 'Current location';
  } catch {
    return 'Current location';
  }
}

export default function CustomerLocationGate({ required = true, allowProviderBypass = false }) {
  const [complete, setComplete] = useState(() => {
    try {
      return window.localStorage.getItem(CHECK_KEY) === 'true' || window.sessionStorage.getItem(CHECK_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [message, setMessage] = useState('');
  const [outsideArea, setOutsideArea] = useState(false);
  const [outsideLocation, setOutsideLocation] = useState(null);

  if (!required || complete) return null;

  function saveLocation(location) {
    const distance = distanceKm(SERVICE_CENTER, location);
    const confirmed = {
      ...location,
      serviceArea: 'Naini, Prayagraj',
      source: location.source || 'manual',
      checkedAt: new Date().toISOString(),
      distanceFromNainiKm: Number(distance.toFixed(2)),
      serviceable: distance <= SERVICE_RADIUS_KM,
    };
    if (distance > SERVICE_RADIUS_KM) {
      setOutsideLocation(confirmed);
      setOutsideArea(true);
      setMessage('LOCAL is currently available in Naini and nearby Prayagraj, within about 25 km of Naini. Your selected location appears to be outside this area. You can still explore LOCAL, but bookings will remain unavailable for this location.');
      return;
    }
    try {
      window.localStorage.setItem(LOCATION_KEY, JSON.stringify(confirmed));
      window.localStorage.setItem(CHECK_KEY, 'true');
      window.sessionStorage.setItem(CHECK_KEY, 'true');
    } catch {
      setMessage('Your browser could not save this location. Please allow site storage and try again.');
      return;
    }
    setMessage('');
    setOutsideArea(false);
    setComplete(true);
  }

  function useCurrentLocation() {
    setMessage('');
    setOutsideArea(false);
    if (!navigator.geolocation) {
      setMessage('This browser cannot provide device location. Please enter your service location manually.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const label = await reverseGeocode(latitude, longitude);
        saveLocation({ label, latitude, longitude, source: 'device GPS' });
        setBusy(false);
      },
      (error) => {
        setBusy(false);
        setMessage(error?.code === 1
          ? 'Location permission was denied. Enter your service location manually to continue.'
          : 'We could not detect your device location. Enter your service location manually to continue.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  function continueExploringOutsideArea() {
    if (!outsideLocation) return;
    try {
      window.localStorage.setItem(LOCATION_KEY, JSON.stringify(outsideLocation));
      window.localStorage.setItem(CHECK_KEY, 'true');
      window.sessionStorage.setItem(CHECK_KEY, 'true');
      setComplete(true);
    } catch {
      setMessage('Your browser could not save this location. Please allow site storage and try again.');
    }
  }

  async function useManualLocation(event) {
    event.preventDefault();
    const query = manualAddress.trim();
    if (query.length < 3) {
      setMessage('Enter a locality or address, for example “Naini, Prayagraj”.');
      return;
    }
    setBusy(true);
    setMessage('');
    setOutsideArea(false);
    try {
      const response = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q='
          + encodeURIComponent(query)
      );
      if (!response.ok) throw new Error('Geocoding unavailable');
      const results = await response.json();
      if (!results.length) {
        setMessage('We could not find that location. Try a nearby landmark or a more complete address.');
        return;
      }
      const result = results[0];
      saveLocation({
        label: result.display_name.split(',').slice(0, 3).join(', '),
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        source: 'manual selection',
      });
    } catch {
      setMessage('Manual location lookup is temporarily unavailable. Please try again or enable device location.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-location-title"
        className="my-auto w-full max-w-lg rounded-3xl bg-white p-6 text-[#102c4d] shadow-2xl sm:p-8"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ApperIcon name="MapPin" size={30} />
        </div>
        <p className="mt-5 text-center text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">LOCAL — Happy to Help</p>
        <h2 id="local-location-title" className="mt-2 text-center text-2xl font-black tracking-tight">Confirm your service location</h2>
        <p className="mt-3 text-center text-sm leading-6 text-slate-600">
          LOCAL finds nearby Service Providers using where you are now. We will not use your saved profile address for this check.
        </p>
        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
          <div className="flex items-center gap-2 font-bold"><ApperIcon name="MapPinned" size={18} /> Current launch area</div>
          <p className="mt-1">Naini and nearby Prayagraj, within about 25 km of Naini.</p>
        </div>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={busy}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#102c4d] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#183c64] disabled:cursor-wait disabled:opacity-60"
        >
          <ApperIcon name={busy ? 'LoaderCircle' : 'LocateFixed'} size={18} className={busy ? 'animate-spin' : ''} />
          {busy ? 'Checking location…' : 'Use my current location'}
        </button>
        <div className="my-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> OR <span className="h-px flex-1 bg-slate-200" />
        </div>
        <form onSubmit={useManualLocation} className="space-y-3">
          <label htmlFor="local-manual-location" className="block text-sm font-bold">Enter location manually</label>
          <input
            id="local-manual-location"
            value={manualAddress}
            onChange={(event) => setManualAddress(event.target.value)}
            placeholder="e.g. Naini, Prayagraj"
            autoComplete="street-address"
            className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-[#102c4d] transition hover:bg-slate-50 disabled:opacity-60"
          >
            <ApperIcon name="Search" size={17} /> Check this location
          </button>
        </form>
        {message && (
          <div role="status" className={'mt-4 rounded-xl p-3 text-sm leading-5 ' + (outsideArea ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800')}>
            {message}
          </div>
        )}
        {outsideArea && (
          <div className="mt-3 space-y-3">
            <p className="text-center text-xs leading-5 text-slate-500">
              You can still explore LOCAL, but customer bookings for this area are not enabled yet.
            </p>
            <button
              type="button"
              onClick={continueExploringOutsideArea}
              className="w-full rounded-xl bg-[#102c4d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#183c64]"
            >
              Continue exploring LOCAL
            </button>
          </div>
        )}
        {allowProviderBypass && (
          <button
            type="button"
            onClick={() => window.location.assign('/service-provider/login')}
            className="mt-5 w-full text-center text-sm font-bold text-slate-500 underline underline-offset-4 hover:text-[#102c4d]"
          >
            I am a Service Provider
          </button>
        )}
      </section>
    </div>
  );
}
