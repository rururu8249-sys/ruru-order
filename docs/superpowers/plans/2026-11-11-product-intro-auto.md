# Automatic product introduction replay

**Goal:** Existing explicit product introduction saves its video position; customers replay from product options without losing their selections.
**Architecture:** Validated, per-broadcast/video/product settings records; existing moderator command executes widget + site guide first. Fresh live-player telemetry supplies a timestamp. Read-only API exposes a record only for current visible catalog targets. Replay uses the existing iframe and preserves the parent option state.
**Tech Stack:** Next.js App Router, React, Supabase settings, YouTube iframe.
**Spec:** User requires no additional routine operator steps or management tab. Existing replace-selection introduces; append and automatic rotation do not. Multiple selected products share the timestamp. Public menu sits in product options; replay has product-return and live-return. No retroactive guessing for old introductions.

## Global Constraints
- No order, payment, stock or Bankda writes/logic changes.
- Bind every record to broadcast + video + canonical product target. Validate moderator identity before recording.
- Missing/stale/rewound playback must not fabricate a timestamp. Report skipped recording privately while keeping successful widget/chat actions.
- Current broadcast/video only in this increment. Expired DVR points show an honest unavailable state; no misleading playback success.
- Preserve intentional replay across application switching. No new admin tab.

### Task 1: Record and retrieve validated introductions
Files: lib/productIntro.ts, lib/productIntroServer.ts, lib/liveChatProductCommand.ts, lib/liveChatProductCommandServer.ts, app/api/live-chat/route.ts, app/api/live-chat/product-intro/route.ts, scripts/test-product-intro.mjs.
Interface: ProductIntroCapture {videoId, seconds, capturedAt}; ProductIntro adds recordedAt. Optional post-command callback receives resolved catalog targets. Settings key hashes exact canonical target.
Tests: RED then GREEN capture freshness/live-head/video match, server timestamp validation, independent target storage, errors, nonmatching video, visible-only lookup. Existing command route tests unchanged.

### Task 2: Connect live player and product options
Files: lib/useProductIntroPlayer.ts, components/customer/ProductIntroLink.tsx, components/customer/LiveWatchView.tsx, app/order/page.tsx.
Interface: batch target carries optional intro; watch view provides capture on explicit replace. ProductIntroLink loads a record and passes it to the parent's replay request; sheet open=false suspends presentation, not form state. Replay seeks once ready, verifies arrival with timeout, maintains manual review intent, offers return-to-options and live.
Tests: controller RED/GREEN replay readiness/range/timeout/retry/manual-intent; actual component browser fixture at mobile/desktop, preserving iframe and selected form state.

### Task 3: Verify and integrate
Run focused and regression tests, tsc, build with both BANKDA guards; independent code review; inspect final diff. Fetch main, commit exact changed files, push and verify Vercel. Prepend CLAUDE progress and verify docs deployment. No production test announcements.

## Review Focus
Canonical parent/detail mapping, mismatched iframe/source/video, stale telemetry and app switching, read API exposure, authentication, delayed request races, option-sheet history and focus, invalid/expired DVR, unintentional recording on append/auto-cycle, no loss of existing commerce behavior.
