# Product Color Swatches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect editable representative colors to existing admin options and customer previews without changing ordering semantics.

**Architecture:** Small shared validation/projection module; admin-only dictionary and picker; customer saved-value rendering. Exact labels remain inventory identifiers; detail-specific maps avoid collisions.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Node assertion tests, Canvas, pinned MIT color-name-list.

**Spec:** docs/superpowers/specs/2026-10-10-product-color-swatches-design.md

## Global Constraints

## Execution evidence — 2026-10-10

- Task 1 committed as `09c8a63` after contract tests.
- Tasks 2–3 implementation and component tests completed locally. Dictionary pinned to MIT `color-name-list@14.51.0` (31,918 English entries); 205 Korean aliases are editable representative translations, not certified fabric colors.
- Review corrections: brand-detail modal supports draft/cancel; legacy combo exposes independent detail maps. New-product reset regression reproduced (`#123456` leaked), corrected, and passed.
- Fresh all-package run: all 29 `test:*` commands passed; `npm run build` exited 0; `git diff --check` passed. Existing React test-renderer and module-type warnings remain.
- Real-component static fixture inspected at desktop and 390px: wrapping and white borders visible, no horizontal overflow. This is layout verification, not interactive browser E2E.
- Remaining release check: deployed unsaved admin draft/name lookup and photo sampler browser interaction. No production product/order writes used for tests.
- Dependency audit reports 19 advisories in other packages; no advisory names the new dictionary. Dependency upgrades remain separate work; this is not a clean security audit claim.

- Never rename option/stock keys or mutate existing orders.
- Customer code uses only saved values; dictionary loads only in admin editing.
- Existing products without maps retain their existing appearance.
- Never add 판매중 labels.
- Routine approval handoffs waived by user; execute inline sequentially.

## Review Focus

- Legacy detail names masquerading as colors must not receive automatic swatches.
- Two details sharing a shade name must retain independent manual corrections.
- Rapid file changes and cancellation must not apply an outdated sample.
- Unknown/mixed names must remain text, not an arbitrary nearest match.
- Admin resave and linked product moves must not erase swatches or inventory metadata.

### Task 1: Validated saved-value contract

**Files:** Create lib/productColorSwatches.ts; scripts/test-product-color-swatches.mjs.
**Interfaces:** normalizeSwatchMap(raw: unknown): Record<string,string|null>; retainColorSwatches(raw:unknown, labels:string[]): map; readProductColorSwatches(note:unknown, detailName?:string): map. sampleColorPixel(data:Uint8ClampedArray,width:number,height:number,x:number,y:number):string|null accepts normalized [0,1) coordinates and rejects transparent/out-of-range samples.

- [ ] Write tests for exact-key roundtrip, malformed maps/HEX, own properties, retained labels, scoped detail override, absent map, pixel edges/scaling/transparency.
- [ ] Run node --import ./scripts/_ts-resolve.mjs scripts/test-product-color-swatches.mjs; expect missing-module assertion failure.
- [ ] Implement the named pure functions; no database or order changes.
- [ ] Run the same command; expect PASS.
- [ ] Commit only task files.

### Task 2: Admin-only name dictionary and editor

**Files:** Create lib/adminColorNames.ts; components/admin-live/quick-product/ColorSwatchEditor.tsx; scripts/test-admin-color-swatches.mjs. Modify package.json/package-lock.json; QuickProductFastForm.tsx.
**Interfaces:** suggestColorName(name:string):Promise<string|null>, exact normalized lookup plus documented Korean aliases; ColorSwatchEditor consumes labels:string[], value:map, onChange(map). Task 1 map functions own validation.

- [ ] Pin and inspect MIT dictionary, provenance/count, test English and Korean examples, unknown/pattern refusal, manual/null precedence and photo cancellation.
- [ ] Watch new test fail, then implement dictionary lazy loading and reusable compact editor.
- [ ] Wire load/save for regular and detail maps; retain exact labels and unrelated note keys.
- [ ] Run new tests and existing product-detail/brand/manual-soldout tests; expect PASS.
- [ ] Commit task files.

### Task 3: Customer saved swatches and end-to-end verification

**Files:** Create components/customer/ProductColorSwatches.tsx and component tests; modify app/order/page.tsx and display projections only where needed.
**Interfaces:** Customer component accepts saved map/ordered labels; never imports admin dictionary. Detail picker uses Task 1 scoped map.

- [ ] Write failing tests: absent map no output; white visible border; named accessible preview; same color name in two details isolated; purchase handler unchanged.
- [ ] Implement compact wrapping previews and existing selector swatches with names retained.
- [ ] Run all package test:* commands and npm run build; expect all PASS/build success.
- [ ] Inspect desktop/narrow viewport and unsaved admin draft; no production orders.
- [ ] Fresh code review, fix important findings with RED→GREEN, then commit. Deploy only with existing user-authorized workflow after verification.
