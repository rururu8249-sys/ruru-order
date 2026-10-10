# Shopping guide notice consolidation

> Use superpowers:executing-plans, inline sequential execution as requested by the user.

**Goal:** One public notice editor instead of a separate shopping-guide settings editor, without losing the existing public text.
**Architecture:** Atomically copy the existing nonempty `settings.notice_text` into a pinned public notice, record `shop_guide_notice_id`, and retain the original setting as a recovery copy. The customer inbox stops producing its synthetic guide row once the migration marker exists. Public notice visibility remains authoritative, even after hiding/deleting the migrated article. The top banner selection and arrival popup remain independent.
**Spec:** `docs/superpowers/specs/2026-10-10-crm-operating-architecture.md`, user request to consolidate the separate shopping guide.
**Tech:** Next/React, Supabase Postgres, PGlite.

## Constraints and review focus
- No content rewrite, automatic message sending, order/payment changes, or banner selection.
- Empty text creates no empty public notice; migration reruns create no duplicates.
- Preserve a byte-for-byte backup; copy actual text, not a guessed replacement.
- Hiding/deleting a migrated notice must not revive the legacy public text.
- Older clients receive normal notices and no duplicate synthetic guide.
- Settings save must no longer overwrite the retained legacy backup.

## Sequential tasks
- [ ] Test migration on nonempty, empty, repeated, same-title/different-body, and hidden/deleted migrated article fixtures using PGlite; observe RED before SQL implementation.
- [ ] Implement `supabase/sql/consolidate_shop_guide_notice.sql`; use a transaction/locked setting and marker, preserving original value.
- [ ] Test real admin editor no longer exposes/writes notice_text; remove separate editor/preview. Keep legacy customer fallback only when marker absent; test marker present even when its notice is absent.
- [ ] Remove the unreachable order-page legacy notice sheet after checking its only opener.
- [ ] Run notice tests, full build, independent review; apply migration and release only after checks. Record deployment SHA and actual verification limits.

## Research
https://www.cheshireeast.gov.uk/council_and_democracy/council_information/website_information/web-standards/duplicate-content.aspx — maintain one authoritative source rather than independently maintained copies. This supports consolidation; it does not prescribe our schema or imply the reference site was copied.

## Preceding release completed
Option manual soldout commit `5ae86fc887a872bf4d894c5669daa780e03a949b`, deployment `dpl_FjJ77k7RNt8QRXYfkFLY5pCGxZVS`: READY, production alias verified. Server guards and all 26 test commands passed. Production administrator unsaved verification pending; no real order test performed.

## Execution evidence
- User requested no normal 판매중 label. Follow-up `280d71b803fc3445dfc1d8b2d59a68f01d6657d0` deployed READY (`dpl_5n7EuM5Rm7GdkNAxMuAEU5grcqYQ`), production alias verified. Actual admin unsaved M/L fixture checked: M alone checked, no selling labels, inventory OFF; cancelled without saving.
- Migration test first failed on missing completion marker. API and admin tests failed on legacy revival and duplicate editor, then passed after implementation.
- Independent read-only review found tabs/newline-only text would create a blank notice. Treated as a release-blocking visible regression; failing fixture reproduced, exact JavaScript whitespace trimming check fixed it. Original copied/backup content remains unchanged. No remaining confirmed critical/important findings.
- All 27 package test commands and build passed. Review did not claim production/browser verification; release checks remain separate. Unrelated dirty files preserved.
- Release order: deploy API/UI first, then migrate public guide data so old API does not produce duplicate guide during transition. No orders, payments, messages or top-banner selection modified.
