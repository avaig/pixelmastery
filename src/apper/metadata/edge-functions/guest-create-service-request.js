// LOCAL guest booking Edge Function — FINAL DRAFT for Apper's managed Edge Function runtime.
// Single self-contained file: no imports, no module export; entry point is the final apper.serve(handler).
// Supersedes src/apper/metadata/edge-functions/guest-create-service-request.js (DB guard table design),
// which must NOT be deployed.
//
// Secrets: read only through `await apper.getSecret(NAME)` inside loadConfig(). The exact return shape of
// apper.getSecret is ASSUMED to be a string (verify in Apper before deploy); a value wrapped as { value }
// is accepted defensively. Secrets, HMAC keys and hashes are never logged or returned.
//
// Guards use Upstash Redis over its REST API (HTTPS only). Each Redis command / Lua script is atomic on its
// own; the whole booking (Redis claim + Apper customer write + Apper request write) is NOT a distributed
// transaction and there is NO exactly-once guarantee. Uncertain outcomes are kept as 'pending' claims that
// require Customer Care / manual reconciliation; the function never auto-retries an Apper write.
const API_ROOT = 'https://api.apper.io/v1/data';
const LOCATION_PENDING_PREFIX = '[LOCATION VERIFICATION PENDING] ';
// Names were verified in live read-only checks; resolve their IDs on each request.
const CATEGORY_NAME = 'Car Assistance';
const CAPABILITY_NAME = 'Car Wash';
const PICKLIST = Object.freeze({
  customerStatus: 'Active', requestStatus: 'Open', preferredTime: 'ASAP',
  serviceMode: 'Normal', pricingMode: 'Fixed Price', providerStatus: 'Active',
  verificationStatus: 'Approved', availability: ['Available Now', 'Available Later'],
  capabilityLinkStatus: ['Active', 'Approved'],
});
const MAX_PER_HOUR = 5;
const RATE_WINDOW_TTL_SECONDS = 7200;
const PENDING_TTL_SECONDS = 604800; // 7 days; pending claims are never auto-resubmitted within this window.
const COMPLETED_TTL_SECONDS = 604800; // 7 days (>= 24h retention requirement).
const REDIS_TIMEOUT_MS = 5000;
const APPER_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 16384;
const MAX_PROVIDER_ROWS = 500;
const MAX_LINK_ROWS = 1000;
const WASH_PLATFORM_FEE = 25;
const PICKUP_DROP_FEE = 100;
const SERVICE_AREA = { latitude: 25.382, longitude: 81.875, radiusKm: 25 };
const INDIA_BOUNDS = { minLatitude: 6.5, maxLatitude: 35.7, minLongitude: 68, maxLongitude: 97.5 };
const SERVICE_KEYS = new Set(['car-wash']);
// nearbyProviders is DISABLED for the first live milestone (no per-IP/abuse protection yet). While false the
// action answers 404 before any secret loading or Apper/Redis call; findNearbyProviders() is kept for later.
const ENABLE_NEARBY_PROVIDERS = false;
const SECRET_NAMES = Object.freeze(['APPER_API_KEY', 'APPER_APP_ID', 'GUARD_HMAC_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']);
const APPER_SECRET_NAMES = Object.freeze(['APPER_API_KEY', 'APPER_APP_ID']);
const UNAVAILABLE_MESSAGE = 'Booking is temporarily unavailable';
const PENDING_MESSAGE = 'Your booking is being confirmed. Please do not submit it again. Customer Care will confirm it.';
const TABLE_ALLOWLIST = Object.freeze({
  customer_profiles_c: {
    read: ['Id', 'phone_c'],
    write: ['Name', 'phone_c', 'location_c', 'status_c'],
  },
  service_requests_c: {
    read: [],
    write: ['Name', 'customer_c', 'service_category_c', 'required_capability_c', 'device_type_c', 'problem_description_c', 'location_c', 'service_area_c', 'latitude_c', 'longitude_c', 'status_c', 'preferred_time_c', 'requested_at_c', 'scheduled_at_c', 'service_mode_c', 'pricing_mode_c', 'pricing_mode_description_c'],
  },
  service_categories_c: { read: ['Id', 'Name', 'status_c'], write: [] },
  service_capabilities_c: { read: ['Id', 'Name', 'status_c'], write: [] },
  technician_profiles_c: { read: ['Id', 'Name', 'verification_status_c', 'status_c', 'availability_c', 'latitude_c', 'longitude_c', 'service_radius_km_c'], write: [] },
  service_provider_capabilities_c: { read: ['Id', 'technician_c', 'capability_c', 'status_c'], write: [] },
});
// Redis Lua scripts (exact strings; each runs atomically inside Redis).
// Claim + rate limit in ONE atomic script. KEYS[1] = idem key, KEYS[2] = rate key;
// ARGV[1] = pending-claim JSON, ARGV[2] = claim TTL (s), ARGV[3] = rate-window TTL (s), ARGV[4] = limit.
//   idem key exists          -> {0, existingValue}  (no rate change, nothing created)
//   rate count >= limit      -> {2, count}          (NOT incremented, no claim created)
//   otherwise                -> INCR rate (EXPIRE on first hit) + SET idem NX EX -> {1, newCount}
// So concurrent submissions with one attempt key consume at most one attempt, retries of an existing claim
// never consume an attempt, and a claim is only ever created together with its rate increment. No cjson.
const CLAIM_AND_RATE_SCRIPT = "local v=redis.call('GET',KEYS[1]) if v then return {0,v} end local c=tonumber(redis.call('GET',KEYS[2]) or '0') if c>=tonumber(ARGV[4]) then return {2,c} end c=redis.call('INCR',KEYS[2]) if c==1 then redis.call('EXPIRE',KEYS[2],tonumber(ARGV[3])) end redis.call('SET',KEYS[1],ARGV[1],'NX','EX',tonumber(ARGV[2])) return {1,c}";
// Compare-and-set: replace the claim only if it still holds EXACTLY the pending value this invocation wrote
// (that value contains state 'pending' and this payloadHash, so the check is at least as strict as
// "state is pending and payloadHash equal" without depending on Lua cjson). ARGV[3] = 'KEEPTTL' or seconds.
const CAS_UPDATE_SCRIPT = "if redis.call('GET',KEYS[1])==ARGV[1] then if ARGV[3]=='KEEPTTL' then redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL') else redis.call('SET',KEYS[1],ARGV[2],'EX',tonumber(ARGV[3])) end return 1 end return 0";
// Compare-and-delete: release the claim only if it still holds exactly this invocation's pending value.
const CAS_DELETE_SCRIPT = "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) return 1 end return 0";
const REDIS_SCRIPTS = Object.freeze({ claimAndRate: CLAIM_AND_RATE_SCRIPT, casUpdate: CAS_UPDATE_SCRIPT, casDelete: CAS_DELETE_SCRIPT });
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractLookupId(value) {
  const id = value && typeof value === 'object' && !Array.isArray(value) ? value.Id : value;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

// ---------------------------------------------------------------------------------------------------------
// Configuration (secrets). Any missing/empty secret, a non-HTTPS Redis URL, or getSecret throwing => null,
// which callers turn into a generic 503 before any Redis or Apper call.
// ---------------------------------------------------------------------------------------------------------
function normalizeSecret(raw) {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && typeof raw.value === 'string') return raw.value.trim();
  return '';
}

async function loadConfig(names = SECRET_NAMES) {
  try {
    if (typeof apper === 'undefined' || !apper || typeof apper.getSecret !== 'function') return null;

    const values = {};
    // Apper provisions secrets only when each name is supplied as a string literal.
    if (names.includes('APPER_API_KEY')) values.APPER_API_KEY = normalizeSecret(await apper.getSecret('APPER_API_KEY'));
    if (names.includes('APPER_APP_ID')) values.APPER_APP_ID = normalizeSecret(await apper.getSecret('APPER_APP_ID'));
    if (names.includes('GUARD_HMAC_SECRET')) values.GUARD_HMAC_SECRET = normalizeSecret(await apper.getSecret('GUARD_HMAC_SECRET'));
    if (names.includes('UPSTASH_REDIS_REST_URL')) values.UPSTASH_REDIS_REST_URL = normalizeSecret(await apper.getSecret('UPSTASH_REDIS_REST_URL'));
    if (names.includes('UPSTASH_REDIS_REST_TOKEN')) values.UPSTASH_REDIS_REST_TOKEN = normalizeSecret(await apper.getSecret('UPSTASH_REDIS_REST_TOKEN'));

    for (const name of names) {
      if (!values[name]) return null;
    }

    const config = { apiKey: values.APPER_API_KEY, appId: values.APPER_APP_ID };
    if (names.includes('UPSTASH_REDIS_REST_URL')) {
      let url;
      try { url = new URL(values.UPSTASH_REDIS_REST_URL); } catch { return null; }
      if (url.protocol !== 'https:') return null;
      config.redisUrl = values.UPSTASH_REDIS_REST_URL.replace(/\/+$/, '');
      config.redisToken = values.UPSTASH_REDIS_REST_TOKEN;
      config.hmacSecret = values.GUARD_HMAC_SECRET;
    }
    return config;
  } catch {
    return null;
  }
}

function logEvent(code) {
  // Fixed, data-free event codes only. Never log secrets, keys, hashes, phone numbers or request bodies.
  try { console.warn(`guest-booking: ${code}`); } catch { /* ignore */ }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Upstash Redis REST client: POST the command array as JSON with `Authorization: Bearer <token>`;
// response JSON is { result } or { error }. Network error, non-200 or { error } => RedisError (fail closed).
// ---------------------------------------------------------------------------------------------------------
class RedisError extends Error {}

async function redisCommand(config, command) {
  let response;
  try {
    response = await fetchWithTimeout(config.redisUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }, REDIS_TIMEOUT_MS);
  } catch {
    throw new RedisError('redis-network');
  }
  if (response.status !== 200) throw new RedisError('redis-status');
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RedisError('redis-unreadable');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || 'error' in payload || !('result' in payload)) {
    throw new RedisError('redis-error');
  }
  return payload.result;
}

async function guardHmac(secret, domain, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${domain}:${value}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function utcHourBucket(date = new Date()) {
  // Rate window bucket: yyyymmddhh in UTC.
  return date.toISOString().slice(0, 13).replace(/[-T]/g, '');
}

function parseClaim(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.payloadHash !== 'string') return null;
    if (value.state === 'done' && extractLookupId(value.requestId)) return value;
    if (value.state === 'pending') return value;
    return null;
  } catch {
    return null;
  }
}

function pendingResponse() {
  return jsonResponse(202, { success: true, pending: true, status: 'pending', message: PENDING_MESSAGE });
}

function unavailableResponse() {
  return jsonResponse(503, { success: false, message: UNAVAILABLE_MESSAGE });
}

// Existing claim handling. Never creates anything.
function respondToExistingClaim(raw, payloadHash) {
  const claim = parseClaim(raw);
  if (!claim) {
    logEvent('claim-unreadable');
    return unavailableResponse();
  }
  if (claim.payloadHash !== payloadHash) {
    return jsonResponse(409, { success: false, message: 'This booking attempt key was already used for a different request' });
  }
  if (claim.state === 'done') {
    return jsonResponse(200, { success: true, duplicate: true, requestId: extractLookupId(claim.requestId), message: 'Your request was already submitted.' });
  }
  // Pending (in progress, or an uncertain earlier attempt): requires Customer Care / manual reconciliation.
  return pendingResponse();
}

// ---------------------------------------------------------------------------------------------------------
// Apper REST (documented Create Record / fetch endpoints; Authorization header carries the raw API key).
// ---------------------------------------------------------------------------------------------------------
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
      if (method === 'PUT' && !extractLookupId(record.Id)) throw new Error('Update requires a UUID record Id.');
      const lookupFields = table === 'service_requests_c'
        ? ['customer_c', 'service_category_c', 'required_capability_c'] : [];
      if (lookupFields.some((field) => field in record && !extractLookupId(record[field]))) {
        throw new Error('Record reference requires a UUID string.');
      }
    }
    return;
  }
  throw new Error('Apper operation is not allowed.');
}

function apperUrl(config, path) {
  return `${API_ROOT}/${encodeURIComponent(config.appId)}/tables/${path}`;
}

// Read (fetch records). Any failure throws; reads never create anything.
async function queryRecords(config, table, fields, where = [], limit = 100, offset = 0) {
  const body = { fields, ...(where.length ? { where } : {}), pagingInfo: { limit: Math.min(100, limit), offset } };
  validateApperOperation('POST', table, table, body);
  const response = await fetchWithTimeout(apperUrl(config, table), {
    method: 'POST',
    headers: { Authorization: config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, APPER_TIMEOUT_MS);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Apper returned an unreadable response.');
  }
  if (!response.ok || result?.success !== true) throw new Error('Apper read failed.');
  return Array.isArray(result.data) ? result.data : [];
}

// Create one record. Returns { outcome: 'created', id } | { outcome: 'definitive' } | { outcome: 'uncertain', id? }.
// 'definitive' = Apper explicitly rejected the record (HTTP 4xx, or a per-record success:false), so no record
// exists. Everything ambiguous (network error/timeout, 5xx, unparseable body, unexpected shape, success without
// a UUID Id) is 'uncertain': the record MAY exist.
async function createRecordOutcome(config, table, record) {
  const body = { records: [record] };
  validateApperOperation('POST', table, `${table}/records`, body);
  let response;
  try {
    response = await fetchWithTimeout(apperUrl(config, `${table}/records`), {
      method: 'POST',
      headers: { Authorization: config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, APPER_TIMEOUT_MS);
  } catch {
    return { outcome: 'uncertain' };
  }
  if (response.status >= 400 && response.status < 500) return { outcome: 'definitive' };
  if (!response.ok) return { outcome: 'uncertain' };
  let result;
  try {
    result = await response.json();
  } catch {
    return { outcome: 'uncertain' };
  }
  const rows = result?.results;
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') return { outcome: 'uncertain' };
  const row = rows[0];
  if (row.success === false) return { outcome: 'definitive' };
  const id = extractLookupId(row.data?.Id);
  if (result.success === true && row.success === true && id && !(Array.isArray(row.errors) && row.errors.length > 0)) {
    return { outcome: 'created', id };
  }
  return { outcome: 'uncertain', ...(id ? { id } : {}) };
}

async function queryExactName(config, table, name) {
  const records = await queryRecords(config, table, ['Id', 'Name', 'status_c'], [
    { fieldName: 'Name', operator: 'EqualTo', values: [name] },
  ], 10);
  return records.find((record) => String(record.Name ?? '').trim().toLowerCase() === name.toLowerCase()) ?? null;
}

function validateBookingInput(req, body) {
  const fullName = cleanText(body.fullName);
  const mobile = normalizeIndianMobile(body.mobile);
  const location = cleanText(body.location);
  const serviceKey = cleanText(body.serviceKey);
  const idempotencyKey = cleanText(body.idempotencyKey || req.headers.get('Idempotency-Key'));
  const fail = (message) => ({ error: jsonResponse(400, { success: false, message }) });
  if (fullName.length < 2 || fullName.length > 80) return fail('Enter a valid full name (2–80 characters).');
  if (!mobile) return fail('Enter a valid Indian mobile number.');
  if (location.length < 5 || location.length > 220) return fail('Enter a service location (5–220 characters).');
  if (!SERVICE_KEYS.has(serviceKey)) return fail('This service is not available for mobile booking yet.');
  if (!UUID_V4_RE.test(idempotencyKey)) return fail('A valid booking attempt key is required.');
  const coordinates = validateCoordinates(body.latitude, body.longitude);
  if (!coordinates.valid) return fail('The provided location coordinates are invalid.');
  if (coordinates.latitude !== null) {
    const distanceToArea = getDistanceKm(SERVICE_AREA.latitude, SERVICE_AREA.longitude, coordinates.latitude, coordinates.longitude);
    if (distanceToArea === null || distanceToArea > SERVICE_AREA.radiusKm) {
      return fail('This location is outside the current 25 km service area around Naini, Prayagraj.');
    }
  }
  const washDetails = validateWashDetails(body.serviceDetails);
  if (!washDetails) return fail('Car Wash details or submitted totals do not match the current menu.');
  return { fullName, mobile, location, serviceKey, idempotencyKey, coordinates, washDetails };
}

function buildRequestRecord(input, customerId, categoryId, capabilityId) {
  const { washDetails, coordinates, location } = input;
  return {
    Name: `CAR • Car Wash (${washDetails.items.reduce((sum, item) => sum + item.quantity, 0)} items)`,
    customer_c: customerId,
    service_category_c: categoryId,
    required_capability_c: capabilityId,
    device_type_c: 'Mobile',
    problem_description_c: buildWashDescription(washDetails),
    location_c: coordinates.latitude === null ? `${LOCATION_PENDING_PREFIX}${location.slice(0, 220 - LOCATION_PENDING_PREFIX.length)}` : location,
    service_area_c: 'Prayagraj',
    ...(coordinates.latitude === null ? {} : { latitude_c: coordinates.latitude, longitude_c: coordinates.longitude }),
    status_c: PICKLIST.requestStatus,
    preferred_time_c: PICKLIST.preferredTime,
    requested_at_c: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
    scheduled_at_c: null,
    service_mode_c: PICKLIST.serviceMode,
    pricing_mode_c: PICKLIST.pricingMode,
    pricing_mode_description_c: 'Submit your selected menu quote. LOCAL Customer Care will call to confirm details and pickup/drop, then send any revised quote for your approval before work starts.',
  };
}

// ---------------------------------------------------------------------------------------------------------
// createBooking
// 1-3. ONE atomic claim-and-rate script: an existing claim is answered without consuming the rate limit or
//      creating anything; over the per-phone limit (5 per UTC hour) -> 429 with no increment and no claim;
//      otherwise the rate counter is incremented and the pending claim is created in the same script.
// 4. Find-or-create customer, CAS stage update, create request.
// 5. Success -> CAS to done (EX COMPLETED_TTL_SECONDS).
// 6. Definitive failure before/without any write (lookup read failure, explicit customer/request rejection,
//    stage-update failure before the request write) -> compare-and-delete release; user may retry.
// 7. Uncertain failure (customer write or request write may exist) -> keep pending (no delete, no Apper
//    retry) and answer 202; manual reconciliation.
// Not a distributed transaction; no exactly-once guarantee; Redis operations are atomic individually only.
// ---------------------------------------------------------------------------------------------------------
async function createGuestBooking(req, body) {
  const input = validateBookingInput(req, body);
  if (input.error) return input.error;
  const config = await loadConfig(SECRET_NAMES);
  if (!config) {
    logEvent('config-unavailable');
    return unavailableResponse();
  }
  let idemKey;
  let payloadHash;
  let currentValue;
  try {
    const phoneHash = await guardHmac(config.hmacSecret, 'phone', input.mobile);
    idemKey = `idem:${await guardHmac(config.hmacSecret, 'idem', input.idempotencyKey)}`;
    payloadHash = await guardHmac(config.hmacSecret, 'payload', canonicalJson({
      serviceKey: input.serviceKey,
      mobile: input.mobile,
      fullName: input.fullName,
      location: input.location,
      coordinates: { latitude: input.coordinates.latitude, longitude: input.coordinates.longitude },
      serviceDetails: input.washDetails,
    }));

    // 1-3. Existing claim / rate limit / new claim: one atomic script (the only decision path).
    const claimValue = JSON.stringify({ state: 'pending', payloadHash, stage: 'claimed', createdAt: new Date().toISOString() });
    const rateKey = `rate:${phoneHash}:${utcHourBucket()}`;
    const result = await redisCommand(config, ['EVAL', CLAIM_AND_RATE_SCRIPT, 2, idemKey, rateKey,
      claimValue, PENDING_TTL_SECONDS, RATE_WINDOW_TTL_SECONDS, MAX_PER_HOUR]);
    if (!Array.isArray(result) || result.length !== 2) throw new RedisError('redis-claim-result');
    const [code, detail] = result;
    if (Number(code) === 0) {
      if (typeof detail !== 'string') throw new RedisError('redis-claim-result');
      return respondToExistingClaim(detail, payloadHash);
    }
    const count = Number(detail);
    if (!Number.isSafeInteger(count) || count < 0) throw new RedisError('redis-claim-result');
    if (Number(code) === 2) {
      return jsonResponse(429, { success: false, message: 'Too many booking requests. Please try again later.' });
    }
    if (Number(code) !== 1 || count < 1 || count > MAX_PER_HOUR) throw new RedisError('redis-claim-result');
    currentValue = claimValue;
  } catch {
    logEvent('redis-unavailable');
    return unavailableResponse();
  }

  // From here on this invocation owns the pending claim `currentValue`.
  const release = async () => {
    try {
      await redisCommand(config, ['EVAL', CAS_DELETE_SCRIPT, 1, idemKey, currentValue]);
    } catch {
      // Claim stays pending until reconciled/expired; later retries get the 202 pending answer, never a write.
      logEvent('claim-release-failed');
    }
  };
  const casUpdate = async (next, ttlMode) => {
    const nextValue = JSON.stringify(next);
    const result = await redisCommand(config, ['EVAL', CAS_UPDATE_SCRIPT, 1, idemKey, currentValue, nextValue, ttlMode]);
    if (Number(result) !== 1) throw new RedisError('redis-cas-mismatch');
    currentValue = nextValue;
  };
  const claimBase = JSON.parse(currentValue);

  // 4a. Lookups (reads only, before any write): any failure is definitive and releases the claim.
  let customerId;
  let categoryId;
  let capabilityId;
  let existingCustomerId = null;
  try {
    const category = await queryExactName(config, 'service_categories_c', CATEGORY_NAME);
    const capability = await queryExactName(config, 'service_capabilities_c', CAPABILITY_NAME);
    categoryId = extractLookupId(category?.Id);
    capabilityId = extractLookupId(capability?.Id);
    if (!categoryId || !capabilityId) throw new Error('Service lookup unavailable.');
    const customerMatches = await Promise.all([input.mobile, input.mobile.slice(3)].map((phone) => queryRecords(config, 'customer_profiles_c', ['Id', 'phone_c'], [
      { fieldName: 'phone_c', operator: 'EqualTo', values: [phone] },
    ], 10)));
    const phoneMatches = customerMatches.flat().filter((record) => record && normalizeIndianMobile(record.phone_c) === input.mobile);
    // A profile with this phone exists but its Id is unusable: the lookup cannot decide safely. Nothing has
    // been written yet, so release rather than create a possible duplicate profile.
    if (phoneMatches.length && !phoneMatches.some((record) => extractLookupId(record.Id))) throw new Error('Customer lookup unusable.');
    const existingCustomer = phoneMatches.find((record) => extractLookupId(record.Id));
    if (existingCustomer) existingCustomerId = extractLookupId(existingCustomer.Id);
  } catch {
    logEvent('pre-write-lookup-failure');
    await release();
    return unavailableResponse();
  }

  // 4b. Customer profile create (only when no profile with this phone exists).
  if (existingCustomerId) {
    customerId = existingCustomerId;
  } else {
    const created = await createRecordOutcome(config, 'customer_profiles_c', {
      Name: input.fullName,
      phone_c: input.mobile,
      location_c: input.location,
      status_c: PICKLIST.customerStatus,
    });
    if (created.outcome === 'definitive') {
      // Apper explicitly rejected the record (4xx / per-record success:false): no profile exists. Release.
      logEvent('customer-rejected');
      await release();
      return unavailableResponse();
    }
    if (created.outcome !== 'created') {
      // Uncertain: the profile MAY exist. Keep the claim pending, never attempt the request, never release.
      logEvent('customer-write-uncertain');
      try {
        await casUpdate({ ...claimBase, stage: 'customer-write-uncertain', ...(created.id ? { customerId: created.id } : {}) }, 'KEEPTTL');
      } catch {
        logEvent('uncertain-stage-update-failed'); // claim remains pending ('claimed'); still never released.
      }
      return pendingResponse();
    }
    customerId = created.id;
  }

  // 4c. Record the stage (UUID only) before the request write. If this fails, nothing was requested: release.
  try {
    await casUpdate({ ...claimBase, stage: 'request-writing', customerId }, 'KEEPTTL');
  } catch {
    logEvent('stage-update-failed');
    await release();
    return unavailableResponse();
  }

  // 4d. Service request write: attempted exactly once, never retried here.
  const request = await createRecordOutcome(config, 'service_requests_c', buildRequestRecord(input, customerId, categoryId, capabilityId));
  if (request.outcome === 'definitive') {
    logEvent('request-rejected');
    await release();
    return unavailableResponse();
  }
  if (request.outcome === 'uncertain') {
    logEvent('request-write-uncertain');
    try {
      await casUpdate({ ...claimBase, stage: 'request-write-uncertain', customerId, ...(request.id ? { requestId: request.id } : {}) }, 'KEEPTTL');
    } catch {
      logEvent('uncertain-stage-update-failed'); // claim remains pending ('request-writing').
    }
    return pendingResponse();
  }

  // 5. Success: record done.
  try {
    await casUpdate({ state: 'done', requestId: request.id, payloadHash }, String(COMPLETED_TTL_SECONDS));
  } catch {
    logEvent('done-update-failed');
    try {
      await casUpdate({ ...claimBase, stage: 'request-write-uncertain', customerId, requestId: request.id }, 'KEEPTTL');
    } catch {
      logEvent('uncertain-stage-update-failed');
    }
    return pendingResponse();
  }
  return jsonResponse(200, { success: true, requestId: request.id, message: 'Car Wash request submitted to LOCAL Customer Care.' });
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

async function findNearbyProviders(body) {
  const coordinates = validateCoordinates(body.latitude, body.longitude);
  if (!coordinates.valid || coordinates.latitude === null) return jsonResponse(400, { success: false, message: 'A valid current location is required to find nearby providers.' });
  const serviceKey = cleanText(body.serviceKey || 'car-wash');
  if (!SERVICE_KEYS.has(serviceKey)) return jsonResponse(400, { success: false, message: 'This service is not available yet.' });
  const requested = Number(body.radiusKm);
  const radiusKm = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 50) : 15;
  const config = await loadConfig(APPER_SECRET_NAMES);
  if (!config) return jsonResponse(503, { success: false, message: 'Nearby providers are temporarily unavailable.' });
  try {
    const capability = await queryExactName(config, 'service_capabilities_c', CAPABILITY_NAME);
    if (!capability) return jsonResponse(503, { success: false, message: 'Car Wash booking is temporarily unavailable. Please contact Customer Care.' });
    const capabilityId = extractLookupId(capability.Id);
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
        const linkedTechnician = extractLookupId(link.technician_c);
        const linkedCapability = extractLookupId(link.capability_c);
        return PICKLIST.capabilityLinkStatus.some((value) => value.toLowerCase() === linkStatus)
          && linkedTechnician === extractLookupId(profile.Id)
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

async function readJsonBody(req) {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { error: jsonResponse(413, { success: false, message: 'Request body is too large.' }) };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: jsonResponse(400, { success: false, message: 'Invalid request body.' }) };
    return { body };
  } catch {
    return { error: jsonResponse(400, { success: false, message: 'Invalid JSON body.' }) };
  }
}


async function runReadOnlyDiagnostics() {
  const names = SECRET_NAMES;
  const statuses = {};
  const values = {};
  const secretShapes = {};

  if (typeof apper === 'undefined' || !apper || typeof apper.getSecret !== 'function') {
    return jsonResponse(200, {
      success: true,
      diagnostic: {
        secretApi: 'unavailable',
        secrets: Object.fromEntries(names.map((name) => [name, 'unavailable'])),
        redis: { tested: false, result: 'not-tested' },
      },
    });
  }

  const rawValues = {};
  const readErrors = {};
  const literalSecretReads = [
    ['APPER_API_KEY', () => apper.getSecret('APPER_API_KEY')],
    ['APPER_APP_ID', () => apper.getSecret('APPER_APP_ID')],
    ['GUARD_HMAC_SECRET', () => apper.getSecret('GUARD_HMAC_SECRET')],
    ['UPSTASH_REDIS_REST_URL', () => apper.getSecret('UPSTASH_REDIS_REST_URL')],
    ['UPSTASH_REDIS_REST_TOKEN', () => apper.getSecret('UPSTASH_REDIS_REST_TOKEN')],
  ];

  for (const [name, read] of literalSecretReads) {
    try {
      rawValues[name] = await read();
    } catch {
      readErrors[name] = 'read-error';
    }
  }

  for (const name of names) {
    const raw = rawValues[name];
    const proto = raw && (typeof raw === 'object' || typeof raw === 'function') ? Object.getPrototypeOf(raw) : null;
    secretShapes[name] = {
      type: typeof raw,
      isArray: Array.isArray(raw),
      constructor: raw?.constructor?.name || null,
      keys: raw && (typeof raw === 'object' || typeof raw === 'function') ? Object.keys(raw).slice(0, 20) : [],
      prototypeKeys: proto ? Object.getOwnPropertyNames(proto).slice(0, 20) : [],
      valuePropertyType: raw && typeof raw === 'object' && 'value' in raw ? typeof raw.value : 'absent',
      dataPropertyType: raw && typeof raw === 'object' && 'data' in raw ? typeof raw.data : 'absent',
      resultPropertyType: raw && typeof raw === 'object' && 'result' in raw ? typeof raw.result : 'absent'
    };
    const value = normalizeSecret(raw);
    statuses[name] = readErrors[name] || (value ? 'readable' : 'missing-or-unexpected-format');
    values[name] = value;
  }
  const appIdLooksValid = values.APPER_APP_ID === '7636d58bb98b42bab9f47c5875f0a825';
  const hmacLooksValid = /^[a-f0-9]{64}$/i.test(values.GUARD_HMAC_SECRET || '');
  let redis = { tested: false, result: 'not-tested' };

  if (statuses.UPSTASH_REDIS_REST_URL === 'readable'
      && statuses.UPSTASH_REDIS_REST_TOKEN === 'readable') {
    let url;
    try {
      url = new URL(values.UPSTASH_REDIS_REST_URL);
    } catch {
      redis = { tested: false, result: 'invalid-url' };
    }

    if (url) {
      if (url.protocol !== 'https:') {
        redis = { tested: false, result: 'https-required' };
      } else {
        try {
          const response = await fetchWithTimeout(url.toString().replace(/\/+$/, ''), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${values.UPSTASH_REDIS_REST_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(['PING']),
          }, REDIS_TIMEOUT_MS);

          if (response.status !== 200) {
            redis = { tested: true, result: 'http-error', httpStatus: response.status };
          } else {
            let payload;
            try {
              payload = await response.json();
            } catch {
              payload = null;
            }
            redis = payload && !('error' in payload) && payload.result === 'PONG'
              ? { tested: true, result: 'PONG', httpStatus: 200 }
              : { tested: true, result: 'unexpected-redis-response', httpStatus: 200 };
          }
        } catch {
          redis = { tested: true, result: 'network-error-or-timeout' };
        }
      }
    }
  }

  return jsonResponse(200, {
    success: true,
    diagnostic: {
      secretApi: 'available',
      secrets: statuses,
      secretShapes,
      appIdFormatValid: appIdLooksValid,
      hmacFormatValid: hmacLooksValid,
      redis,
      note: 'No booking claim, customer record, or service request was created. One Redis PING may have been issued.',
    },
  });
}

const handler = async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'POST') return jsonResponse(405, { success: false, message: 'Method not allowed.' });
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return jsonResponse(400, { success: false, message: 'Invalid JSON body.' });
  }
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const action = cleanText(body.action);
  try {
    if (action === 'diagnostics') return await runReadOnlyDiagnostics();
    if (action === 'createBooking') return await createGuestBooking(req, body);
    if (action === 'nearbyProviders') {
      // Disabled for the first live milestone: answered before any secret loading or Apper/Redis call.
      if (!ENABLE_NEARBY_PROVIDERS) return jsonResponse(404, { success: false, message: 'This action is not available.' });
      return await findNearbyProviders(body);
    }
  } catch {
    logEvent('unhandled-error');
    return unavailableResponse();
  }
  if (action === 'catalog') {
    // Static menu; needs no secrets (usable as the no-login reachability probe).
    return jsonResponse(200, {
      success: true,
      services: [{ serviceKey: 'car-wash', categoryName: CATEGORY_NAME, capabilityName: CAPABILITY_NAME, platformFee: WASH_PLATFORM_FEE, options: WASH_CATALOG }],
    });
  }
  return jsonResponse(400, { success: false, message: 'Unknown action.' });
};

apper.serve(handler);