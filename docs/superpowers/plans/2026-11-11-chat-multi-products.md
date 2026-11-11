# Chat multi-product selection implementation plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** Make comma-separated admin product search and photo-based multi-selection actually work, with explicit replace/append rotation and small product photos in site chat.
**Architecture:** Reuse the verified broadcast catalog and existing private command route. Validate all selected targets before saving one rotation; post one private receipt plus public product guides. Existing cart/order/money functions remain untouched.
**Tech Stack:** Next.js App Router, React, existing Supabase server client.
**Spec:** User requests and accepted flow in this conversation (09:23 design; 09:41 failed comma entry).

## Constraints
- Admin-only slash commands, private original text; guides only in site chat.
- No selection executes while typing. Up/down navigate, Enter toggles, explicit buttons execute.
- Retain selections across searches; split commas before normalization; ambiguous matches require choice; unmatched terms stay visible.
- Up to 20 selected products per operation; current catalog/availability revalidated server-side; no silent partial acceptance.
- Photos from existing catalog, detail photo before parent; no message schema migration.
- Preserve existing single-command compatibility and ordinary chat/emoji flows.
- Append keeps current rotation (all/history/selected) and deduplicates; prevent stale append overwrite using compare-and-set.

## Tasks
- [x] Add failing search/multi API regression tests, implement shared search/selection utilities and server bulk replace/append.
- [x] Add picker photo/checkbox/selected chips/explicit actions; wire existing send callback, retaining draft on failure.
- [x] Add small product thumbnails to existing product/cart bot rows via current customer product list, preserving open-product callback.
- [x] Run actual-component, API, private-command, widget and browser tests; independent review; tsc/build BANKDA2 guards.
- [x] Push, verify Vercel success, prepend CLAUDE progress with feature hash and document any unchanged baseline failures.

## Verification notes
- Actual POST, append CAS/all/history, shared search, picker and photo tests pass; incremental BB-30 → BB-307 auto-check regression fixed and independently re-reviewed.
- Actual LiveWatch browser harness: PC1440x900/mobile390x844; photos, checkbox actions, failure/retry selection retention, exact batch payload, unknown-term blocking, photo opens existing product callback. No production test messages or widget mutations.
- `npx tsc --noEmit` and production build pass; BANKDA safety guards both pass. Existing unrelated admin UI guard8 and option-split guard1 findings unchanged from HEAD.
- Production read-only catalog check: PD-509 exists; BB-307 absent; MC-307 is white. Unknown comma terms are displayed separately, never substituted.

Feature deployment: `ca538db`, Vercel success verified.
