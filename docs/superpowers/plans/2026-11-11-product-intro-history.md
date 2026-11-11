# Product intro video history Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User approved inline implementation of the discussed flow; reuse the current checkout and leave unrelated untracked files untouched.

**Goal:** Keep product introduction timestamps with their YouTube video and restore them when an operator reconnects that video, without resetting sales or registering products again.

**Architecture:** Retain existing immutable broadcast/video/target intro records. Read matching target bookmarks across broadcasts for the explicitly selected video, choosing the latest capture. Add an authenticated video history endpoint and compact picker alongside the existing URL field. Archive the old URL before replacing it. Existing pause keeps sales open; true sales closure remains OFF.

**Tech Stack:** Next.js 16, React 19, Supabase settings/broadcasts; no new service or AI credits.

**Spec:** Approved chat flow: A → B → A restores A's saved product introductions; unavailable/private YouTube videos cannot be made public by the site. Current sale visibility and product identity are authoritative.

## Global Constraints
- Never delete intro records when changing a video; never copy an A timestamp to B.
- Current broadcast must be ON and selected video must match before public lookup. Paused ON remains valid.
- Only exact current visible product ID/detail matches receive links; no price/order/stock changes.
- No invented timestamps or retroactive automatic links for unrecorded products.
- Video history selection updates the existing URL form; existing Apply saves. Clear pending/success/error feedback.
- Preserve old broadcasts' sales dates/status; choosing a video changes video, not sale ownership.

## Review Focus
- Same video attached to a different broadcast restores matching products.
- An older capture must not defeat a later correction; malformed keys/values excluded.
- Database failure must not report a successful URL change or lose its old history.
- Hidden/removed products and a nonselected/private video must not leak through public lookup.
- A slow response for A after switching to B cannot show A's button.

### Task 1: Restore exact video bookmarks across broadcasts
Files: lib/productIntroServer.ts; app/api/live-chat/product-intro/route.ts; scripts/test-product-intro-history.mjs; scripts/test-product-intro-list.mjs.
- [x] Add failing A → B → A / cross-broadcast / newest / malformed / hidden tests using real server helpers with an in-memory settings transport.
- [x] Implement a video-scoped index keyed by exact target digest, retaining v1 writes and current broadcast authorization.
- [x] Run intro API, player, link, catalog and new history tests.

### Task 2: Remember and choose past videos
Files: lib/broadcastVideoHistory.ts; lib/broadcastVideoHistoryServer.ts; app/api/admin-live/video-history/route.ts; components/admin-live/liveBroadcastController.ts; components/admin-live/BroadcastVideoHistoryPicker.tsx; components/admin-live/LiveHeader.tsx; components/admin-live/AdminLiveDashboard.tsx.
- [x] Test authenticated archive/update and history deduplication, old overwritten video discovery, stale-write conflict and errors.
- [x] Save old metadata before URL replacement using exact old URL optimistic concurrency. History merges broadcast URLs, saved metadata and existing intro records. Admin-only route paginates reads.
- [x] Integrate a compact date/title/search picker with thumbnails into existing URL form, no extra menu. Return explicit save errors; never show success after failure.
- [x] Verify picker interaction and A/B/A component isolation. Run relevant tests and TypeScript/build checks.

### Task 3: Verify and deliver
- [x] Review full change and run meaningful regression suite, build required guards.
- [ ] If deploy access is available, deploy reviewed build and verify read-only production endpoints/UI; never replace the user's selected broadcast for a test.
- [ ] Report shipped vs verified vs remaining limits, provide short usage instructions.
