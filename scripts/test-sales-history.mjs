import assert from 'node:assert/strict';
import { aggregateSalesItems, eligibleSalesOrder, salesPaymentAmount, sortedSalesBroadcasts, salesProductPhotos } from '../lib/salesHistory.ts';
const brand={id:751,image_url:'brand.webp',product_note:JSON.stringify({detail_photos:{'BB-60':'bb60.webp','BB-58':'bb58.webp'}})};
assert.deepEqual(salesProductPhotos('BB-60',brand),{brand:'brand.webp',detail:'bb60.webp'});
assert.deepEqual(salesProductPhotos('BB-6',brand),{brand:'brand.webp',detail:''});
assert.deepEqual(salesProductPhotos('BB-60',{...brand,product_note:'invalid'}),{brand:'brand.webp',detail:''});
assert.deepEqual(salesProductPhotos('BB-60',{...brand,product_note:{detail_photo_sets:{'BB-60':['set.webp']},detail_photos:{'BB-60':'old.webp'}}}),{brand:'brand.webp',detail:'set.webp'});
assert.deepEqual(salesProductPhotos('버버리',{product_name:'버버리',image_url:'brand.webp',product_note:{brand_group:{enabled:true}}}),{brand:'brand.webp',detail:''});
assert.deepEqual(salesProductPhotos('단독상품',{product_name:'단독상품',image_url:'real.webp'}),{brand:'real.webp',detail:'real.webp'});
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
