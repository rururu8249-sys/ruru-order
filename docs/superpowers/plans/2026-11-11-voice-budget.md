# Voice automation budget implementation

**Goal:** Persist the approved 40,000 KRW per-broadcast automation budget, block unbudgeted work, and expose durable admin warning/stop status before connecting paid audio processing.
**Architecture:** Service-only Postgres ledger serializes every reservation. A guarded worker adapter reserves conservative costs before invoking a provider. An authenticated admin panel displays budget, readiness and persistent interruption states. No paid provider or relay is available yet, so production activation stays disabled.
**Tech Stack:** Next.js 16, React 19, Supabase/Postgres, Node tests/PGlite.
**Spec:** User approval in this conversation: continuous recognition; 80% warning; 40,000 KRW limit; only AI stops; explicit cap raise; no silent restart on prepaid recharge. Photo clarification: exact configurable spoken capture phrase, bind current introduced variant at speech time, append after existing images, preserve cover.

## Constraints
- Reuse current checkout on isolated feature branch; leave unrelated untracked files alone.
- Budget amount means conservative internal allocation, not finalized card billing. No promised FX-inclusive absolute billing ceiling without measured deployment costs.
- Service-only ledger and RPCs; admin cookie required for all admin routes.
- Debit before work; duplicate request IDs never authorize another provider call. Unknown provider outcome remains debited; retry needs a new reservation.
- No automatic start, reset or cap increase. Keep spent amount across restart and page reload.
- Do not alter broadcast, chat, orders or product images while building budget control.
- No new live photos until actual audio/video input and timestamp calibration are connected. Prepare deterministic command and append rules, not a pretend capture button.

## Tasks
1. Failing PGlite tests, then atomic budget reserve/configure/worker heartbeat RPCs, audit events and access restrictions. Test duplicate requests, racing reservations, cap raise, stopped worker, missing readiness and role denial.
2. Cost bounds + worker gate + exact-photo-command rules. Tests prove no provider call when denied/unavailable, repeat cannot double charge, conservative limits, phrase and product target validation.
3. Admin authenticated endpoint and dashboard panel. No initial fake running state. Persistent warning/stop/offline notices; explicit limit editing; manual product navigation. Save photo trigger configuration without enabling capture.
4. Build, relevant regression tests, review, additive DB deployment and site deployment. Verify unauthenticated routes denied and production bundle. Report paid activation blockers clearly.

## Review focus
Cross-broadcast state leakage; two workers/replayed requests; lost provider response; stale worker shown as running; misleading exact cost; capture bound to wrong variant; hidden controls on mobile.

## Progress
- Source/auth/schema inspected. No voice provider or worker presently configured. Existing offline voice decisions are only a spike.
- Budget ledger/API/panel implemented; PGlite access/concurrency tests, cost gate/command tests, authenticated API tests and rendered UI tests pass. Initial production build passes. Independent review identified stale display, old-cap stop, worker interruption and rate-binding issues; corrected and regression tests pass.
- User clarification: automatic wearing photo is ONCE PER PRODUCT across all days/broadcasts. If already captured, skip BEFORE capture/upload. Existing cover is untouched; append the first captured frame. Only explicit replacement may change it. Automatic intro marks are first-per-broadcast/video/product, not overwritten by repeated mentions.
- Pending paid activation: API account/key, actual RTMP relay, source audio/video clock verification, receiver notification setup and controlled live trial. Do not represent these as complete.
