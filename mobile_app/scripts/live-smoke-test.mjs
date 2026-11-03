import { randomUUID } from 'node:crypto';

const apiBase = process.env.EXPO_PUBLIC_API_BASE?.trim();
const mobile = process.env.LOCAL_SMOKE_TEST_MOBILE?.trim();
if (!apiBase || apiBase.includes('YOUR-APPER-EDGE-FUNCTION-URL')) {
  throw new Error('Set EXPO_PUBLIC_API_BASE to the deployed guest booking edge function URL.');
}
if (!mobile) throw new Error('Set LOCAL_SMOKE_TEST_MOBILE to an explicitly authorized test mobile number.');

const idempotencyKey = randomUUID();
const body = {
  action: 'createBooking',
  fullName: `TEST Booking ${new Date().toISOString().slice(0, 10)}`,
  mobile,
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
};

const response = await fetch(apiBase, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify(body),
});
const result = await response.json();
if (!response.ok || result.success !== true) {
  throw new Error(`Smoke test failed with HTTP ${response.status}: ${result.message || 'No public error message'}`);
}
console.log(JSON.stringify({
  success: true,
  testLabel: body.fullName,
  requestId: result.requestId,
  duplicate: result.duplicate === true,
  note: 'This creates a TEST-labelled customer booking in the configured LOCAL app.',
}, null, 2));
