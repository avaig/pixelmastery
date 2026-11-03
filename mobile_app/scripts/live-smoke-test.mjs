// Live smoke test for the deployed guest-booking Edge Function. NOT run by npm test.
// Run every command from the `mobile_app` directory of a checkout of branch feature/mobile-app:
//   git checkout feature/mobile-app && cd mobile_app
//
//   cd mobile_app && EXPO_PUBLIC_API_BASE=<url> node scripts/live-smoke-test.mjs --probe
//       Harmless, no-login reachability check: POST {action:'catalog'} and an invalid JSON body.
//       Creates nothing. Sends no cookies and no Authorization header.
//
//   cd mobile_app && EXPO_PUBLIC_API_BASE=<url> LOCAL_SMOKE_TEST_MOBILE=<approved test number> node scripts/live-smoke-test.mjs --confirm-test
//       Creates ONE clearly marked TEST booking (customer profile if new + service request) with a fresh UUIDv4
//       attempt key (printed), then retries the same key (expects the same requestId, duplicate:true) and reuses it
//       with a different payload (expects 409). Identification uses customer-visible fields only:
//         Full Name        exactly 'ZZ TEST LOCAL MOBILE'
//         Service Location 'ZZ TEST - DO NOT DISPATCH - ' + LOCAL_SMOKE_TEST_ADDRESS (default 'Naini, Prayagraj')
//         Coordinates      25.382, 81.875 (Naini, inside the 25 km service area)
//
//   ... --confirm-test --reuse-key <uuid>
//       Repeats only the retry (same payload) and mismatch (409) checks for an earlier attempt key. Expected to
//       create nothing; if that key has expired or is unknown the "retry" WOULD create a new TEST booking (reported
//       as FAIL), which is why --confirm-test is still required.
//
//   ... --confirm-test --rate-limit
//       Additionally submits new TEST bookings from the same test number until HTTP 429 (max 6 attempts in total
//       this UTC hour): up to 5 TEST requests can exist afterwards.
//
// Cleanup of TEST records requires separate user approval. Reads EXPO_PUBLIC_API_BASE, LOCAL_SMOKE_TEST_MOBILE and
// LOCAL_SMOKE_TEST_ADDRESS from the environment only. Prints no secrets (it never reads any).
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_NAME = 'ZZ TEST LOCAL MOBILE';
const LOCATION_MARKER = 'ZZ TEST - DO NOT DISPATCH - ';
const TEST_POINT = Object.freeze({ latitude: 25.382, longitude: 81.875 }); // Naini, inside the 25 km area
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Must be run from the mobile_app directory.
if (resolve('scripts/live-smoke-test.mjs') !== fileURLToPath(import.meta.url) || !existsSync('package.json')) {
  console.error('Run this from the mobile_app directory, e.g.: cd mobile_app && EXPO_PUBLIC_API_BASE=<url> node scripts/live-smoke-test.mjs --probe');
  process.exit(2);
}

const argv = process.argv.slice(2);
const args = new Set(argv);
const apiBase = process.env.EXPO_PUBLIC_API_BASE?.trim();
if (!apiBase || apiBase.includes('YOUR-APPER-EDGE-FUNCTION-URL') || !apiBase.startsWith('https://')) {
  console.error('Set EXPO_PUBLIC_API_BASE to the deployed HTTPS guest booking edge function URL.');
  process.exit(2);
}

async function send(body, headers = {}) {
  const response = await fetch(apiBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers }, // deliberately no Authorization / Cookie
    body: typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, json, contentType: response.headers.get('content-type'), setsCookie: response.headers.has('set-cookie') };
}

function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

if (args.has('--probe')) {
  const catalog = await send({ action: 'catalog' });
  check('catalog returns 200 JSON without login', catalog.status === 200 && catalog.json?.success === true && Array.isArray(catalog.json?.services), `HTTP ${catalog.status}, ${catalog.contentType}`);
  const invalid = await send('{not json');
  check('invalid body returns 400 JSON', invalid.status === 400 && invalid.json?.success === false, `HTTP ${invalid.status}`);
  check('no Set-Cookie on responses', !catalog.setsCookie && !invalid.setsCookie);
  console.log('Probe complete. Nothing was created.');
  process.exit();
}

if (!args.has('--confirm-test')) {
  console.error('Refusing to create a booking without --confirm-test (use --probe for the harmless check).');
  process.exit(2);
}
const mobile = process.env.LOCAL_SMOKE_TEST_MOBILE?.replace(/\D/g, '');
if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
  console.error('Set LOCAL_SMOKE_TEST_MOBILE to the 10-digit test mobile number you approved (a number you control, or an obviously fake test number such as 9000000001 once you confirm it is acceptable).');
  process.exit(2);
}
const address = (process.env.LOCAL_SMOKE_TEST_ADDRESS ?? 'Naini, Prayagraj').trim();
let reuseKey = null;
const reuseIndex = argv.indexOf('--reuse-key');
if (reuseIndex >= 0) {
  reuseKey = argv[reuseIndex + 1];
  if (!UUID_V4_RE.test(reuseKey ?? '')) {
    console.error('--reuse-key needs the UUIDv4 attempt key printed by an earlier --confirm-test run.');
    process.exit(2);
  }
}

const serviceDetails = {
  vehicleType: 'small',
  items: [{ title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }],
  pickupDropRequested: false,
  subtotal: 400,
  platformFee: 25,
  pickupDropCharge: 0,
  total: 425,
};
// The script builds the whole payload itself; it refuses to send anything without the ZZ TEST markers.
function booking(idempotencyKey, locationSuffix = '') {
  const payload = {
    action: 'createBooking',
    fullName: TEST_NAME,
    mobile,
    location: `${LOCATION_MARKER}${address}${locationSuffix}`,
    latitude: TEST_POINT.latitude,
    longitude: TEST_POINT.longitude,
    serviceKey: 'car-wash',
    serviceDetails,
    idempotencyKey,
  };
  if (payload.fullName !== TEST_NAME || !payload.location.startsWith(LOCATION_MARKER)
    || address.length < 3 || payload.location.length > 220 || !UUID_V4_RE.test(idempotencyKey)) {
    console.error(`Refusing: the booking must use Full Name '${TEST_NAME}', a location starting '${LOCATION_MARKER}' (max 220 chars) and a UUIDv4 key.`);
    process.exit(2);
  }
  return payload;
}

async function retryAndMismatch(key, expectedRequestId) {
  const retry = await send(booking(key), { 'Idempotency-Key': key });
  if (retry.status === 200 && retry.json?.duplicate !== true) {
    check('same key + same payload returns duplicate:true', false, `a NEW TEST booking was created (requestId ${retry.json?.requestId}); the key had expired or was unknown`);
  } else {
    check('same key + same payload returns the same requestId (duplicate)', retry.status === 200 && retry.json?.duplicate === true
      && UUID_RE.test(retry.json?.requestId ?? '') && (!expectedRequestId || retry.json.requestId === expectedRequestId), `HTTP ${retry.status}${retry.json?.requestId ? `, requestId ${retry.json.requestId}` : ''}`);
  }
  const mismatch = await send(booking(key, ' (mismatch check)'), { 'Idempotency-Key': key });
  check('same key + different payload returns 409', mismatch.status === 409, `HTTP ${mismatch.status}`);
}

booking(reuseKey ?? randomUUID(), ' (mismatch check)'); // validates the longest payload before anything is sent
console.log(`TEST customer Full Name: ${TEST_NAME}`);
console.log(`TEST Service Location:   ${booking(reuseKey ?? randomUUID()).location}`);

if (reuseKey) {
  console.log(`idempotencyKey (reused): ${reuseKey}`);
  await retryAndMismatch(reuseKey, null);
} else {
  const key = randomUUID();
  console.log(`idempotencyKey (record this; reuse with --reuse-key ${key}): ${key}`);
  const first = await send(booking(key), { 'Idempotency-Key': key });
  if (first.status === 202) {
    check('first booking', false, 'HTTP 202 pending: outcome uncertain, needs Customer Care reconciliation; stopping (do not resubmit)');
    process.exit();
  }
  if (!check('first booking returns 200 with a UUID requestId', first.status === 200 && UUID_RE.test(first.json?.requestId ?? ''), `HTTP ${first.status}: ${first.json?.message ?? ''}`)) process.exit();
  console.log(`requestId (TEST record; record this and match it to the record Id in the Admin Panel): ${first.json.requestId}`);
  await retryAndMismatch(key, first.json.requestId);
}

if (args.has('--rate-limit')) {
  let limited = false;
  for (let attempt = 2; attempt <= 6 && !limited; attempt += 1) {
    const next = randomUUID();
    const result = await send(booking(next), { 'Idempotency-Key': next });
    console.log(`attempt ${attempt}: HTTP ${result.status}${result.json?.requestId ? ` requestId ${result.json.requestId}` : ''} (key ${next})`);
    limited = result.status === 429;
    if (result.status === 202) { check('rate-limit run', false, 'pending response; stopping'); break; }
  }
  check('rate limit reached (429) by the 6th new booking this hour', limited);
}
console.log('Booking mode complete. TEST records may have been created; cleanup requires separate user approval.');
