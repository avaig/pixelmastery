import test from 'node:test';
import assert from 'node:assert/strict';
import pricing from '../src/services/pricing.js';
import serviceArea from '../src/utils/serviceArea.js';
import config from '../src/config.js';
const { checkServiceability, getDistanceKm } = serviceArea;
const { SERVICE_AREA } = config;

const { calculateWashTotals } = pricing;

test('Car Wash totals use catalogue line prices, one platform fee, and optional pickup/drop', () => {
  const cart = [
    { title: 'Complete Car Wash', variant: 'Small Car (Hatchback / Sedan)', quantity: 1 },
    { title: 'Interior Only', variant: 'Small Car (Hatchback / Sedan)', quantity: 2 },
  ];
  assert.deepEqual(calculateWashTotals(cart, false), {
    subtotal: 800,
    platformFee: 25,
    pickupDropCharge: 0,
    total: 825,
  });
  assert.deepEqual(calculateWashTotals(cart, true), {
    subtotal: 800,
    platformFee: 25,
    pickupDropCharge: 100,
    total: 925,
  });
});

test('Car Wash totals ignore unknown menu variants instead of trusting client price fields', () => {
  assert.deepEqual(calculateWashTotals([
    { title: 'Complete Car Wash', variant: 'Made up', quantity: 2, price: 1 },
  ], false), { subtotal: 0, platformFee: 25, pickupDropCharge: 0, total: 25 });
});

test('haversine helper handles zero distance and Naini coverage boundary', () => {
  assert.equal(getDistanceKm(25.382, 81.875, 25.382, 81.875), 0);
  const inside = checkServiceability(25.382, 81.875, SERVICE_AREA);
  assert.equal(inside.distanceKm, 0);
  assert.equal(inside.serviceable, true);
  const outside = checkServiceability(25.382, 82.2, SERVICE_AREA);
  assert.equal(outside.serviceable, false);
});

test('haversine helper rejects invalid coordinates', () => {
  assert.equal(getDistanceKm(100, 0, 0, 0), null);
  assert.equal(getDistanceKm(Number.NaN, 0, 0, 0), null);
  assert.equal(getDistanceKm(null, 0, 0, 0), null);
});
