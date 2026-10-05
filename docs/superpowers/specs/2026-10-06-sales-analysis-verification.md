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

## Deployment and browser verification

- Production deployment `dpl_FidMPfydJ6qBmoH4vUDqFozi9YoY` READY, alias `ruru-order.vercel.app`, implementation SHA `57b45f83d5c1b7b3cc5c58da1502cf7318785d9a`.
- Overall payment 269,219,460원 matches prior sales history. Current broadcast payment 4,449,925원/product 4,369,000원/19 paid groups matches baseline.
- October filter, Oct 4 broadcast switch (6,487,145원), item options, visible lazy-loaded photo and copy-success toast verified.
- Legacy `?panel=reports` opens same canonical sales analysis workspace. 390px viewport document width 375px: no horizontal overflow. Temporary viewport reset.
- Browser error log contains only pre-existing YouTube iframe injection errors; no application-origin errors observed in inspected logs. YouTube behavior was not modified.
- Proof: `outputs/sales-analysis-desktop-20261006.png` and `outputs/sales-analysis-mobile-20261006.png` in outer task workspace.
