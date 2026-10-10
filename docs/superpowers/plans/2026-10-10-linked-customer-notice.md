# Linked customer notice implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** One registered public notice supplies the customer banner and its directly opened detail, preserving legacy content.

**Architecture:** Store only an optional notice ID in settings. Resolve current public notice data at read time, not a copied title/body. Keep legacy fields untouched and reuse the existing detail modal. No personal-message or payment writes.

**Tech Stack:** Next.js, React, Supabase, Node test scripts.

**Spec:** docs/superpowers/specs/2026-10-10-crm-operating-architecture.md (notice integration slice only).

## 2026-10-10 correction in progress

User clarified that the arrival popup is NOT the public notice detail. The earlier reuse of that popup was incorrect. Current local correction dispatches the exact public notice ID to the notice-detail reader, keeps the arrival popup independent, and displays no banner when no public notice is selected. Existing popup fields remain unchanged. The public notice list now offers selection followed by the existing explicit settings save; list pinning is labelled separately.

Verification: all 25 package test scripts passed; final production build passed. Customer-notice coverage includes direct public read, error hiding, racing responses, no personal-message writes, list selection without implicit publishing, and reopening the inbox at its list (regression observed RED then GREEN). Correction is not yet released. Additional product/card requests remain queued in the architecture spec, not marked complete.

## Global Constraints

- Preserve old popup settings when no link exists; do not migrate or delete live content automatically.
- A linked banner displays the selected notice title, never a separately entered banner summary. Details opens that same notice body. User explicitly reconfirmed this requirement.
- Hidden/deleted/failed linked reads must not expose legacy or private text.
- No real customer message, payment, order, or points mutation for testing.
- User requested sequential native execution without routine approval pauses.

## Review Focus

### Release verification (2026-10-10)

- Released commit `8effa70fccb530ce0897465cab3c29fd41fe38a8`; Vercel production `dpl_GBhZmnbboYQ6i2qjPmZ85ve7ZaET` READY with matching SHA and no alias error.
- All 25 package `test:*` commands and production build passed before release.
- Live admin public-list selection and exact linked title/body preview verified without saving. Reload discarded the test selection. Production currently has no selected top notice; no real notice was arbitrarily published.
- Direct-article behavior covered by automated interaction tests; live customer banner click with a saved selection remains unverified.
- The original task checklist below is historical. Final implementation intentionally keeps arrival-popup content independent; missing selection hides the banner rather than using legacy popup content.

- Missing/deleted/non-public notice: no stale banner.
- Failed settings load: admin cannot overwrite defaults.
- Long notice: body retained; existing modal scrolls.
- Switching back to legacy: original legacy values remain intact.
- Clicking banner must open displayed content, not unrelated inbox list.

### Task 1: Resolve and connect public notice

**Files:** create lib/customerNoticeSource.ts and scripts/test-customer-notice-source.mjs; modify components/admin-live/AdminLiveNoticePanel.tsx and app/order/page.tsx; add component interaction test.

**Interfaces:** `resolveCustomerNotice(rows, readPublicNotice)` returns `{title,text,bar,linked,available}`. Reader consumes a positive integer ID and returns matching `{id,title,content,is_visible}` or null. Invalid link/error produces unavailable, not legacy fallback. No configured link returns legacy text.

- [ ] Write real resolver tests with literal fixtures: legacy, valid public link, changed source text, hidden/mismatched/missing/error, malformed IDs, legacy restore.
- [ ] Run test; missing implementation fails. Implement resolver; rerun passes.
- [ ] Admin: load link setting; select public notices; show linked read-only preview and edit-list action. Hide duplicate title/body inputs when linked. Preserve legacy save fields. Disable settings save after load failure; linked choices unavailable until notice list loads.
- [ ] Customer: resolve notice during existing settings load; use resolved title/body/bar; keep popup enable separate. Banner opens existing content modal directly, inbox navigation unchanged.
- [ ] Add real interaction coverage for source selection and direct detail click where feasible; verify build and existing notice tests.
- [ ] Run package test commands sequentially, production build, review diff. Commit only scoped files; release only after review and verify deployment SHA. Never claim full architecture complete from this slice.
