# Member-Segmented Bank Account Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the administrator keep the current deposit account, add one additional account, choose one account for everyone or separate accounts for existing and first-order customers, and optionally retain first-order routing through a KST date window across broadcasts and shopping orders while preserving every submitted order's account snapshot.

**Architecture:** Store a versioned two-account routing configuration, including an optional inclusive KST first-order retention window, in one `settings` JSON value while retaining the existing three legacy account keys as the primary-account compatibility view. Submit broadcast and shopping orders through a new service-role-only Postgres wrapper that locks by stable customer identity, applies duplicate → same broadcast → active retention window → ordinary history precedence inside one transaction, writes an immutable bank-account snapshot into every order row, and delegates existing inventory/points/duplicate protection to the current submit RPC. Customer completion and order-history views read the saved snapshot, with a legacy fallback only for pre-migration orders.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2.4, TypeScript, Supabase/Postgres, `@supabase/supabase-js`, Node assertion/source-guard tests, Vercel.

**Approved specification:** `/Users/ruru/Documents/Codex/2026-10-01/https-ruru-order-vercel-app-admin/outputs/계좌-노출-설계서.md`

## Global Constraints

- The administrator may configure at most two bank accounts: existing primary account plus one secondary account.
- Routing mode is either `all` or `split`; `split` selects one account for existing customers and one for first-order customers. Both selectors may point to the same account.
- A first-order customer has no prior valid order group. Deleted, canceled, refunded, and operator-test orders do not count. A real unpaid order that was not canceled does count.
- Split mode may optionally define one inclusive `YYYY-MM-DD` KST retention window. A customer whose first valid order occurred inside that window remains `first_order` for new broadcasts and shopping orders until the window ends.
- With the retention window disabled, first-order status is not carried beyond the same broadcast: a new broadcast or post-broadcast shopping order is immediately reclassified from the latest settings and valid history.
- Additional orders in the same non-null `broadcast_id` inherit the first valid order group's segment and exact bank snapshot, even across midnight. The next different broadcast is classified from prior valid history. Orders without a broadcast ID use ordinary history classification and do not share an unlimited null-broadcast bucket.
- Admin changes to the date window, routing mode, or selectors apply immediately after a successful save to newly started orders. Duplicate retries, historical orders, and same-broadcast inherited snapshots remain immutable.
- Broadcast and shopping orders use the same routing policy; there is no shopping-only selector.
- Customer identity uses a normalized Kakao ID first and normalized phone as the fallback. Browser input never decides the segment or selected account.
- Two simultaneous first submissions by the same identity must serialize inside one database transaction.
- Each order row stores the assigned segment and account snapshot. Changing settings later must not change historical payment instructions.
- Account-routing failure is fail-closed: a bank-transfer order is not accepted when configuration or assignment is invalid. Card orders still receive an audit snapshot but do not show bank instructions.
- The existing `submit_customer_order_with_points` function remains unchanged; the new wrapper composes around it.
- The new database function is not executable by `public`, `anon`, or `authenticated`; only `service_role` receives execute permission.
- Do not modify Bankda matching configuration automatically. Show an explicit admin warning and verification checklist instead.
- Preserve all unrelated untracked and user-owned files in the existing checkout.

## Review Focus

- Confirm legacy orders still show a sensible fallback account without rewriting history.
- Confirm duplicate retry returns the already-saved snapshot instead of reclassifying the customer.
- Confirm the first-order check is performed before the new group is inserted and under the same identity lock.
- Confirm Kakao ID prevents a phone-number change from making an existing customer appear new.
- Confirm phone fallback checks all supported Korean phone storage formats.
- Confirm admin save cannot reference a missing/disabled account or create a third account.
- Confirm KST start/end boundaries are inclusive, invalid/reversed dates fail validation, and disabling the window makes the next different-broadcast/shopping order use ordinary history immediately.
- Confirm an admin save racing an order uses one complete old or new JSON configuration, never mixed fields.

---

## Task 1: Isolate the feature work and capture the current baseline

**Files:**

- Read: `/Users/ruru/Desktop/ruru-order-app/AGENTS.md`
- Read: `/Users/ruru/Desktop/ruru-order-app/package.json`
- Create worktree: `/Users/ruru/Documents/Codex/2026-10-01/https-ruru-order-vercel-app-admin/work/bank-account-routing`
- Test: existing scripts and build commands from `package.json`

- [ ] **Step 1: Record the dirty baseline without touching it**

Run: `git -C /Users/ruru/Desktop/ruru-order-app status --short --branch`

Expected: tracked tree is clean and the previously observed unrelated untracked files remain listed.

- [ ] **Step 2: Create an isolated branch/worktree from the verified remote default state**

Run: `git -C /Users/ruru/Desktop/ruru-order-app fetch origin main`

Run: `git -C /Users/ruru/Desktop/ruru-order-app worktree add -b feat/bank-account-routing /Users/ruru/Documents/Codex/2026-10-01/https-ruru-order-vercel-app-admin/work/bank-account-routing origin/main`

Expected: the feature worktree opens on `feat/bank-account-routing` with no user untracked files copied into it.

- [ ] **Step 3: Run the pre-change baseline**

Run: `npm run lint`

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-shop-info.mjs`

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-lookup.mjs`

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-submit-row-price.mjs`

Expected: record every pre-existing pass/failure exactly before feature edits.

- [ ] **Step 4: Commit checkpoint only after confirming the worktree contains no copied user changes**

No commit is expected at this task; this is a safety gate.

## Task 2: Define and test the two-account settings model

**Files:**

- Modify: `lib/shopInfo.ts`
- Modify: `scripts/test-shop-info.mjs`

- [ ] **Step 1: Write failing settings-model tests**

Add test cases for:

- legacy seven-key settings migrating to one enabled primary account;
- valid `shop_bank_config_v1` JSON with exactly two account slots;
- `all` routing selecting one enabled account;
- `split` routing selecting enabled existing/first-order accounts, including the same account for both;
- disabled retention windows with empty dates and enabled windows with valid inclusive `YYYY-MM-DD` dates;
- rejecting impossible dates, missing enabled-window dates, and `startDate > endDate`;
- rejecting a third account, duplicate account IDs, malformed JSON, invalid account numbers, and selectors referencing a missing/disabled account;
- serializing deterministic JSON and keeping `shop_bank_name`, `shop_bank_account`, and `shop_bank_holder` synchronized to the primary account;
- bank-line rendering from an explicit account snapshot.

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-shop-info.mjs`

Expected: FAIL because the new model and config key do not exist.

- [ ] **Step 2: Add the domain types and compatibility parser**

Implement these public interfaces in `lib/shopInfo.ts`:

```ts
export type ShopBankAccountId = "primary" | "secondary";
export type ShopBankAudienceMode = "all" | "split";

export type ShopBankAccount = {
  id: ShopBankAccountId;
  enabled: boolean;
  label: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
};

export type ShopBankRouting = {
  mode: ShopBankAudienceMode;
  allAccountId: ShopBankAccountId;
  existingAccountId: ShopBankAccountId;
  firstOrderAccountId: ShopBankAccountId;
  firstOrderWindow: {
    enabled: boolean;
    startDate: string;
    endDate: string;
  };
};
```

Extend `ShopInfo` with `bankAccounts` and `bankRouting` while retaining flat `bankName`, `bankAccount`, and `bankHolder` fields as primary-account compatibility aliases. Add `shop_bank_config_v1` to `SHOP_INFO_KEYS`.

- [ ] **Step 3: Implement strict validation and deterministic serialization**

Make `validateShopInfo` normalize labels, strip account-number whitespace, enforce the two fixed IDs, enforce at most one secondary account, validate every referenced account, and validate enabled-window dates as real inclusive KST dates with `startDate <= endDate`. Return Korean operator-facing errors that identify the exact bad field. Make `toShopInfoRows` write accounts, routing, and the entire window atomically in the versioned JSON plus the three legacy primary keys.

- [ ] **Step 4: Run the focused test**

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-shop-info.mjs`

Expected: PASS with both old compatibility assertions and new routing assertions.

- [ ] **Step 5: Commit**

Run: `git add lib/shopInfo.ts scripts/test-shop-info.mjs && git commit -m "feat: model two bank accounts and routing"`

## Task 3: Build the admin account editor and secure settings API

**Files:**

- Modify: `app/api/admin-live/shop-info/route.ts`
- Modify: `components/admin-live/ShopInfoSettingsTab.tsx`
- Create: `components/admin-live/BankAccountRoutingSettings.tsx`
- Create: `scripts/test-bank-account-settings-source.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing API/UI source guards**

Assert that:

- the API reads and writes `shop_bank_config_v1` only through authenticated admin + service role;
- the UI exposes primary and optional secondary account cards but no third-account action;
- deleting the secondary account cannot leave a routing selector pointing to it;
- the mode selector has `전체 고객 동일 계좌` and `회원 구분` options;
- split mode exposes separate existing-customer and first-order selectors;
- split mode exposes an optional retention-window switch plus start/end date inputs and states that the policy is shared by broadcast and shopping orders;
- disabled windows serialize empty dates and invalid/reversed enabled dates cannot save;
- saving a routing/account change requires an explicit confirmation showing all affected assignments and the Bankda warning.

Run: `node scripts/test-bank-account-settings-source.mjs`

Expected: FAIL before the component exists.

- [ ] **Step 2: Extract the bank editor into a focused component**

Implement controlled props for accounts/routing and accessible inputs. Keep the primary account permanently present, add/remove only the secondary slot, show live previews, and disable Save while the draft is invalid.

- [ ] **Step 3: Wire the editor into `ShopInfoSettingsTab`**

Replace the single-account fields with the editor, update `draft`, `applyInfo`, and the save-diff confirmation. The confirmation must distinguish account-detail changes from audience-routing changes.

- [ ] **Step 4: Keep the admin API fail-closed**

Use the shared validator for POST, return 400 for malformed routing, upsert only `SHOP_INFO_KEYS`, and read back/parse after the write. Do not accept arbitrary settings keys from the request body.

- [ ] **Step 5: Run focused checks**

Run: `node scripts/test-bank-account-settings-source.mjs`

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-shop-info.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add app/api/admin-live/shop-info/route.ts components/admin-live/ShopInfoSettingsTab.tsx components/admin-live/BankAccountRoutingSettings.tsx scripts/test-bank-account-settings-source.mjs package.json && git commit -m "feat: add bank account routing settings UI"`

## Task 4: Add immutable order snapshots and transactional customer classification

**Files:**

- Create with CLI: `supabase/migrations/<generated_timestamp>_bank_account_routing.sql`
- Create: `supabase/sql/check/bank_account_routing_verification.sql`
- Create: `scripts/test-bank-account-routing-sql.mjs`
- Modify: `package.json`

- [ ] **Step 1: Generate the migration through the Supabase CLI**

Run: `npx supabase migration new bank_account_routing`

Expected: the CLI reports the exact generated path under `supabase/migrations/`; use that file and do not invent a timestamp.

- [ ] **Step 2: Write failing SQL source tests first**

Assert the migration contains:

- nullable snapshot columns on `public.orders`: `customer_order_segment`, `payment_bank_account_id`, `payment_bank_name`, `payment_bank_account`, `payment_bank_holder`, `payment_bank_assigned_at`;
- a check constraint limiting segment to `first_order` or `existing` when non-null;
- a seven-argument wrapper function `submit_customer_order_with_bank_routing`;
- identity-scoped `pg_advisory_xact_lock` before prior-order classification;
- valid-order filters for deleted/test/canceled/refunded rows;
- deterministic `shop_bank_config_v1` parsing with legacy fallback;
- snapshot overwrite into every order JSON row before calling `submit_customer_order_with_points`;
- duplicate-result snapshot lookup by `order_group_id`;
- `REVOKE EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, and `GRANT EXECUTE` only to `service_role`.

Run: `node scripts/test-bank-account-routing-sql.mjs`

Expected: FAIL while the generated migration is empty.

- [ ] **Step 3: Implement the migration without replacing the current submit RPC**

The wrapper must:

1. validate the order group and normalized Kakao/phone identity;
2. acquire `pg_advisory_xact_lock(hashtextextended('bank-route:' || identity, 0))`;
3. if the group already exists, return the existing submit result plus its saved snapshot;
4. otherwise, when `broadcast_id` is non-null, reuse the segment and exact snapshot from the same customer's first valid order in that same broadcast; fail closed if same-broadcast snapshots conflict;
5. when no same-broadcast snapshot exists, query prior valid order groups and the first valid order timestamp by exact Kakao ID, or by phone variants only when Kakao is unavailable / the historical row has no Kakao ID;
6. read one complete current config JSON and, in `split` mode, retain `first_order` only when both the first valid order and current KST date are inside the enabled inclusive window; disabled windows never extend status beyond the same broadcast;
7. otherwise resolve `first_order` or `existing` from ordinary valid history and choose the current mode's account;
8. reject an absent/invalid selected account;
9. add the selected snapshot and current Kakao ID to every JSON order row;
10. call the existing six-argument `submit_customer_order_with_points` in the same transaction;
11. return its fields plus `customer_order_segment` and a `bank_account` object.

Use `SECURITY INVOKER`, `SET search_path = public, pg_temp`, fully qualify table/function names, and never expose the config through an unauthenticated RPC.

- [ ] **Step 4: Add executable verification SQL**

The check file must verify columns, constraints, function signature, grants, and run rollback-only fixtures covering first order; same-broadcast retention across midnight and config changes; disabled-window next-broadcast and shopping orders becoming existing; an active window retaining `first_order` across a different broadcast and shopping order; inclusive KST boundaries; immediate shorten/extend/disable changes; canceled-only history; test-only history; Kakao continuity across phone change; phone fallback; same-account split routing; duplicate retry; simultaneous identity serialization; and atomic old-or-new settings during a save race.

- [ ] **Step 5: Run static SQL checks**

Run: `node scripts/test-bank-account-routing-sql.mjs`

Expected: PASS.

- [ ] **Step 6: Run migration verification in a disposable/local Supabase database**

Run: `npx supabase db reset`

Run the generated verification SQL against the local database.

Expected: migration applies from a clean state and every fixture rolls back after PASS. If the repository's historical migrations cannot bootstrap locally, record that exact pre-existing limitation and validate the migration in a disposable branch database before production.

- [ ] **Step 7: Commit**

Run: `git add supabase/migrations supabase/sql/check/bank_account_routing_verification.sql scripts/test-bank-account-routing-sql.mjs package.json && git commit -m "feat: assign bank accounts transactionally"`

## Task 5: Route order submission through the secure wrapper

**Files:**

- Modify: `app/api/customer-orders/submit/route.ts`
- Create: `lib/orderBankAccount.ts`
- Create: `scripts/test-customer-order-bank-submit.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing submit-route tests**

Test pure parsing plus source guards for:

- normalized Kakao ID passed as `p_kakao_id`;
- the route calling only `submit_customer_order_with_bank_routing` for customer submits;
- client-supplied snapshot/account/segment fields stripped before RPC;
- successful responses returning a validated `bankAccount` snapshot and segment;
- duplicate retries returning the stored snapshot;
- missing snapshot on a bank-transfer submission causing a server error rather than current-settings fallback.

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-bank-submit.mjs`

Expected: FAIL.

- [ ] **Step 2: Add snapshot parsing helpers**

Define a narrow `OrderBankAccountSnapshot` type and strict parser in `lib/orderBankAccount.ts`. Account number may contain digits/hyphens only; all three display fields and account ID are required.

- [ ] **Step 3: Update the submit route**

Sanitize every incoming row, call the new wrapper with the stable identity, remove the post-submit Kakao stamping write because the wrapper now stamps atomically, and preserve unrelated recipient/hold-cleanup/YouTube behavior. Return `bank_account` from the RPC as `bankAccount` without exposing the full shop config.

- [ ] **Step 4: Run focused tests**

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-bank-submit.mjs`

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-submit-row-price.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add app/api/customer-orders/submit/route.ts lib/orderBankAccount.ts scripts/test-customer-order-bank-submit.mjs package.json && git commit -m "feat: return assigned bank snapshot on submit"`

## Task 6: Show and copy the assigned account after order completion

**Files:**

- Modify: `app/order/page.tsx`
- Modify: `components/customer/CustomerPaymentGuideBottomSheet.tsx`
- Create: `scripts/test-order-payment-bank-ui.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing completion-flow tests**

Assert that `DoneData` contains the server snapshot, the displayed account comes from `done.bankAccount`, and the Copy button copies that same account. Assert that the assigned-account panel prominently tells customers to recheck the current account before transferring because the deposit account can change. Assert that card payment and points-only behavior remains unchanged.

Run: `node scripts/test-order-payment-bank-ui.mjs`

Expected: FAIL because completion currently uses global `useShopInfo()` bank fields.

- [ ] **Step 2: Store the server snapshot in completion state**

Require a valid server snapshot for bank-transfer completion. Keep the global primary account only for generic pre-order help text and legacy history fallback, never as a substitute for a just-submitted bank-transfer order.

- [ ] **Step 3: Make display and clipboard use one selected object**

Derive one `activePaymentBankAccount` object and pass it to the payment guide. Update `copyBankAccount` to copy `activePaymentBankAccount.bankAccount`, eliminating display/copy mismatch. Place the warning `입금 계좌는 변경될 수 있습니다. 입금 전 이 화면의 계좌번호를 꼭 확인해 주세요.` directly beside the assigned account so it is visible before copying or transferring.

- [ ] **Step 4: Run focused tests**

Run: `node scripts/test-order-payment-bank-ui.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add app/order/page.tsx components/customer/CustomerPaymentGuideBottomSheet.tsx scripts/test-order-payment-bank-ui.mjs package.json && git commit -m "feat: show assigned bank account after checkout"`

## Task 7: Show the historical account for the selected order group

**Files:**

- Modify: `components/customer/CustomerOrderLookupBottomSheet.tsx`
- Modify: `app/order/page.tsx`
- Modify: `scripts/test-customer-order-lookup.mjs`

- [ ] **Step 1: Write failing history tests**

Add cases proving that:

- every grouped order exposes one consistent account snapshot;
- clicking an individual bank-transfer order opens that group's account;
- card orders do not offer bank details;
- rows with conflicting snapshots in the same group are flagged and do not silently pick one;
- pre-migration legacy groups use the current primary account and are labeled as a legacy fallback only in internal state.

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-lookup.mjs`

Expected: FAIL.

- [ ] **Step 2: Add account data to the grouped lookup model**

Extend `CustomerOrderLookupGroup` with optional `bankAccount` and change `onOpenPaymentGuide` to accept the selected group. Render `입금 계좌 보기` per eligible bank-transfer group instead of one ambiguous footer action.

- [ ] **Step 3: Guard inconsistent history**

When rows in one group disagree on snapshot fields, hide the account button and show a customer-safe support message while logging the group ID for operators. Do not guess which row is correct.

- [ ] **Step 4: Run focused tests**

Run: `node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-lookup.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add components/customer/CustomerOrderLookupBottomSheet.tsx app/order/page.tsx scripts/test-customer-order-lookup.mjs && git commit -m "feat: preserve bank account in order history"`

## Task 8: Full regression, security review, and production rollout

**Files:**

- Verify: all files changed above
- Verify: `.vercel/repo.json`
- Verify: Supabase migration history

- [ ] **Step 1: Run all focused regression tests**

Run:

```bash
node --import ./scripts/_ts-resolve.mjs scripts/test-shop-info.mjs
node scripts/test-bank-account-settings-source.mjs
node scripts/test-bank-account-routing-sql.mjs
node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-bank-submit.mjs
node scripts/test-order-payment-bank-ui.mjs
node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-lookup.mjs
node --import ./scripts/_ts-resolve.mjs scripts/test-submit-row-price.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run repository-wide checks**

Run: `npm run lint`

Run: `npm run build`

Run every `guard:*` script listed in `package.json`.

Expected: all pass, or only baseline failures already recorded in Task 1 remain and are documented with unchanged output.

- [ ] **Step 3: Perform a Supabase security audit**

Verify:

- no new table is exposed;
- `orders` RLS remains unchanged;
- the wrapper has no execute grant for `PUBLIC`, `anon`, or `authenticated`;
- the service-role route is the only application caller;
- no service key or full bank config reaches the browser;
- snapshot columns are read-only to customer flows;
- migration history is synchronized before `db push`.

- [ ] **Step 4: Review the diff before deployment**

Run: `git status --short`

Run: `git diff origin/main...HEAD --stat`

Run: `git diff origin/main...HEAD --check`

Expected: only planned files changed, no whitespace errors, no user files included.

- [ ] **Step 5: Apply the database migration before the application release**

Run: `npx supabase migration list`

Run: `npx supabase db push`

Expected: only the reviewed bank-routing migration is pending/applied. Stop if remote history differs.

- [ ] **Step 6: Deploy the application and run browser smoke tests**

Verify in production:

1. admin can keep one account, add exactly one secondary account, choose all/split mode, and save;
2. invalid routing cannot save;
3. admin can enable/disable an inclusive KST retention window and invalid dates cannot save;
4. a disposable true first-order identity receives the configured first-order account;
5. with no window, a same-broadcast retry keeps its snapshot while a different-broadcast or shopping order is reclassified as existing;
6. with a window, different-broadcast and shopping orders remain on the first-order account until the end date, then change to existing;
7. changing the window/mode/selectors affects the next eligible new order immediately but does not change historical or same-broadcast snapshots;
8. account display and clipboard value match;
9. card checkout, point-only checkout, order lookup, recipient details, inventory deduction, cart holds, and duplicate retry still work;
10. Bankda is checked separately against every account that may receive a transfer.

- [ ] **Step 7: Final rollback readiness check**

Application rollback may revert to the prior deployment while leaving nullable snapshot columns and the wrapper in place. Database rollback must not drop snapshot data after live orders exist; instead disable split routing by saving `all` mode and redeploy the prior app if necessary.

- [ ] **Step 8: Final commit/push and completion report**

Run: `git push -u origin feat/bank-account-routing`

Report the exact test outputs, migration ID, deployment URL, chosen live routing configuration, and production smoke-test evidence. Do not claim completion before those checks pass.
