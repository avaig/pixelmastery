// Sandbox test: the Nearby screen is disabled for the first live milestone and makes no network/location call.
// The screen file contains JSX, so this test extracts the plain-JS findProviders() function from the exact
// source and runs it with stubbed state setters, Location and postAction (no Expo/React runtime).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../src/config.js';

const source = await readFile(new URL('../src/screens/NearbyScreen.js', import.meta.url), 'utf8');

function extractFunction(text, header) {
  const start = text.indexOf(header);
  assert.ok(start >= 0, `missing ${header}`);
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('unbalanced function');
}

test('Nearby is disabled by a constant and shows the later-release message', () => {
  assert.match(source, /^const NEARBY_PROVIDERS_ENABLED = false;$/m);
  assert.match(source, /'Nearby providers will be available in a later release\.'/);
  // Search button is only rendered when enabled; map/GPS/search code is retained.
  assert.match(source, /\{NEARBY_PROVIDERS_ENABLED \? <AppButton title=\{loading \? 'Checking nearby providers…' : 'Use my location & search'\}/);
  assert.match(source, /postAction\('nearbyProviders'/);
  assert.match(source, /Location\.requestForegroundPermissionsAsync\(\)/);
  assert.match(source, /<MapView /);
  // Discovery radius config is untouched.
  assert.equal(config.DISCOVERY_RADIUS_KM, 15);
});

test('findProviders() makes no network call and requests no location while disabled', async () => {
  const fnSource = extractFunction(source, 'async function findProviders()');
  const constants = source.match(/^const NEARBY_PROVIDERS_ENABLED = false;\nconst DISABLED_MESSAGE = '[^']+';$/m)[0];
  const calls = [];
  const messages = [];
  const stub = (name) => (...args) => { calls.push(name); return undefined; };
  const Location = {
    requestForegroundPermissionsAsync: async () => { calls.push('permission'); return { status: 'granted' }; },
    getCurrentPositionAsync: async () => { calls.push('position'); return { coords: { latitude: 25.382, longitude: 81.875 } }; },
    Accuracy: { Balanced: 3 },
  };
  const postAction = async () => { calls.push('postAction'); return { success: true, providers: [] }; };
  const fetchStub = async () => { calls.push('fetch'); throw new Error('network'); };
  const findProviders = new Function('Location', 'postAction', 'fetch', 'setLoading', 'setMessage', 'setPoint', 'setProviders', 'DISCOVERY_RADIUS_KM',
    `${constants}\n${fnSource}\nreturn findProviders;`)(Location, postAction, fetchStub, stub('setLoading'), (m) => messages.push(m), stub('setPoint'), stub('setProviders'), 15);
  await findProviders();
  await findProviders();
  assert.deepEqual(calls, []);
  assert.deepEqual(messages, ['Nearby providers will be available in a later release.', 'Nearby providers will be available in a later release.']);
});
