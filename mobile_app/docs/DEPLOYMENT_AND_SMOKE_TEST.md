# Deployment and controlled smoke test: guest booking Edge Function

Function source: `mobile_app/edge-function-draft/guest-create-service-request.js` (branch `feature/mobile-app`).
**Do not deploy** `src/apper/metadata/edge-functions/guest-create-service-request.js`. It is the superseded DB-guard version. Do not edit or commit that folder either, because Apper's bot reacts to commits there.
Never paste secret values into chat, GitHub, `.env`, Expo/EAS variables or app code.

**Where to run commands:** every `node scripts/...` command below must be run from the `mobile_app` directory. After cloning the repository: `git checkout feature/mobile-app`, then `cd mobile_app`. The smoke script refuses to run from any other directory.

**nearbyProviders is disabled for this first live milestone.** `ENABLE_NEARBY_PROVIDERS = false` in the draft makes the `nearbyProviders` action answer HTTP 404 `{success:false, message:'This action is not available.'}` before any secret loading or Apper/Redis call; the app's Nearby tab only shows "Nearby providers will be available in a later release." and makes no network call. The code is kept. Before it may be enabled (separate approval), it needs at least: rate limiting per client IP and per phone/device in Redis (the endpoint is unauthenticated and reads provider tables), a cap on lookups per minute and on result size, caching of provider lists rather than reading up to 500 profiles + 1,000 links per request, abuse controls (bot/app-attestation or similar, fail-closed on Redis errors, monitoring/alerting), and a privacy review of what is returned (first name, availability, rounded distance).

## A. Provision (user steps)
1. **Upstash Redis:** in the Upstash console, create one Redis database (a region near India if available). Open the database's **REST API** section and copy the **REST URL** (must start with `https://`) and the **read/write REST token** for this database. Do not use the read-only token or any account-level API key. Leave TLS on (Upstash's default).
2. **HMAC secret:** run `openssl rand -hex 32` on your own machine. Store the output in your password manager and keep it stable, because rotating it orphans existing guard keys.
3. **Apper Secrets page:** add these five secrets, typing the values in Apper's UI only:
   `APPER_API_KEY`, `APPER_APP_ID`, `GUARD_HMAC_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
4. **Verify `apper.getSecret`:** confirm in the Apper builder/docs that `await apper.getSecret('NAME')` returns the value as a string (a `{ value }` wrapper is also handled). If the signature differs, stop and report back; do not change it ad hoc.
5. **Create the function:** use Apper's managed Edge Function facility (not repository sync). Suggested name/slug `guest-create-service-request`, with `requireAuthentication = false`. Paste the full contents of `mobile_app/edge-function-draft/guest-create-service-request.js` unchanged. It ends with `apper.serve(handler);` and has no imports or exports.
6. **Find the public HTTPS invoke URL.** How to do this is **unverified**. Look in, in order: the function's detail/settings page in Apper (an "Invoke URL" or "Endpoint" field); the managed Edge Function list; the app's API/integration settings; Apper documentation for functions invoked without authentication. The web app only uses `sdk.functions.invoke(name)`, which does not show a URL. If no public HTTPS URL exists, stop; do not weaken authentication.
7. **Configure the mobile app:** set `EXPO_PUBLIC_API_BASE=<invoke URL>` in `mobile_app/.env` (git-ignored) for local runs, and in each EAS environment/profile (replacing the `https://YOUR-APPER-EDGE-FUNCTION-URL` placeholders) for builds. This is the only backend setting. No secret goes into Expo.

## B. No-login probe (creates nothing)
8. From a clean shell (no cookies, no Authorization header), in a checkout of `feature/mobile-app`:
   `cd mobile_app && EXPO_PUBLIC_API_BASE=<invoke URL> node scripts/live-smoke-test.mjs --probe`
   Expected: `PASS catalog returns 200 JSON without login`, `PASS invalid body returns 400 JSON`, `PASS no Set-Cookie on responses`. If the function demands a session or returns HTML/redirects, stop.

## C. Controlled test booking (needs your explicit go-ahead; creates TEST records)
9. **Choose the test mobile number.** Use a number you control, or an obviously fake test number such as `9000000001`. You must confirm that the number you choose is acceptable before running (it is stored in `customer_profiles_c.phone_c` as `+91…`). Then run, from `mobile_app`:
   `cd mobile_app && EXPO_PUBLIC_API_BASE=<url> LOCAL_SMOKE_TEST_MOBILE=<approved test number> node scripts/live-smoke-test.mjs --confirm-test`
   The script builds the payload itself and refuses to send it unless `--confirm-test` is given and the name/location carry the TEST markers. It uses only customer-visible fields to mark the booking (nothing technical is added to the server-side description):
   - Customer **Full Name** exactly `ZZ TEST LOCAL MOBILE` (`customer_profiles_c.Name`). If a customer profile with the test number already exists, that profile and its existing name are reused; then search by the location marker below instead.
   - **Service Location** `ZZ TEST - DO NOT DISPATCH - Naini, Prayagraj` (`location_c` on the request and on a new customer profile). Set `LOCAL_SMOKE_TEST_ADDRESS` to use a different short in-area address after the prefix.
   - Coordinates `25.382, 81.875` (Naini, inside the 25 km area); one Complete Car Wash, Small Car, ₹400 + ₹25 fee = ₹425, no Pickup & Drop.
   It prints a fresh UUIDv4 `idempotencyKey` and the returned `requestId`, retries the same key (expects the same `requestId`, `duplicate: true`), then sends a changed location under the same key (expects 409). To repeat only those two checks later, run `cd mobile_app && EXPO_PUBLIC_API_BASE=<url> LOCAL_SMOKE_TEST_MOBILE=<same number> node scripts/live-smoke-test.mjs --confirm-test --reuse-key <idempotencyKey>` (same number and address). If the key has expired (7 days) or is unknown, that run would create a new TEST booking and reports FAIL.
   **Finding it in the Admin Panel:** open Central Dispatch (`/admin/dispatch`) as Admin, set the date filter to include today, and type `ZZ TEST LOCAL MOBILE` in the search box ("Search by customer name, service, location…"); searching `ZZ TEST - DO NOT DISPATCH` also matches the location. The request **Name** produced by the function is exactly `CAR • Car Wash (1 items)` (format `CAR • Car Wash (<total quantity> items)`), and the service shown is the `Car Wash` capability. Open the request: its URL is `/requests/<Id>`, and that `<Id>` must equal the printed `requestId` UUID. Customer records can be checked in the customer list by the same name. These page/label names come from the current web code (`src/pages/CentralDispatch.jsx`, route `/admin/dispatch`); they have not been checked in the live Admin Panel.
   **Recording:** copy the printed `idempotencyKey` and `requestId` UUIDs, the date/time and each PASS/FAIL line into your own notes. They are not secrets; never record tokens or keys.
10. Pass/fail checklist (tick each one):
    - [ ] Customer profile created (or reused) with `Name`, `phone_c` (`+91…`), `location_c`, `status_c = Active`; no email, Owner or coordinates.
    - [ ] Service request has `customer_c`, `service_category_c` (Car Assistance), `required_capability_c` (Car Wash) as UUID lookups; `device_type_c = Mobile`; `status_c Open`, `preferred_time_c ASAP`, `service_mode_c Normal`, `pricing_mode_c Fixed Price`; `latitude_c/longitude_c` set; `requested_at_c` set.
    - [ ] `problem_description_c` lists Complete Car Wash, Small Car ₹400, Platform Fee ₹25, total ₹425, with no technical markers (`idem:`, `rate:`, hashes).
    - [ ] Request visible in the existing Admin Panel (manual check by you).
    - [ ] Script: same key + same payload returns the **same requestId** with `duplicate: true`, and no new record exists.
    - [ ] Script: same key + different payload returns **409**.
    - [ ] Rate limit: `--confirm-test --rate-limit` returns **429** on the 6th new booking within the UTC hour (creates up to 5 TEST requests in total).
    - [ ] Fail-closed: temporarily set `UPSTASH_REDIS_REST_TOKEN` to an invalid value in Apper, then run a booking. Expect **503** and confirm no new records. Restore the correct token afterwards.
    - [ ] Missing location coordinates (optional, via the app with manual address only): `location_c` starts with `[LOCATION VERIFICATION PENDING] ` and no lat/lng.
    - [ ] Pending path: not safely forceable live. Only if a 202 ever occurs: the app shows the "being confirmed" message, offers no success screen and does not resubmit. Customer Care then reconciles in the Admin Panel.
11. Record the HTTP codes and requestIds (UUIDs of TEST records only) in your notes. No secrets.

## D. Rollback / disable
12. To stop bookings immediately, do any one of these: disable or delete the function in Apper's managed facility; remove `UPSTASH_REDIS_REST_TOKEN` (or any of the five secrets) so createBooking fails closed with 503; or point `EXPO_PUBLIC_API_BASE` back to the placeholder and rebuild. None of these deletes data.

## E. Cleanup
13. Cleanup requires separate user approval. TEST customer/request records and Redis keys stay in place until you separately approve a cleanup. Apper record deletion is destructive and is **not** part of this procedure. Redis keys expire by themselves (7 days for claims, 2 hours for rate buckets).

## What is still unverified
- `apper.getSecret` return shape, and whether outbound HTTPS to Upstash is allowed from Apper's runtime.
- The public invoke URL and unauthenticated invocation (`requireAuthentication=false`).
- Upstash execution of the exact Lua scripts (`KEEPTTL`, numeric arguments, the two-key claim-and-rate script) and REST error formats. The claim-and-rate script was checked only against an in-test JavaScript model and a Lua 5.1 run with a mocked `redis.call`, not against Redis/Upstash.
- Live Apper create-record behaviour: per-record error shapes, `Mobile` in `device_type_c`, Decimal precision, read-after-write when reusing a customer by phone.
- Admin Panel visibility; native device UI (GPS, geocoder, maps); EAS builds.
- Every behaviour above is covered only by sandbox tests with a mocked Upstash and a mocked Apper (`npm test`).
