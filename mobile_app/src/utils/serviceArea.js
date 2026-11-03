const EARTH_RADIUS_KM = 6371;

function getDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const rawValues = [latitudeA, longitudeA, latitudeB, longitudeB];
  if (rawValues.some((value) => value === null || value === undefined || String(value).trim() === '')) return null;
  const values = rawValues.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (Math.abs(values[0]) > 90 || Math.abs(values[2]) > 90 || Math.abs(values[1]) > 180 || Math.abs(values[3]) > 180) return null;
  const [latA, lonA, latB, lonB] = values.map((value) => value * Math.PI / 180);
  const deltaLat = latB - latA;
  const deltaLon = lonB - lonA;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function checkServiceability(latitude, longitude, serviceArea) {
  const distanceKm = getDistanceKm(
    serviceArea.centre.latitude,
    serviceArea.centre.longitude,
    latitude,
    longitude,
  );
  return {
    distanceKm,
    serviceable: distanceKm !== null && distanceKm <= serviceArea.radiusKm,
  };
}

module.exports = { checkServiceability, getDistanceKm };
