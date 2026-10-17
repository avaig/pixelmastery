import { useState } from 'react';
import ApperIcon from '@/components/ApperIcon';

const LOCATION_KEY = 'local_provider_working_location_c';
const CHECK_KEY = 'local_provider_location_check_complete';

async function reverseGeocode(latitude, longitude) {
  try {
    const response = await fetch(
      'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='
        + latitude + '&longitude=' + longitude + '&localityLanguage=en'
    );
    if (!response.ok) return 'Current working location';
    const data = await response.json();
    return [data.locality, data.city || data.localityInfo?.administrative?.[0]?.name, data.principalSubdivision]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 2)
      .join(', ') || 'Current working location';
  } catch {
    return 'Current working location';
  }
}

export default function ServiceProviderLocationGate() {
  const [complete, setComplete] = useState(() => {
    try {
      return window.localStorage.getItem(CHECK_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [message, setMessage] = useState('');

  if (complete) return null;

  function saveLocation(location) {
    const confirmed = {
      ...location,
      source: location.source || 'manual selection',
      checkedAt: new Date().toISOString(),
      accuracyType: location.source === 'device GPS' ? 'device coordinates' : 'manually selected address',
    };
    try {
      window.localStorage.setItem(LOCATION_KEY, JSON.stringify(confirmed));
      window.localStorage.setItem(CHECK_KEY, 'true');
      setComplete(true);
      setMessage('');
    } catch {
      setMessage('Your browser could not save this location. Please allow site storage and try again.');
    }
  }

  function useCurrentLocation() {
    setMessage('');
    if (!navigator.geolocation) {
      setMessage('This browser cannot provide device location. Enter your working location manually.');
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
          ? 'Location permission was denied. Enter your working location manually to continue.'
          : 'We could not detect your device location. Enter your working location manually to continue.');
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
    );
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
    try {
      const response = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q='
          + encodeURIComponent(query)
      );
      if (!response.ok) throw new Error('Location search unavailable');
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
      setMessage('Manual location search is temporarily unavailable. Please try again or enable device location.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-location-title"
        className="my-auto w-full max-w-lg rounded-3xl bg-white p-6 text-[#102c4d] shadow-2xl sm:p-8"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <ApperIcon name="MapPin" size={30} />
        </div>
        <p className="mt-5 text-center text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">LOCAL — Service Provider</p>
        <h2 id="provider-location-title" className="mt-2 text-center text-2xl font-black tracking-tight">Set your working location</h2>
        <p className="mt-3 text-center text-sm leading-6 text-slate-600">
          LOCAL uses your location to help match you with nearby customer requests. This is your current working location, separate from your registered address and service coverage.
        </p>
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
          <label htmlFor="provider-manual-location" className="block text-sm font-bold">Enter working location manually</label>
          <input
            id="provider-manual-location"
            value={manualAddress}
            onChange={(event) => setManualAddress(event.target.value)}
            placeholder="e.g. Naini, Prayagraj"
            autoComplete="street-address"
            className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-[#102c4d] transition hover:bg-slate-50 disabled:opacity-60"
          >
            <ApperIcon name="Search" size={17} /> Find and save working location
          </button>
        </form>
        {message && <div role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">{message}</div>}
        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          GPS is optional. A manually selected address is labelled as manual and is not treated as live GPS.
        </p>
      </section>
    </div>
  );
}
