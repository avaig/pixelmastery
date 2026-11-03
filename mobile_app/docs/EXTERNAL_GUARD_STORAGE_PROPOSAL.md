# Guest-booking guard storage: final design (Upstash Redis REST)

Status: implemented in `mobile_app/edge-function-draft/guest-create-service-request.js` and covered by sandbox (mocked) tests only. Nothing has been provisioned, deployed or written live. Controlled integration testing only; not production.

## Decisions
- **Storage:** Upstash Redis through its HTTPS REST API (`POST <UPSTASH_REDIS_REST_URL>`, `Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>`, JSON command array body; response `{result}` or `{error}`). TLS only: a non-`https://` URL counts as missing config. No Apper guard table (`GUARD_TABLE_PROPOSAL.md` is superseded).
- **Secrets:** five server-side secrets on Apper's Secrets page, read only through `await apper.getSecret(NAME)` in `loadConfig()`: `APPER_API_KEY`, `APPER_APP_ID`, `GUARD_HMAC_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Any missing/empty value, or `getSecret` throwing, returns 503 `Booking is temporarily unavailable` with nothing created. The return shape of `getSecret` is **assumed** to be a string (a `{ value }` wrapper is accepted defensively); verify it in Apper before deploy.
- **Identifiers:** HMAC-SHA256 with `GUARD_HMAC_SECRET`, domain prefixes `phone:`, `idem:`, `payload:`, hex truncated to 32 characters. Keys are `idem:<h>` and `rate:<phoneH>:<yyyymmddhh>`, where the hour bucket is **UTC**. The payload hash covers canonical sorted-key JSON of `{serviceKey, mobile (normalised +91), fullName, location, coordinates, serviceDetails (server-validated)}`. Redis never holds a raw phone number, attempt key, name or address. Keep `GUARD_HMAC_SECRET` stable: rotating it orphans existing keys.
- **Rate limit:** 5 new booking claims per phone per UTC hour, enforced by one atomic `EVAL` (`INCR`, and `EXPIRE 7200` on the first hit). The 6th returns 429. Retries of an existing attempt key do not consume the limit. Concurrent duplicates that arrive before the claim exists can each use up one slot.
- **No duplicate-by-phone block:** two different consecutive bookings from one phone are allowed; only the attempt key deduplicates.
- **Retention:** pending claims `PENDING_TTL_SECONDS = 604800` (7 days); completed claims `COMPLETED_TTL_SECONDS = 604800` (7 days, which meets the 24-hour minimum).

## Flow (createBooking)
1. Validate input (400 on failure), load config (503), then `GET idem:<h>`. If a claim exists, answer it (below) without creating anything.
2. Atomic rate-limit `EVAL` (429 when the count is above 5).
3. Claim with `SET idem:<h> {state:'pending',payloadHash,stage:'claimed',createdAt} NX EX 604800`. If another caller won the race, `GET` and answer as an existing claim.
4. Look up the category/capability, then find or create the customer by `phone_c` (customer fields are exactly `Name, phone_c, location_c, status_c`; no email, Owner or coordinates). Next, a compare-and-set to `stage:'request-writing'` with `customerId` (TTL preserved). Then the single service-request create.
5. Success: compare-and-set to `{state:'done', requestId, payloadHash}` with `EX 604800`, and return `{success:true, requestId, message}`.
6. **Definitive failure** (a lookup failed before any write, a customer create failed or was uncertain, or the request create got an explicit 4xx or per-record `success:false`, so no request exists): compare-and-delete the claim and return a generic 503 so the user can retry with the same key.
7. **Uncertain failure** (network error or timeout, 5xx, unparseable response, or a missing request Id after the request create; or failing to record `done` after the request was created): the claim stays **pending** (`stage:'request-write-uncertain'`, with the `requestId` if known). Nothing is deleted and the Apper write is never retried. The response is HTTP 202 `{success:true, pending:true, status:'pending', message:'Your booking is being confirmed. Please do not submit it again. Customer Care will confirm it.'}`.

Existing-claim answers: same payload and `done` returns the original `requestId` with `duplicate:true`. A different payload returns 409 `This booking attempt key was already used for a different request`. `pending` returns the 202 above and never creates anything.

**Pending needs manual reconciliation.** A pending claim blocks that attempt key for its full 7-day retention. There is no automatic resubmission. Customer Care must check in the Admin Panel whether the request exists and confirm it with the customer. Deleting a pending key by hand, if ever needed, needs a separate decision.

Compare-and-set/delete scripts replace or delete the key only if it still holds **exactly** the pending value this invocation wrote. That value contains `state:'pending'` and the `payloadHash`, so this is at least as strict as "pending and same payloadHash", and it does not depend on Lua `cjson`.

## Honest guarantees
Each Redis command or script is atomic on its own. The full booking (Redis claim, Apper customer write, Apper request write) is **not a distributed transaction** and has **no exactly-once guarantee**. A crash or timeout between steps can leave a pending claim, an orphan customer profile, or a created request whose claim never reached `done`. The design fails toward "pending, reconcile by hand" rather than toward creating a duplicate. The per-phone limit does not stop an attacker who rotates phone numbers (accepted residual risk for controlled testing, since the function is invoked without authentication).

## Not verified live
`apper.getSecret` signature/return shape; outbound HTTPS from Apper's runtime to Upstash; Upstash behaviour against these exact scripts (`KEEPTTL`, numeric args); Apper create-record response shape for errors/timeouts; the function's public URL and unauthenticated invocation.
