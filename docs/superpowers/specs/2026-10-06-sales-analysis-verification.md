# Sales analysis verification

Implementation commit: `57b45f8`. Read-only integration; no database writes or payment-status changes.

## Automated evidence

- All 23 `test:*` scripts pass. Production build passes.
- Full pagination, second-page failure, superseded response, failed-refresh totals removal, snapshot injection without duplicate reads.
- Quantity-based product amounts, adjusted row amounts, shipping previous payment status, refund net payment, shop-only filter, cross-channel reused group identifiers, checkout/item/unit count distinctions.
- Mixed-status legacy paid-group metadata includes all its items; irrelevant unpaid/test products are not enriched.
- Independent read-only review: original important findings resolved; no remaining Critical/Important blockers reported.

## Live read-only evidence

- Selected order columns verified against production `information_schema.columns`.
- 5,319 rows: full row JSON 18,668,657 bytes vs analytics projection 5,432,301 bytes (~71% reduction). These are database JSON byte counts, not a browser timing guarantee.
- All group rows retained until payment grouping to avoid changing mixed legacy orders or pending-order counts. No addresses, bank details or audit histories in analytics projection.
- Existing production console baseline: current broadcast payment 4,449,925원, product 4,369,000원, paid groups 19.

Deployment and visual verification must be confirmed separately before reporting completion.
