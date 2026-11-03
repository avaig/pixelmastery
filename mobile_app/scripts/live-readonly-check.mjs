import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiKey = process.env.APPER_API_KEY;
const appId = process.env.APPER_APP_ID;
if (!apiKey || !appId) throw new Error('Set APPER_API_KEY and APPER_APP_ID in the server shell environment.');
const root = 'https://api.apper.io/v1';
// Read-only metadata check for the four Apper tables the guest-booking function touches for writes/lookups.
// Guard state lives in Upstash Redis (not Apper), so there is no guard table to check.
const tables = ['customer_profiles_c', 'service_requests_c', 'service_categories_c', 'service_capabilities_c'];
const expected = {
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
const choices = {
  customer_profiles_c: { status_c: ['Active', 'Blocked'] },
  service_requests_c: {
    status_c: ['Open', 'Quoted', 'Negotiating', 'Confirmed', 'Completed', 'Cancelled'],
    preferred_time_c: ['ASAP', 'Scheduled', 'Within 1 hour', 'Today', 'Tomorrow'],
    service_mode_c: ['Normal', 'Urgent', 'Emergency'],
    pricing_mode_c: ['Fixed Price', 'Provider Quote', 'Urgent Dispatch'],
  },
  service_categories_c: { status_c: ['Active', 'Paused'] },
  service_capabilities_c: { status_c: ['Active', 'Paused'] },
};
const source = await readFile(new URL('../edge-function-draft/guest-create-service-request.js', import.meta.url), 'utf8');
const allowlistText = source.match(/const TABLE_ALLOWLIST = Object\.freeze\((\{[\s\S]*?\n\})\);\n/);
assert.ok(allowlistText, 'Edge allowlist not found; stop rather than assuming fields.');
const allowlist = new Function(`return (${allowlistText[1]});`)();

async function request(method, path, body) {
  const response = await fetch(`${root}/${path}`, {
    method, headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${method} metadata/list returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.success === false) throw new Error(`${method} metadata/list reported failure`);
  return result;
}
function rows(result) {
  const data = result?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.fields)) return data.fields;
  if (Array.isArray(result?.items)) return result.items;
  throw new Error('Unexpected metadata/list response shape');
}
const tableNames = rows(await request('GET', `meta/${encodeURIComponent(appId)}/tables`))
  .map((table) => table.name ?? table.Name ?? table.tableName);
console.log('GET tables list: OK');
for (const table of tables) {
  const result = await request('GET', `meta/${encodeURIComponent(appId)}/tables/${table}/fields`);
  if (!result) throw new Error(`Required table ${table} missing`);
  assert.ok(tableNames.includes(table), `${table} missing from tables list`);
  const fields = new Map(rows(result).map((field) => [field.name ?? field.Name ?? field.fieldName, field]));
  for (const fieldName of new Set([...allowlist[table].read, ...allowlist[table].write])) {
    if (['Id', 'CreatedOn'].includes(fieldName)) continue; // platform fields, not custom field metadata
    const field = fields.get(fieldName);
    assert.ok(field, `${table}.${fieldName} missing`);
    const actualType = field.type ?? field.Type ?? field.fieldType;
    assert.equal(actualType, expected[table][fieldName], `${table}.${fieldName} type`);
    const requiredChoices = choices[table]?.[fieldName];
    if (requiredChoices) {
      const raw = field.options ?? field.Options ?? field.picklistValues ?? field.values ?? field.picklistOptions;
      assert.ok(Array.isArray(raw), `${table}.${fieldName} options absent`);
      const actual = raw.map((option) => typeof option === 'string' ? option : option.value ?? option.name ?? option.label);
      assert.deepEqual([...actual].sort(), [...requiredChoices].sort(), `${table}.${fieldName} options`);
    }
  }
  console.log(`${table}: metadata allowlist fields/types OK`);
}
// Provider tables are deliberately not fetched: this check is limited to the four named tables.
// Their read allowlists were inspected separately in the supplied live schema findings.
for (const [table, name] of [['service_categories_c', 'Car Assistance'], ['service_capabilities_c', 'Car Wash']]) {
  const result = await request('POST', `data/${encodeURIComponent(appId)}/tables/${table}`, {
    fields: ['Id', 'Name', 'status_c'], where: [{ fieldName: 'Name', operator: 'EqualTo', values: [name] }], pagingInfo: { limit: 10, offset: 0 },
  });
  const matches = rows(result).filter((row) => row.Name === name);
  assert.equal(matches.length, 1, `${table} ${name}: expected exactly one`);
  assert.equal(matches[0].status_c, 'Active');
  assert.match(matches[0].Id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  console.log(`${table}: exact Name filter ${name} => one Active UUID record (Id not printed)`);
}
console.log('Read-only check complete. No personal rows read and no writes performed.');
