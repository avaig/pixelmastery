# Proposed internal guest-booking guard — NOT YET VERIFIED

Do not deploy or enable guest booking until the table, secret, permissions, lookup records and behavior below have been checked in the actual Apper app. **This document proposes a table; it does not create one.** The self-contained edge function fails closed with HTTP 503 `Booking is temporarily unavailable` when the secret is unset or the guard cannot be read/written before customer/request creation.

## Proposed schema

Table name: `guest_booking_guard_c`.

| Field | Type | Values / use |
| --- | --- | --- |
| `Name` | Text | `idem:<32-hex-HMAC>` or `rate:<32-hex-HMAC>:<yyyymmddhh>` (UTC hour). Keys must not contain raw identifiers. |
| `request_id_c` | Number | Set on an idempotency row only after request creation. |
| `attempts_c` | Number | Rate-bucket attempt count; idempotency claims start at 1. |
| `status_c` | Picklist | Exact proposed values `Pending`, `Done`, `Failed`. A rate row is `Done`. |
| `expires_at_c` | DateTime | Idempotency claim: creation +24h. Rate bucket: creation +2h. |
| `created_at_c` | DateTime | Claim/bucket creation UTC time; a `Pending` claim less than two minutes old blocks another submission. |

`Id` is the platform record ID used for comparisons and updates, not a custom schema field. Provisioning these fields and verifying DateTime/picklist serialization is required before live use.

## Secret and access

Set `GUARD_HMAC_SECRET` as an **Apper server secret** available through `Deno.env.get` to the deployed edge function, never as an Expo/mobile variable. Use a high-entropy value managed through the server's secret process; do not log it or include it in responses. HMAC-SHA256 signs `phone:<normalized E.164 number>`, `idem:<uuid>` or `ip:<forwarded IP>` with separate domains, and stores only the first 32 hexadecimal digits of each digest in guard keys. The optional forwarded IP header is not trustworthy. Even HMAC-derived keys are sensitive internal data. Rotating the secret changes every key: existing idempotency and hourly rate records become invisible to the new secret; plan rotation and a temporary overlap/cleanup policy explicitly. Never store a raw phone, IP or idempotency UUID in this table.

Grant read/create/update **only to the edge function's server-side API key**. No mobile/client direct access, no `Customer_c` or `ServiceProvider_c` grants, and no anonymous or API-view exposure. `Admin_c` may have at most read access, **subject to the user's explicit decision**; do not assume an Admin grant. Check permissions for the actual deployed API key before enabling bookings.

## Request flow and retention

Read idempotency claims first. A `Done` row returns its request ID as a duplicate. A fresh `Pending` claim returns 409. A `Failed` or older-than-two-minute `Pending` claim allows a new attempt. Read the phone bucket and optional IP bucket (up to five each per hour), increment the attempt count, create a `Pending` claim, read claims again and choose the lowest active `Id`. A loser returns 409 without creating a customer or request. The winner reuses a customer by phone when present, creates the request, then updates its claim to `Done` with `request_id_c`; a pre-request-completion failure updates the claim to `Failed`. Guard failures return a safe 503. The edge response does not contain hashes, raw identifiers from the guard, or the secret.

Proposed retention: purge rows with `expires_at_c` in the past, with idempotency rows set to +24 hours and rate rows to +2 hours. A separately reviewed scheduled function or an authorized manual purge could list expired IDs and use the documented bulk-delete endpoint `POST /v1/data/{appId}/tables/{table}/records/delete`. **Neither cleanup path is implemented here.** Confirm exact delete payload/permissions, observe per-record errors, and do not expose the cleanup route to clients.

## NOT PRODUCTION-GRADE

The reviewed Apper API docs describe record endpoints and per-record errors, but show **no unique constraint, upsert, transaction, or atomic insert** for these operations. Therefore lowest-`Id` election is **best-effort only; duplicates are NOT guaranteed to be prevented under concurrency.** Read-after-write consistency has not been verified. Concurrent rate increments may be lost; two claims may not see each other. A failed final `Done` update can leave a *created* request with a `Pending` claim; a later retry may create another request. A customer write can succeed before a request write fails, leaving an orphan customer. A 503 cannot undo already committed writes. Production requires server-enforced unique/atomic reservation, transactional/reconciled writes and robust abuse controls. Do not use this prototype as exactly-once or production-grade rate limiting. Locationless requests must be checked by Customer Care before any provider offer.

## Pre-live verification checklist — all NOT YET VERIFIED

- [ ] **NOT YET VERIFIED:** provision all guard fields, `Pending`/`Done`/`Failed` picklist values, actual DateTime/Number semantics, and the key's read/create/update privileges; deny client/API-view exposure.
- [ ] **NOT YET VERIFIED:** read-only schema inspection with `GET /v1/meta/{appId}/tables/{table}/fields` for guard, customer and service request tables. Confirm the metadata route and field names before writes.
- [ ] **NOT YET VERIFIED:** live `Car Assistance` category and `Car Wash` capability records exist and are `Active`; confirm exact names, status and lookup IDs before deployment.
- [ ] **NOT YET VERIFIED:** all live picklist values used by customer, request, provider and capability-link writes/reads, including guard statuses; confirm `device_type_c` value `Mobile`.
- [ ] **NOT YET VERIFIED:** isolated authorized read-after-write claim test, competing claims, per-record failures, stale-claim retry and cleanup semantics (with no real customer bookings).
- [ ] **NOT YET VERIFIED:** existing web offer flow cannot offer a no-coordinate request before Customer Care verifies it.

No live Apper access, table creation, deployment or cleanup was performed for this prototype.
