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
// Catch encounter-order display, split identities containing '/', and lost duplicate quantities.
const grouped = aggregateSalesItems([
 {product_name:'셔츠',color:'3번',size:'XL',qty:8,product_price:39000},
 {product_name:'셔츠',color:'2번',size:'XXL',qty:2,product_price:39000},
 {product_name:'셔츠',color:'3번',size:'S',qty:3,product_price:39000},
 {product_name:'셔츠',color:'2번',size:'M',qty:1,product_price:39000},
 {product_name:'셔츠',color:'2번',size:'M',qty:1,product_price:39000},
])[0];
assert.deepEqual(grouped.optionGroups,[
 {label:'2번',sizes:[{label:'M',qty:2},{label:'XXL',qty:2}]},
 {label:'3번',sizes:[{label:'S',qty:3},{label:'XL',qty:8}]},
]);
assert.equal(grouped.qty,15);
assert.equal(grouped.sales,585000);
assert.deepEqual(aggregateSalesItems([
 {product_name:'옷',color:'베이지 / 화이트',size:'M/38',qty:2},
 {product_name:'옷',color:'베이지 / 화이트',size:'36',qty:1},
])[0].optionGroups,[{label:'베이지 / 화이트',sizes:[{label:'36',qty:1},{label:'M/38',qty:2}]}]);
assert.deepEqual(aggregateSalesItems([{product_name:'단독',color:'없음',size:'M',qty:3}])[0].optionGroups,[{label:'',sizes:[{label:'M',qty:3}]}]);
assert.deepEqual(aggregateSalesItems([{product_name:'단독',qty:1}])[0].optionGroups,[{label:'',sizes:[{label:'옵션 없음',qty:1}]}]);
for(const flag of ['is_deleted','is_permanently_deleted','is_test_order','exclude_from_settlement']) assert.equal(eligibleSalesOrder({admin_order_status_v2:'카드결제완료',[flag]:true}),false);
assert.equal(eligibleSalesOrder({admin_order_status_v2:'카드결제완료',event_gift_winner_id:42}),false);
assert.equal(eligibleSalesOrder({admin_order_status_v2:'취소'}),false);
assert.equal(eligibleSalesOrder({admin_order_status_v2:'자동입금확인'}),true);
assert.equal(salesPaymentAmount({final_amount:0,total_price:195000}),0);
assert.equal(salesPaymentAmount({adjusted_total_price:120000,total_price:195000}),120000);
assert.deepEqual(sortedSalesBroadcasts([{id:'empty',started_at:''},{id:'old',started_at:'2026-09-20'},{id:'new',started_at:'2026-10-04'}],new Map([['old',{count:1}],['new',{count:2}]] )).map(r=>r.id),['new','old']);
console.log('sales history regression tests passed');
