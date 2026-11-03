import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const fields = {
  customer_profiles_c: { Name: 'Text', phone_c: 'Text', location_c: 'Text', status_c: 'Picklist' },
  service_requests_c: {
    Name: 'Text', customer_c: 'Lookup', service_category_c: 'Lookup', required_capability_c: 'Lookup', device_type_c: 'Text',
    problem_description_c: 'MultilineText', location_c: 'Text', service_area_c: 'Text', latitude_c: 'Decimal', longitude_c: 'Decimal',
    status_c: 'Picklist', preferred_time_c: 'Picklist', requested_at_c: 'DateTime', scheduled_at_c: 'DateTime',
    service_mode_c: 'Picklist', pricing_mode_c: 'Picklist', pricing_mode_description_c: 'MultilineText',
  },
  service_categories_c: { Name: 'Text', status_c: 'Picklist' },
  service_capabilities_c: { Name: 'Text', status_c: 'Picklist' },
};
const options = {
  customer_profiles_c: { status_c: ['Active', 'Blocked'] },
  service_requests_c: { status_c: ['Open', 'Quoted', 'Negotiating', 'Confirmed', 'Completed', 'Cancelled'], preferred_time_c: ['ASAP', 'Scheduled', 'Within 1 hour', 'Today', 'Tomorrow'], service_mode_c: ['Normal', 'Urgent', 'Emergency'], pricing_mode_c: ['Fixed Price', 'Provider Quote', 'Urgent Dispatch'] },
  service_categories_c: { status_c: ['Active', 'Paused'] },
  service_capabilities_c: { status_c: ['Active', 'Paused'] },
};
function checkReadOnly(overrides = {}) {
  const prelude = `const fields = ${JSON.stringify(fields)};
const options = ${JSON.stringify(options)};
const calls = [];
globalThis.fetch = async (url, init) => {
  const path = new URL(url).pathname;
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ method: init.method, path, body });
  if (init.method === 'GET' && path === '/v1/meta/test-app/tables') {
    return Response.json({ success: true, data: Object.keys(fields).map((name) => ({ name })) });
  }
  const match = path.match(/^\\/v1\\/meta\\/test-app\\/tables\\/([^/]+)\\/fields$/);
  if (init.method === 'GET' && match) {
    if (match[1] === 'guest_booking_guard_c') return Response.json({ success: false, message: 'Table guest_booking_guard_c does not exist' });
    return Response.json({ success: true, data: Object.entries(fields[match[1]]).map(([name, type]) => ({ name, type, options: options[match[1]]?.[name] })) });
  }
  if (init.method === 'POST' && ['service_categories_c', 'service_capabilities_c'].some((table) => path === '/v1/data/test-app/tables/' + table)) {
    const name = path.endsWith('service_categories_c') ? 'Car Assistance' : 'Car Wash';
    return Response.json({ success: true, data: [{ Id: '01a144b6-ef8a-71fc-8bbb-3e16e0f647c0', Name: name, status_c: 'Active' }] });
  }
  throw new Error('Unexpected request');
};
process.on('exit', () => console.log('MOCK_CALLS=' + JSON.stringify(calls)));
`;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(prelude)}`, 'scripts/live-readonly-check.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8', env: { ...process.env, APPER_API_KEY: 'test-key', APPER_APP_ID: 'test-app', ...overrides },
  });
  return result;
}

test('read-only verifier touches only five metadata endpoints and two non-personal list queries', () => {
  const result = checkReadOnly();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /guest_booking_guard_c: MISSING/);
  const calls = JSON.parse(result.stdout.split('MOCK_CALLS=')[1]);
  assert.equal(calls.filter(({ method }) => method === 'GET').length, 6);
  assert.equal(calls.filter(({ method }) => method === 'POST').length, 2);
  assert.equal(calls.some(({ path }) => path.includes('technician_profiles_c')), false);
  assert.equal(calls.some(({ path, method }) => method === 'POST' && path.includes('customer_profiles_c')), false);
  for (const call of calls.filter(({ method }) => method === 'POST')) {
    assert.deepEqual(call.body.fields, ['Id', 'Name', 'status_c']);
    assert.equal(call.body.where[0].operator, 'EqualTo');
  }
});

test('read-only verifier refuses to proceed without environment config', () => {
  const result = checkReadOnly({ APPER_API_KEY: '' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /test-key/);
});
