import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const edgePath = new URL('../../edge-function/guest-create-service-request.js', import.meta.url);
const source = await readFile(edgePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const database = new Map();
const calls = [];
let failServiceRequestCreate = false;
let handler;

globalThis.Deno = { env: { get: (name) => ({ APPER_API_KEY: 'unit-test-key', APPER_APP_ID: 'app-test-id' })[name] } };
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

  if (tablePath.endsWith('/records')) {
    assert.equal(method, 'POST');
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
      const created = { Id: targetTable === 'customer_profiles_c' ? 201 : 901, ...record, CreatedOn: new Date().toISOString() };
      stored.push(created);
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

const edge = await import(moduleUrl);

function clearMock() {
  database.clear();
  calls.length = 0;
  failServiceRequestCreate = false;
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
  assert.deepEqual(Object.keys(customerCreate.body.records[0]).sort(), ['Name', 'phone_c', 'location_c', 'latitude_c', 'longitude_c', 'status_c'].sort());
  assert.equal(customerCreate.body.records[0].phone_c, '+919876543210');
  assert.equal('Owner' in customerCreate.body.records[0], false);
  assert.equal('email_c' in customerCreate.body.records[0], false);
  const requestRecord = requestCreate.body.records[0];
  assert.equal(requestRecord.customer_c, 201);
  assert.equal(requestRecord.service_category_c, 18);
  assert.equal(requestRecord.required_capability_c, 39);
  assert.equal(requestRecord.device_type_c, 'Mobile');
  assert.match(requestRecord.problem_description_c, /LOCAL_GUEST_IDEMPOTENCY:11111111-1111-4111-8111-111111111111/);
  assert.match(requestRecord.problem_description_c, /LOCAL Platform Fee: ₹25/);
  assert.match(requestRecord.problem_description_c, /CAR_WASH_DECISIONS_JSON:/);
  assert.equal(requestRecord.status_c, 'Open');
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
  assert.equal(calls.filter((call) => call.url.endsWith('/records')).length, createCount);
});

test('per-record Apper failure returns a generic error and retry reuses the customer', async () => {
  clearMock();
  failServiceRequestCreate = true;
  const failed = await handler(bookingRequest());
  const failedResult = await failed.json();
  assert.equal(failed.status, 502);
  assert.match(failedResult.message, /could not complete/i);
  assert.equal(JSON.stringify(failedResult).includes('simulated failure'), false);
  assert.equal(recordsFor('customer_profiles_c').length, 1);
  assert.equal(recordsFor('service_requests_c').length, 0);

  failServiceRequestCreate = false;
  const retried = await handler(bookingRequest());
  const retryResult = await retried.json();
  assert.equal(retried.status, 200);
  assert.equal(retryResult.success, true);
  assert.equal(recordsFor('customer_profiles_c').length, 1);
  assert.equal(recordsFor('service_requests_c').length, 1);
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


test('DB-derived hourly limits rate-limit by phone and forwarded IP without exposing either value', async () => {
  clearMock();
  const now = new Date().toISOString();
  const phoneHash = createHash('sha256').update('+919876543210').digest('hex');
  const ipHash = createHash('sha256').update('203.0.113.77').digest('hex');
  database.set('service_requests_c', Array.from({ length: 5 }, (_, index) => ({
    Id: index + 1,
    Name: 'Prior test request',
    CreatedOn: now,
    problem_description_c: `LOCAL_GUEST_RATE_PHONE:${phoneHash}\nLOCAL_GUEST_RATE_IP:${ipHash}`,
  })));
  const response = await handler(bookingRequest({}, { 'x-forwarded-for': '203.0.113.77' }));
  const result = await response.json();
  assert.equal(response.status, 429);
  assert.match(result.message, /too many/i);
  assert.equal(JSON.stringify(result).includes('9876543210'), false);
  assert.equal(recordsFor('customer_profiles_c').length, 0);
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
