# Subscription checkout replay follow-up

Base: `d6f406dbde399a8bef956714dc56d42c260de471` on
`fix/subscribe-once-point-20261122`.

## Reproduced problem

The prior promotion-only retry exception allowed a saved order past the
subscription eligibility check, but the actual POST then counted its quantity
again against purchase limits or rejected its already-released cart hold.
Both failures were reproduced with the unmodified POST and real local helpers.

## Change

- Ordinary customer requests first read the complete saved group, after the
  automation authentication check. Every row must match the customer and order
  intent. Exact counts, multiset comparison and matching saved bank snapshots
  prevent partial-row or altered-cart acknowledgements.
- An existing order returns saved amounts and account details without calling
  the save RPC or repeating recipient, cart, or notification writes. An RPC
  duplicate caused by a concurrent submit is also reread before returning.
- Shipping and point requests can change during client recalculation; replay
  confirmations use stored amounts. A duplicate refreshes the point balance
  instead of subtracting the original use a second time.
- During an unanswered submit, cart synchronization preserves matching submitted
  options in the same page. The clear-mark reason is explicit. Server holds and
  cart sequence numbers remain unchanged, so this cannot reserve sold stock.
  Admin clear, expiry, unavailable products and revocation still remove rows.
  A definite rejection ends this UI preservation without resetting the group ID.

## Verification

The tests execute the actual exported POST with database/framework fixtures,
the complete client cart-sync function with I/O/state fixtures, and client
success assignments with the real amount parser. The original failing POST
cases were also rerun against the unchanged base with realistic numeric Kakao
and UUID broadcast identifiers. Existing subscription, combine-shipping,
bank-response and cart-hold regressions were run.

Run `bash scripts/verify-subscribe-replay-20261122.sh` in the full review checkout
to include its existing dependencies, related regressions, TypeScript and build.
The partial review environment has no project node_modules: native TypeScript
syntax transformation is not a full type check, and the TypeScript-dependent
brand-submit test and full build require that full-checkout verification.

## Boundaries

- No production order, database migration, main-branch merge or production
  deployment was performed for this follow-up. Actual database transactions,
  transaction concurrency and genuine-device checkout E2E remain unverified.
- Recipient enrichment is still a separate best-effort write. If an alternate
  recipient was never durably saved, replay returns a conflict instead of
  assuming or rewriting it. Fully saved alternate recipients and default
  recipients are covered.
- Cart preservation covers submission-clear responses in the same page. It is
  not a durable payload journal for reloads, another tab replacing the draft,
  or user edits between attempts. Altered order contents are rejected by the
  server. A submitted clear mark alone is not proof that this pending group was
  saved; only the complete server group check supplies that acknowledgement.
- The previously prepared subscription migration and interpretation of legacy
  free-shipping history remain separate production-release work.
