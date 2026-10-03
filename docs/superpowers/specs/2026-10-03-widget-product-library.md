# Widget Product Library Design

## Goal

Make the broadcast product widget workflow readable and practical: every product ever pinned remains in a reusable library, the current broadcast product list stays clearly visible underneath, and operators can rotate only chosen library items on the live overlay.

## Confirmed behavior

- A successful widget pin records the product and optional detail product in a persistent server-backed library.
- Existing browser history is imported idempotently on first load; already-lost entries beyond the old local 30-entry cap cannot be recovered.
- The library shows current image, product/detail name, current price, pin count, and current-broadcast availability.
- The compact default view occupies one card row so the current broadcast product list remains the primary work area.
- Operators can expand the library, search it, sort it, remove history entries, pin an item immediately, and select items for live rotation.
- Rotation selection is stored per broadcast. Manual pinning always overrides rotation.
- Missing, hidden, or sold-out targets stay visible in the library with an unavailable state but are skipped by the live overlay.
- The overlay keeps legacy “all current broadcast products” rotation when no explicit selection exists. An explicit selection rotates only those targets.
- Automatic changes use a short fade/slide transition and respect reduced-motion preferences.

## Storage

- Reuse the existing `settings` table; no schema migration.
- `widget_product_history_v2`: JSON array of persistent history entries.
- `widget_rotation_<broadcast UUID>`: JSON rotation configuration for that broadcast.
- Admin writes go through an authenticated route using the service role. The public overlay only reads its active broadcast rotation setting.

## Safety constraints

- Do not alter order, payment, settlement, inventory deduction, or customer-facing order logic.
- Do not remove products from a broadcast when they are removed from the history library.
- Preserve existing manual pin behavior and legacy rotation as the fallback.
- Preserve the full current-broadcast product list below the compact library.

