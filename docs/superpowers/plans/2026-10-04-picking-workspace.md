# Picking Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators build one picking workspace from multiple broadcasts and safely process late-paid and post-pick-changed order items on screen and in the same Excel workbook.

**Architecture:** Add a pure workspace model for KST payment-date filtering and attention classification, an authenticated paginated scope loader for selected broadcasts, and database-enforced repick state. Keep the existing order table filter untouched; the picking modal owns its broadcast scope, tabs, and export-visible rows.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres, ExcelJS, Node assertion tests, react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-10-04-picking-workspace.md`

## Global Constraints

- Before-pick physical edits create no exception; after-pick physical edits atomically clear `picked_at` and open repick attention.
- Price-only edits never open repick attention.
- The existing single-broadcast order-list filter and all money, payment, settlement, shipping, and inventory calculations remain unchanged.
- The picking UI and workbook first sheet use exactly the same filtered item IDs.
- Attention rows cannot be completed through bulk completion.
- All user-facing date classification uses `Asia/Seoul`.

## Review Focus

- A selected historical broadcast outside the dashboard's latest 500 loaded rows must still load completely.
- A database update that changes both price and a physical option must open repick, while a price-only update must not.
- Repeated edits before repicking must preserve the first pre-change picked snapshot rather than replacing it.
- A failed multi-broadcast refresh must retain the previous usable list and must not silently export a partial scope.
- An attention item must appear once on the main sheet and once on the cross-check sheet without being counted twice in UI totals.

---

### Task 1: Picking workspace domain model

**Files:**
- Create: `lib/orderPickingWorkspace.ts`
- Create: `scripts/test-order-picking-workspace.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `PickingPaymentDateFilter`, `PickingAttentionKind`, `kstDateKey`, `classifyPickingAttention`, `filterPickingWorkspaceOrders`, `selectBroadcastIdsForDateKeys`.
- Consumes: `LiveOrder`, `LiveOrderItem`, existing paid status codes, and item repick metadata added in Task 2.

- [ ] **Step 1: Write failing tests** for KST today payment filtering, next-day payment classification, repick precedence, canceled/excluded removal, multiple broadcast inclusion, and today+yesterday broadcast selection.
- [ ] **Step 2: Run** `npm run test:picking-workspace` **and verify it fails because the module is missing.**
- [ ] **Step 3: Implement the pure domain model with literal paid-status and KST rules from the spec.**
- [ ] **Step 4: Run** `npm run test:picking-workspace` **and verify it passes.**
- [ ] **Step 5: Commit** `feat(picking): add workspace filtering model`.

### Task 2: Database-enforced repick lifecycle

**Files:**
- Create: `supabase/migrations/20261004010000_order_repick_attention.sql`
- Create: `scripts/test-order-repick-migration.mjs`
- Modify: `components/admin-live/types.ts`
- Modify: `lib/admin-v2/types.ts`
- Modify: `components/admin-live/liveOrderAdapter.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `orders.repick_required_at`, `orders.repick_before`, `orders.repick_resolved_at`; matching `LiveOrderItem` fields.
- Consumes: existing `orders.picked_at` and physical fields `product_name`, `color`, `size`, `qty`.

- [ ] **Step 1: Write a failing migration behavior test** that executes the migration against a minimal PGlite `orders` table and asserts before-pick, price-only, first post-pick edit, repeated edit, repick resolution, and second-cycle behavior.
- [ ] **Step 2: Run** `npm run test:picking-repick` **and verify the required columns/trigger are missing.**
- [ ] **Step 3: Add the idempotent columns, trigger function, and trigger; map them through row and UI types.**
- [ ] **Step 4: Run** `npm run test:picking-repick && npm run test:picking-workspace` **and verify both pass.**
- [ ] **Step 5: Commit** `feat(picking): enforce repick after completed-item edits`.

### Task 3: Authenticated multi-broadcast scope loading

**Files:**
- Create: `lib/orderPickingScopeLoader.ts`
- Create: `app/api/admin-live/picking-workspace/route.ts`
- Create: `scripts/test-order-picking-scope-loader.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `parsePickingWorkspaceRequest`, `loadPickingWorkspaceRows`, and `POST /api/admin-live/picking-workspace` returning fully adapted `LiveOrder[]`.
- Consumes: selected broadcast IDs, `broadcasts.started_at/ended_at`, paginated `orders` rows, admin session verification, and existing live-order adapter functions.

- [ ] **Step 1: Write failing tests** for empty/duplicate/over-limit IDs, pagination beyond 1,000 rows, direct-ID plus time-window deduplication, deleted-row exclusion, and query failure propagation.
- [ ] **Step 2: Run** `npm run test:picking-scope` **and verify it fails because the loader is missing.**
- [ ] **Step 3: Implement the dependency-injected loader and authenticated uncached POST route.**
- [ ] **Step 4: Run** `npm run test:picking-scope && npm run lint -- app/api/admin-live/picking-workspace/route.ts lib/orderPickingScopeLoader.ts`.
- [ ] **Step 5: Commit** `feat(picking): load complete multi-broadcast scopes`.

### Task 4: Multi-broadcast selector and attention workflow UI

**Files:**
- Create: `components/admin-live/PickingBroadcastSelector.tsx`
- Modify: `components/admin-live/LiveOrderPickingModal.tsx`
- Modify: `components/admin-live/LiveOrderTable.tsx`
- Modify: `scripts/test-order-picking-ui.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 filters, attention metadata, route response, and `BroadcastCalendarItem[]`.
- Produces: today/today+yesterday multi-selection, applied-scope summary, payment-date filter, `전체 챙김`/`추가 챙김` tabs, before→current repick cards, and attention-safe individual completion.

- [ ] **Step 1: Extend the UI test with failing cases** for today+esterday selection, successful and failed scope refresh, today-paid filtering, attention-tab membership, repick before→current display, and bulk exclusion.
- [ ] **Step 2: Run** `npm run test:picking` **and verify the new assertions fail for missing controls/behavior.**
- [ ] **Step 3: Implement the selector and wire the modal to loaded workspace orders without altering the parent order-list filter.**
- [ ] **Step 4: Implement attention tabs/badges, payment-date filtering, and individual-only attention completion.**
- [ ] **Step 5: Run** `npm run test:picking && npm run lint -- components/admin-live/PickingBroadcastSelector.tsx components/admin-live/LiveOrderPickingModal.tsx components/admin-live/LiveOrderTable.tsx`.
- [ ] **Step 6: Commit** `feat(admin): add multi-broadcast picking workspace`.

### Task 5: Screen-matched workbook with attention sheet

**Files:**
- Create: `lib/orderPickingExportRows.ts`
- Create: `scripts/test-order-picking-export.mjs`
- Modify: `components/admin-live/adminLiveOrderExcelExport.ts`
- Modify: `components/admin-live/LiveOrderPickingModal.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: the modal's exact visible item IDs and Task 1 attention classification.
- Produces: pure `buildPickingExportRows`, main-sheet `구분` column/attention styling, and `추가챙김` cross-check sheet.

- [ ] **Step 1: Write failing tests** asserting exact visible-ID parity, main row contents, late-payment detail, repick before/current detail, ordinary-row exclusion from the second sheet, and stable row counts.
- [ ] **Step 2: Run** `npm run test:picking-export` **and verify it fails because the row builder is missing.**
- [ ] **Step 3: Implement the row builder and use it for both workbook sheets.**
- [ ] **Step 4: Add attention colors, filters, frozen headers, widths, and Korean date/time formatting without duplicating quantities.**
- [ ] **Step 5: Run** `npm run test:picking-export && npm run test:picking`.
- [ ] **Step 6: Commit** `feat(picking): export attention-aware workbook`.

### Task 6: Full verification and operator-flow inspection

**Files:**
- Verify only unless a defect is found.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: validated database behavior, production build, and desktop/narrow picking workflow evidence.

- [ ] **Step 1: Run** `npm run test:picking-workspace && npm run test:picking-repick && npm run test:picking-scope && npm run test:picking-export && npm run test:picking`.
- [ ] **Step 2: Run** `npm run lint`.
- [ ] **Step 3: Run** `npm run build`.
- [ ] **Step 4: Start the app and inspect the picking workspace at desktop and narrow widths, including today+esterday selection, attention tabs, failed refresh retention, and screen/export counts.**
- [ ] **Step 5: Review the complete branch against the spec and fix Critical/Important findings through RED→GREEN tests.**
- [ ] **Step 6: Commit any verification fixes.**
