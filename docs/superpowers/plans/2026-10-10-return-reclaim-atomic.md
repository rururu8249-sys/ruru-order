# Return reclaim atomicity implementation plan

> **For agentic workers:** Use superpowers:executing-plans, sequential native execution.

**Goal:** Prevent concurrent refund registrations from reclaiming points twice or overwriting balances.

**Architecture:** Preserve the existing once-per-order-group reclaim policy and negative-balance allowance. A service-role-only PostgreSQL function serializes each group and locks the existing customer balance; ledger and balance writes commit or roll back together. No historical correction or real customer test writes.

**Tech Stack:** Next.js route, Supabase PostgreSQL, local PostgreSQL 17 fixture.

**Spec:** User requested evidence-based CRM reliability and sequential completion without routine approval pauses. Review of order-return found separate history/read/insert/upsert operations. This plan addresses that concrete risk only.

## Global constraints

- Do not alter real orders, refunds, points, deposits or customer data to test.
- Do not change policy: once per group, selected-quantity amount proportion, negative balance allowed.
- Existing legacy reclaim rows must suppress another reclaim.
- Missing balance must fail closed, not create a zero balance.

## Review focus

- Same group requested concurrently: one ledger entry and one decrement.
- Different groups for one customer: all deltas preserved.
- One write fails: neither ledger nor balance commits.
- Missing balance and unauthorized role: no mutation.
- Existing legacy record and response retry: no second decrement.

### Task 1: Atomic function and route integration

Files: new `supabase/migrations/20261010120000_order_return_points_atomic.sql`, new `scripts/test-order-return-atomic.mjs`, existing order-return route and route tests.

Interface: `reclaim_order_return_points(p_phone text,p_group_id text,p_amount integer,p_nickname text,p_customer_name text,p_memo text) returns jsonb`; result `ok`, `duplicate`, `reclaimed`, `balance_after`, `message`.

- [ ] Write and run local PostgreSQL tests: 20 same-group calls decrement 100 once; 20 different-group calls decrement 100 each; legacy/retry no decrement; missing balance/roles rejected; injected ledger/balance write failures roll back.
- [ ] Implement transaction advisory group lock, balance row lock, legacy history check and atomic writes; run tests.
- [ ] Replace separate route balance/ledger writes with the RPC; no fallback non-atomic writes; exercise actual route success/failure/duplicate responses.
- [ ] Run all package tests and build; independent read-only review.
- [ ] Apply additive function migration only after schema verification and tests, verify privileges without invoking mutation, release reviewed code and confirm deployment SHA/READY.
