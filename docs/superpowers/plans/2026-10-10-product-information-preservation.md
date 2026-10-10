# Product information preservation

## Confirmed cause and bounded change

Both `normalizeDetailChips` and the fast form silently truncated information to ten characters and six entries. Remove these cuts, retain trimming/empty-entry removal/deduplication, and retain the existing comma/newline separator behavior. No inventory, pricing, order, or database-schema changes in this unit.

Long unbroken information must wrap inside the admin preview and customer option sheet. Existing values already truncated in storage cannot be reconstructed by this change.

Reference read: https://design-system.service.gov.uk/components/character-count/ — impose length limits only for a justified reason; avoid silently preventing input. This supports removing the arbitrary silent cut, not a claim of infinite storage capacity.

## Verification

- Normalizer regression preserves 12 emoji and more than six entries (failed before the fix).
- Editor blur preserves long/seventh entries. Wrapping regression failed before adding overflowWrap/maxWidth.
- Real form save payload and reopen preserve both source-owned and shared chips.
- `npm run test:product-detail-info` passed (model/editor/form and 20 brand-table checks).
- `npm run build` passed, with existing module-type, renderer-deprecation and middleware-convention warnings.
- All 25 package `test:*` scripts passed sequentially. Not deployed yet.

## Next sequential unit

Trace manual option soldout independently of stock counts through admin save, customer selection, cart, and server submission before changing behavior. Color swatches remain later in the queue; admin/card/detail placements must use the same option source rather than separate configuration.
