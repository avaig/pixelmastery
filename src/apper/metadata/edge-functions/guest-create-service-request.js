const API_ROOT = 'https://api.apper.io/v1/data';
const GUARD_TABLE = 'guest_booking_guard_c';
const LOCATION_PENDING_PREFIX = '[LOCATION VERIFICATION PENDING] ';
// These lookup names have NOT been verified against live records; confirm before deploy.
const CATEGORY_NAME = 'Car Assistance';
const CAPABILITY_NAME = 'Car Wash';
const PICKLIST = Object.freeze({
  customerStatus: 'Active', requestStatus: 'Open', preferredTime: 'ASAP',
  serviceMode: 'Normal', pricingMode: 'Fixed Price', providerStatus: 'Active',
  verificationStatus: 'Approved', availability: ['Available Now', 'Available Later'],
  capabilityLinkStatus: ['Active', 'Approved'],
});
const MAX_PER_HOUR = 5;
const MAX_PROVIDER_ROWS = 500;
const MAX_LINK_ROWS = 1000;
const WASH_PLATFORM_FEE = 25;
const PICKUP_DROP_FEE = 100;
const SERVICE_AREA = { latitude: 25.382, longitude: 81.875, radiusKm: 25 };
const INDIA_BOUNDS = { minLatitude: 6.5, maxLatitude: 35.7, minLongitude: 68, maxLongitude: 97.5 };
const SERVICE_KEYS = new Set(['car-wash']);
const TABLE_ALLOWLIST = Object.freeze({
  customer_profiles_c: {
    read: ['Id', 'Name', 'phone_c'],
    write: ['Name', 'phone_c', 'location_c', 'status_c'],
  },
  [GUARD_TABLE]: {
    read: ['Id', 'Name', 'request_id_c', 'attempts_c', 'status_c', 'expires_at_c', 'created_at_c'],
    write: ['Id', 'Name', 'request_id_c', 'attempts_c', 'status_c', 'expires_at_c', 'created_at_c'],
  },
  service_requests_c: {
    read: ['Id', 'Name', 'problem_description_c', 'CreatedOn'],
    write: ['Id', 'Name', 'customer_c', 'service_category_c', 'required_capability_c', 'device_type_c', 'problem_description_c', 'location_c', 'service_area_c', 'latitude_c', 'longitude_c', 'status_c', 'preferred_time_c', 'requested_at_c', 'scheduled_at_c', 'service_mode_c', 'pricing_mode_c', 'pricing_mode_description_c'],
  },
  service_categories_c: { read: ['Id', 'Name', 'status_c'], write: [] },
  service_capabilities_c: { read: ['Id', 'Name', 'status_c'], write: [] },
  technician_profiles_c: { read: ['Id', 'Name', 'verification_status_c', 'status_c', 'availability_c', 'latitude_c', 'longitude_c', 'service_radius_km_c'], write: [] },
  service_provider_capabilities_c: { read: ['Id', 'technician_c', 'capability_c', 'status_c'], write: [] },
});
const WASH_CATALOG = [
  {
    title: 'Complete Car Wash',
    prices: [
      { label: 'Small Car (Hatchback / Sedan)', price: 400 },
      { label: 'SUV / Big Car', price: 500 },
    ],
  },
  {
    title: 'Exterior Only',
    prices: [
      { label: 'Small Car — Without Body Polish', price: 300 },
      { label: 'Small Car — With Body Polish', price: 500 },
      { label: 'SUV / Big Car — Without Body Polish', price: 400 },
      { label: 'SUV / Big Car — With Body Polish', price: 900 },
    ],
  },
  {
    title: 'Interior Only',
    prices: [
      { label: 'Small Car (Hatchback / Sedan)', price: 200 },
      { label: 'SUV / Big Car', price: 300 },
    ],
  },
  {
    title: 'Interior Deep Clean',
    prices: [
      { label: 'Small Car — Without Seat Removal & Refitting', price: 2500 },
      { label: 'Small Car — With Seat Removal & Refitting', price: 3000 },
      { label: 'SUV / Big Car — Without Seat Removal & Refitting', price: 4500 },
      { label: 'SUV / Big Car — With Seat Removal & Refitting', price: 5000 },
    ],
  },
  {
    title: 'Rubbing & Detailing',
    prices: [
      { label: 'Small Car — Basic', price: 3000 },
      { label: 'Small Car — Premium', price: 8000 },
      { label: 'SUV / Big Car — Basic', price: 5000 },
      { label: 'SUV / Big Car — Premium', price: 10000 },
    ],
  },
];

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/LOCAL_[A-Z0-9_]+\s*:/gi, '')
    .trim();
}

function normalizeIndianMobile(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

function validateCoordinates(latitude, longitude) {
  if (latitude === undefined && longitude === undefined) return { valid: true, latitude: null, longitude: null };
  if (latitude === undefined || longitude === undefined || latitude === null || longitude === null
    || String(latitude).trim() === '' || String(longitude).trim() === '') return { valid: false };
  const lat = Number(latitude);
  const lng = Number(longitude);
  const valid = Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= INDIA_BOUNDS.minLatitude && lat <= INDIA_BOUNDS.maxLatitude
    && lng >= INDIA_BOUNDS.minLongitude && lng <= INDIA_BOUNDS.maxLongitude;
  return valid ? { valid: true, latitude: lat, longitude: lng } : { valid: false };
}

function getDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const rawValues = [latitudeA, longitudeA, latitudeB, longitudeB];
  if (rawValues.some((value) => value === null || value === undefined || String(value).trim() === '')) return null;
  const values = rawValues.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (Math.abs(values[0]) > 90 || Math.abs(values[2]) > 90 || Math.abs(values[1]) > 180 || Math.abs(values[3]) > 180) return null;
  const [latA, lonA, latB, lonB] = values.map((value) => value * Math.PI / 180);
  const deltaLat = latB - latA;
  const deltaLon = lonB - lonA;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function validateWashDetails(details) {
  const allowedDetailFields = ['vehicleType', 'items', 'pickupDropRequested', 'subtotal', 'platformFee', 'pickupDropCharge', 'total'];
  if (!details || typeof details !== 'object' || Array.isArray(details)
    || Object.keys(details).some((field) => !allowedDetailFields.includes(field))
    || !['small', 'suv'].includes(details.vehicleType)) return null;
  if (!Array.isArray(details.items) || details.items.length < 1 || details.items.length > WASH_CATALOG.length) return null;
  const seenTitles = new Set();
  const items = [];
  for (const item of details.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some((field) => !['title', 'variant', 'quantity'].includes(field))
      || seenTitles.has(item.title)) return null;
    const option = WASH_CATALOG.find((entry) => entry.title === item.title);
    const price = option?.prices.find((entry) => entry.label === item.variant);
    const quantity = Number(item.quantity);
    if (!price || !Number.isInteger(quantity) || quantity < 1 || quantity > 5) return null;
    const isSuv = /SUV|Big Car/i.test(price.label);
    if ((details.vehicleType === 'suv') !== isSuv) return null;
    seenTitles.add(item.title);
    items.push({ title: option.title, variant: price.label, quantity, baseUnitPrice: price.price, listedUnitPrice: price.price });
  }
  const pickupDropRequested = details.pickupDropRequested === true;
  const subtotal = items.reduce((sum, item) => sum + item.listedUnitPrice * item.quantity, 0);
  const pickupDropCharge = pickupDropRequested ? PICKUP_DROP_FEE : 0;
  const total = subtotal + WASH_PLATFORM_FEE + pickupDropCharge;
  if (Number(details.subtotal) !== subtotal
    || Number(details.platformFee) !== WASH_PLATFORM_FEE
    || Number(details.pickupDropCharge) !== pickupDropCharge
    || Number(details.total) !== total) return null;
  return { vehicleType: details.vehicleType, items, pickupDropRequested, subtotal, pickupDropCharge, total };
}

function formatRupees(amount) {
  return Number(amount).toLocaleString('en-IN');
}

function buildWashDescription(details) {
  const itemsSummary = details.items
    .map((item) => `${item.title} — ${item.variant} × ${item.quantity} = ₹${formatRupees(item.listedUnitPrice * item.quantity)}`)
    .join('; ');
  const decisions = details.items.map((item) => ({
    id: `${item.title}::${item.variant}`,
    title: item.title,
    variant: item.variant,
    quantity: item.quantity,
    baseUnitPrice: item.baseUnitPrice,
    listedUnitPrice: item.listedUnitPrice,
    decision: 'customer_selected',
    proposedUnitPrice: null,
  }));
  if (details.pickupDropRequested) {
    decisions.push({
      id: 'pickup-drop',
      title: 'Pickup & Drop',
      variant: 'Requested',
      quantity: 1,
      listedUnitPrice: PICKUP_DROP_FEE,
      decision: 'customer_requested',
      proposedUnitPrice: null,
      fixed: true,
    });
  }
  const pickupText = details.pickupDropRequested
    ? '; Pickup & Drop requested — indicative menu charge ₹100, subject to Customer Care location confirmation'
    : '; Pickup & Drop not requested yet — Customer Care to ask during confirmation call';
  const totalDescription = details.pickupDropRequested
    ? 'Customer menu estimate including platform fee and indicative Pickup & Drop'
    : 'Customer menu estimate including platform fee';
  return `Customer submitted this Car Wash quote for Customer Care review and a confirmation call. Selected options: ${itemsSummary}; LOCAL Platform Fee: ₹${WASH_PLATFORM_FEE} (once per booking)${pickupText}. Service subtotal: ₹${formatRupees(details.subtotal)}. ${totalDescription}: ₹${formatRupees(details.total)}. This is the customer-submitted menu quote, not a final confirmed bill. Customer Care must call, confirm vehicle/location and pickup/drop requirement, then issue a revised quote for customer approval if the total changes. Do not start work until the customer approves the final quote. CAR_WASH_DECISIONS_JSON:${JSON.stringify(decisions)} for their car.`;
}

async function guardHmac(secret, domain, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${domain}:${value}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function getConfig() {
  const apiKey = Deno.env.get('APPER_API_KEY');
  const appId = Deno.env.get('APPER_APP_ID');
  return apiKey && appId ? { apiKey, appId } : null;
}

function validateApperOperation(method, table, path, body) {
  const policy = TABLE_ALLOWLIST[table];
  if (!policy || !path.startsWith(`${table}`)) throw new Error('Apper table is not allowed.');
  if (path === table && method === 'POST') {
    if (!body || !Array.isArray(body.fields) || body.fields.some((field) => !policy.read.includes(field))) {
      throw new Error('Apper read fields are not allowed.');
    }
    return;
  }
  if (path === `${table}/records` && ['POST', 'PUT'].includes(method)) {
    if (!Array.isArray(body?.records) || body.records.length === 0) throw new Error('Apper records are required.');
    for (const record of body.records) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid Apper record.');
      if (Object.keys(record).some((field) => !policy.write.includes(field))) throw new Error('Apper write fields are not allowed.');
      if (method === 'PUT' && (!Number.isInteger(Number(record.Id)) || Number(record.Id) <= 0)) throw new Error('Update requires a numeric record Id.');
    }
    return;
  }
  throw new Error('Apper operation is not allowed.');
}

async function apperRequest(config, method, path, body) {
  const table = path.split('/')[0];
  validateApperOperation(method, table, path, body);
  const response = await fetch(`${API_ROOT}/${encodeURIComponent(config.appId)}/tables/${path}`, {
    method,
    headers: {
      Authorization: config.apiKey,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Apper returned an unreadable response.');
  }
  if (!response.ok || result.success !== true) throw new Error('Apper record operation failed.');
  if (path.endsWith('/records')) {
    if (!Array.isArray(result.results) || result.results.length !== body.records.length) throw new Error('Apper record operation failed.');
    if (result.results.some((row) => row?.success !== true || !row.data || (Array.isArray(row.errors) && row.errors.length > 0))) throw new Error('Apper record operation failed.');
  }
  return result;
}

async function queryRecords(config, table, fields, where = [], limit = 100, offset = 0) {
  const result = await apperRequest(config, 'POST', table, {
    fields,
    ...(where.length ? { where } : {}),
    pagingInfo: { limit: Math.min(100, limit), offset },
  });
  return Array.isArray(result.data) ? result.data : [];
}

async function createRecord(config, table, record) {
  const result = await apperRequest(config, 'POST', `${table}/records`, { records: [record] });
  const row = result.results[0];
  if (row.success !== true || !row.data) throw new Error('Apper did not create the record.');
  return row.data;
}

function extractLookupId(value) {
  if (value && typeof value === 'object') value = value.Id ?? value.id ?? value.value;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function queryExactName(config, table, name) {
  const records = await queryRecords(config, table, ['Id', 'Name', 'status_c'], [
    { fieldName: 'Name', operator: 'EqualTo', values: [name] },
  ], 10);
  return records.find((record) => String(record.Name ?? '').trim().toLowerCase() === name.toLowerCase()) ?? null;
}

async function readGuardRows(config, name) {
  const result = await apperRequest(config, 'POST', GUARD_TABLE, {
    fields: TABLE_ALLOWLIST[GUARD_TABLE].read,
    where: [{ fieldName: 'Name', operator: 'EqualTo', values: [name] }],
    pagingInfo: { limit: 100, offset: 0 },
  });
  if (!Array.isArray(result.data) || result.data.length >= 100
    || result.data.some((row) => row.Name !== name || !extractLookupId(row.Id))) throw new Error('Guard read failed.');
  return result.data.sort((a, b) => Number(a.Id) - Number(b.Id));
}

function pendingIsFresh(row, nowMs) {
  const created = Date.parse(row.created_at_c);
  return !Number.isFinite(created) || created >= nowMs - 2 * 60 * 1000;
}

function activeClaim(row, nowMs) {
  return row.status_c === 'Done' || (row.status_c === 'Pending' && pendingIsFresh(row, nowMs));
}

async function recordAttempt(config, name, rows, nowIso) {
  const existing = rows[0];
  if (existing) {
    if (!Number.isSafeInteger(Number(existing.attempts_c)) || Number(existing.attempts_c) < 0) throw new Error('Invalid guard record.');
    await apperRequest(config, 'PUT', `${GUARD_TABLE}/records`, { records: [{
      Id: extractLookupId(existing.Id), attempts_c: Number(existing.attempts_c) + 1,
    }] });
  } else {
    await createRecord(config, GUARD_TABLE, {
      Name: name, status_c: 'Done', attempts_c: 1, created_at_c: nowIso,
      expires_at_c: new Date(Date.parse(nowIso) + 2 * 60 * 60 * 1000).toISOString(),
    });
  }
}

function getRequestIp(req) {
  const direct = cleanText(req.headers.get('cf-connecting-ip')) || cleanText(req.headers.get('x-real-ip'));
  if (direct) return direct.slice(0, 80);
  return cleanText(req.headers.get('x-forwarded-for')).split(',')[0].trim().slice(0, 80);
}

async function createGuestBooking(config, req, body) {
  const fullName = cleanText(body.fullName);
  const mobile = normalizeIndianMobile(body.mobile);
  const location = cleanText(body.location);
  const serviceKey = cleanText(body.serviceKey);
  const details = body.serviceDetails;
  const headerKey = cleanText(req.headers.get('Idempotency-Key'));
  const idempotencyKey = cleanText(body.idempotencyKey || headerKey);
  if (fullName.length < 2 || fullName.length > 80) return jsonResponse(400, { success: false, message: 'Enter a valid full name (2–80 characters).' });
  if (!mobile) return jsonResponse(400, { success: false, message: 'Enter a valid Indian mobile number.' });
  if (location.length < 5 || location.length > 220) return jsonResponse(400, { success: false, message: 'Enter a service location (5–220 characters).' });
  if (!SERVICE_KEYS.has(serviceKey)) return jsonResponse(400, { success: false, message: 'This service is not available for mobile booking yet.' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return jsonResponse(400, { success: false, message: 'A valid booking attempt key is required.' });
  const coordinates = validateCoordinates(body.latitude, body.longitude);
  if (!coordinates.valid) return jsonResponse(400, { success: false, message: 'The provided location coordinates are invalid.' });
  if (coordinates.latitude !== null) {
    const distanceToArea = getDistanceKm(SERVICE_AREA.latitude, SERVICE_AREA.longitude, coordinates.latitude, coordinates.longitude);
    if (distanceToArea === null || distanceToArea > SERVICE_AREA.radiusKm) {
      return jsonResponse(400, { success: false, message: 'This location is outside the current 25 km service area around Naini, Prayagraj.' });
    }
  }
  const washDetails = validateWashDetails(details);
  if (!washDetails) return jsonResponse(400, { success: false, message: 'Car Wash details or submitted totals do not match the current menu.' });

  const secret = Deno.env.get('GUARD_HMAC_SECRET');
  if (!secret) return jsonResponse(503, { success: false, message: 'Booking is temporarily unavailable' });
  try {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const hourBucket = nowIso.slice(0, 13).replace(/[-T]/g, '');
    const phoneHmac = await guardHmac(secret, 'phone', mobile);
    const idemHmac = await guardHmac(secret, 'idem', idempotencyKey);
    const ip = getRequestIp(req);
    const ipHmac = ip ? await guardHmac(secret, 'ip', ip) : null;
    const idemName = `idem:${idemHmac}`;
    const phoneName = `rate:${phoneHmac}:${hourBucket}`;
    const ipName = ipHmac ? `rate:${ipHmac}:${hourBucket}` : null;
    const priorClaims = await readGuardRows(config, idemName);
    const done = priorClaims.find((row) => row.status_c === 'Done');
    if (done) {
      const requestId = extractLookupId(done.request_id_c);
      if (!requestId) return jsonResponse(503, { success: false, message: 'Booking is temporarily unavailable' });
      return jsonResponse(200, { success: true, duplicate: true, requestId, message: 'Your request was already submitted.' });
    }
    if (priorClaims.some((row) => row.status_c === 'Pending' && pendingIsFresh(row, nowMs))) {
      return jsonResponse(409, { success: false, message: 'A duplicate booking is in progress. Please retry shortly.' });
    }
    const phoneRows = await readGuardRows(config, phoneName);
    const ipRows = ipName ? await readGuardRows(config, ipName) : [];
    if ([...phoneRows, ...ipRows].some((row) => !Number.isSafeInteger(Number(row.attempts_c)) || Number(row.attempts_c) < 0)) throw new Error('Invalid guard record.');
    if (phoneRows.some((row) => Number(row.attempts_c) >= MAX_PER_HOUR)
      || ipRows.some((row) => Number(row.attempts_c) >= MAX_PER_HOUR)) {
      return jsonResponse(429, { success: false, message: 'Too many booking requests. Please try again later.' });
    }
    await recordAttempt(config, phoneName, phoneRows, nowIso);
    if (ipName) await recordAttempt(config, ipName, ipRows, nowIso);
    const claim = await createRecord(config, GUARD_TABLE, {
      Name: idemName, status_c: 'Pending', attempts_c: 1, created_at_c: nowIso,
      expires_at_c: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    });
    const claimId = extractLookupId(claim.Id);
    if (!claimId) throw new Error('Invalid claim.');
    const claims = await readGuardRows(config, idemName);
    const winner = claims.filter((row) => activeClaim(row, nowMs))[0];
    if (!winner) throw new Error('Claim was not visible.');
    if (extractLookupId(winner.Id) !== claimId) {
      await apperRequest(config, 'PUT', `${GUARD_TABLE}/records`, { records: [{ Id: claimId, status_c: 'Failed' }] });
      return jsonResponse(409, { success: false, message: 'A duplicate booking is in progress. Please retry shortly.' });
    }
    let requestCreated = false;
    try {
    const category = await queryExactName(config, 'service_categories_c', CATEGORY_NAME);
    const capability = await queryExactName(config, 'service_capabilities_c', CAPABILITY_NAME);
    if (!category || !capability) throw new Error('Service lookup unavailable.');

    const customerSearchVariants = [mobile, mobile.slice(3)];
    const customerMatches = await Promise.all(customerSearchVariants.map((phone) => queryRecords(config, 'customer_profiles_c', ['Id', 'Name', 'phone_c'], [
      { fieldName: 'phone_c', operator: 'EqualTo', values: [phone] },
    ], 10)));
    const matchingCustomers = customerMatches.flat();
    let customer = matchingCustomers.find((record) => normalizeIndianMobile(record.phone_c) === mobile);
    if (!customer) {
      customer = await createRecord(config, 'customer_profiles_c', {
        Name: fullName,
        phone_c: mobile,
        location_c: location,
        status_c: PICKLIST.customerStatus,
      });
    }

    const problemDescription = buildWashDescription(washDetails);
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const record = {
      Name: `CAR • Car Wash (${washDetails.items.reduce((sum, item) => sum + item.quantity, 0)} items)`,
      customer_c: extractLookupId(customer.Id),
      service_category_c: extractLookupId(category.Id),
      required_capability_c: extractLookupId(capability.Id),
      device_type_c: 'Mobile',
      problem_description_c: problemDescription,
      location_c: coordinates.latitude === null ? `${LOCATION_PENDING_PREFIX}${location.slice(0, 220 - LOCATION_PENDING_PREFIX.length)}` : location,
      service_area_c: 'Prayagraj',
      ...(coordinates.latitude === null ? {} : { latitude_c: coordinates.latitude, longitude_c: coordinates.longitude }),
      status_c: PICKLIST.requestStatus,
      preferred_time_c: PICKLIST.preferredTime,
      requested_at_c: now,
      scheduled_at_c: null,
      service_mode_c: PICKLIST.serviceMode,
      pricing_mode_c: PICKLIST.pricingMode,
      pricing_mode_description_c: 'Submit your selected menu quote. LOCAL Customer Care will call to confirm details and pickup/drop, then send any revised quote for your approval before work starts.',
    };
    const request = await createRecord(config, 'service_requests_c', record);
    requestCreated = true;
    const requestId = extractLookupId(request.Id);
    if (!requestId) throw new Error('Invalid request ID.');
    await apperRequest(config, 'PUT', `${GUARD_TABLE}/records`, { records: [{ Id: claimId, status_c: 'Done', request_id_c: requestId }] });
    return jsonResponse(200, { success: true, requestId, message: 'Car Wash request submitted to LOCAL Customer Care.' });
    } catch {
      if (!requestCreated) await apperRequest(config, 'PUT', `${GUARD_TABLE}/records`, { records: [{ Id: claimId, status_c: 'Failed' }] });
      throw new Error('Booking could not be completed.');
    }
  } catch {
    return jsonResponse(503, { success: false, message: 'Booking is temporarily unavailable' });
  }
}

async function listAll(config, table, fields, maxRows) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += 100) {
    const page = await queryRecords(config, table, fields, [], Math.min(100, maxRows - offset), offset);
    rows.push(...page);
    if (page.length < Math.min(100, maxRows - offset)) break;
  }
  return rows;
}

function getServiceRadius(value) {
  const radius = Number(value);
  return Number.isFinite(radius) && radius !== 0 ? Math.max(1, Math.min(100, radius)) : 10;
}

async function hashId(value, appId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${appId}:${value}:LOCAL_NEARBY_V1`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function firstName(value) {
  const name = cleanText(value);
  return name ? name.split(/\s+/)[0].slice(0, 40) : 'Service Provider';
}

async function findNearbyProviders(config, body) {
  const coordinates = validateCoordinates(body.latitude, body.longitude);
  if (!coordinates.valid || coordinates.latitude === null) return jsonResponse(400, { success: false, message: 'A valid current location is required to find nearby providers.' });
  const serviceKey = cleanText(body.serviceKey || 'car-wash');
  if (!SERVICE_KEYS.has(serviceKey)) return jsonResponse(400, { success: false, message: 'This service is not available yet.' });
  const requested = Number(body.radiusKm);
  const radiusKm = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 50) : 15;
  try {
    const capability = await queryExactName(config, 'service_capabilities_c', CAPABILITY_NAME);
    if (!capability) return jsonResponse(503, { success: false, message: 'Car Wash booking is temporarily unavailable. Please contact Customer Care.' });
    const capabilityId = String(extractLookupId(capability.Id));
    const [profiles, links] = await Promise.all([
      listAll(config, 'technician_profiles_c', ['Id', 'Name', 'verification_status_c', 'status_c', 'availability_c', 'latitude_c', 'longitude_c', 'service_radius_km_c'], MAX_PROVIDER_ROWS),
      listAll(config, 'service_provider_capabilities_c', ['Id', 'technician_c', 'capability_c', 'status_c'], MAX_LINK_ROWS),
    ]);
    const providers = [];
    for (const profile of profiles) {
      if (String(profile.verification_status_c ?? '').trim().toLowerCase() !== PICKLIST.verificationStatus.toLowerCase()) continue;
      if (String(profile.status_c ?? '').trim().toLowerCase() !== PICKLIST.providerStatus.toLowerCase()) continue;
      const availability = cleanText(profile.availability_c);
      const availabilityLower = availability.toLowerCase();
      if (!PICKLIST.availability.some((value) => value.toLowerCase() === availabilityLower)) continue;
      const matchedCapability = links.some((link) => {
        const linkStatus = String(link.status_c ?? '').trim().toLowerCase();
        const linkedTechnician = String(extractLookupId(link.technician_c));
        const linkedCapability = String(extractLookupId(link.capability_c));
        return PICKLIST.capabilityLinkStatus.some((value) => value.toLowerCase() === linkStatus)
          && linkedTechnician === String(profile.Id)
          && linkedCapability === capabilityId;
      });
      if (!matchedCapability) continue;
      if (profile.latitude_c === null || profile.latitude_c === undefined || String(profile.latitude_c).trim() === ''
        || profile.longitude_c === null || profile.longitude_c === undefined || String(profile.longitude_c).trim() === '') continue;
      const lat = Number(profile.latitude_c);
      const lng = Number(profile.longitude_c);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const distanceKm = getDistanceKm(coordinates.latitude, coordinates.longitude, lat, lng);
      const ownRadiusKm = getServiceRadius(profile.service_radius_km_c);
      if (distanceKm === null || distanceKm > radiusKm || distanceKm > ownRadiusKm) continue;
      providers.push({
        providerHash: await hashId(profile.Id, config.appId),
        name: firstName(profile.Name),
        distanceKm: Math.round(distanceKm * 10) / 10,
        availability,
      });
    }
    providers.sort((a, b) => a.distanceKm - b.distanceKm);
    return jsonResponse(200, { success: true, radiusKm, providers: providers.slice(0, 50) });
  } catch {
    return jsonResponse(502, { success: false, message: 'Nearby providers are temporarily unavailable.' });
  }
}

const handler = async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'POST') return jsonResponse(405, { success: false, message: 'Method not allowed.' });
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { success: false, message: 'Invalid JSON body.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonResponse(400, { success: false, message: 'Invalid request body.' });
  const config = getConfig();
  if (!config) return jsonResponse(503, { success: false, message: 'Booking service is not configured yet.' });
  const action = cleanText(body.action);
  if (action === 'createBooking') return createGuestBooking(config, req, body);
  if (action === 'nearbyProviders') return findNearbyProviders(config, body);
  if (action === 'catalog') {
    return jsonResponse(200, {
      success: true,
      services: [{ serviceKey: 'car-wash', categoryName: CATEGORY_NAME, capabilityName: CAPABILITY_NAME, platformFee: WASH_PLATFORM_FEE, options: WASH_CATALOG }],
    });
  }
  return jsonResponse(400, { success: false, message: 'Unknown action.' });
};

apper.serve(handler);
