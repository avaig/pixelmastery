// Sandbox (mocked) tests for mobile_app/edge-function-draft/guest-create-service-request.js.
// Global fetch is replaced by an in-memory fake Upstash Redis REST server plus a fake Apper REST API.
// These tests do NOT exercise live Upstash, live Apper or Apper's managed runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edgePath = new URL('../edge-function-draft/guest-create-service-request.js', import.meta.url);
const source = await readFile(edgePath, 'utf8');
// Apper deploys a single self-contained script. Evaluate that exact source with only its final serve call
// stripped; a test-only return exposes internals (never shipped to Apper).
assert.match(source, /apper\.serve\(handler\);\s*$/);
assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
const testedSource = source.replace(/apper\.serve\(handler\);\s*$/, '');

const REDIS_URL = 'https://fake-redis.test';
const BASE_SECRETS = Object.freeze({
  APPER_API_KEY: 'unit-test-apper-key-7f3a',
  APPER_APP_ID: 'app-test-id',
  GUARD_HMAC_SECRET: 'unit-test-guard-hmac-secret-91c2',
  UPSTASH_REDIS_REST_URL: REDIS_URL,
  UPSTASH_REDIS_REST_TOKEN: 'unit-test-redis-token-5d8e',
});
let secrets = { ...BASE_SECRETS };
let secretMode = 'string'; // 'string' | 'wrapped' | 'throw'
globalThis.apper = {
  serve() {},
  async getSecret(name) {
    if (secretMode === 'throw') throw new Error('getSecret failed');
    const value = secrets[name];
    if (value === undefined) return undefined;
    return secretMode === 'wrapped' ? { value } : value;
  },
};

const edge = new Function(`${testedSource}\nreturn { handler, REDIS_SCRIPTS, validateApperOperation, TABLE_ALLOWLIST, extractLookupId, guardHmac, canonicalJson, validateWashDetails, COMPLETED_TTL_SECONDS, PENDING_TTL_SECONDS };`)();
const { handler, REDIS_SCRIPTS } = edge;

// ---------------- fake Upstash Redis REST ----------------
const redis = new Map(); // key -> { value, expiresAt|null }
let redisFault = null; // (command) => Response | throws | undefined
const redisCalls = [];
function redisGet(key) {
  const entry = redis.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) { redis.delete(key); return null; }
  return entry;
}
function ttlOf(key) {
  const entry = redisGet(key);
  if (!entry) return -2;
  return entry.expiresAt === null ? -1 : Math.round((entry.expiresAt - Date.now()) / 1000);
}
function runRedis(command) {
  const [name, ...args] = command;
  switch (String(name).toUpperCase()) {
    case 'GET': return { result: redisGet(args[0])?.value ?? null };
    case 'DEL': return { result: redis.delete(args[0]) ? 1 : 0 };
    case 'SET': {
      const [key, value, ...opts] = args;
      const upper = opts.map((opt) => String(opt).toUpperCase());
      if (upper[0] !== 'NX' || upper[1] !== 'EX' || upper.length !== 3) return { error: 'ERR unsupported SET form in fake' };
      if (redisGet(key)) return { result: null };
      redis.set(key, { value: String(value), expiresAt: Date.now() + Number(opts[2]) * 1000 });
      return { result: 'OK' };
    }
    case 'EVAL': {
      const [script, numKeys, key, ...argv] = args;
      assert.equal(Number(numKeys), 1);
      if (script === REDIS_SCRIPTS.rateLimit) {
        const entry = redisGet(key);
        const count = entry ? Number(entry.value) + 1 : 1;
        redis.set(key, { value: String(count), expiresAt: entry ? entry.expiresAt : Date.now() + Number(argv[0]) * 1000 });
        return { result: count };
      }
      if (script === REDIS_SCRIPTS.casUpdate) {
        const entry = redisGet(key);
        if (!entry || entry.value !== argv[0]) return { result: 0 };
        const expiresAt = argv[2] === 'KEEPTTL' ? entry.expiresAt : Date.now() + Number(argv[2]) * 1000;
        redis.set(key, { value: argv[1], expiresAt });
        return { result: 1 };
      }
      if (script === REDIS_SCRIPTS.casDelete) {
        const entry = redisGet(key);
        if (!entry || entry.value !== argv[0]) return { result: 0 };
        redis.delete(key);
        return { result: 1 };
      }
      return { error: 'NOSCRIPT unknown script in fake' };
    }
    default: return { error: `ERR unknown command ${name}` };
  }
}

// ---------------- fake Apper REST ----------------
const IDS = { category: '01a144b6-7ef0-78e4-aa61-ba16fce3f9bf', capability: '01a144b6-ef8a-71fc-8bbb-3e16e0f647c0', provider: '01a144b6-3333-7333-8333-333333333333', link: '01a144b6-4444-7444-8444-444444444444' };
const database = new Map();
let idCounter = 0;
let apperFault = null; // ({ table, method, isWrite, body }) => Response | throws | undefined
const apperCalls = [];
const newId = () => `01a144b6-${(++idCounter).toString(16).padStart(4, '0')}-7000-8000-${'0'.repeat(12)}`;
function rowsFor(table) {
  if (!database.has(table)) database.set(table, []);
  return database.get(table);
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function runApper(parsed, options) {
  const tablePath = parsed.pathname.split('/tables/')[1];
  const table = tablePath.split('/')[0];
  const body = options.body ? JSON.parse(options.body) : null;
  if (tablePath.endsWith('/records')) {
    assert.equal(options.method, 'POST');
    assert.deepEqual(Object.keys(body), ['records']);
    const stored = rowsFor(table);
    const results = body.records.map((record) => {
      const created = { Id: newId(), ...record, CreatedOn: new Date().toISOString() };
      stored.push(created);
      return { success: true, message: '', data: created };
    });
    return json({ success: true, message: 'Bulk create operation completed', results });
  }
  assert.equal(options.method, 'POST');
  const seeds = table === 'service_categories_c' ? [{ Id: IDS.category, Name: 'Car Assistance', status_c: 'Active' }]
    : table === 'service_capabilities_c' ? [{ Id: IDS.capability, Name: 'Car Wash', status_c: 'Active' }] : [];
  const rows = [...seeds, ...rowsFor(table)].filter((row) => (body.where || []).every((condition) => condition.operator === 'EqualTo' && String(row[condition.fieldName]) === String(condition.values?.[0])));
  const lookupFields = ['technician_c', 'capability_c', 'customer_c', 'service_category_c', 'required_capability_c'];
  return json({ success: true, data: rows.slice(0, body.pagingInfo?.limit || 100).map((row) => Object.fromEntries(body.fields.map((field) => [field, lookupFields.includes(field) && row[field] ? { Id: row[field], Name: 'Test lookup' } : row[field]]))) });
}

globalThis.fetch = async (url, options = {}) => {
  await new Promise((resolve) => setImmediate(resolve)); // let concurrent invocations interleave
  const parsed = new URL(url);
  if (parsed.origin === REDIS_URL) {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${BASE_SECRETS.UPSTASH_REDIS_REST_TOKEN}`);
    const command = JSON.parse(options.body);
    redisCalls.push(command);
    if (redisFault) {
      const faulted = redisFault(command);
      if (faulted) return faulted;
    }
    return json(runRedis(command));
  }
  assert.equal(parsed.origin, 'https://api.apper.io');
  assert.ok(parsed.pathname.startsWith('/v1/data/app-test-id/tables/'));
  assert.equal(options.headers.Authorization, BASE_SECRETS.APPER_API_KEY);
  const tablePath = parsed.pathname.split('/tables/')[1];
  const info = { table: tablePath.split('/')[0], method: options.method, isWrite: tablePath.endsWith('/records'), body: options.body ? JSON.parse(options.body) : null };
  apperCalls.push(info);
  if (apperFault) {
    const faulted = apperFault(info);
    if (faulted) return faulted;
  }
  return runApper(parsed, options);
};

// ---------------- console capture ----------------
const consoleOutput = [];
for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
  const original = console[level].bind(console);
  console[level] = (...args) => { consoleOutput.push(args.map(String).join(' ')); if (process.env.SHOW_EDGE_LOGS) original(...args); };
}
const responseBodies = [];

function reset() {
  redis.clear();
  database.clear();
  redisCalls.length = 0;
  apperCalls.length = 0;
  redisFault = null;
  apperFault = null;
  secrets = { ...BASE_SECRETS };
  secretMode = 'string';
}
const writes = (table) => apperCalls.filter((call) => call.isWrite && (!table || call.table === table));
const DEFAULT_KEY = '11111111-1111-4111-8111-111111111111';
const keyN = (n) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const SMALL_WASH = {
  vehicleType: 'small',
  items: [{ title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }],
  pickupDropRequested: false, subtotal: 400, platformFee: 25, pickupDropCharge: 0, total: 425,
};
function bookingBody(overrides = {}) {
  return {
    action: 'createBooking', fullName: 'ZZ TEST Customer', mobile: '9876543210', location: 'TEST ONLY, Naini, Prayagraj',
    latitude: 25.382, longitude: 81.875, serviceKey: 'car-wash', serviceDetails: SMALL_WASH, idempotencyKey: DEFAULT_KEY, ...overrides,
  };
}
function post(body) {
  return new Request('https://edge.test/guest-create-service-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
async function call(overrides) {
  const response = await handler(post(bookingBody(overrides)));
  const text = await response.text();
  responseBodies.push(text);
  return { status: response.status, body: JSON.parse(text) };
}
async function hashes(overrides = {}) {
  const b = bookingBody(overrides);
  const secret = BASE_SECRETS.GUARD_HMAC_SECRET;
  const mobile = `+91${b.mobile}`;
  return {
    phone: await edge.guardHmac(secret, 'phone', mobile),
    idem: await edge.guardHmac(secret, 'idem', b.idempotencyKey),
    payload: await edge.guardHmac(secret, 'payload', edge.canonicalJson({
      serviceKey: b.serviceKey, mobile, fullName: b.fullName, location: b.location,
      coordinates: { latitude: b.latitude ?? null, longitude: b.longitude ?? null },
      serviceDetails: edge.validateWashDetails(b.serviceDetails),
    })),
  };
}
const claimOf = async (overrides) => {
  const entry = redisGet(`idem:${(await hashes(overrides)).idem}`);
  return entry ? JSON.parse(entry.value) : null;
};
const PENDING = { success: true, pending: true, status: 'pending', message: 'Your booking is being confirmed. Please do not submit it again. Customer Care will confirm it.' };

test('source is a single apper.serve file without Deno.env or the superseded DB guard', () => {
  assert.equal(source.includes('Deno.env'), false);
  assert.equal(source.includes('Deno'), false);
  assert.equal(source.includes('guest_booking_guard_c'), false);
  assert.match(source, /await apper\.getSecret\(name\)/);
  for (const name of Object.keys(BASE_SECRETS)) assert.ok(source.includes(`'${name}'`));
  assert.equal(edge.COMPLETED_TTL_SECONDS, 604800);
  assert.equal(edge.PENDING_TTL_SECONDS, 604800);
  assert.equal(REDIS_SCRIPTS.rateLimit, "local c=redis.call('INCR',KEYS[1]); if c==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return c");
});

test('successful booking writes allowlisted customer/request payloads and records done in Redis', async () => {
  reset();
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['message', 'requestId', 'success']);
  assert.match(result.body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const [customerCall] = writes('customer_profiles_c');
  const [requestCall] = writes('service_requests_c');
  const customer = customerCall.body.records[0];
  assert.deepEqual(Object.keys(customer).sort(), ['Name', 'location_c', 'phone_c', 'status_c']);
  assert.equal(customer.phone_c, '+919876543210');
  assert.equal(customer.status_c, 'Active');
  for (const field of ['latitude_c', 'longitude_c', 'Owner', 'email_c']) assert.equal(field in customer, false);
  const request = requestCall.body.records[0];
  assert.equal(request.customer_c, rowsFor('customer_profiles_c')[0].Id);
  assert.equal(request.service_category_c, IDS.category);
  assert.equal(request.required_capability_c, IDS.capability);
  assert.equal(request.device_type_c, 'Mobile');
  assert.equal(request.latitude_c, 25.382);
  assert.equal(request.longitude_c, 81.875);
  assert.equal(request.location_c, 'TEST ONLY, Naini, Prayagraj');
  assert.deepEqual([request.status_c, request.preferred_time_c, request.service_mode_c, request.pricing_mode_c], ['Open', 'ASAP', 'Normal', 'Fixed Price']);
  assert.match(request.requested_at_c, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.match(request.problem_description_c, /^Customer submitted this Car Wash quote/);
  assert.match(request.problem_description_c, /LOCAL Platform Fee: ₹25/);
  assert.match(request.problem_description_c, /CAR_WASH_DECISIONS_JSON:/);
  assert.doesNotMatch(request.problem_description_c, /LOCAL_GUEST_|idem:|rate:|payloadHash/);
  assert.equal(result.body.requestId, rowsFor('service_requests_c')[0].Id);
  const h = await hashes();
  const claim = await claimOf();
  assert.deepEqual(claim, { state: 'done', requestId: result.body.requestId, payloadHash: h.payload });
  assert.ok(Math.abs(ttlOf(`idem:${h.idem}`) - 604800) <= 2);
  const rateKeys = [...redis.keys()].filter((key) => key.startsWith('rate:'));
  assert.deepEqual(rateKeys, [`rate:${h.phone}:${new Date().toISOString().slice(0, 13).replace(/[-T]/g, '')}`]);
  assert.ok(ttlOf(rateKeys[0]) > 7190 && ttlOf(rateKeys[0]) <= 7200);
  assert.equal([...redis.keys()].some((key) => /9876543210|11111111-1111/.test(key)), false);
  assert.equal(JSON.stringify([...redis.values()]).includes('9876543210'), false);
  assert.match(h.idem, /^[0-9a-f]{32}$/);
  assert.match(h.payload, /^[0-9a-f]{32}$/);
});

test('concurrent identical claims create exactly one request', async () => {
  reset();
  const results = await Promise.all(Array.from({ length: 5 }, () => call()));
  assert.equal(writes('service_requests_c').length, 1);
  assert.equal(writes('customer_profiles_c').length, 1);
  const created = rowsFor('service_requests_c')[0].Id;
  assert.equal(results.filter((r) => r.status === 200 && !r.body.duplicate).length, 1);
  for (const r of results) {
    assert.ok([200, 202].includes(r.status), `unexpected ${r.status}`);
    if (r.status === 200) assert.equal(r.body.requestId, created);
    else assert.deepEqual(r.body, PENDING);
  }
});

test('retry after done returns the original UUID and creates nothing', async () => {
  reset();
  const first = await call();
  const before = writes().length;
  const retry = await call({ fullName: '  ZZ TEST Customer ', mobile: '+91 98765 43210' }); // canonicalised, same payload
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, { success: true, duplicate: true, requestId: first.body.requestId, message: 'Your request was already submitted.' });
  assert.equal(writes().length, before);
});

test('same key with a different payload returns 409 and writes nothing', async () => {
  reset();
  await call();
  const before = writes().length;
  for (const change of [{ fullName: 'Different Person' }, { latitude: 25.383 }, { serviceDetails: { ...SMALL_WASH, pickupDropRequested: true, pickupDropCharge: 100, total: 525 } }]) {
    const result = await call(change);
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { success: false, message: 'This booking attempt key was already used for a different request' });
  }
  assert.equal(writes().length, before);
});

test('an existing pending claim answers 202 and never creates anything, even on retry', async () => {
  reset();
  const h = await hashes();
  redis.set(`idem:${h.idem}`, { value: JSON.stringify({ state: 'pending', payloadHash: h.payload, stage: 'claimed', createdAt: new Date().toISOString() }), expiresAt: Date.now() + 604800e3 });
  for (let i = 0; i < 3; i += 1) {
    const result = await call();
    assert.equal(result.status, 202);
    assert.deepEqual(result.body, PENDING);
  }
  assert.equal(apperCalls.length, 0);
  assert.equal([...redis.keys()].some((key) => key.startsWith('rate:')), false); // retries do not consume rate
});

for (const [label, fault] of [
  ['HTTP 500', () => json({ success: false, message: 'server error' }, 500)],
  ['timeout/network error', () => { throw new DOMException('The operation timed out.', 'TimeoutError'); }],
  ['unparseable 200', () => new Response('not json', { status: 200 })],
  ['200 without a request Id', () => json({ success: true, results: [{ success: true, data: {} }] })],
]) {
  test(`uncertain request write (${label}) keeps the claim pending and a retry creates nothing`, async () => {
    reset();
    apperFault = (info) => (info.isWrite && info.table === 'service_requests_c' ? fault() : undefined);
    const result = await call();
    assert.equal(result.status, 202);
    assert.deepEqual(result.body, PENDING);
    const claim = await claimOf();
    assert.equal(claim.state, 'pending');
    assert.equal(claim.stage, 'request-write-uncertain');
    assert.match(claim.customerId, /^[0-9a-f-]{36}$/);
    const h = await hashes();
    assert.ok(ttlOf(`idem:${h.idem}`) > 604000);
    const requestAttempts = writes('service_requests_c').length;
    assert.equal(requestAttempts, 1);
    apperFault = null;
    const retry = await call();
    assert.equal(retry.status, 202);
    assert.deepEqual(retry.body, PENDING);
    assert.equal(writes('service_requests_c').length, requestAttempts);
  });
}

test('failure to record done after the request was created stays pending with the requestId', async () => {
  reset();
  redisFault = (command) => (command[0] === 'EVAL' && command[1] === REDIS_SCRIPTS.casUpdate && JSON.parse(command[5]).state === 'done' ? json({ error: 'simulated' }) : undefined);
  const result = await call();
  assert.equal(result.status, 202);
  assert.deepEqual(result.body, PENDING);
  const claim = await claimOf();
  assert.equal(claim.state, 'pending');
  assert.equal(claim.stage, 'request-write-uncertain');
  assert.equal(claim.requestId, rowsFor('service_requests_c')[0].Id);
  redisFault = null;
  assert.equal((await call()).status, 202);
  assert.equal(writes('service_requests_c').length, 1);
});

test('definitive per-record request failure releases the claim and a retry succeeds reusing the customer', async () => {
  reset();
  apperFault = (info) => (info.isWrite && info.table === 'service_requests_c'
    ? json({ success: true, results: [{ success: false, message: 'simulated failure', errors: [{ fieldName: 'customer_c', message: 'test only' }] }] }) : undefined);
  const failed = await call();
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.body, { success: false, message: 'Booking is temporarily unavailable' });
  assert.equal(await claimOf(), null);
  apperFault = null;
  const retry = await call();
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, undefined);
  assert.equal(rowsFor('customer_profiles_c').length, 1);
  assert.equal(rowsFor('service_requests_c').length, 1);
  assert.equal(writes('customer_profiles_c').length, 1);
});

test('definitive 4xx customer failure and pre-write lookup failure release the claim', async () => {
  for (const fault of [
    (info) => (info.isWrite && info.table === 'customer_profiles_c' ? json({ success: false, message: 'bad' }, 400) : undefined),
    (info) => (info.table === 'service_capabilities_c' ? json({ success: false }, 500) : undefined),
  ]) {
    reset();
    apperFault = fault;
    assert.equal((await call()).status, 503);
    assert.equal(writes('service_requests_c').length, 0);
    assert.equal(await claimOf(), null);
    apperFault = null;
    assert.equal((await call()).status, 200);
    assert.equal(rowsFor('service_requests_c').length, 1);
  }
});

test('stage-update failure before the request write releases and creates no request', async () => {
  reset();
  redisFault = (command) => (command[0] === 'EVAL' && command[1] === REDIS_SCRIPTS.casUpdate ? new Response('bad gateway', { status: 502 }) : undefined);
  assert.equal((await call()).status, 503);
  assert.equal(writes('service_requests_c').length, 0);
  assert.equal(await claimOf(), null);
});

test('rate limit: 10 parallel distinct bookings from one phone -> exactly 5 succeed, rest 429', async () => {
  reset();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => call({ idempotencyKey: keyN(i + 1) })));
  assert.equal(results.filter((r) => r.status === 200).length, 5);
  const limited = results.filter((r) => r.status === 429);
  assert.equal(limited.length, 5);
  for (const r of limited) assert.deepEqual(r.body, { success: false, message: 'Too many booking requests. Please try again later.' });
  assert.equal(writes('service_requests_c').length, 5);
});

test('retries do not consume the rate limit; the 6th new booking in the hour is 429', async () => {
  reset();
  assert.equal((await call({ idempotencyKey: keyN(1) })).status, 200);
  for (let i = 0; i < 10; i += 1) assert.equal((await call({ idempotencyKey: keyN(1) })).body.duplicate, true);
  for (let n = 2; n <= 5; n += 1) assert.equal((await call({ idempotencyKey: keyN(n) })).status, 200);
  assert.equal((await call({ idempotencyKey: keyN(6) })).status, 429);
  assert.equal(writes('service_requests_c').length, 5);
});

test('two different consecutive bookings from the same phone both succeed (no duplicate-by-phone block)', async () => {
  reset();
  const first = await call({ idempotencyKey: keyN(1) });
  const second = await call({ idempotencyKey: keyN(2), serviceDetails: { vehicleType: 'small', items: [{ title: 'Interior Only', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }], pickupDropRequested: false, subtotal: 200, platformFee: 25, pickupDropCharge: 0, total: 225 } });
  const third = await call({ idempotencyKey: keyN(3) }); // identical details, new attempt key
  assert.deepEqual([first.status, second.status, third.status], [200, 200, 200]);
  assert.equal(new Set([first.body.requestId, second.body.requestId, third.body.requestId]).size, 3);
  assert.equal(rowsFor('customer_profiles_c').length, 1);
});

test('Redis down, non-200, {error} or garbage fails closed with 503 before any Apper call', async () => {
  for (const fault of [
    () => { throw new TypeError('fetch failed'); },
    () => new Response('unauthorized', { status: 401 }),
    () => json({ error: 'WRONGPASS invalid token' }, 200),
    () => new Response('<html>', { status: 200 }),
  ]) {
    reset();
    redisFault = fault;
    const result = await call();
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { success: false, message: 'Booking is temporarily unavailable' });
    assert.equal(apperCalls.length, 0);
  }
});

test('each missing/empty secret, a non-HTTPS Redis URL, or getSecret throwing -> 503 with zero calls', async () => {
  const variants = [];
  for (const name of Object.keys(BASE_SECRETS)) {
    variants.push({ [name]: undefined }, { [name]: '' }, { [name]: '   ' });
  }
  variants.push({ UPSTASH_REDIS_REST_URL: 'http://fake-redis.test' }, { UPSTASH_REDIS_REST_URL: 'not a url' });
  for (const change of variants) {
    reset();
    secrets = { ...BASE_SECRETS, ...change };
    const result = await call();
    assert.equal(result.status, 503, JSON.stringify(Object.keys(change)));
    assert.deepEqual(result.body, { success: false, message: 'Booking is temporarily unavailable' });
    assert.equal(apperCalls.length + redisCalls.length, 0);
  }
  reset();
  secretMode = 'throw';
  const thrown = await call();
  assert.equal(thrown.status, 503);
  assert.equal(apperCalls.length + redisCalls.length, 0);
});

test('getSecret values wrapped as { value } are accepted defensively', async () => {
  reset();
  secretMode = 'wrapped';
  assert.equal((await call()).status, 200);
});

test('validation: bad attempt key, price mismatch and out-of-area coordinates are rejected with zero calls', async () => {
  for (const change of [
    { idempotencyKey: 'not-a-uuid' },
    { idempotencyKey: '01a144b6-1111-7111-8111-111111111111' }, // UUIDv7, client keys must be v4
    { serviceDetails: { ...SMALL_WASH, subtotal: 1, total: 26 } },
    { serviceDetails: { ...SMALL_WASH, items: [{ title: 'Complete Car Wash', variant: 'SUV / Big Car', quantity: 1 }] } },
    { serviceDetails: { ...SMALL_WASH, items: [{ title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1, price: 1 }] } },
    { latitude: 25.382, longitude: 82.2 },
    { latitude: 25.382, longitude: undefined },
    { mobile: '12345' },
    { fullName: 'A' },
    { serviceKey: 'car-service' },
  ]) {
    reset();
    const result = await call(change);
    assert.equal(result.status, 400, JSON.stringify(change));
    assert.equal(apperCalls.length + redisCalls.length, 0);
  }
  const price = await (async () => { reset(); return call({ serviceDetails: { ...SMALL_WASH, total: 400 } }); })();
  assert.deepEqual(price.body, { success: false, message: 'Car Wash details or submitted totals do not match the current menu.' });
});

test('manual location without coordinates gets the pending prefix, no coordinates, bounded to 220 chars', async () => {
  reset();
  assert.equal((await call({ latitude: undefined, longitude: undefined })).status, 200);
  const record = rowsFor('service_requests_c')[0];
  assert.equal(record.location_c, '[LOCATION VERIFICATION PENDING] TEST ONLY, Naini, Prayagraj');
  assert.equal('latitude_c' in record || 'longitude_c' in record, false);
  assert.equal(rowsFor('customer_profiles_c')[0].location_c, 'TEST ONLY, Naini, Prayagraj');
  reset();
  assert.equal((await call({ latitude: undefined, longitude: undefined, location: 'A'.repeat(220) })).status, 200);
  const long = rowsFor('service_requests_c')[0].location_c;
  assert.equal(long.length, 220);
  assert.match(long, /^\[LOCATION VERIFICATION PENDING\] /);
});

test('allowlist rejects unknown tables/fields and non-UUID references; no guard table in allowlist', () => {
  assert.throws(() => edge.validateApperOperation('POST', 'unknown', 'unknown', { fields: ['Id'] }));
  assert.throws(() => edge.validateApperOperation('POST', 'customer_profiles_c', 'customer_profiles_c', { fields: ['email_c'] }));
  assert.throws(() => edge.validateApperOperation('POST', 'customer_profiles_c', 'customer_profiles_c/records', { records: [{ Name: 'A', Owner: 42 }] }));
  assert.throws(() => edge.validateApperOperation('POST', 'customer_profiles_c', 'customer_profiles_c/records', { records: [{ latitude_c: 25 }] }));
  assert.throws(() => edge.validateApperOperation('POST', 'service_requests_c', 'service_requests_c/records', { records: [{ Name: 'x', secret_c: 'bad' }] }));
  assert.throws(() => edge.validateApperOperation('POST', 'service_requests_c', 'service_requests_c/records', { records: [{ customer_c: 999 }] }), /UUID/);
  assert.throws(() => edge.validateApperOperation('PUT', 'service_requests_c', 'service_requests_c/records', { records: [{ status_c: 'Closed' }] }), /UUID/);
  assert.throws(() => edge.validateApperOperation('DELETE', 'service_requests_c', 'service_requests_c/records', { records: [{}] }));
  assert.throws(() => edge.validateApperOperation('POST', 'technician_profiles_c', 'technician_profiles_c/records', { records: [{ Name: 'x' }] }));
  assert.deepEqual(edge.TABLE_ALLOWLIST.customer_profiles_c.write, ['Name', 'phone_c', 'location_c', 'status_c']);
  assert.deepEqual(Object.keys(edge.TABLE_ALLOWLIST).sort(), ['customer_profiles_c', 'service_capabilities_c', 'service_categories_c', 'service_provider_capabilities_c', 'service_requests_c', 'technician_profiles_c']);
  assert.equal(edge.extractLookupId(IDS.capability), IDS.capability);
  assert.equal(edge.extractLookupId({ Id: IDS.capability, Name: 'Car Wash' }), IDS.capability);
  assert.equal(edge.extractLookupId(39), null);
  assert.equal(edge.extractLookupId({ Id: 39 }), null);
  assert.equal(edge.extractLookupId('01a144b6-zzzz-7000-8000-000000000000'), null);
});

test('customer lookup reuses an existing profile by phone (no new customer write)', async () => {
  reset();
  rowsFor('customer_profiles_c').push({ Id: '01a144b6-9999-7999-8999-999999999999', phone_c: '9876543210' });
  const result = await call();
  assert.equal(result.status, 200);
  assert.equal(writes('customer_profiles_c').length, 0);
  assert.equal(rowsFor('service_requests_c')[0].customer_c, '01a144b6-9999-7999-8999-999999999999');
});

test('catalog works without secrets; invalid/oversized bodies are rejected before secrets', async () => {
  reset();
  secretMode = 'throw';
  const catalog = await handler(post({ action: 'catalog' }));
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).services[0].platformFee, 25);
  assert.equal((await handler(post('{bad json'))).status, 400);
  assert.equal((await handler(post('[]'))).status, 400);
  assert.equal((await handler(post({ action: 'nope' }))).status, 400);
  assert.equal((await handler(post({ action: 'catalog', pad: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await handler(new Request('https://edge.test/x', { method: 'GET' }))).status, 405);
  assert.equal(apperCalls.length + redisCalls.length, 0);
});

test('nearby providers needs only Apper secrets and returns coarse fields', async () => {
  reset();
  secrets = { APPER_API_KEY: BASE_SECRETS.APPER_API_KEY, APPER_APP_ID: BASE_SECRETS.APPER_APP_ID };
  rowsFor('technician_profiles_c').push({ Id: IDS.provider, Name: 'Mira Singh', verification_status_c: 'Approved', status_c: 'Active', availability_c: 'Available Now', latitude_c: 25.382, longitude_c: 81.885, service_radius_km_c: 10, phone_c: '+919999999999' });
  rowsFor('service_provider_capabilities_c').push({ Id: IDS.link, technician_c: IDS.provider, capability_c: IDS.capability, status_c: 'Active' });
  const response = await handler(post({ action: 'nearbyProviders', latitude: 25.382, longitude: 81.875, serviceKey: 'car-wash', radiusKm: 75 }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.radiusKm, 50);
  assert.equal(result.providers.length, 1);
  assert.deepEqual(Object.keys(result.providers[0]).sort(), ['availability', 'distanceKm', 'name', 'providerHash']);
  assert.equal(result.providers[0].name, 'Mira');
  assert.equal(JSON.stringify(result).includes('9999999999'), false);
  assert.equal(JSON.stringify(result).includes(IDS.provider), false);
  assert.equal(redisCalls.length, 0);
  assert.equal(apperCalls.some((c) => c.isWrite), false);
  secrets = {};
  assert.equal((await handler(post({ action: 'nearbyProviders', latitude: 25.382, longitude: 81.875 }))).status, 503);
});

test('no secret, HMAC key, hash or Redis key appears in any response body or console output', async () => {
  // Exercise remaining paths (409, 429, pending) so their bodies are captured too.
  reset();
  await call();
  await call({ fullName: 'Other Person' });
  for (let n = 2; n <= 6; n += 1) await call({ idempotencyKey: keyN(n) });
  apperFault = (info) => (info.isWrite && info.table === 'service_requests_c' ? json({}, 500) : undefined);
  await call({ idempotencyKey: keyN(9), mobile: '9123456789' });
  apperFault = null;
  const h = await hashes();
  const forbidden = [...Object.values(BASE_SECRETS).filter((v) => v !== REDIS_URL), REDIS_URL, h.phone, h.idem, h.payload, 'idem:', 'rate:', 'payloadHash'];
  const haystack = [...responseBodies, ...consoleOutput].join('\n');
  assert.ok(responseBodies.length > 50);
  for (const value of forbidden) assert.equal(haystack.includes(value), false, 'leaked a forbidden value');
  assert.equal(consoleOutput.every((line) => /^guest-booking: [a-z-]+$/.test(line)), true);
});
