# Live automation implementation plan

> **For agentic workers:** Use superpowers:executing-plans task by task. Preserve the original checkout. This worktree starts at 4f6a048.

**Goal:** Implement the approved design plus user-requested v1.5 tempo, mobile switching and nickname pool design using one existing customer and isolated actors/sessions, real customer APIs, controllable resource use and normal public presentation.

**Architecture:** Private database campaigns persist identity and order counts across OFF/ON. Atomic RPCs own controls, leases, action outcomes and scheduler state. Existing customer APIs authenticate narrow automation capabilities and retain their common validation/storage path. A server worker drives API sessions; the old browser host is retired. Browser verification is separate from the worker.

**Tech Stack:** Next 16.2.6, React 19.2.4, TypeScript, Supabase Postgres/pg_cron/pg_net/Vault, PGlite and existing Node test loaders.

**Spec:** ../specs/2026-11-13-live-automation-design.txt

## Global constraints

- One existing customer only; no global customer nickname mutation. Sessions/actors share owner but not carts, actions or nicknames.
- Per ordering actor 1–3 distinct forms per broadcast campaign; variable quiet/steady/burst tempo with rolling-hour and concurrency caps. A posted product question binds the same actor/product to submission 30–120 seconds later.
- Sold-out preflight sends no submit request. A stock race must roll back the entire save. No inventory, points, settlement, payment matching, shipping or external messages from automation.
- One primary Start/Stop controls all three features atomically; independent switches stay in collapsed details. Default OFF. OFF cancels unsent work and scheduler; no dedicated periodic polling when everything is OFF. Manual action makes one order without enabling switches.
- One shared Gemini gate for all environments and retries. Unknown/malformed policy denies calls; provider policy and local counters are distinct. No billing changes.
- Public presentation retains existing design and counts valid sessions, without test badges. Provenance remains internal. Ended runs hide their public messages.
- Existing unrelated files, normal customers and other cron jobs remain intact. No deployment claim without verified deployment and live evidence.

## Review focus

- Concurrent OFF and submit: whichever transaction acquires campaign lock first determines commit; late worker cannot resurrect work.
- Shared owner identity: no cross-actor cart cleanup, nickname overwrite, retrieval or order allowance reset.
- Lost HTTP response: same idempotency key recovers outcome; no new form on timeout or deleted-order retry.
- Config failure or scheduler unavailable: ON fails atomically; never show active UI without an active scheduler.
- Public and ordinary browser observations: no mock counts, private debug overlays, leaked permissions or source labels; API execution is never called browser-click verification.

## Task 1 — Pure scheduling and persona rules
Files: lib/liveAutomation.ts, lib/liveAutomationPersona.ts, lib/autoTestOrder.ts; scripts/test-live-automation.mjs.
Interfaces: createPersona(seed), personaLine(profile,kind,index), duplicateLine(text,recent), orderWindow(last,now,random), questionWindow(due,random), dwellMinutes(random), nicknameKey(text), validatePlannedLines(planned,current).
- [ ] Write failing assertions for exact dwell choices, 300–570 sec dispatch budget, 30–90 sec question lead, 1–3 form targets, persona stability/diversity, duplicate rejection, unavailable option rejection.
- [ ] Run node --import ./scripts/_ts-resolve.mjs scripts/test-live-automation.mjs; expect failure for missing implementation.
- [ ] Implement pure contracts and reusable product eligibility without the old historical-order date filter.
- [ ] Run the same command; expect PASS. Commit task.

## Task 2 — Persistent sessions, actions and lifecycle
Files: supabase/migrations/20261113071302_live_automation_sessions.sql, scripts/test-live-automation-db.mjs, lib/liveAutomationServer.ts.
Interfaces: automation_control(broadcast,feature,enabled,revision), automation_claim(kind), automation_complete(action,lease,outcome), automation_session_context(session), automation_tick_dispatch(). Internal state includes campaign, actor, session, action, alias, shadow cart and last result.
- [ ] Write PGlite behavior assertions: default OFF; stale revision rejection; OFF/ON counts retained; distinct nicknames; exact dwell; leases and fencing; stopped session rejects writes; same source message only once; actor target prevents fourth form; no stock/payment effects from verified automation.
- [ ] Run database test, observe missing schema failure.
- [ ] Implement tables with service-only grants/RLS, lifecycle RPCs, constraints and cron lifecycle. Configure Vault separately; never serialize credentials in cron commands or public state.
- [ ] Add order-boundary wrapper around the existing common order RPC and narrowly scoped stock-mutation suppression for verified automation only; transactional product checks and flags precede common save. Keep ordinary path unchanged.
- [ ] Run database suite and existing order guards; expect PASS. Commit task.

## Task 2a — Latest user revisions
- [ ] Replace fixed submission interval and dwell list with persisted variable tempo and rolling limits.
- [ ] Prepare 200 collision-checked nickname candidates, atomic assignment, customer-priority collision retirement and on-demand refill.
- [ ] Keep question 30–120s binding, sparse AI independently of order load, cart dwell and no catch-up.
- [ ] Verify boundaries, concurrency, retries and ordinary member collision races.

## Task 3 — API authentication and worker execution
Files: lib/liveAutomationAuth.ts, lib/liveAutomationWorker.ts, app/api/{presence,live-chat,cart-reservations,customer-orders/submit}/route.ts, app/api/cron/auto-test-order/route.ts.
Interfaces: signed short-lived capability(session,action,revision,scope), requireAutomationContext(request,owner,scope), runAutomationTick(db,origin,kind), runAutomationNow(db,origin).
- [ ] Add tests: unsigned reserved customer denied; wrong session/scope denied; preflight sold-out transport count zero; bound product retained on card rotation; timeout recovery retains group ID; chat/presence OFF cannot be bypassed by manual order.
- [ ] Observe RED, implement common API integration and short worker tasks; no sleeps or shared nickname update.
- [ ] Keep normal API validation; shadow holds do not reserve live stock. Suppress external callbacks for verified automation; attach links atomically.
- [ ] Verify customer and automation regression suites; commit task.

## Task 4 — Gemini shared admission and natural conversation
Files: lib/geminiGate.ts, lib/geminiJson.ts and other discovered Gemini transports, lib/autoTestChat.ts, lib/liveAutomationConversation.ts; scripts/test-gemini-gate.mjs and conversation tests.
Interfaces: shared permit immediately before HTTP, model policy with RPM/RPD/TPM, feature priority and attempt ledger; conversation uses actor persona and bounded history.
- [ ] Write failing tests for malformed quotas, development bypass, minute-boundary bursts, each retry counted, unknown TPM denial, model 429 not hopped, Q/A reserves, duplicate direct mentions and non-LIVE questions.
- [ ] Implement central admission in all transports, remove auto-only 150 cutoff, use verified full provider caps (primary 500/day, 15/minute), no percentage reserve; defer background speech behind active interactive requests.
- [ ] Implement same-person consistent questions/replies and server variation; all product questions require an order slot; failures emit no internal text publicly.
- [ ] Run targeted gate/conversation tests and existing AI tests; commit task.

## Task 5 — Real presence and public presentation
Files: lib/liveAudienceServer.ts, lib/presenceWrite.ts, live chat client render/filter files found by references; tests for audience, public chat and stopping browser timers.
- [ ] Add tests with normal observer plus 1→3→5 unique automation sessions, expiry, OFF and other broadcast exclusion.
- [ ] Remove virtual-array addition; derive automation inclusion from valid sessions and actual presence only. Keep internal counts in private admin state.
- [ ] Remove public test label rendering and ensure terminated runs stop appearing in public events/history. Keep provenance for deletion.
- [ ] Verify original presence/chat tests with revised requirements; commit task.

## Task 6 — Existing admin controls and manual action
Files: components/admin-live/AutoTestOrderSettings.tsx, ScreenTestHost.tsx, app/api/admin-live/auto-test-order/route.ts, vercel.json; scripts/test-live-automation-ui.mjs.
- [ ] Add component/route tests for independent switches, OFF polling zero, hidden-tab pause, stale response, one manual action, stop available while running and failure rollback.
- [ ] Reuse existing card/Switch tokens, add viewer switch, retain run/delete controls, one-line results and folded details. Replace unsafe storage-overwriting host with authenticated optional host contract.
- [ ] Remove only /api/cron/auto-test-order from vercel.json; new database schedule is active only when needed. Strict credential verification replaces user-agent authentication.
- [ ] Verify component tests, narrow/mobile layout and all eight feature combinations; commit task.

### Task 6b — Manual chat using an ordering actor
Files: app/api/live-chat/automation-persona/route.ts, lib/liveAutomationManualChat.ts, existing LiveWatchView closed toolbar and open composer and parent chat sender.
- [ ] Add failing tests: verified admin or server-verified designated Kakao account only; forged phone/capability denied; manual actor has active presence/cart or today saved orders in this broadcast; AI needs cart or today orders; ordinary customer identity remains untouched.
- [ ] Add a private composer-adjacent selector in both mobile states, recent shortcuts and one-tap own-identity reset; preserve drafts and bind identity during send. Reuse the existing input and /api/live-chat POST, passing a short-lived narrowly scoped selection permit; manually entered text is never generated by AI.
- [ ] Persist a one-message action/idempotency key even when automatic chat is OFF. No automatic switch/scheduler/viewer mutation. Clear selection at logout/expiry/broadcast change/reload.
- [ ] Verify independent public browser receives exactly one message under selected nickname; replays and stale broadcast capabilities denied.

## Task 7 — Integration verification and review
- [ ] Run targeted behavior/DB/route/UI suites, npm run guard, npx tsc --noEmit, npm run build, git diff --check. Record pre-existing dependency audit findings without upgrading unrelated packages.
- [ ] Validate real local UI with two isolated contexts using real routes and isolated data; record API versus browser execution evidence separately.
- [ ] Fresh whole-branch review; reproduce important findings with failing tests and fix. Re-run affected suites and build as appropriate.
- [ ] Update CLAUDE.md and user-facing report with exact files, checks, remaining deployment dependencies and rollback.

2026-11-13 checkpoint: local implementation and 40 focused suites pass; actual admin component rendered and clicked at narrow card width. Latest affected automation suite rerun after fixes. Production build and TypeScript verified separately. Existing UI guard has the same 13 violations on base; existing option-split guard flags unchanged chat tokenization. Whole-branch reviewer found uncertain-action recovery and order failures suppressing chat; both reproduced and fixed. Production remains untouched. Real multi-device, actual provider policy and production end-to-end acceptance remain pending; do not mark Task 8 complete.

## Task 8 — Apply and verify the operational result
- [ ] Check actual project policy, pg_net availability and deployment settings; prepare additive migration with OFF defaults and protected scheduler configuration.
- [ ] Apply the reviewed authorized change and deploy if repository approval requirements are satisfied; otherwise present the tested concrete diff and identify the exact final approval rule.
- [ ] Verify live API authorization, UI, order IDs, question timing, viewer dwell, independent OFF/ON, OFF stable 10-minute request absence, cleanup and normal-customer noninterference. No 120-minute dwell pass without actually observing it.
- [ ] Deliver results with pass/fail/not-run for the 54 spec checks; do not call unverified items complete.

Latest v1.6 execution order: finish 200-name candidate catalog (done, current customer conflicts zero), then atomic nickname pool and manual leases/AI fencing, then mobile selector in both compose states. This advances Task 6b alongside Task 2a before resuming remaining Task 3+ APIs. Current-state broadcast eligibility and four-operator concurrency are mandatory.
