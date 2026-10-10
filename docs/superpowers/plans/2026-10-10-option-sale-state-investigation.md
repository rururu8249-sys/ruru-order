# Option sale-state investigation — next sequential unit

## Evidence collected, not implemented

2026-10-10 read-only inspection of production project `rpmpqudiscpasivrwuyz`:

- `submit_customer_order_with_points` source hash `3ac5e0e3f97fc1479bd5c9823e57b722`. It locks product rows, parses stock variants, then continues without inventory checks when stock management is not true. Its deployed body differs from the old `supabase/sql/inventory_auto_deduct_rpc.sql` snapshot. Do not replace production from that old snapshot.
- `claim_cart_hold` source hash `4839862622e0986f6d53340cab265d9e`. It locks products and only enables variant stock validation for managed inventory. Keep absolute expiry and snapshot fields intact.
- Bank-routing wrapper source hash `b1a2830daef4c2d2be85ab9b6bf3d6ac`; submission route calls this wrapper after price, consent, shipping, purchase-limit and hold validation.
- Customer `registeredOptionStockVariants` returns an empty array when stock management is off; `isSoldOutColorSize` exclusively checks that array.
- Admin renders option stock controls only when stock management is on; soldout derives from stock minus holds. Saved variant payload currently contains color/size/stock, not an independent sale-state field.
- Linked-source catalog and legacy brand details use distinct option projections. Both must preserve manual availability, keyed to the actual source product and option combination.

## Proposed implementation boundary

Manual option sale availability must be independent of numeric inventory. Do not encode manual soldout as stock zero, negative inventory or an invented high stock count. Show a clearly labeled 판매중/품절 state alongside each option combination, even with inventory off. Stock controls remain conditional; state controls do not.

Before enabling the admin control, implement and test the same rule at customer selection, cart reservation and transactional order submission. A previously added cart item must be rejected after its option becomes soldout. Empty colors, size-only options, legacy brand keys and linked source IDs need literal regression fixtures. Exact metadata representation and atomic database patch are still to be designed against the full deployed function definitions.

No production product, order, reservation or schema changed during this investigation.

Reference checked: https://supabase.com/docs/guides/database/functions — database functions for data-intensive transactional work, explicit access permissions. Changelog fetched with curl after the web reader rejected its Markdown content type. No platform upgrade is part of this task.
