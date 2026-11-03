# LOCAL Mobile (Expo + React Native)

Customer-facing mobile prototype for LOCAL. The only implemented booking flow in this prototype is Car Wash; it has not been deployed or validated by live writes. Admin and Service Provider authentication is explicitly not implemented.

## Run locally

1. Install Node.js and npm.
2. Copy `.env.example` to `.env` and set the public client values. `EXPO_PUBLIC_API_BASE` must be the deployed Apper edge-function invoke URL. Do not put the Apper API key in any Expo variable or mobile file.
3. Install and start:

   ```sh
   npm install
   npx expo start
   ```

4. Use a development build for Google Maps / native modules. GPS access is requested only after the user taps **Use my location** or **Use my location & search**. Manual address geocoding uses the platform geocoder (`expo-location`); Android also requires foreground location permission for geocoding and may prompt when the user checks the address or submits. Declining does not block manual-only submission. Platform behavior has not been device-tested. A draggable map pin is an alternative.

Useful variables:

- `EXPO_PUBLIC_API_BASE` — HTTPS edge-function URL (public).
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — optional public Google Maps SDK key; restrict it by app identifier and API in Google Cloud.
- `EXPO_PUBLIC_DISCOVERY_RADIUS_KM` — nearby search radius; default 15 km, clamped to 1–50 km.
- `EXPO_PUBLIC_CUSTOMER_CARE_PHONE` — optional verified phone number in E.164 format; blank means the app will not dial an unverified number.

The edge function separately requires server-side `APPER_API_KEY`, `APPER_APP_ID` and `GUARD_HMAC_SECRET` through `Deno.env.get`. Those secrets must never be added to `.env`, Expo, EAS public variables or app code.

## EAS builds

Set the actual public edge-function URL (and any public Maps key) in the chosen EAS environment/profile, then run:

```sh
npx eas-cli build --profile development --platform android
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform all
```

`eas.json` includes deliberately invalid `https://YOUR-APPER-EDGE-FUNCTION-URL` placeholders in each profile. Replace/configure them before building a usable binary. `com.local.mobile` is a clearly marked placeholder bundle/package identifier; confirm it is available and replace it before release.

## What is implemented

- Bottom navigation for Home, Services, Nearby and Account, plus a stack for Car Care, Car Wash, the login investigation placeholder and coming-soon service states. Deep-link scheme: `localapp://`.
- Car Care catalogue matching the live web menu: Car Wash, Car Service, Car Essentials at Your Doorstep and Car Insurance Claim.
- Full guest Car Wash selection and quote: Small Car vs SUV, exact catalogue variants, one selected item per catalogue group, quantity, optional Pickup & Drop, ₹25 booking platform fee and indicative ₹100 pickup/drop. Server re-computes every rate and rejects submitted totals that do not match.
- Booking sheet asks only for Full Name, Indian 10-digit Mobile Number and Service Location. Manual address entry is accepted without treating it as verified. At submit the app attempts on-device geocoding; the user can also drop/drag a map pin. Coordinates from GPS, geocoding or pin are checked against the 25 km Naini/Prayagraj pilot radius in both app and edge function. Without coordinates, the request location carries `[LOCATION VERIFICATION PENDING] ` and the customer sees a Customer Care verification warning before dispatch.
- Nearby search calls the edge function and renders a map of the customer’s search area plus coarse provider name/availability/distance cards. The edge API does not return provider coordinates, identifiers or phone numbers, so the app intentionally does not create provider pins.
- SecureStore token-store wrapper and authentication stub for later; no fake login is provided.

## Verification status — controlled integration testing only; not production

Local validation uses `npm test`, `npx expo-doctor` and `npx expo export --platform android --no-bytecode`. Edge tests evaluate the self-contained deployed source with a mocked Apper REST API; they cover payloads, guard failure, retries, allowlists and record-level failures. No native device UI or live API write was validated.

Not verified: live deployment, guard table schema/permissions (it is not provisioned), guard claim read-after-write consistency, actual guest customer/request writes, `Mobile` text-field write behavior, Decimal precision, maps API-key setup, native GPS/geocoder/pin behavior, EAS signing/builds or authentication. Live read-only metadata verified the five requested table endpoints (guard is MISSING), field types/picklists, and one Active Car Assistance category and one Active Car Wash capability via non-personal Name filters. Provider fields are covered by supplied read-only findings, not re-fetched by the restricted script. No customer/provider rows or live writes were read/performed. The live smoke test in `scripts/live-smoke-test.mjs` was **not run**; it requires an explicitly authorized test phone and deployed edge URL.

App icon/splash artwork are placeholders, not production brand assets. `app.json` asset references are limited to `./assets/icon.png` and `./assets/splash.png` (the icon is also used for the Android adaptive icon). The edge function is a single-file `apper.serve(handler)` entry point; no local module imports.

## Booking guard and unverified locations

Guest booking fails closed until the internal guard table described in [docs/GUARD_TABLE_PROPOSAL.md](docs/GUARD_TABLE_PROPOSAL.md) is provisioned with server-only access **and** a server-side `GUARD_HMAC_SECRET` is set. The guard signs phone, attempt key and optional IP with domain-separated HMAC-SHA256, then claims `Pending` before booking and updates to `Done`/`Failed`. Lowest UUID-string Id election assumes UUIDv7 lexicographic order tracks creation; it is best-effort only: no unique constraint/atomic insert/transaction is documented, read-after-write consistency is unverified, and duplicate prevention is not guaranteed under concurrency. Same key with a different canonical booking payload returns 409 via a full domain-separated payload HMAC; same key/payload and Done returns the existing UUID requestId. The guard table requires server-only API-key access, NO Admin read and NO public/client grants; keep `GUARD_HMAC_SECRET` stable because rotation orphans records. Retention/cleanup is proposed, not implemented. This is **NOT PRODUCTION-GRADE** and never writes guard markers to `problem_description_c`. A no-coordinate request **may appear eligible to every provider in the existing web matching code**, which only checks distance when both sides have GPS. Customer Care must verify location before any offer flow; confirm this risk in the live system. See [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## Local verification commands

```sh
npm test
npx expo-doctor
npx expo export --platform android --no-bytecode
node --check ../edge-function/guest-create-service-request.js
node scripts/live-readonly-check.mjs # requires server-shell APPER_API_KEY and APPER_APP_ID; metadata and non-personal catalog rows only
```

Hermes bytecode export is disabled in the Linux ARM64 sandbox because the installed Hermes compiler executable is x86-64; JavaScript bundle export succeeds without bytecode. This does not verify a native EAS build.
