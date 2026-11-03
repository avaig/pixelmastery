# Guest-booking guard proposal — controlled integration testing only; not production

The internal `guest_booking_guard_c` table does **not** exist in the live Apper app. Do not deploy/enable bookings until it is provisioned and validated. The edge function fails closed with 503 when `GUARD_HMAC_SECRET` is missing or guard reads/writes fail before a booking write. A failed final Done update can occur **after** a request was created, so 503 does not imply rollback.

## Exact proposed schema (not created)

| Field | Type | Values / purpose |
| --- | --- | --- |
| `Name` | Text | `idem:<32 hex HMAC>` or `rate:<32 hex HMAC>:<yyyymmddhh>` UTC. |
| `request_id_c` | Text | Created service-request UUID string; set only after the request succeeds. NOT Number. |
| `payload_hash_c` | Text | Full 64-hex HMAC-SHA256 digest of the canonical booking payload on idempotency claims. |
| `attempts_c` | Number | Rate bucket counter or claim initial value 1. |
| `status_c` | Picklist | Exactly `Pending`, `Done`, `Failed` (rate bucket uses `Done`). |
| `expires_at_c` | DateTime | Claim +24 hours, rate bucket +2 hours. |
| `created_at_c` | DateTime | UTC creation time; Pending less than 2 minutes old blocks retry. |

`Id` is the Apper platform UUID-string record ID, not a custom table field. Lookup values read as `{Id, Name}` objects and written as UUID strings. Observed IDs are UUIDv7; **lowest-Id election assumes lexical UUID string order tracks creation order**; this assumption and its behavior need a controlled integration test before reliance. Guard DateTime, Number and picklist serialization are not verified.

## Secrets and access rules

Only the edge function's **server-side API key** may read/create/update this table. **NO Customer, ServiceProvider, Anonymous, public API/client, or Admin read access** (no Admin grant, per decision). Verify permissions for the actual deployed key; never embed a key or secret in `EXPO_PUBLIC_`, other mobile files or responses. `GUARD_HMAC_SECRET` must remain stable: **never rotate casually**. Rotation orphans existing guard records (old idempotency/rate keys become invisible); any planned rotation needs an explicitly reviewed migration/overlap and cleanup policy.

The guard stores only domain-separated HMAC-SHA256 results: phone (`phone:`), attempt key (`idem:`), and optional untrusted forwarded IP (`ip:`) use first 32 hex digits in keys. For idempotency, `payload_hash_c` is the **full** HMAC-SHA256 with domain prefix `payload:` over canonical sorted-key JSON of `{serviceKey, mobile (normalised E.164), fullName, location, coordinates, serviceDetails}`. Coordinates use validated numeric latitude/longitude or null; service details use server-validated menu values. Never log or return keys, hashes or the secret. No technical guard marker is placed in `problem_description_c`.

## Flow and retention

Read claim rows for the key first: a different `payload_hash_c` always returns 409 `This booking attempt key was already used for a different request` without creating a customer/request (including Pending, Failed, Done and stale claims). Same payload + Done returns its existing UUID requestId. Fresh Pending returns 409. Stale Pending or Failed allows retry. Read phone and optional IP buckets, reject at five attempts per hour, increment/create buckets, create a Pending claim with the payload hash, then re-read claims. A different hash discovered on recheck also returns 409; otherwise only the lowest active UUID Id proceeds. A loser is marked Failed. The winner reuses/creates the customer, creates the request and sets Done with the request UUID; pre-request failures mark Failed. An absent/unreadable/unwritable guard or absent secret fails closed with a safe 503.

**Retention/cleanup proposal only, not implemented:** purge rows past `expires_at_c` (claim 24h, rate bucket 2h). A separately reviewed server-side scheduled cleanup or authorized manual purge would list expired records and use documented bulk delete, checking per-record errors and permissions. Do not expose cleanup to clients. Confirm expiry and deletion semantics before building it.

## Best-effort duplicate protection, NOT guaranteed under concurrency

No documented unique constraint, atomic insert/upsert or transaction makes claim-then-recheck **best-effort only; it does not guarantee duplicate prevention under concurrency**. Read-after-write consistency is unverified; competing claims can fail to see each other, rate increments may be lost, final Done update can fail after request creation, and customer creation can precede failed request creation. A 503 cannot undo committed writes. Production needs server-enforced atomic uniqueness and reconciled writes plus abuse protection. A locationless request must not be offered to providers until Customer Care verifies it.

## Live read-only verification results (2026-11-03)

**Verified:** category `service_categories_c` Name `Car Assistance` has exactly one Active record; capability `service_capabilities_c` Name `Car Wash` has exactly one Active record; record IDs are UUID strings, lookup reads are `{Id, Name}`; metadata confirms customer fields Name Text, phone_c Text, location_c Text, status_c Picklist `[Active,Blocked]`, and request fields in the allowlist (including device_type_c Text, latitude_c/longitude_c Decimal, pricing_mode_description_c MultilineText), with request picklist values for status `[Open,Quoted,Negotiating,Confirmed,Completed,Cancelled]`, preferred_time `[ASAP,Scheduled,Within 1 hour,Today,Tomorrow]`, service_mode `[Normal,Urgent,Emergency]`, pricing_mode `[Fixed Price,Provider Quote,Urgent Dispatch]`. Category and capability status picklists are `[Active,Paused]`. Name EqualTo filtering works; CreatedOn GreaterThan filtering was verified in the supplied findings. The metadata/list check reads no personal rows. Provider metadata/picklist findings are in `LIVE_SCHEMA_FINDINGS.md` but not re-fetched by the restricted five-table script.

**NOT verified:** any live writes or update semantics, guard table existence/permissions (currently **MISSING**), guard DateTime/picklist operation, read-after-write consistency, UUIDv7 order across competing claims, Decimal precision, live customer/request booking or deployed edge invocation. `Mobile` is a Text value, not a picklist option. Controlled integration testing only; not production.
