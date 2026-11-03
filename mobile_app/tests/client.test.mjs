// Sandbox test of src/api/client.js response handling with a mocked fetch (no network, no Expo runtime).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/api/client.js', import.meta.url), 'utf8');
assert.match(source, /^import \* as Crypto from 'expo-crypto';\n/);
const body = source.replace(/^import \* as Crypto from 'expo-crypto';\n/, '').replace(/^export /gm, '');
function load(fetchImpl, apiBase = 'https://edge.example.test/fn') {
  return new Function('process', 'fetch', 'Crypto', `${body}\nreturn { postAction };`)({ env: { EXPO_PUBLIC_API_BASE: apiBase } }, fetchImpl, {});
}
const reply = (status, json) => async () => new Response(JSON.stringify(json), { status });

test('202 pending is returned as pending (not success, not an error)', async () => {
  const { postAction } = load(reply(202, { success: true, pending: true, status: 'pending', message: 'Your booking is being confirmed. Please do not submit it again. Customer Care will confirm it.' }));
  const result = await postAction('createBooking', { idempotencyKey: 'k' });
  assert.deepEqual(result, { pending: true, message: 'Your booking is being confirmed. Please do not submit it again. Customer Care will confirm it.' });
  assert.equal('requestId' in result, false);
});

test('200 success passes through; 409/429/503 throw the server message', async () => {
  assert.equal((await load(reply(200, { success: true, requestId: 'abc' })).postAction('createBooking', {})).requestId, 'abc');
  for (const status of [409, 429, 503]) {
    await assert.rejects(load(reply(status, { success: false, message: `m${status}` })).postAction('createBooking', {}), new RegExp(`m${status}`));
  }
});

test('sends the Idempotency-Key header and uses EXPO_PUBLIC_API_BASE only', async () => {
  let seen;
  const { postAction } = load(async (url, init) => { seen = { url, init }; return new Response('{"success":true}', { status: 200 }); });
  await postAction('createBooking', { idempotencyKey: 'abc' });
  assert.equal(seen.url, 'https://edge.example.test/fn');
  assert.equal(seen.init.headers['Idempotency-Key'], 'abc');
  assert.equal('Authorization' in seen.init.headers, false);
  await assert.rejects(load(reply(200, {}), '').postAction('catalog', {}), /not configured/);
});
