const LOCATION_KEY = 'local_service_location_c';
const SERVICE_CENTER = { latitude: 25.382, longitude: 81.875 };
const SERVICE_RADIUS_KM = 25;

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

export function getLocalServiceAreaStatus() {
  try {
    const location = JSON.parse(window.localStorage.getItem(LOCATION_KEY) || 'null');
    if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
      return { checked: false, serviceable: false, location: null };
    }

    // Always recalculate from the actual coordinates. Do not trust an older cached
    // serviceable flag or distance that may have been produced by an outdated rule.
    const distance = distanceKm(SERVICE_CENTER, {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    });
    const serviceable = distance <= SERVICE_RADIUS_KM;
    const verifiedLocation = {
      ...location,
      distanceFromNainiKm: Number(distance.toFixed(2)),
      serviceable,
      serviceArea: 'Naini, Prayagraj',
    };

    // Repair stale local data so every service uses the same current decision.
    window.localStorage.setItem(LOCATION_KEY, JSON.stringify(verifiedLocation));

    return {
      checked: true,
      serviceable,
      location: verifiedLocation,
      distanceKm: Number(distance.toFixed(2)),
    };
  } catch {
    return { checked: false, serviceable: false, location: null };
  }
}

export function getServiceAreaMessage() {
  const status = getLocalServiceAreaStatus();
  if (!status.checked) {
    return 'Please confirm your service location on the LOCAL home screen before submitting a request.';
  }
  return 'LOCAL is coming soon to ' + (status.location?.label || 'your area') + '. We are currently accepting service requests in Naini and nearby Prayagraj only.';
}
