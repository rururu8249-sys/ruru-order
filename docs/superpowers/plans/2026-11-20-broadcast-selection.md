# Broadcast Selection Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Root implements sequentially; other agents inspect and review only, per the user's existing instruction.

**Goal:** Keep broadcast rows stationary on selection and display products belonging only to the latest selected broadcast.

**Architecture:** Separate selection from list ordering/filter visibility. Bind product results to their broadcast ID and reject stale request revisions. Preserve existing server reads and write contracts.

**Tech Stack:** Installed Next.js 16.4.6, React 19.2.4, TypeScript, existing Supabase client, react-test-renderer and `scripts/admin-ui-test-loader.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-20-broadcast-selection-design.md`.

## Global Constraints

- Start from exact production commit `d9c7f425cee0f81edc6550b70a8ab54dafc11270` in an isolated fix branch.
- Verify existing intent before changing behavior; latest explicit stationary-list request replaces selected-row promotion.
- Keep ON priority, undated drafts, filter controls and all business write policies.
- No production test writes or changes to member, authentication, order, money or points rules.
- Use existing dependencies. Do not rewrite existing regression expectations to get a pass.

## Review Focus

- Filter a selected old broadcast, then select another visible broadcast: the old row must not vanish on that click.
- Initial all-old data, draft creation and restore under an unmatched search: selected rows stay visible.
- A→B→A with out-of-order responses: the earlier A must not replace the newer A response.
- A late mutation refresh for an earlier selection must not invalidate the latest selection's read.
- Pending/error states must not expose previous broadcast product actions or report a false empty result.

## Task 1: Selection and read-state regression

**Files:** component above; create `scripts/test-broadcast-selection-20261120.mjs`; update `CLAUDE.md` and `DESIGN-ADMIN.md`.

- [x] Add actual-component cases for repeated selection preserving literal row order, period/search retention and drafts, pending old-product removal, late responses, same-ID revisions, failed reads and retry. Use fixtures only at external IO boundaries.
- [x] Run against unchanged product source. Expected: stationary-row and stale-result assertions fail for the reproduced reasons.
- [x] Implement stable visibility with selection-independent order; record the filter's retained selection independently of row clicks.
- [x] Bind product rows to selection and latest request revision, including optimistic reorder state; distinguish pending/error/empty.
- [x] Run the new tests unchanged, related existing broadcast/product/widget tests, guard, TypeScript and production build. Expected: all selected gates exit 0.
- [x] Record results and have a fresh reviewer inspect the complete diff and preserved contracts.
- [ ] Commit the reviewed tree. Prepare an exact-base patch ZIP and one terminal command using the proven deployment workflow. Verify package paths, checksums, expected tree and shell syntax. Report local completion separately from deployment.

## Execution record

- Existing branch was clean; imported the authenticated remote commit only after reconstructing its exact Git object hash. Fix branch created at the production SHA.
- Root reproduced the A/B/C race with the real component. Fixture requests only; writes 0. The video and historical commit independently identify selection promotion as the list-moving cause.
- User has already requested uninterrupted sequential execution; no additional plan approval is needed for this fix.

- Final review: independent read-only review found four concrete boundary failures. Each was reproduced in the actual component, fixed in one pass, and covered by named regressions: returning_selection_pending, catalog_pending_error_retry, pin_membership_pending_error, external_rename_selected. All pass.
- Additional preserved behaviors: custom_dates and optimistic_reorder_late_refresh pass, including exact broadcast/product scoped write fixtures. No production writes.
- Ruling: external data changes that move the selected broadcast outside the filter update the retained ID during refresh, not on click. This preserves the existing selected-visible policy; an older exception may leave on that actual data refresh. Ordinary unchanged refresh preserves it.
- Ruling: add document listener stubs to the existing sales workspace test. The exact production base failed with the same missing DOM method; all business assertions are unchanged. Baseline evidence is retained in the delivery verification logs.
- Verification: 18/18 selected regression scripts, UI guard 123 files/0 violations, all guard command exit 0, tsc exit 0, production build exit 0 (58/58 pages; payment matching 528 comparisons).
- No minor findings were deferred. Actual production deployment and browser verification remain pending user-side application.
