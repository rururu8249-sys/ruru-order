# Independent option soldout implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, sequentially.

**Goal:** Allow manual option soldout without numeric inventory, including transactional rejection of stale carts.
**Architecture:** Add optional boolean `manual_soldout` to existing stock variant records. Missing means false. Use exact option identity and existing product locks; do not replace inventory or payment logic.
**Tech Stack:** Next.js, React, TypeScript, PostgreSQL, PGlite.
**Spec:** ../specs/2026-10-10-crm-operating-architecture.md and 2026-10-10-option-sale-state-investigation.md.

## Global constraints
- No production customer/order writes during testing.
- Preserve numeric inventory, reservation absolute expiry, idempotency and points.
- No admin control is released before server enforcement exists.
- Do not replace deployed RPCs with stale repository snapshots.

## Review focus
- Missing/manual false is not soldout; string "false" must not be truthy.
- Size-only options normalize 없음 and empty identically.
- Legacy brand detail color keys and linked actual product IDs remain distinct.
- An existing held option can become soldout before checkout: reject and roll back.
- Editing names and unrelated fields preserves manual state.

### Task 1: Transactional enforcement
Files: `supabase/sql/option_manual_soldout.sql`, `scripts/test-option-manual-soldout-db.mjs`, `scripts/fixtures/option-sale-rpcs-before.sql`.
Interface: SQL `ruru_option_manual_soldout(jsonb,text,text,text) returns boolean`.
- [ ] Write and run failing real PGlite tests against read-only captured deployed RPC bodies: inventory OFF reservation rejected, no inserted order after rejection, legacy brand and empty option matching, manual false accepted.
- [ ] Implement pure SQL helper and fail-closed source-hash checked patch to existing RPC bodies under existing locks, before stock-management early exit.
- [ ] Run tests including normal managed stock decrement, stale reservation and duplicate order behavior.
- [ ] Commit only this task's files after verification. Do not publish UI yet.

### Task 2: Admin persistence and customer selection
Files: `lib/productOptionAvailability.ts`, `QuickProductFastForm.tsx`, `lib/brandDetailTableOps.ts`, `app/order/page.tsx`, relevant linked projections and tests.
Interface: `isOptionManuallySoldOut(note: unknown,color:string,size:string,detailName?:string): boolean` mirrors SQL.
- [ ] Write failing normalization, form save/reopen and name-edit tests.
- [ ] Preserve manual_soldout through all variant projections, add 판매중/품절 per option regardless inventory toggle; quantity controls stay conditional.
- [ ] Disable only matching customer options, recheck on add-to-cart.
- [ ] Run all package test scripts, build, desktop/mobile visual checks.

### Task 3: Release and verification
- [ ] Re-read production RPC hashes and apply reviewed migration only if unchanged.
- [ ] Verify pure SQL fixtures without production order writes; deploy frontend after backend verification.
- [ ] Verify deployed commit and actual admin unsaved form; record untested paths explicitly.

## Sources and decisions
- PostgreSQL explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html — existing FOR UPDATE serializes option edits and checkout.
- Shopify inventory states: https://help.shopify.com/en/manual/inventory-and-locations/fundamentals/inventory-states — inventory quantity is a separate operational concept. Manual option sale-state is our requested custom behavior, not a claimed Shopify equivalent.
- User explicitly requests uninterrupted sequential execution; no routine design-approval pause.

## Execution evidence — 2026-10-10
- Task 1/2 implemented. DB test first failed on unmanaged hold accepted; UI test first failed on missing inventory-OFF controls. Both now pass.
- Independent reviewer found empty/없음 legacy rebuild losing state and requested live stock-sync audit. Both reproduced with failing tests and fixed. Actual deployed stock-sync RPC reconstructed only color/size/stock; guarded patch preserves manual_soldout on cancellation/restocking.
- All 26 package `test:*` commands passed. Production build passed. Existing deprecation/module-type warnings remain.
- Synthetic rendered real form checked at desktop and 390px: new option state section fits. Existing adjacent color/size controls overflow at 390px; broader mobile form repair remains queued, not claimed fixed.
- Production migration `option_manual_soldout` applied successfully. Three RPC guard flags verified; source hashes now claim=4e7c2f8d8e2da51fcd1f7152d4b4acc2, sync=906b0cfc826bc160f9c9d94257cc0bd2, submit=4f58a64462678deb5b3f511924e5b8ab.
- Security advisor before/after unchanged: 42 INFO RLS-without-policy, 15 WARN mutable search paths, 20 WARN anonymous and 20 WARN authenticated executable security-definer functions. Existing warnings remain outside this change; no new warning introduced. https://supabase.com/docs/guides/database/database-linter
- No production product, order, points or reservation test writes. Frontend commit 5ae86fc887a872bf4d894c5669daa780e03a949b verified READY with production alias on deployment dpl_FjJ77k7RNt8QRXYfkFLY5pCGxZVS.
- User refinement: no normal-option 판매중 label; admin uses a 품절 checkbox, customer marks only unavailable options. UI assertion first failed for missing checkbox, then passed including save/reopen/clear. DB guards unchanged; full build passed. Synthetic real-form browser confirms checked M and unchecked L with inventory OFF. Production draft was opened and cancelled without saving.
- Checkbox basis: https://design-system.service.gov.uk/components/checkboxes/ supports toggling a single option on/off. This is an admin control, not a normal-product status badge.
