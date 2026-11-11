# Shared live product card implementation

Spec: ../specs/2026-11-11-live-product-card.md
Base: 19e046a. Branch: codex/live-product-card.

## Task 1: Shared selection and rotation
- Add pure customer projection and shared rotation clock. Preserve legacy config decoding.
- Read only two small existing settings on customer view, reuse its loaded catalog, refresh on existing catalog events and fallback poll; discard stale responses across broadcasts.
- Save clock server-side for pause/resume, use in widget and site.
- Test selected legacy/linked details, all/history/pin, OFF, soldout, empty and clock pause/resume. Expected: tests fail before implementation, pass afterwards.

## Task 2: Customer interface and chat behavior
- Compact card and filtered list with explicit full-list return; reset bottom catalog access.
- Suppress public guides only for admin product commands, retain private receipt/intro/order flows.
- Actual React interaction tests and existing command tests. Expected: single hidden command receipt, exact product identity and full catalog access.
- Build and scoped regression suite; inspect responsive browser; independent whole-diff review before integration.

## Review focus
Linked brand IDs, stale settings responses, disabled versus paused, product option identity under rotation, broadcast switch, timer cleanup, public/private chat separation, mobile height and existing intro replay.

## Verification ledger
- Task 1 implemented: canonical linked targets, two-row settings subscription, shared server clock and pause/resume. Pure projection and actual hook race/cleanup tests pass.
- Task 2 implemented: single compact card, 상품 선택 action, featured-panel/full-catalog navigation, private-only admin command receipt. Actual component and route tests pass.
- User refinement: removed the live-card count footer; multiple featured items open their panel, a single item opens its exact detail.
- Browser checked 320×568, 360×800, 568×320, 639×500, 640×500, 740×360, 768×820 and 1440×900. No horizontal body overflow; measured chat bounds do not overlap card. Short landscape card ~62 CSS px, other checked cards 80 CSS px. Physical devices not exhaustively tested.
- Temporary browser fixture removed before production build. No test orders/messages/database writes.
- Fresh independent whole-diff review found three parity bugs. Fixed with regressions: linked source stock independent from parent; unavailable pin falls back to widget rotation; legacy detail price/stock uses the widget projection. Regression tests observed failing before fixes, then passing.
- Final scoped suite: featured projection/hook/UI, widget rotation, chat command/append/picker, live-watch, live seek, sound, intro navigation all pass.
- No additional infrastructure or voice automation activated.
