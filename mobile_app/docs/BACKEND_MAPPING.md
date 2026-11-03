# LOCAL Mobile: Backend & Workflow Mapping (analysis phase)

Branch: feature/mobile-app (from master 1a7e242). Analysis-phase document; items 4–5 below are updated where later decisions superseded them (2026-11-03).

## 1. Backend facts (verified in repo)
- Backend: Apper managed backend. Web uses `window.ApperSDK` (browser global) via src/services/sdk.js with VITE_APPER_PROJECT_ID + VITE_APPER_PUBLIC_KEY.
- All business logic runs CLIENT-SIDE in the web app through `sdk.table('<table>').select/where/create/update`. There is no server-side booking/matching/assignment function.
- Edge functions in repo: `calculate-driver-on-demand-tariff`, `email-local-invoice` (format: `apper.serve(async (req)=>...)`, secrets via `Deno.env.get`). Invoked from web by `sdk.functions.invoke(name, body)`.
- Roles (src/config/app.config.js): Admin_c, Customer_c, ServiceProvider_c. Auth via `sdk.session.login/register` and Apper hosted UI. Admin uses a built-in credential form.
- .env variable NAMES (values not read/logged): VITE_APPER_PROJECT_ID, VITE_APPER_PUBLIC_KEY, VITE_APPER_SDK_CDN_URL, VITE_EMAIL_LOCAL_INVOICE, VITE_CALCULATE_DRIVER_ON_DEMAND_TARIFF. All VITE_ prefixed; no private-credential-looking names. Still: .env is committed (it is in git history); the PUBLIC key is by design public, but confirm it is scoped, and consider git-ignoring .env on master (needs owner approval).

## 2. Tables / fields seen in code
- customer_profiles_c: Id, Name, email_c, phone_c, location_c, latitude_c, longitude_c, status_c, Owner (Apper user).
- service_categories_c: Id, Name, status_c (looked up by name per vehicle: e.g. 'Car Assistance').
- service_capabilities_c: Id, Name, status_c (required_capability_c on request).
- service_requests_c: Name, customer_c, service_category_c, required_capability_c, device_type_c, problem_description_c (carries embedded markers e.g. CAR_WASH_DECISIONS_JSON, LOCAL_*_QUOTE_JSON, *_APPROVAL_JSON), location_c, service_area_c ('Prayagraj'), latitude_c, longitude_c, status_c (Open/Quoted/Negotiating/Confirmed/Completed/Cancelled), preferred_time_c, requested_at_c, scheduled_at_c, service_mode_c, pricing_mode_c, pricing_mode_description_c.
- technician_profiles_c: Id, Name, email_c, phone_c/mobile_c, verification_status_c, status_c, availability_c, service_area_c, latitude_c, longitude_c, service_radius_km_c.
- technician_responses_c (offers/assignments): request_c, technician_c, proposed_price_c, original_proposed_price_c, final_agreed_price_c, negotiation_status_c, negotiation_history_c, message_c, availability_c, status_c.
- jobs_c: request_c, response_c, customer_c, technician_c, agreed_price_c, scheduled_at_c, status_c, payment_status_c, billing_status_c, payment_method_c, payment_reference_c, customer_payable_now_c, remaining_amount_c, local_service_fee_amount_c, payout_status_c, provider_travel_status_c, service_start_otp_c(+verified_at), dispute_status_c, etc.
- emergency_requests_c: emergency flows.

## 3. Workflow mapping
| Web screen | Role | Tables written/read |
|---|---|---|
| CarCareAssistance -> CustomerRequestStart (service=Car Wash) | Customer | read service_categories_c, service_capabilities_c; create service_requests_c (wash cart serialized in problem_description_c + CAR_WASH_DECISIONS_JSON; platform fee, pickup/drop) |
| CustomerRequestStart (other services, driver, car service, insurance, essentials, bike) | Customer | create service_requests_c with service-specific text/JSON markers |
| RequestDetail | Customer/Admin | service_requests_c, technician_responses_c, jobs_c; quote/approval JSON markers; negotiation; job creation |
| CentralDispatch | Admin | all above + customer_profiles_c; assign providers (create technician_responses_c), update jobs_c payment/billing/payout |
| TechnicianDashboard / ResponseNew | Provider | technician_profiles_c (availability, radius), technician_responses_c, jobs_c |
| providerMatching.js | rules | provider must be verification approved + status Active; availability gating; radius = clamp(service_radius_km_c,1,100) default 10; capability link match |
| serviceArea.js | rules | Service centre 25.382,81.875, 25 km gate (Naini/Prayagraj) |

Note: existing in-code service gate is 25 km; requested mobile discovery radius default is 15 km, configurable. These are two distinct rules and both will be kept (serviceability gate vs. provider-discovery radius).

## 4. Blockers & findings
1. **Documented Apper REST API (api.apper.io/v1) authenticates with ONE account-level API key.** No end-user (Admin/Provider) login/session endpoint is documented. Using that key from the app is forbidden (and would bypass per-user permissions). So the REST API is only usable server-side (edge function), never for individual Admin/Provider auth.
2. **Native end-user auth is unverified.** The web SDK is browser-bound (`window.ApperSDK`, hosted UI). A React Native token flow is not documented. Options (to decide before implementing): (a) ask Apper support whether a mobile/HTTP session API exists (dropped: the owner decided not to contact Apper Support); (b) run the existing Apper login inside an Expo WebView on the same origin and capture the session, storing it with expo-secure-store (works with existing roles, depends on SDK behaviour; needs testing); (c) Admin/Provider screens as WebView to the live web portal as an interim. No alternative accounts will be created.
3. **Business rules live in the client.** A mobile app calling tables directly would need authenticated SDK access. For Admin/Provider this is blocked by (2). For guests, a single edge function is the only safe path.
4. **Guest booking edge function (approved).** Plan: `guest-create-service-request` edge function. Validates name/mobile (E.164 India)/location/service payload; per-phone rate limit (5 per UTC hour; no per-IP limit is implemented); idempotency-key duplicate handling; find-or-create customer_profiles_c by phone WITHOUT creating Apper users (checked live read-only 2026-11-03: the guest profile is written with only Name, phone_c, location_c, status_c; customer_profiles_c has no latitude_c/longitude_c); loads service category/capability by name server-side; writes service_requests_c using the same field/marker formats as CustomerRequestStart. Uses server-side Apper secrets (read with apper.getSecret), never in the app. The function to deploy is mobile_app/edge-function-draft/guest-create-service-request.js via Apper's managed Edge Function facility; the src/apper/metadata/edge-functions/ copy is superseded and must not be deployed.
   - Deployment NOT done or verified. No function will be reported as deployed until tested.
5. Rate limiting / idempotency storage: decided — Upstash Redis REST (no Apper guard table; guest_booking_guard_c is superseded and will not be created). See EXTERNAL_GUARD_STORAGE_PROPOSAL.md.
6. Car Wash price list / package constants live inside CustomerRequestStart.jsx; mobile must reproduce them exactly (or better, fetch them from one source) to avoid price drift.
7. Maps: react-native-maps needs a Google Maps API key on Android (credential required, restricted by package/SHA).

## 5. Credentials / accounts still needed
- Expo account + EAS project id; Apple Developer account; Google Play Console; Google Maps SDK key (Android; iOS optional).
- Apper: server-side API key stored as an Apper edge-function secret; dedicated TEST Admin and TEST Provider accounts (via secret storage) and a non-production test customer/category data policy.
