// Car Wash catalogue / pricing consistency: web (approved source of truth, read-only) vs mobile vs edge server.
// Web source: ../../src/pages/CustomerRequestStart.jsx in a full repository checkout (override with
// LOCAL_WEB_SOURCE=<path>). If it is not present the web comparison is skipped and reported as skipped.
// Sandbox test only: no network, no Apper/Redis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pricing from '../src/services/pricing.js';

const SUV_RE = /SUV|Big Car/i; // vehicle-type rule used identically by web, mobile and server
const edgeSource = await readFile(new URL('../edge-function-draft/guest-create-service-request.js', import.meta.url), 'utf8');
const getSecretCalls = [];
globalThis.apper = globalThis.apper ?? { serve() {}, async getSecret(name) { getSecretCalls.push(name); return undefined; } };
const server = new Function(`${edgeSource.replace(/apper\.serve\(handler\);\s*$/, '')}\nreturn { handler, WASH_CATALOG, WASH_PLATFORM_FEE, PICKUP_DROP_FEE, validateWashDetails };`)();

const webPath = process.env.LOCAL_WEB_SOURCE || fileURLToPath(new URL('../../src/pages/CustomerRequestStart.jsx', import.meta.url));
const webSource = existsSync(webPath) ? await readFile(webPath, 'utf8') : null;

function extractBlock(text, header, open, close) {
  const start = text.indexOf(header);
  assert.ok(start >= 0, `missing ${header}`);
  let depth = 0;
  for (let i = text.indexOf(open, start); i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    if (text[i] === close) { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('unbalanced block');
}
function loadWeb() {
  const options = extractBlock(webSource, 'const CAR_WASH_OPTIONS = [', '[', ']');
  const getWashPrice = extractBlock(webSource, 'function getWashPrice(item) {', '{', '}');
  const web = new Function(`${options};\n${getWashPrice}\nreturn { CAR_WASH_OPTIONS, getWashPrice };`)();
  const fees = [...webSource.matchAll(/const CAR_WASH_PLATFORM_FEE = (\d+);/g)].map((m) => Number(m[1]));
  const pickups = [...webSource.matchAll(/includePickupDrop \? (\d+) : 0/g)].map((m) => Number(m[1]));
  assert.equal(fees.length, 1);
  assert.ok(pickups.length >= 2);
  assert.equal(new Set(pickups).size, 1);
  // Web total formula (display and review): subtotal + pickup/drop + platform fee, integer rupees, no rounding.
  assert.ok(webSource.includes('const estimatedTotalValue = washCartSummary.subtotal + pickupDropCharge + CAR_WASH_PLATFORM_FEE;'));
  assert.ok(webSource.includes("const nextTotal = nextSubtotal + (includePickupDrop ? 100 : 0) + CAR_WASH_PLATFORM_FEE;"));
  // No catalogue variant carries an `extra` flag, so the web add-on path (Body Polish / Seat removal extras) is inert.
  assert.equal(web.CAR_WASH_OPTIONS.some((o) => o.prices.some((p) => 'extra' in p)), false);
  const total = (cart, pickup) => cart.reduce((sum, item) => sum + web.getWashPrice({ title: item.title, variant: item.variant, addons: [] }) * item.quantity, 0) + (pickup ? pickups[0] : 0) + fees[0];
  return { catalog: web.CAR_WASH_OPTIONS, fee: fees[0], pickup: pickups[0], total };
}

const project = (catalog) => catalog.map((option) => ({
  id: option.title, // there is no separate id field: identity is the title, line id is `${title}::${variant}`
  title: option.title,
  variants: option.prices.map((price) => ({ id: `${option.title}::${price.label}`, label: price.label, vehicleType: SUV_RE.test(price.label) ? 'suv' : 'small', price: price.price })),
}));

const SAMPLE_CARTS = [
  { vehicleType: 'small', pickup: false, items: [{ title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }] },
  { vehicleType: 'small', pickup: true, items: [{ title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 2 }, { title: 'Interior Only', variant: 'Small Car (Hatchback / Sedan)', quantity: 3 }] },
  { vehicleType: 'suv', pickup: true, items: [{ title: 'Exterior Only', variant: 'SUV / Big Car — With Body Polish', quantity: 1 }, { title: 'Interior Deep Clean', variant: 'SUV / Big Car — With Seat Removal & Refitting', quantity: 1 }, { title: 'Rubbing & Detailing', variant: 'SUV / Big Car — Premium', quantity: 5 }] },
  { vehicleType: 'small', pickup: false, items: [{ title: 'Exterior Only', variant: 'Small Car — Without Body Polish', quantity: 4 }, { title: 'Interior Deep Clean', variant: 'Small Car — Without Seat Removal & Refitting', quantity: 1 }, { title: 'Rubbing & Detailing', variant: 'Small Car — Basic', quantity: 1 }, { title: 'Interior Only', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }, { title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 }] },
  { vehicleType: 'suv', pickup: false, items: [{ title: 'Complete Car Wash', variant: 'SUV / Big Car', quantity: 1 }, { title: 'Interior Only', variant: 'SUV / Big Car', quantity: 1 }] },
];
// Every single variant, with and without Pickup & Drop.
for (const option of pricing.CAR_WASH_OPTIONS) {
  for (const price of option.prices) {
    for (const pickup of [false, true]) SAMPLE_CARTS.push({ vehicleType: SUV_RE.test(price.label) ? 'suv' : 'small', pickup, items: [{ title: option.title, variant: price.label, quantity: 1 }] });
  }
}
const details = (cart) => ({ vehicleType: cart.vehicleType, items: cart.items, pickupDropRequested: cart.pickup, ...pricing.calculateWashTotals(cart.items, cart.pickup) });

test('mobile and server catalogues are exactly equal (ids, names, vehicle types, prices, fee, pickup/drop)', () => {
  assert.deepEqual(project(server.WASH_CATALOG), project(pricing.CAR_WASH_OPTIONS));
  assert.equal(server.WASH_PLATFORM_FEE, pricing.CAR_WASH_PLATFORM_FEE);
  assert.equal(server.PICKUP_DROP_FEE, pricing.PICKUP_DROP_FEE);
  assert.equal(pricing.CAR_WASH_PLATFORM_FEE, 25);
  assert.equal(pricing.PICKUP_DROP_FEE, 100);
  assert.equal(project(pricing.CAR_WASH_OPTIONS).flatMap((o) => o.variants).length, 16);
});

test('web (approved source) catalogue, fee, pickup/drop and totals equal mobile and server', (t) => {
  if (!webSource) { t.skip(`web source not present at ${webPath}`); return; }
  const web = loadWeb();
  assert.deepEqual(project(web.catalog), project(pricing.CAR_WASH_OPTIONS));
  assert.deepEqual(project(web.catalog), project(server.WASH_CATALOG));
  assert.deepEqual(web.catalog.map((o) => o.description), pricing.CAR_WASH_OPTIONS.map((o) => o.description));
  assert.equal(web.fee, pricing.CAR_WASH_PLATFORM_FEE);
  assert.equal(web.fee, server.WASH_PLATFORM_FEE);
  assert.equal(web.pickup, pricing.PICKUP_DROP_FEE);
  assert.equal(web.pickup, server.PICKUP_DROP_FEE);
  for (const cart of SAMPLE_CARTS) assert.equal(pricing.calculateWashTotals(cart.items, cart.pickup).total, web.total(cart.items, cart.pickup), JSON.stringify(cart));
});

test('mobile totals equal server-recomputed totals on sample carts (integer rupees, no rounding)', () => {
  const expected = [425, 1525, 56025, 7325, 825]; // hand-computed from the web menu
  SAMPLE_CARTS.forEach((cart, index) => {
    const submitted = details(cart);
    const checked = server.validateWashDetails(submitted);
    assert.ok(checked, JSON.stringify(cart));
    assert.equal(checked.subtotal, submitted.subtotal);
    assert.equal(checked.pickupDropCharge, submitted.pickupDropCharge);
    assert.equal(checked.total, submitted.total);
    assert.equal(submitted.total, submitted.subtotal + 25 + (cart.pickup ? 100 : 0));
    assert.ok(Number.isInteger(submitted.total));
    if (index < expected.length) assert.equal(submitted.total, expected[index]);
  });
});

test('server rejects a client total (or subtotal/fee/pickup charge) that differs by 1 rupee, before any secret or call', async () => {
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('no network in this test'); };
  const secretsBefore = getSecretCalls.length;
  try {
    for (const cart of SAMPLE_CARTS.slice(0, 5)) {
      const good = details(cart);
      for (const [field, delta] of [['total', 1], ['total', -1], ['subtotal', 1], ['subtotal', -1], ['platformFee', 1], ['platformFee', -1], ['pickupDropCharge', 1], ['pickupDropCharge', -1]]) {
        const bad = { ...good, [field]: good[field] + delta };
        assert.equal(server.validateWashDetails(bad), null);
        const response = await server.handler(new Request('https://edge.test/fn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          action: 'createBooking', fullName: 'ZZ TEST LOCAL MOBILE', mobile: '9000000001', location: 'ZZ TEST - DO NOT DISPATCH - Naini, Prayagraj',
          latitude: 25.382, longitude: 81.875, serviceKey: 'car-wash', serviceDetails: bad, idempotencyKey: '22222222-2222-4222-8222-222222222222',
        }) }));
        assert.equal(response.status, 400, `${field}${delta}`);
        assert.deepEqual(await response.json(), { success: false, message: 'Car Wash details or submitted totals do not match the current menu.' });
      }
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetchCalls, 0);
  assert.equal(getSecretCalls.length, secretsBefore);
});

test('Car Wash screen uses the shared pricing module and its fee/pickup copy matches the constants', async () => {
  const screen = await readFile(new URL('../src/screens/CarWashScreen.js', import.meta.url), 'utf8');
  assert.match(screen, /import \{ CAR_WASH_OPTIONS, calculateWashTotals \} from '\.\.\/services\/pricing';/);
  assert.doesNotMatch(screen, /price:\s*\d/); // no local price table in the screen
  assert.ok(screen.includes(`Platform fee is ₹${pricing.CAR_WASH_PLATFORM_FEE} per booking`));
  assert.ok(screen.includes(`Indicative menu charge ₹${pricing.PICKUP_DROP_FEE}`));
  assert.ok(screen.includes(`Request Pickup & Drop · ₹${pricing.PICKUP_DROP_FEE}`));
  const catalogResponse = await server.handler(new Request('https://edge.test/fn', { method: 'POST', body: JSON.stringify({ action: 'catalog' }) }));
  const catalog = await catalogResponse.json();
  assert.equal(catalog.services[0].platformFee, pricing.CAR_WASH_PLATFORM_FEE);
  assert.deepEqual(project(catalog.services[0].options), project(pricing.CAR_WASH_OPTIONS));
});
