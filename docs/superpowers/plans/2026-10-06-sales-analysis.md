# Unified Sales Analysis Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, sequentially. User explicitly requested continuous execution without further approval pauses.

**Goal:** Replace duplicate sales entry screens with one read-only analysis experience.
**Architecture:** One complete snapshot loader feeds both period summaries and selected-broadcast analysis. Preserve the existing order adapter and report arithmetic; inject snapshots into the existing report presentation rather than duplicate report calculations.
**Tech Stack:** React, TypeScript, existing Supabase browser client, existing regression scripts.
**Spec:** docs/superpowers/specs/2026-10-06-sales-analysis-design.md

## Global Constraints
- No order, payment, stock or settlement writes.
- No partial totals on failed queries; reject stale responses.
- Preserve source IDs, adjusted amounts, shipping and existing grouping adapter.
- No new dependency or persistent customer cache.

## Review Focus
- Multi-item checkout: distinguish groups, rows, quantity.
- Shipped rows: preserve previous payment status.
- Same product name and distinct prices: no false merge.
- Null broadcast: shopping orders remain separate.
- Failed refresh: no stale totals represented as current.

### Task 1: Snapshot loading contract
Files: create lib/salesAnalysisLoader.ts; test scripts/test-sales-analysis.mjs.
Interface: loadSalesAnalysisSnapshot(db, isCurrent) returns complete broadcasts/orders/products or throws; cancellation throws without publishing results.
- [ ] Write failing tests for pagination, second-page failure, canceled generation, and products restricted to purchased IDs.
- [ ] Run node scripts/test-sales-analysis.mjs; expected assertion failure for missing loader.
- [ ] Implement loader, full order fields required by existing adapter, minimal broadcast/product metadata.
- [ ] Run loader tests and existing sales/report tests; expected pass.
- [ ] Commit scoped task files.

### Task 2: One snapshot, summary and detail
Files: create components/admin-live/SalesAnalysisPanel.tsx; modify BroadcastReportPopup.tsx; extend script component tests.
Interface: optional suppliedSnapshot prop on BroadcastReportPopup carries broadcasts, orders and products; supplied snapshot disables internal requests and uses existing adapter/calculation.
- [ ] Write failing component tests for supplied data, grouped orders, rapid selection, failed refresh and no duplicate reads.
- [ ] Implement panel with period/channel/search controls, grouped summary, explicit item count, list/detail responsive layout; render existing report from the same snapshot.
- [ ] Preserve product/option/photos and copy through existing report presentation, adding scoped item details without changing amount formulas.
- [ ] Run targeted tests; expected pass.
- [ ] Commit scoped task files.

### Task 3: Routing, review and verification
Files: AdminLiveDashboard.tsx, adminLiveMenu.ts, existing menu tests.
- [ ] Test both sales/reports entry points route to the unified panel and legacy URLs remain valid.
- [ ] Replace embedded duplicate entry points, label sales as 판매분석, preserve non-analysis product manager.
- [ ] Run all test scripts, TypeScript/build, diff check; expected pass.
- [ ] Independent final review, fix important findings via failing tests first.
- [ ] Production deploy only after green checks; read-only desktop/mobile verify same-broadcast figures and loading behavior.
