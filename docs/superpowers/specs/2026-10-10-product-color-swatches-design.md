# Product color swatches

## Intent and scope

Continue the CRM operating-architecture queue after deployed press feedback. Make existing color options visually recognizable without adding another settings menu or changing order/inventory identifiers. User requested uninterrupted sequential implementation; routine approval handoffs are waived, not verification.

## Evidence and choice

- Shopify connects editable swatches to existing option values: https://help.shopify.com/en/manual/custom-data/metafields/category-metafields/using-category-metafields
- MIT color-name-list provides a large named-color dictionary: https://github.com/meodai/color-names (pin 14.51.0; verify actual count locally).
- Canvas pixel sampling supports local uploaded photos: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData
- Repository: QuickProductFastForm rebuilds product_note; legacy combo color_options may contain detail names. Brand source links preserve original product rows. Therefore raw color_options cannot universally be treated as colors.

Choose editable name suggestions plus optional local-photo sampling. Pure manual selection is repetitive; unreviewed automatic photograph inference can select background colors. Name suggestions are representative display colors, not certified textile measurements. Unknown/pattern names remain text until the operator selects a color. Korean aliases map explicitly to named entries; no fabricated certification or universal coverage claim.

## Storage and compatibility

Add optional product_note.color_swatches: Record<string,string> (exact existing color label to validated #RRGGBB). A null value explicitly suppresses a swatch. Add detail_color_swatches: Record<detailName, map> for legacy bundled items so identically named shades on different garments remain independent. Never rename option/stock keys. Existing products without maps retain their existing appearance. Customer code uses only saved values; dictionary loads only in admin editing.

## Layout

Admin: existing color option area gets compact rows with color name, small editable swatch and optional photo-sampling action. Reuse the existing color-photo area; do not introduce a settings page. Brand detail editor gets the same component scoped to the detail. Manual correction outranks name suggestion and survives save/reopen.

Customer: small swatches under product title, wrapping with no wide blank area; preview is informational, not another purchase action. Existing detail color selectors show saved swatch plus the full color name. Keep selection/disabled/품절 behavior. Never add 판매중 labels. A mixed/unknown option retains its name without a made-up swatch.

## Photo interaction

Local file selection, image preview, tap/click point, preview color, explicit apply. No server upload needed for sampling. Handle cancellation, decode failure and transparent pixels; revoke object URLs. Keyboard users retain native color-picker/manual input alternative. Explain screen/photo lighting differences briefly in admin, not repeated customer warnings.

## Verification

Exact-key roundtrip, invalid HEX, prototype keys, legacy detail identifiers, two details sharing a color name, linked-source preservation, unknown names, Korean/English aliases, sample coordinate scaling, transparent pixels, cancellation and explicit no-swatch. Component tests for unchanged purchase behavior; full project tests/build; desktop and narrow viewport visual check. No production order or inventory mutation for visual testing.
