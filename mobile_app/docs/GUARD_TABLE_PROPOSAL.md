# SUPERSEDED: guest-booking guard table proposal

This proposal (an Apper table `guest_booking_guard_c` holding idempotency/rate-limit rows) is **superseded and must not be implemented**. The table was never created and must not be created.

Guard state now lives in Upstash Redis via its REST API. See [EXTERNAL_GUARD_STORAGE_PROPOSAL.md](EXTERNAL_GUARD_STORAGE_PROPOSAL.md) for the final design and [DEPLOYMENT_AND_SMOKE_TEST.md](DEPLOYMENT_AND_SMOKE_TEST.md) for deployment steps.

The old function that used this table, `src/apper/metadata/edge-functions/guest-create-service-request.js`, is also **superseded and must not be deployed**. The function to deploy is `mobile_app/edge-function-draft/guest-create-service-request.js`.
