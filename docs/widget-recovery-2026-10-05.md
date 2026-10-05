# Product widget incident recovery

## Verified cause

- Active broadcast 07de8bab-39d1-4298-b2d6-d9e4c2e5ba31 contained product IDs 741–751.
- All 11 had stock management explicitly false, stock zero, and is_soldout true. The real widget excludes sold-out parents before expanding the legacy detail catalog.
- Deployed ruru_sync_product_inventory_variants derived is_soldout from zero variant stock without respecting stock_management_enabled. An isolated real PostgreSQL trigger test reproduced the failure on unmanaged insertion.
- The source implementation existed in commits e6b08ec / a5309f1 dated 2026-05-30. This does not establish which later write activated it; the exact initiating action remains unverified.

## Applied scope

- Production migration inventory_management_off_preserve_soldout replaces only the existing function, preserving trigger attachment and permissions.
- OFF products preserve explicit stock/sold-out state. ON and legacy-default inventory still derive stock and sold-out correctly.
- Restored is_soldout=false only for the 11 verified current-broadcast parents, conditional on explicit management OFF and membership. No options, photos, prices, quantities, orders or other products changed.
- Other unmanaged sold-out rows were not bulk cleared: automatic versus intentional state cannot be established from the flag alone.

## Verification

- scripts/test-inventory-management-off.mjs failed before fix (false became true); passed after fix. Includes insert/update, explicit manual sold-out preservation, managed zero/positive, and missing-flag default.
- All 18 package test:* commands passed, including widget client and original linked-product stock/order integration. Existing Node module-type/react-test-renderer warnings remain.
- Production browser displayed BB-56, BB-58, and BB-76 at different observations, with image/options/price. No browser console errors.
- Screenshot: /tmp/ruru-widget-recovered-20261005.png.
- OBS/Prism rendered stream output is not directly verified; no stream controls/settings were changed.

## Remaining requests

New Excel has 33 bag rows and 10 ceramics rows. Bags have two price columns (판매가 / 세일가); final price choice requested before registration. Workbook images are embedded. Nothing registered yet. Report reliability and the broader admin/analytics backlog remain incomplete.
