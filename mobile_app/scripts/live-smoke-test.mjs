// Live smoke test for the deployed guest-booking Edge Function. NOT run by npm test.
//   node scripts/live-smoke-test.mjs --probe
//       Harmless, no-login reachability check: POST {action:'catalog'} and an invalid JSON body.
//       Creates nothing. Sends no cookies and no Authorization header.
//   LOCAL_SMOKE_TEST_MOBILE=<authorised test number> node scripts/live-smoke-test.mjs --confirm-test
//       Creates ONE 'ZZ TEST' booking (customer profile if new + service request), then retries the same
//       attempt key (expects the same requestId, duplicate:true) and reuses it with a different payload (expects 409).
//   ... --confirm-test --rate-limit
//       Additionally submits new test bookings from the same test number until HTTP 429 (max 6 attempts in total
//       this hour): up to 5 TEST requests can exist afterwards. Cleanup needs separate approval.
// Reads EXPO_PUBLIC_API_BASE (and LOCAL_SMOKE_TEST_MOBILE for booking mode) from the environment only.
import { randomUUID } from 'node:crypto';

const args = new Set(process.argv.slice(2));
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
const mobile = process.env.LOCAL_SMOKE_TEST_MOBILE?.trim();
if (!mobile) {
  console.error('Set LOCAL_SMOKE_TEST_MOBILE to an explicitly authorised test mobile number.');
  process.exit(2);
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
const booking = (idempotencyKey, overrides = {}) => ({
  action: 'createBooking',
  fullName: `ZZ TEST LOCAL MOBILE ${new Date().toISOString().slice(0, 10)}`,
  mobile,
  location: 'ZZ TEST ONLY, Naini, Prayagraj',
  latitude: 25.382,
  longitude: 81.875,
  serviceKey: 'car-wash',
  serviceDetails,
  idempotencyKey,
  ...overrides,
});

const key = randomUUID();
const first = await send(booking(key), { 'Idempotency-Key': key });
if (first.status === 202) {
  check('first booking', false, 'HTTP 202 pending: outcome uncertain, needs Customer Care reconciliation; stopping');
  process.exit();
}
if (!check('first booking returns 200 with a UUID requestId', first.status === 200 && /^[0-9a-f-]{36}$/i.test(first.json?.requestId ?? ''), `HTTP ${first.status}: ${first.json?.message ?? ''}`)) process.exit();
console.log(`requestId (TEST record): ${first.json.requestId}`);
const retry = await send(booking(key), { 'Idempotency-Key': key });
check('same key + same payload returns the same requestId (duplicate)', retry.status === 200 && retry.json?.duplicate === true && retry.json?.requestId === first.json.requestId, `HTTP ${retry.status}`);
const mismatch = await send(booking(key, { location: 'ZZ TEST ONLY, Naini, Prayagraj, different' }), { 'Idempotency-Key': key });
check('same key + different payload returns 409', mismatch.status === 409, `HTTP ${mismatch.status}`);

if (args.has('--rate-limit')) {
  let limited = false;
  for (let attempt = 2; attempt <= 6 && !limited; attempt += 1) {
    const next = randomUUID();
    const result = await send(booking(next), { 'Idempotency-Key': next });
    console.log(`attempt ${attempt}: HTTP ${result.status}${result.json?.requestId ? ` requestId ${result.json.requestId}` : ''}`);
    limited = result.status === 429;
    if (result.status === 202) { check('rate-limit run', false, 'pending response; stopping'); break; }
  }
  check('rate limit reached (429) by the 6th new booking this hour', limited);
}
console.log('Booking mode complete. TEST records were created; cleanup requires separate approval.');
