import assert from 'node:assert/strict';
import { aggregateSalesItems, eligibleSalesOrder, salesPaymentAmount, sortedSalesBroadcasts } from '../lib/salesHistory.ts';
// Catch shared parent IDs incorrectly merging distinct sold products.
const rows = aggregateSalesItems([
 {product_id:751,product_name:'BB-58',size:'M',qty:2,product_price:195000},
 {product_id:751,product_name:'BB-60',size:'XL',qty:1,product_price:199000},
 {product_id:751,product_name:'BB-58',size:'M',qty:1,product_price:195000},
]);
assert.equal(rows.length,2);
assert.equal(rows.find(r=>r.name==='BB-58').sales,585000);
assert.equal(rows.find(r=>r.name==='BB-58').option,'M · 3개');
for(const flag of ['is_deleted','is_permanently_deleted','is_test_order','exclude_from_settlement']) assert.equal(eligibleSalesOrder({admin_order_status_v2:'카드결제완료',[flag]:true}),false);
assert.equal(eligibleSalesOrder({admin_order_status_v2:'카드결제완료',event_gift_winner_id:42}),false);
assert.equal(eligibleSalesOrder({admin_order_status_v2:'취소'}),false);
assert.equal(eligibleSalesOrder({admin_order_status_v2:'자동입금확인'}),true);
assert.equal(salesPaymentAmount({final_amount:0,total_price:195000}),0);
assert.equal(salesPaymentAmount({adjusted_total_price:120000,total_price:195000}),120000);
assert.deepEqual(sortedSalesBroadcasts([{id:'empty',started_at:''},{id:'old',started_at:'2026-09-20'},{id:'new',started_at:'2026-10-04'}],new Map([['old',{count:1}],['new',{count:2}]] )).map(r=>r.id),['new','old']);
console.log('sales history regression tests passed');
