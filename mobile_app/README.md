# LOCAL Mobile (Expo + React Native)

Customer-facing mobile prototype for LOCAL. The only live booking flow in this build is Car Wash. Admin and Service Provider authentication is explicitly not implemented.

## Run locally

1. Install Node.js and npm.
2. Copy `.env.example` to `.env` and set the public client values. `EXPO_PUBLIC_API_BASE` must be the deployed Apper edge-function invoke URL. Do not put the Apper API key in any Expo variable or mobile file.
3. Install and start:

   ```sh
   npm install
   npx expo start
   ```

4. Use a development build for Google Maps / native modules. Location permission is requested only after the user taps **Use my location** or **Use my location & search**.

Useful variables:

- `EXPO_PUBLIC_API_BASE` — HTTPS edge-function URL (public).
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — optional public Google Maps SDK key; restrict it by app identifier and API in Google Cloud.
- `EXPO_PUBLIC_DISCOVERY_RADIUS_KM` — nearby search radius; default 15 km, clamped to 1–50 km.
- `EXPO_PUBLIC_CUSTOMER_CARE_PHONE` — optional verified phone number in E.164 format; blank means the app will not dial an unverified number.

The edge function separately requires server-side `APPER_API_KEY` and `APPER_APP_ID` through `Deno.env.get`. Those secrets must never be added to `.env`, Expo, EAS public variables or app code.

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
- Booking sheet asks only for Full Name, Indian 10-digit Mobile Number and Service Location. Manual address entry always works. GPS is requested on tap; coordinates are checked against the current 25 km Naini/Prayagraj pilot radius.
- Nearby search calls the edge function and renders a map of the customer’s search area plus coarse provider name/availability/distance cards. The edge API does not return provider coordinates, identifiers or phone numbers, so the app intentionally does not create provider pins.
- SecureStore token-store wrapper and authentication stub for later; no fake login is provided.

## Verification status

Verified locally: npm dependency installation, Expo Doctor/build checks (see final milestone report), Car Wash totals/haversine unit tests and edge-function tests with a mocked Apper REST API. The tests prove payload paths/shapes, allowlists, duplicate handling and record-level create failure behavior.

Not verified: live Apper deployment, schema/picklist compatibility, a real guest customer/request write, maps API-key setup, native device GPS behavior, EAS signing/builds or authentication. The live smoke test in `scripts/live-smoke-test.mjs` was **not run**; it requires an explicitly authorized test phone and deployed edge URL.

Expo icon/splash PNGs are simple Python Pillow-generated placeholders, not production brand assets.

## Local verification commands

```sh
npm test
npx expo-doctor
npx expo export --platform android --no-bytecode
node --input-type=module --check < ../edge-function/guest-create-service-request.js
```

Hermes bytecode export is disabled in the Linux ARM64 sandbox because the installed Hermes compiler executable is x86-64; JavaScript bundle export succeeds without bytecode. This does not verify a native EAS build.
