import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const edgePath = new URL('../../edge-function/guest-create-service-request.js', import.meta.url);
const source = await readFile(edgePath, 'utf8');
// Apper deploys a single self-contained script. Evaluate that exact source with only
// its final serve call stripped; append a test-only return (never shipped to Apper).
assert.match(source, /apper\.serve\(handler\);\s*$/);
assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
const testedSource = source.replace(/apper\.serve\(handler\);\s*$/, '');
const database = new Map();
const calls = [];
let failServiceRequestCreate = false;
let failGuard = false;
let failGuardDoneUpdate = false;
let competingClaim = false;
let guardSecret = 'test-only-guard-secret';
let handler;

globalThis.Deno = { env: { get: (name) => ({ APPER_API_KEY: 'unit-test-key', APPER_APP_ID: 'app-test-id', GUARD_HMAC_SECRET: guardSecret })[name] } };
globalThis.apper = { serve: (callback) => { handler = callback; } };

function recordsFor(table) {
  if (!database.has(table)) database.set(table, []);
  return database.get(table);
}

function makeResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  const tablePath = parsed.pathname.split('/tables/')[1];
  const table = tablePath.split('/')[0];
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url: parsed.href, method, body, headers: options.headers });
  assert.equal(options.headers.Authorization, 'unit-test-key');

  if (table === 'guest_booking_guard_c' && (failGuard || (failGuardDoneUpdate && method === 'PUT' && body?.records?.[0]?.status_c === 'Done' && tablePath.endsWith('/records')))) {
    return makeResponse({ success: false, message: 'guard missing' }, 404);
  }
  if (tablePath.endsWith('/records')) {
    assert.ok(['POST', 'PUT'].includes(method));
    assert.deepEqual(Object.keys(body), ['records']);
    const targetTable = tablePath.split('/')[0];
    if (targetTable === 'service_requests_c' && failServiceRequestCreate) {
      return makeResponse({
        success: true,
        results: [{ success: false, message: 'simulated failure', errors: [{ fieldName: 'customer_c', message: 'test only' }], data: null }],
      });
    }
    const stored = recordsFor(targetTable);
    const results = body.records.map((record) => {
      const created = method === 'PUT' ? { ...stored.find((row) => row.Id === record.Id), ...record } : { Id: targetTable === 'customer_profiles_c' ? 201 : targetTable === 'service_requests_c' ? 901 : stored.length + 1001, ...record, CreatedOn: new Date().toISOString() };
      if (method === 'PUT') stored.splice(stored.findIndex((row) => row.Id === record.Id), 1, created);
      else stored.push(created);
      if (competingClaim && targetTable === 'guest_booking_guard_c' && record.status_c === 'Pending') {
        stored.push({ Id: 999, Name: record.Name, status_c: 'Pending', attempts_c: 1, created_at_c: record.created_at_c, expires_at_c: record.expires_at_c });
      }
      return { success: true, message: '', data: created };
    });
    return makeResponse({ success: true, message: 'Bulk create operation completed', results });
  }

  assert.equal(method, 'POST');
  const sourceRows = recordsFor(table);
  const filtered = sourceRows.filter((row) => (body.where || []).every((condition) => {
    const field = condition.fieldName;
    const queryValue = condition.values?.[0];
    if (condition.operator === 'EqualTo') return String(row[field]) === String(queryValue);
    if (condition.operator === 'Contains') return String(row[field] || '').includes(String(queryValue));
    if (condition.operator === 'GreaterThan') return new Date(row[field]) > new Date(queryValue);
    return false;
  }));
  const seeds = table === 'service_categories_c'
    ? [{ Id: 18, Name: 'Car Assistance', status_c: 'Active' }]
    : table === 'service_capabilities_c'
      ? [{ Id: 39, Name: 'Car Wash', status_c: 'Active' }]
      : [];
  const rows = filtered.length ? filtered : seeds.filter((row) => (body.where || []).every((condition) => row[condition.fieldName] === condition.values?.[0]));
  return makeResponse({ success: true, data: rows.slice(0, body.pagingInfo?.limit || 100) });
};

const edge = new Function(`${testedSource}\nreturn { handler, validateApperOperation, TABLE_ALLOWLIST, getDistanceKm, normalizeIndianMobile, validateWashDetails };`)();
handler = edge.handler;

function clearMock() {
  database.clear();
  calls.length = 0;
  failServiceRequestCreate = false;
  failGuard = false;
  failGuardDoneUpdate = false;
  competingClaim = false;
  guardSecret = 'test-only-guard-secret';
}

function hmac(domain, value) {
  return createHmac('sha256', guardSecret).update(`${domain}:${value}`).digest('hex').slice(0, 32);
}

function bookingRequest(overrides = {}, requestHeaders = {}) {
  const idempotencyKey = '11111111-1111-4111-8111-111111111111';
  return new Request('https://edge.test/guest-create-service-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, ...requestHeaders },
    body: JSON.stringify({
      action: 'createBooking',
      fullName: 'Test Customer',
      mobile: '9876543210',
      location: 'TEST ONLY, Naini, Prayagraj',
      latitude: 25.382,
      longitude: 81.875,
      serviceKey: 'car-wash',
      serviceDetails: {
        vehicleType: 'small',
        items: [{ title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }],
        pickupDropRequested: false,
        subtotal: 400,
        platformFee: 25,
        pickupDropCharge: 0,
        total: 425,
      },
      idempotencyKey,
      ...overrides,
    }),
  });
}

test('edge creates documented Apper record payloads and returns a linked request', async () => {
  clearMock();
  const response = await handler(bookingRequest());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.equal(result.requestId, 901);
  assert.equal(recordsFor('customer_profiles_c').length, 1);
  assert.equal(recordsFor('service_requests_c').length, 1);

  const customerCreate = calls.find((call) => call.url.includes('/customer_profiles_c/records'));
  const requestCreate = calls.find((call) => call.url.includes('/service_requests_c/records'));
  assert.ok(customerCreate);
  assert.ok(requestCreate);
  assert.deepEqual(Object.keys(customerCreate.body.records[0]).sort(), ['Name', 'phone_c', 'location_c', 'status_c'].sort());
  assert.equal(customerCreate.body.records[0].phone_c, '+919876543210');
  assert.equal('Owner' in customerCreate.body.records[0], false);
  assert.equal('email_c' in customerCreate.body.records[0], false);
  const requestRecord = requestCreate.body.records[0];
  assert.equal(requestRecord.customer_c, 201);
  assert.equal(requestRecord.service_category_c, 18);
  assert.equal(requestRecord.required_capability_c, 39);
  assert.equal(requestRecord.device_type_c, 'Mobile');
  assert.doesNotMatch(requestRecord.problem_description_c, /LOCAL_GUEST_(IDEMPOTENCY|RATE_)/);
  assert.match(requestRecord.problem_description_c, /^Customer submitted this Car Wash quote/);
  assert.equal(requestRecord.latitude_c, 25.382);
  assert.equal(requestRecord.longitude_c, 81.875);
  const guardRows = recordsFor('guest_booking_guard_c');
  assert.equal(guardRows.some((row) => row.Name === `idem:${hmac('idem', '11111111-1111-4111-8111-111111111111')}` && row.request_id_c === 901 && row.status_c === 'Done'), true);
  assert.equal(guardRows.some((row) => row.Name === `rate:${hmac('phone', '+919876543210')}:${new Date().toISOString().slice(0, 13).replace(/[-T]/g, '')}`), true);
  assert.equal(guardRows.some((row) => !row.expires_at_c || !row.created_at_c), false);
  assert.equal(JSON.stringify(guardRows).includes('9876543210'), false);
  assert.equal(JSON.stringify(guardRows).includes('11111111-1111-4111-8111-111111111111'), false);
  assert.equal(JSON.stringify(guardRows).includes(guardSecret), false);
  assert.deepEqual(Object.keys(result).sort(), ['success', 'requestId', 'message'].sort());
  assert.equal(JSON.stringify(result).includes(hmac('phone', '+919876543210')), false);
  assert.match(requestRecord.problem_description_c, /LOCAL Platform Fee: ₹25/);
  assert.match(requestRecord.problem_description_c, /CAR_WASH_DECISIONS_JSON:/);
  assert.equal(requestRecord.status_c, 'Open');
  assert.equal(requestRecord.preferred_time_c, 'ASAP');
  assert.equal(requestRecord.service_mode_c, 'Normal');
  assert.equal(requestRecord.pricing_mode_c, 'Fixed Price');
  assert.equal(customerCreate.body.records[0].status_c, 'Active');
  assert.match(requestRecord.requested_at_c, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.equal(calls.every((call) => call.url.includes('/v1/data/app-test-id/tables/')), true);
  assert.equal(calls.some((call) => call.url.endsWith('/records') && !['POST', 'PUT'].includes(call.method)), false);
});

test('allowlist rejects unknown tables, read fields, write fields, and malformed updates', () => {
  assert.throws(() => edge.validateApperOperation('POST', 'unknown', 'unknown', { fields: ['Id'] }));
  assert.throws(() => edge.validateApperOperation('POST', 'customer_profiles_c', 'customer_profiles_c', { fields: ['secret_c'] }));
  assert.throws(() => edge.validateApperOperation('POST', 'customer_profiles_c', 'customer_profiles_c/records', { records: [{ Name: 'A', Owner: 42 }] }));
  assert.throws(() => edge.validateApperOperation('PUT', 'service_requests_c', 'service_requests_c/records', { records: [{ status_c: 'Closed' }] }));
  assert.throws(() => edge.validateApperOperation('POST', 'service_requests_c', 'service_requests_c/records', { records: [{ Name: 'x', customer_c: 1, secret_c: 'bad' }] }));
  assert.throws(() => edge.validateApperOperation('POST', 'customer_profiles_c', 'customer_profiles_c/records', { records: [{ latitude_c: 25 }] }));
  assert.throws(() => edge.validateApperOperation('POST', 'guest_booking_guard_c', 'guest_booking_guard_c/records', { records: [{ phone_c: 'raw phone' }] }));
  assert.deepEqual(edge.TABLE_ALLOWLIST.customer_profiles_c.write, ['Name', 'phone_c', 'location_c', 'status_c']);
  assert.deepEqual(edge.TABLE_ALLOWLIST.guest_booking_guard_c.write, ['Id', 'Name', 'request_id_c', 'attempts_c', 'status_c', 'expires_at_c', 'created_at_c']);
});

test('idempotent retry returns existing request without repeating customer or request writes', async () => {
  clearMock();
  const first = await handler(bookingRequest());
  const firstResult = await first.json();
  const createCount = calls.filter((call) => call.url.endsWith('/records')).length;
  const second = await handler(bookingRequest());
  const secondResult = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondResult.duplicate, true);
  assert.equal(secondResult.requestId, firstResult.requestId);
  assert.deepEqual(Object.keys(secondResult).sort(), ['success', 'duplicate', 'requestId', 'message'].sort());
  assert.equal(calls.filter((call) => call.url.endsWith('/records')).length, createCount);
});

test('per-record Apper failure returns a generic error and retry reuses the customer', async () => {
  clearMock();
  failServiceRequestCreate = true;
  const failed = await handler(bookingRequest());
  const failedResult = await failed.json();
  assert.equal(failed.status, 503);
  assert.equal(failedResult.message, 'Booking is temporarily unavailable');
  assert.equal(JSON.stringify(failedResult).includes('simulated failure'), false);
  assert.equal(recordsFor('customer_profiles_c').length, 1);
  assert.equal(recordsFor('service_requests_c').length, 0);
  assert.equal(recordsFor('guest_booking_guard_c').find((row) => row.Name.startsWith('idem:')).status_c, 'Failed');

  failServiceRequestCreate = false;
  const retried = await handler(bookingRequest());
  const retryResult = await retried.json();
  assert.equal(retried.status, 200);
  assert.equal(retryResult.success, true);
  assert.equal(recordsFor('customer_profiles_c').length, 1);
  assert.equal(recordsFor('service_requests_c').length, 1);
  assert.equal(recordsFor('guest_booking_guard_c').filter((row) => row.Name.startsWith('idem:')).length, 2);
});

test('booking rejects client total manipulation and unsafe markers in names', async () => {
  clearMock();
  const malformed = bookingRequest({ serviceDetails: {
    vehicleType: 'small',
    items: [{ title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }],
    pickupDropRequested: false,
    subtotal: 1,
    platformFee: 25,
    pickupDropCharge: 0,
    total: 26,
  } });
  const response = await handler(malformed);
  assert.equal(response.status, 400);
  assert.equal(recordsFor('customer_profiles_c').length, 0);
});


test('guard hourly limits rate-limit before customer or request writes', async () => {
  clearMock();
  const phoneHash = hmac('phone', '+919876543210');
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
  database.set('guest_booking_guard_c', [{ Id: 1001, Name: `rate:${phoneHash}:${hour}`, attempts_c: 5 }]);
  const response = await handler(bookingRequest());
  assert.equal(response.status, 429);
  assert.equal(recordsFor('customer_profiles_c').length, 0);
  assert.equal(recordsFor('service_requests_c').length, 0);
});

test('missing/unwritable guard fails closed before customer and request writes', async () => {
  clearMock();
  failGuard = true;
  const missing = await handler(bookingRequest());
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).message, 'Booking is temporarily unavailable');
  assert.equal(recordsFor('customer_profiles_c').length, 0);
  failGuard = false;
  failGuardDoneUpdate = false;
  competingClaim = false;
  guardSecret = 'test-only-guard-secret';
  // The first guard write itself fails after successful reads.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/guest_booking_guard_c/records')) return makeResponse({ success: false }, 404);
    return originalFetch(url, options);
  };
  try {
    const unwritable = await handler(bookingRequest());
    assert.equal(unwritable.status, 503);
    assert.equal(recordsFor('service_requests_c').length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('manual location without coordinates is flagged, never written as a false coordinate', async () => {
  clearMock();
  const response = await handler(bookingRequest({ latitude: undefined, longitude: undefined }));
  assert.equal(response.status, 200);
  const record = recordsFor('service_requests_c')[0];
  assert.match(record.location_c, /^\[LOCATION VERIFICATION PENDING\] /);
  assert.equal('latitude_c' in record, false);
  assert.equal('longitude_c' in record, false);
  assert.doesNotMatch(record.problem_description_c, /LOCAL_GUEST_/);
  assert.equal(recordsFor('customer_profiles_c')[0].location_c, 'TEST ONLY, Naini, Prayagraj');
});

test('coordinates outside 25 km are rejected before guard or booking writes', async () => {
  clearMock();
  const response = await handler(bookingRequest({ latitude: 25.382, longitude: 82.2 }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('network hash rate cap prevents a fresh phone from booking', async () => {
  clearMock();
  const ipHash = hmac('ip', '203.0.113.77');
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
  database.set('guest_booking_guard_c', [{ Id: 1001, Name: `rate:${ipHash}:${hour}`, attempts_c: 5 }]);
  const response = await handler(bookingRequest({}, { 'x-forwarded-for': '203.0.113.77' }));
  assert.equal(response.status, 429);
  assert.equal(recordsFor('customer_profiles_c').length, 0);
  assert.equal(recordsFor('service_requests_c').length, 0);
});

test('manual-only location prefix is bounded to 220 characters', async () => {
  clearMock();
  const response = await handler(bookingRequest({ latitude: undefined, longitude: undefined, location: 'A'.repeat(220) }));
  assert.equal(response.status, 200);
  const location = recordsFor('service_requests_c')[0].location_c;
  assert.equal(location.length, 220);
  assert.match(location, /^\[LOCATION VERIFICATION PENDING\] /);
});

test('final Done update failure does not falsely report success', async () => {
  clearMock();
  failGuardDoneUpdate = true;
  const response = await handler(bookingRequest());
  assert.equal(response.status, 503);
  assert.equal(recordsFor('service_requests_c').length, 1);
  assert.equal(recordsFor('guest_booking_guard_c').find((row) => row.Name.startsWith('idem:')).status_c, 'Pending');
});

test('missing HMAC secret fails closed without accessing guard or writing bookings', async () => {
  clearMock();
  guardSecret = '';
  const response = await handler(bookingRequest());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { success: false, message: 'Booking is temporarily unavailable' });
  assert.equal(calls.length, 0);
});

test('fresh Pending claim returns 409 before creating a customer/request', async () => {
  clearMock();
  database.set('guest_booking_guard_c', [{
    Id: 1001, Name: `idem:${hmac('idem', '11111111-1111-4111-8111-111111111111')}`,
    status_c: 'Pending', created_at_c: new Date().toISOString(), attempts_c: 1,
  }]);
  const response = await handler(bookingRequest());
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /in progress/i);
  assert.equal(recordsFor('customer_profiles_c').length, 0);
});

test('stale Pending claim permits a new claim and completes booking', async () => {
  clearMock();
  database.set('guest_booking_guard_c', [{
    Id: 1001, Name: `idem:${hmac('idem', '11111111-1111-4111-8111-111111111111')}`,
    status_c: 'Pending', created_at_c: new Date(Date.now() - 3 * 60000).toISOString(), attempts_c: 1,
  }]);
  const response = await handler(bookingRequest());
  assert.equal(response.status, 200);
  assert.equal(recordsFor('guest_booking_guard_c').find((row) => row.Name.startsWith('idem:') && row.status_c === 'Done').request_id_c, 901);
});

test('simulated concurrent claim elects the lowest Id and loser creates nothing', async () => {
  clearMock();
  competingClaim = true;
  const response = await handler(bookingRequest());
  assert.equal(response.status, 409);
  assert.equal(recordsFor('customer_profiles_c').length, 0);
  assert.equal(recordsFor('service_requests_c').length, 0);
  assert.equal(recordsFor('guest_booking_guard_c').find((row) => row.Id === 1002).status_c, 'Failed');
});

test('guard keys are domain-separated 32-hex HMACs and no booking response exposes identifiers', async () => {
  clearMock();
  const rawIdem = '11111111-1111-4111-8111-111111111111';
  const phone = '+919876543210';
  const ip = '203.0.113.77';
  const first = await handler(bookingRequest({}, { 'x-forwarded-for': ip }));
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  const duplicate = await handler(bookingRequest({}, { 'x-forwarded-for': ip }));
  assert.equal(duplicate.status, 200);
  const duplicateBody = await duplicate.json();
  const names = recordsFor('guest_booking_guard_c').map((row) => row.Name);
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
  assert.ok(names.includes(`idem:${hmac('idem', rawIdem)}`));
  assert.ok(names.includes(`rate:${hmac('phone', phone)}:${hour}`));
  assert.ok(names.includes(`rate:${hmac('ip', ip)}:${hour}`));
  assert.notEqual(hmac('phone', phone), hmac('ip', phone));
  assert.equal(names.some((name) => name.includes(phone) || name.includes(ip) || name.includes(rawIdem)), false);
  assert.equal(JSON.stringify(recordsFor('guest_booking_guard_c')).includes(ip), false);
  for (const body of [firstBody, duplicateBody]) {
    const serialized = JSON.stringify(body);
    for (const value of [rawIdem, phone, ip, hmac('idem', rawIdem), hmac('phone', phone), hmac('ip', ip), guardSecret]) {
      assert.equal(serialized.includes(value), false);
    }
  }
});

test('nearby provider API returns coarse fields only and applies discovery radius', async () => {
  clearMock();
  database.set('technician_profiles_c', [{
    Id: 70,
    Name: 'Mira Singh',
    verification_status_c: 'Approved',
    status_c: 'Active',
    availability_c: 'Available Now',
    latitude_c: 25.382,
    longitude_c: 81.885,
    service_radius_km_c: 10,
    phone_c: '+919999999999',
  }]);
  database.set('service_provider_capabilities_c', [{
    Id: 71,
    technician_c: 70,
    capability_c: 39,
    status_c: 'Active',
  }]);
  const response = await handler(new Request('https://edge.test/guest-create-service-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'nearbyProviders', latitude: 25.382, longitude: 81.875, serviceKey: 'car-wash', radiusKm: 75 }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.radiusKm, 50);
  assert.equal(result.providers.length, 1);
  assert.deepEqual(Object.keys(result.providers[0]).sort(), ['providerHash', 'name', 'distanceKm', 'availability'].sort());
  assert.equal(result.providers[0].name, 'Mira');
  assert.ok(result.providers[0].distanceKm <= 2);
  assert.equal(JSON.stringify(result).includes('9999999999'), false);
  assert.equal('Id' in result.providers[0], false);
  assert.equal('latitude' in result.providers[0], false);
  assert.equal('longitude' in result.providers[0], false);
});
