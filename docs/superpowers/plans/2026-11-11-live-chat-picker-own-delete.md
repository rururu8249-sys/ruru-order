# Live chat product picker and author deletion

> **For agentic workers:** Use superpowers:executing-plans to implement sequentially.

**Goal:** Moderator slash product picker; author soft-delete; moderator-only deleted originals.
**Architecture:** Reuse current fresh catalog and widget command service. Keep hidden_at/hidden_by soft deletion; public realtime stays redacted. Use a separate state-bound Kakao verification flow to issue a signed HttpOnly chat identity, without changing ordinary login or customer sync; never use supplied Kakao IDs to authorize private history or author deletion. Existing ordinary chat compatibility remains.
**Tech Stack:** Next.js App Router, React, Supabase existing schema, node crypto.
**Spec:** User request in this chat, 2026-11-11: slash alone opens selection for moderators, viewers longpress their own message to delete, moderators see dimmed deleted originals.

## Constraints
- No money/order/payment/stock mutations. No production test chat or widget changes.
- Read actual lines before edits; minimum diff; tsc + build with both BANKDA guards; push + Vercel success; CLAUDE top entry with hash.
- New private access uses verified session, with one-time chat-only Kakao verification (7-day session). No public deleted bodies or author account IDs.
- Maintain current slash command behavior, mobile composer/IME and moderator menus.

## Review Focus
- Spoofed identity, other-author deletion, expired/mismatched sessions and logout.
- Public deletion broadcast must never include original; refresh and realtime moderator views converge.
- Picker stale/duplicate/linked targets, sold out, empty catalog, failed save.
- Mobile keyboard/longpress/scroll and desktop arrows/Enter/IME.
- Out-of-order public realtime and private response must not restore deleted public messages.

## Task 1: Picker
- [x] Add isolated tests for list/search, role guard and fresh selected target validation.
- [x] Extend command service/route with exact selected target, lazy read-only catalog endpoint.
- [x] Add shared desktop/mobile picker above composer; arrows/Enter/Escape and tap. Only moderators, slash suppresses ordinary/emoji submission.
- [x] Run command, component and browser regression tests.

## Task 2: Identity and deletion
- [x] Add signed chat session helper and dedicated OAuth issuance through the existing callback URI; clear/reject mismatched accounts on private requests. Add auth tests (forgery, expiry, mismatch).
- [x] New private history/own-delete route: verified identity, row ownership, atomic id+author+visible conditional update; hidden_by=author, pinned_at=null. Moderator reads visible + author-deleted originals only. Existing message schema retained; a narrow settings trigger protects moderator role fields from anonymous changes.
- [x] Add optional mine/deletedByAuthor metadata; retain only authorized tombstones. Public events trigger authenticated reconciliation, never reveal originals.
- [x] Integrate longpress/rightclick own delete and dimmed labeled originals in LiveWatch and authenticated chat-view viewers. Verify through a dedicated OAuth flow using the existing callback URI; customer login/sync remains separate.
- [x] Test public/owner/moderator permissions, repeated/delete race, pinned removal, realtime/refresh and UI.

## Task 3: Release
- [x] Independent security/functional review, necessary corrections, relevant regression suite.
- [x] tsc, build, push; Vercel success; CLAUDE deployment entry.

## Verification and release notes
- Actual Chrome desktop/mobile: slash catalog, aliases, arrow/Enter/Escape, IME, sold-out/empty, precise target; own-only rightclick/longpress/delete failure; dimmed private originals and permission-loss menu clearing.
- Actual private React hook: oldest deleted original retained; live delete; stale public delivery cannot resurrect it; logout invalidates pending private response.
- Unit/API: signature/expiry/nonce/account mismatch, OAuth state/provider failure, ownership/CSRF/soft-delete/pin/idempotency, private originals, role-grant escalation; existing product/initial-read and UI/clipboard regressions pass.
- tsc and production build passed with both BANKDA guards.
- Production trigger installed with transactional isolated temp-table tests for unchanged-role display update/upsert, owner/mod changes, key renames, deletion, unrelated settings and authenticated role. No live setting values or messages changed.
- Browser Kakao sign-in requires the user account; external live OAuth was not performed by the agent. Existing signed admin session can review originals immediately.
- Release 23bee9e pushed; Vercel success. Production: public chat 50 messages/200 with no private fields, private unauthorized 401, catalog unauthorized 403, OAuth state redirect 307 with Secure HttpOnly cookie, order/chat-view 200.
