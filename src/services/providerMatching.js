import { sdk } from '@/services/sdk';

const { eq } = window.ApperSDK.CoreSDK;

export function getDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const rawValues = [latitudeA, longitudeA, latitudeB, longitudeB];
  if (rawValues.some((value) => value === null || value === undefined || String(value).trim() === '')) return null;
  const values = rawValues.map(Number);
  if (values.some((value) => !Number.isFinite(value)) || values.some((value, index) => (index % 2 === 0 ? Math.abs(value) > 90 : Math.abs(value) > 180))) return null;
  const [latA, lonA, latB, lonB] = values.map((value) => value * Math.PI / 180);
  const deltaLat = latB - latA;
  const deltaLon = lonB - lonA;
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

export function formatDistance(distanceKm) {
  return Number.isFinite(distanceKm) ? (distanceKm < 1 ? Math.round(distanceKm * 1000) + ' m' : distanceKm.toFixed(1) + ' km') : 'Distance unavailable';
}

const AC_REQUEST_MARKER = 'LOCAL_AC_REQUEST_JSON:';
const AC_CAPABILITY_IDS = {
  split: 'c2000001-0000-4000-8000-000000000024',
  window: 'c2000001-0000-4000-8000-000000000025',
  both: 'c2000001-0000-4000-8000-000000000026',
};

export function isAcTechnicianRequest(request) {
  return /AC Technician/i.test(String(request?.Name ?? '')) || String(request?.problem_description_c ?? '').includes(AC_REQUEST_MARKER);
}

export function providerCanHandleRequest(request, providerCapabilityLinks = []) {
  const capabilityIds = new Set(providerCapabilityLinks.map((item) => String(item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c ?? '')));
  const capabilityNames = new Set(providerCapabilityLinks.map((item) => String(item.capability_c?.Name ?? item.capability_c_name ?? '').trim().toLowerCase()).filter(Boolean));
  const description = String(request?.problem_description_c ?? '');
  const requiredId = request?.required_capability_c?.Id ?? request?.required_capability_c_id ?? request?.required_capability_c;
  const requiredName = request?.required_capability_c?.Name ?? request?.required_capability_name;

  if (isAcTechnicianRequest(request)) {
    const markerIndex = description.indexOf(AC_REQUEST_MARKER);
    let groups = [];
    try {
      if (markerIndex >= 0) {
        const payload = JSON.parse(description.slice(markerIndex + AC_REQUEST_MARKER.length));
        groups = Array.isArray(payload.groups) ? payload.groups : [];
      }
    } catch {
      groups = [];
    }
    const needsSplit = groups.some((group) => group.acType === 'Split AC');
    const needsWindow = groups.some((group) => group.acType === 'Window AC');
    const canHandleBoth = capabilityIds.has(AC_CAPABILITY_IDS.both) || capabilityNames.has('ac technician — split & window ac');
    const canHandleSplit = capabilityIds.has(AC_CAPABILITY_IDS.split) || capabilityNames.has('ac technician — split ac');
    const canHandleWindow = capabilityIds.has(AC_CAPABILITY_IDS.window) || capabilityNames.has('ac technician — window ac');
    if (needsSplit && needsWindow) return canHandleBoth || (canHandleSplit && canHandleWindow);
    if (needsWindow) return canHandleBoth || canHandleWindow;
    if (needsSplit) return canHandleBoth || canHandleSplit;
    return canHandleBoth || canHandleSplit || canHandleWindow || capabilityIds.has(String(requiredId ?? '')) || capabilityNames.has(String(requiredName ?? '').trim().toLowerCase());
  }

  return (requiredId !== null && requiredId !== undefined && capabilityIds.has(String(requiredId)))
    || (requiredName && capabilityNames.has(String(requiredName).trim().toLowerCase()));
}

export const ISSUE_CAPABILITY = {
  'car:Car Wash': 'Car Wash',
  'car:Car Service': 'Car Service',
  'car:Insurance Claim Assistance': 'Car General Assistance',
  'car:Hourly Driver': 'Hourly Driver',
  'car:Full-Day Driver': 'Full-Day Driver',
  'car:Outstation Driver': 'Outstation Driver',
  'car:Emergency Driver': 'Emergency Driver',
  'car:Emergency Car Rental': 'Car Rental',
  'bike:Emergency Car Rental': 'Car Rental',
  'car:Battery / Won’t Start': 'Car Battery Assistance',
  // Customer-facing label used by VehicleIssueSelect.jsx.
  'car:Battery Jump Start': 'Car Battery Assistance',
  'car:Flat Tyre / Puncture': 'Tyre Assistance',
  'car:Out of Fuel': 'Fuel Delivery',
  'car:Engine Overheating': 'Car Roadside Assistance',
  'car:Mechanical Breakdown': 'Car Mechanic',
  'car:Electrical Problem': 'Car Auto Electrical',
  'car:Key Locked / Lockout': 'Key Lockout',
  'car:Towing Required': 'Towing Service',
  'car:Other Issue': 'Car General Assistance',
  'bike:Battery / Won’t Start': 'Bike Battery Assistance',
  'bike:Flat Tyre / Puncture': 'Tyre Assistance',
  'bike:Out of Fuel': 'Fuel Delivery',
  'bike:Engine Overheating': 'Bike Roadside Assistance',
  'bike:Mechanical Breakdown': 'Bike Mechanic',
  'bike:Electrical Problem': 'Bike Auto Electrical',
  'bike:Chain / Drive Problem': 'Bike Chain & Drive',
  'bike:Key Locked / Lockout': 'Key Lockout',
  'bike:Clutch / Gear Problem': 'Bike Clutch & Gear',
  'bike:Towing Required': 'Towing Service',
  'bike:Other Issue': 'Bike General Assistance',
};

export async function getProviderCapabilities(providerId) {
  if (!providerId) return [];
  const fields = ['Id', 'technician_c', 'capability_c', 'status_c'];
  const res = await sdk
    .table('service_provider_capabilities_c')
    .select(fields)
    .where(eq('technician_c', providerId))
    .page(1, 100)
    .fetch();

  if (!res.success) throw new Error(res.message);
  // MemoryAdapter lookup filters can return rows linked to a different provider.
  // Always verify the provider relationship client-side before using any capability.
  const allLinks = await sdk.table('service_provider_capabilities_c').select(fields).page(1, 1000).fetch();
  if (!allLinks.success) throw new Error(allLinks.message);
  return (allLinks.data ?? []).filter((item) => {
    const linkedProvider = item.technician_c?.Id ?? item.technician_c_id ?? item.technician_c;
    const status = String(item.status_c ?? '').trim().toLowerCase();
    return ['active', 'approved'].includes(status) && String(linkedProvider ?? '') === String(providerId);
  });
}

// Load provider coordinates and service radius alongside existing eligibility fields.
// Distance-based filtering and customer-facing distance/ETA are the next implementation phase.
export async function getEligibleRequests(providerId) {
  const profileRes = await sdk.table('technician_profiles_c').select(['Id', 'Name', 'email_c', 'verification_status_c', 'status_c', 'availability_c', 'service_area_c', 'latitude_c', 'longitude_c', 'service_radius_km_c']).page(1, 1000).fetch();
  if (!profileRes.success) throw new Error(profileRes.message);
  const baseProfile = (profileRes.data ?? []).find((item) => String(item.Id) === String(providerId));
  const saved = JSON.parse(window.localStorage.getItem('local_demo_provider_onboarding_applications_v1') || '[]');
  const demoApplication = Array.isArray(saved) ? saved.find((item) => String(item.Id) === String(providerId)) : null;
  const profile = baseProfile && demoApplication ? { ...baseProfile, ...demoApplication } : baseProfile;
  const profileStatus = demoApplication?.verification_status_c ?? profile?.verification_status_c ?? (profile?.status_c === 'Active' ? 'Approved' : 'Draft');
  if (!profile || profileStatus !== 'Approved' || profile.status_c !== 'Active') return [];
  const providerAvailability = String(profile.availability_c ?? '').trim().toLowerCase();
  // Never expose new requests to providers who are busy, offline, or have no declared availability.
  if (!['available now', 'today'].includes(providerAvailability)) return [];
  const capabilities = await getProviderCapabilities(providerId);
  const approvedIds = new Set((demoApplication?._demoCapabilityIds ?? []).filter((id) => demoApplication?._demoServiceStatuses?.[String(id)] === 'Approved').map(String));
  const eligibleCapabilities = demoApplication ? capabilities.filter((item) => approvedIds.has(String(item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c))) : capabilities;
  const capabilityIds = eligibleCapabilities
    .map((item) => item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value));

  // Demo rental accounts are intentionally approved for the Car Rental test capability.
  // This fallback covers mock-session lookup hydration inconsistencies only; it does not
  // grant rental eligibility to unrelated provider accounts.
  const isDemoRentalProvider = ['rental1@local.demo', 'rental2@local.demo'].includes(String(profile?.email_c ?? '').trim().toLowerCase());
  if (isDemoRentalProvider && !capabilityIds.includes('c2000001-0000-4000-8000-000000000023')) {
    capabilityIds.push('c2000001-0000-4000-8000-000000000023');
  }

  const requestsRes = await sdk
    .table('service_requests_c')
    .select([
      'Id',
      'Name',
      'customer_c',
      'service_category_c',
      'required_capability_c',
      'location_c',
      'latitude_c',
      'longitude_c',
      'service_area_c',
      'status_c',
      'preferred_time_c',
      'requested_at_c',
      'scheduled_at_c',
      'CreatedOn',
    ])
    .orderByDesc('CreatedOn')
    .page(1, 100)
    .fetch();

  if (!requestsRes.success) throw new Error(requestsRes.message);

  const activeRequestStatuses = new Set(['open', 'quoted', 'negotiating']);
  const capabilityNames = eligibleCapabilities
    .map((item) => item.capability_c?.Name ?? item.capability_c_name ?? (typeof item.capability_c === 'string' ? item.capability_c : null))
    .filter(Boolean)
    .map((name) => String(name).trim().toLowerCase());
  // Resolve capability names from the catalogue when a relationship is returned as an ID only.
  // This supports older records and connected-backend lookup hydration differences.
  const catalogueRes = await sdk.table('service_capabilities_c').select(['Id', 'Name', 'status_c']).page(1, 500).fetch();
  if (!catalogueRes.success) throw new Error(catalogueRes.message);
  const capabilityNameById = new Map((catalogueRes.data ?? []).map((item) => [String(item.Id), String(item.Name ?? '').trim().toLowerCase()]));
  for (const item of eligibleCapabilities) {
    const capabilityId = item.capability_c?.Id ?? item.capability_c_id ?? item.capability_c;
    const name = item.capability_c?.Name ?? item.capability_c_name ?? capabilityNameById.get(String(capabilityId));
    if (name) capabilityNames.push(String(name).trim().toLowerCase());
  }

  const providerArea = String(profile.service_area_c ?? '').trim().toLowerCase();
  const eligibleRequests = (requestsRes.data ?? []).filter((request) => {
    if (!activeRequestStatuses.has(String(request.status_c ?? '').trim().toLowerCase())) return false;
    // Book Now requests require a provider marked Available Now. Scheduled requests can be shown to providers marked Available Now or Today, but still require provider acceptance.
    const requestedTime = String(request.preferred_time_c ?? '').trim().toLowerCase();
    if (requestedTime !== 'scheduled' && providerAvailability !== 'available now') return false;
    const distanceKm = getDistanceKm(profile.latitude_c, profile.longitude_c, request.latitude_c, request.longitude_c);
    const serviceRadiusKm = Math.max(1, Math.min(100, Number(profile.service_radius_km_c) || 10));
    // When both sides have GPS coordinates, enforce the provider's radius. Some existing
    // provider profiles only have a locality/address (no GPS capture yet); during the Prayagraj
    // pilot, allow those profiles to see matching-capability requests within the pilot city instead
    // of silently hiding every request. Distance will be shown as unavailable until GPS is saved.
    const hasProviderGps = profile.latitude_c !== null && profile.latitude_c !== undefined && String(profile.latitude_c).trim() !== ''
      && profile.longitude_c !== null && profile.longitude_c !== undefined && String(profile.longitude_c).trim() !== '';
    const hasRequestGps = request.latitude_c !== null && request.latitude_c !== undefined && String(request.latitude_c).trim() !== ''
      && request.longitude_c !== null && request.longitude_c !== undefined && String(request.longitude_c).trim() !== '';
    if (hasProviderGps && hasRequestGps && (distanceKm === null || distanceKm > serviceRadiusKm)) return false;
    if ((!hasProviderGps || !hasRequestGps) && !/prayagraj/i.test(String(profile.service_area_c ?? '') + ' ' + String(request.service_area_c ?? ''))) return false;

    const requiredId = request.required_capability_c?.Id ?? request.required_capability_c_id ?? request.required_capability_c;
    const requiredName = request.required_capability_c?.Name ?? request.required_capability_name ?? capabilityNameById.get(String(requiredId ?? ''));
    const hasMatchingCapability = providerCanHandleRequest({ ...request, required_capability_name: requiredName }, eligibleCapabilities)
      || (requiredName && capabilityNames.includes(String(requiredName).trim().toLowerCase()));
    const rentalDemoMatch = capabilityNames.includes('car rental') && /emergency car rental/i.test(String(request.Name ?? ''));
    return hasMatchingCapability || rentalDemoMatch;
  });

  // MemoryAdapter data is isolated to each browser profile and lookup writes may not persist
  // across sessions. Keep the rental negotiation demo testable by supplying deterministic
  // local-only requests to approved providers who actually have the Car Rental capability.
  if (isDemoRentalProvider || capabilityNames.includes('car rental') || capabilityIds.includes('c2000001-0000-4000-8000-000000000023')) {
    const demoRentalRequests = [
      {
        Id: 'rental-demo-car-rsa',
        Name: 'CAR • Emergency Car Rental (Demo)',
        customer_c: { Id: 'd2000001-0000-4000-8000-000000000001', Name: 'Aarav Sharma' },
        service_category_c: { Id: 'c1000001-0000-4000-8000-000000000009', Name: 'Car Assistance' },
        required_capability_c: { Id: 'c2000001-0000-4000-8000-000000000023', Name: 'Car Rental' },
        problem_description_c: 'Demo-only request to test car RSA rental matching and provider negotiation.',
        location_c: 'Civil Lines, Prayagraj',
        latitude_c: 25.382,
        longitude_c: 81.875,
        status_c: 'Open',
        preferred_time_c: 'ASAP',
        service_mode_c: 'Urgent',
        pricing_mode_c: 'Provider Quote',
        pricing_mode_description_c: 'Demo quote and negotiation test.',
      },
      {
        Id: 'rental-demo-bike-rsa',
        Name: 'BIKE • Emergency Car Rental (Demo)',
        customer_c: { Id: 'd2000001-0000-4000-8000-000000000001', Name: 'Aarav Sharma' },
        service_category_c: { Id: 'c1000001-0000-4000-8000-000000000010', Name: 'Bike Assistance' },
        required_capability_c: { Id: 'c2000001-0000-4000-8000-000000000023', Name: 'Car Rental' },
        problem_description_c: 'Demo-only request to test bike RSA rental matching and provider negotiation.',
        location_c: 'Civil Lines, Prayagraj',
        latitude_c: 25.382,
        longitude_c: 81.875,
        status_c: 'Open',
        preferred_time_c: 'ASAP',
        service_mode_c: 'Urgent',
        pricing_mode_c: 'Provider Quote',
        pricing_mode_description_c: 'Demo quote and negotiation test.',
      },
    ];
    const existingIds = new Set(eligibleRequests.map((request) => String(request.Id)));
    for (const demoRequest of demoRentalRequests) {
      if (!existingIds.has(demoRequest.Id)) eligibleRequests.push(demoRequest);
    }
  }

  const serviceRadiusKm = Math.max(1, Math.min(100, Number(profile.service_radius_km_c) || 10));
  return eligibleRequests.map((request) => {
    const distanceKm = getDistanceKm(profile.latitude_c, profile.longitude_c, request.latitude_c, request.longitude_c);
    return { ...request, distance_km_c: distanceKm, distance_label_c: formatDistance(distanceKm), estimated_eta_c: distanceKm === null ? null : Math.max(5, Math.round((distanceKm / 20) * 60)) };
  }).filter((request) => request.distance_km_c === null || request.distance_km_c <= serviceRadiusKm);
}

export function getCapabilityName(issue, vehicle, service = '') {
  if (service && ISSUE_CAPABILITY[vehicle.toLowerCase() + ':' + service]) {
    return ISSUE_CAPABILITY[vehicle.toLowerCase() + ':' + service];
  }
  return ISSUE_CAPABILITY[vehicle.toLowerCase() + ':' + issue] ?? null;
}
