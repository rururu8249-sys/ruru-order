# Widget Product Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, readable widget-product library above the full broadcast product list and let operators rotate only selected library items on the live overlay.

**Architecture:** Store history and per-broadcast rotation JSON in fixed `settings` keys, with writes mediated by a new authenticated admin route. Keep parsing, merging, filtering, target matching, and rotation selection in a pure library shared by the admin UI and product overlay. Render the compact/expanded library in a focused client component so the existing large management component only owns data and actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, CSS Modules, Node assertion tests.

**Spec:** `docs/superpowers/specs/2026-10-03-widget-product-library.md`

## Global Constraints

- Successful pins persist without the old eight-item display limit or thirty-item server limit.
- Default library height is one compact row; the current broadcast product list remains visible below it.
- Manual pin overrides selected rotation; invalid and sold-out targets never reach the live rotation.
- Existing broadcasts without explicit rotation settings continue rotating all broadcast products.
- No order, payment, settlement, inventory deduction, or customer order-page behavior changes.

## Review Focus

- Malformed or stale settings JSON must fall back safely without blanking the legacy widget rotation.
- Duplicate product/detail targets from local and server history must merge idempotently.
- A detail-product selection must not accidentally rotate every detail under its parent product.
- An explicit selection containing unavailable products must filter them without reintroducing unselected products.
- Compact library rendering must not push the existing broadcast product list out of the usable viewport.

---

### Task 1: Persistent library model and authenticated settings API

**Files:**
- Create: `lib/widgetProductLibrary.ts`
- Create: `scripts/test-widget-product-library.mjs`
- Create: `app/api/admin-live/widget-library/route.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WidgetHistoryEntry`, `WidgetRotationConfig`, `parseWidgetHistory`, `mergeWidgetHistory`, `recordWidgetHistory`, `removeWidgetHistory`, `parseWidgetRotation`, `widgetRotationSettingKey`, `selectWidgetRotationItems`, and request validation helpers.
- Consumes: existing `settings(key,value)` storage and admin session verification.

- [ ] **Step 1: Write failing pure-behavior tests** for malformed JSON fallback, idempotent local/server merge, record/remove behavior, detail-level target matching, unavailable filtering, and legacy fallback.
- [ ] **Step 2: Run** `npm run test:widget-library` **and verify it fails because the library does not exist.**
- [ ] **Step 3: Implement the pure model and settings-key helpers.**
- [ ] **Step 4: Run** `npm run test:widget-library` **and verify all cases pass.**
- [ ] **Step 5: Implement authenticated GET/POST actions for merge, record, remove, and save-rotation using fixed settings keys only.**
- [ ] **Step 6: Run** `npm run test:widget-library && npm run lint -- app/api/admin-live/widget-library/route.ts lib/widgetProductLibrary.ts`.
- [ ] **Step 7: Commit** `feat(widget): add persistent product library model`.

### Task 2: Readable admin library above the complete broadcast product list

**Files:**
- Create: `components/admin-live/WidgetProductLibraryPanel.tsx`
- Create: `components/admin-live/WidgetProductLibraryPanel.module.css`
- Modify: `components/admin-live/AdminLiveProductManagePopup.tsx`
- Modify: `lib/pinHistory.ts`

**Interfaces:**
- Consumes: Task 1 history/rotation types and `/api/admin-live/widget-library`.
- Produces: compact one-row library, expanded searchable/sortable library, selection controls, current price/image/status display, and server-backed pin history updates.

- [ ] **Step 1: Extend the failing model test** to cover compact slicing, search, and frequent/recent/name sorting.
- [ ] **Step 2: Run** `npm run test:widget-library` **and verify the new UI-model cases fail.**
- [ ] **Step 3: Implement UI-model selectors and the focused panel component.**
- [ ] **Step 4: Replace the horizontal chip strip with the panel; import legacy local history idempotently; preserve the full current-broadcast list below.**
- [ ] **Step 5: Wire pin success, history removal, rotation selection, start/pause/resume, and legacy-all reset actions.**
- [ ] **Step 6: Run** `npm run test:widget-library && npm run lint -- components/admin-live/WidgetProductLibraryPanel.tsx components/admin-live/AdminLiveProductManagePopup.tsx lib/pinHistory.ts`.
- [ ] **Step 7: Commit** `feat(admin): redesign widget product library`.

### Task 3: Selected live rotation and smooth transitions

**Files:**
- Modify: `components/product-widget/ProductWidgetClient.tsx`
- Modify: `lib/widgetProductLibrary.ts`
- Modify: `scripts/test-widget-product-library.mjs`

**Interfaces:**
- Consumes: Task 1 rotation parsing and target-selection helpers.
- Produces: selected-only overlay rotation, manual-pin precedence, unavailable filtering, pause handling, and reduced-motion-safe transition styling.

- [ ] **Step 1: Add a failing test** for selected detail ordering, paused configuration, and empty explicit selection.
- [ ] **Step 2: Run** `npm run test:widget-library` **and verify the new cases fail.**
- [ ] **Step 3: Load the active broadcast rotation setting alongside products and apply explicit selection after broadcast membership/sold-out filtering.**
- [ ] **Step 4: Change the interval to five seconds, disable it while paused or manually pinned, reset stale indexes, and add a subtle keyed fade/slide transition with reduced-motion support.**
- [ ] **Step 5: Run** `npm run test:widget-library && npm run lint -- components/product-widget/ProductWidgetClient.tsx lib/widgetProductLibrary.ts`.
- [ ] **Step 6: Commit** `feat(widget): rotate selected frequent products`.

### Task 4: Full verification and visual inspection

**Files:**
- Verify only unless a defect is found.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: verified production build and visual evidence for compact/expanded admin layout and live widget transition.

- [ ] **Step 1: Run** `npm run test:widget-library`.
- [ ] **Step 2: Run** `npm run lint`.
- [ ] **Step 3: Run** `npm run build`.
- [ ] **Step 4: Start the development server and inspect the admin product screen at desktop and narrow widths, confirming the product list remains visible below the compact library.**
- [ ] **Step 5: Inspect `/product-widget?preview=1` and the active-broadcast flow for selected rotation, manual pin precedence, pause, and smooth transition.**
- [ ] **Step 6: Review the full diff against the spec and record any rulings or deferred minor findings.**
- [ ] **Step 7: Commit any verification fixes with their RED→GREEN tests.**

