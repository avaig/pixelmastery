const LOCATION_KEY = 'local_service_location_c';
const SERVICE_RADIUS_KM = 25;

export function getLocalServiceAreaStatus() {
  try {
    const location = JSON.parse(window.localStorage.getItem(LOCATION_KEY) || 'null');
    if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
      return { checked: false, serviceable: false, location: null };
    }
    const serviceable = location.serviceable === true
      && Number(location.distanceFromNainiKm) <= SERVICE_RADIUS_KM;
    return {
      checked: true,
      serviceable,
      location,
      distanceKm: Number(location.distanceFromNainiKm),
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
