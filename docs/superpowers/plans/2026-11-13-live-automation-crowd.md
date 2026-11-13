# Live automation crowd and payment-notice plan

> Execute inline with superpowers:executing-plans; final independent review before rollout.

Goal: Sustain roughly 50 genuine server presence sessions, fluctuate naturally, occasionally peak at 100; vary order waves and delayed rehearsal payment notices without touching financial truth.
Architecture: Keep one customer, independent DB actors/sessions and existing /api/presence HTTP endpoint. One authenticated batch heartbeat per campaign replaces per-person HTTP fan-out. DB population state persists target/cooldown. Existing order API remains authoritative. Delayed synthetic receipt events have their own table and only publish official chat notices, never payment/order status, ledgers, SMS or shipping.
Spec: User 2026-11-13 request: average ~50, rare100, quiet/busy order/payment rhythms. Existing nonfinancial rehearsal constraints remain. Routine implementation is delegated by user's repeated proceed instructions; no new approval gate.

## Constraints and defaults
- Baseline target 42–58 (mean50), renew every2–5min; spike target90–100 for2–3min, cooldown45–90min. First spike after15–30min. Growth <=15 /30s, shrink <=8 /30s; actual session expiry remains variable5–120min.
- Overall generated viewer cap100; normal member sessions are separate and can take total beyond100.
- First order45–90s; quiet3–8min; steady35–100s; burst4–8 forms over~90s, max3 concurrent submits and120 forms/rolling hour. Intermediate busy waves2–3 forms/60s; ordinary activity is central (20%quiet/45%steady/25%busy/10%burst wave selection). Postburst75%steady/25%quiet, never consecutive bursts. Spike can encourage next burst; AI still sparse6 proactive/hour.
- Each actor1–3 forms. Sold-out items never silently substituted after question. No added browsers, AI calls, or viewer-count-only offsets.
- Payment notification eligibility only successfully persisted automation orders. 80% receive delayed notice45–420s, some remain unpaid; notice body based on actual chosen payment method. No real paid state. Event primary key=order action; OFF cancels pending; retries cannot duplicate.
- No posts from real customer identities; manual selected persona suppresses AI as before. Official receipt bot is distinct from persona speech.

## Tasks
- [x] SQL migration: population cap/state/step, batch real presence, scaled order wave/admission, isolated payment queue/notice guard/dispatcher cancellation. Test with actual PostgreSQL behavior via PGlite:50/100/ramp, expiry/reconnect, OFF/revision, duplicate payment/no finance mutation/forged events.
- [x] Worker/API: prepare population+one batch HTTP heartbeat, <=8 wave, payment drain independent from AI; authenticated batching through presenceWrite. Tests pin100 sessions→one HTTP and ordinary callers cannot request a batch.
- [x] Read-only admin status: show actual active generated count and population goal, payment simulation status in details (no extra basic buttons). Preserve common customer count.
- [x] Run scoped regression/tsc/build/guards, independent review, migrate and deploy via GitHub. Start with user's explicit request; measure API/DB count and worker HTTP latency, ramp to~50, observe continued updates and orders/notices. Report exact verified bounds, no fabricated long-run spike observations.

## Review focus
- OFF concurrent with batch/late notice cannot reintroduce presence or publish payment.
- Batch scope cannot cross campaign or revive expired/session-stopped actors.
- Financial flags/status/points remain identical when synthetic notification publishes.
- Target reduction cannot cancel an in-progress order or manual chat lease; stop watching only, preserve session until normal expiry.
- Worker crash/restart does not catch up an unlimited backlog; per-tick bounds and persistent due dates.

## Rollout evidence
- a0fc666 deployed; migrations applied; current run started18:53KST, actual presence15→30→50→53 and public count matches plus ordinary sessions. Worker HTTP200/failures0; orders saved and isolated receipts queued. Full long-run cadence/rare natural spike remains unobserved.
- User cart-notice question exposed missing notification hook despite successful hold→submit. Added service-only validated cart-notice RPC and common formatter, tested before deployment.
