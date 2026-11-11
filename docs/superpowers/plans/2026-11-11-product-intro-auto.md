# Automatic product introduction replay

**Goal:** Existing explicit product introduction saves its video position; customers replay from product options without losing their selections.
**Architecture:** Validated, per-broadcast/video/product settings records; existing moderator command executes widget + site guide first. The currently watched position supplies a timestamp, including live DVR and ended recordings. Paused positions remain valid until player state/position changes. Read-only API exposes a record only for current visible catalog targets. Replay uses the existing iframe and preserves the parent option state.
**Tech Stack:** Next.js App Router, React, Supabase settings, YouTube iframe.
**Spec:** User requires no additional routine operator steps or management tab. Existing replace-selection introduces; append and automatic rotation do not. Multiple selected products share the timestamp. Public menu sits in product options; replay has product-return and live-return. No retroactive guessing for old introductions.

## Global Constraints
- No order, payment, stock or Bankda writes/logic changes.
- Bind every record to broadcast + video + canonical product target. Validate moderator identity before recording.
- Missing or stale playing telemetry must not fabricate a timestamp. Deliberately rewound/paused playback is supported. Report skipped recording privately while keeping successful widget/chat actions.
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

## Ended-recording correction (2026-11-11)
- Removed live-head-only capture gate. Capture the watched position, with the existing 5-second pre-roll bounded by the playable range. Playing samples still require freshness; paused samples retain their confirmed position.
- Use duration when VOD does not provide seekableEnd. Refresh stale playing samples with a bounded wait, canceling on player replacement/unmount.
- Start intro seeking from the known playable range when a paused iframe sends no new periodic packet. Fresh playback telemetry still confirms arrival.
- Regression: model/persistence/public GET, actual POST, React hook paused VOD/duration/seek/trust boundary/refresh/timeout/cleanup, mobile390/desktop1440 actual components.
- Actual ended YouTube tBZ_wBUQtRI: pause, seek while paused to239.2, wait6seconds, save234seconds, customer intro playback arrives233.408861/state1. No production widget/chat writes performed for testing.
