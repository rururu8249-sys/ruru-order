import assert from 'node:assert/strict';
import {reset,seed,sql,register,W} from './event-custom-gift-db-fixture.mjs';

const OTHER_BROADCAST='44444444-4444-4444-8444-444444444444';

reset();
await seed();

await sql(`
 insert into orders(id,created_at,broadcast_id,customer_id,customer_phone,youtube_nickname,order_group_id,order_lookup_code,product_name,qty,product_price,total_price,final_amount,address,admin_order_status_v2,picked_at,payment_bank_account)
 values
  (4,'2030-01-04','${OTHER_BROADCAST}',1,'01012345678','A','g4','c4','other broadcast',1,500,500,500,'other-address','카드결제완료',now(),'bank4');
 update event_roulette_winners set winner_order_ids='["4"]' where id='${W}';
`);

const crossBroadcast=await register();
assert.equal(crossBroadcast.ok,true,'a winner loaded from submitted orders must not be rejected only because its order belongs to another broadcast');
assert.equal(crossBroadcast.orderGroupId,'g4');
assert.equal(await sql(`select broadcast_id from orders where event_gift_winner_id='${W}'`),OTHER_BROADCAST);

reset();
await seed();
await sql(`
 insert into orders(id,created_at,broadcast_id,customer_id,customer_phone,youtube_nickname,order_group_id,order_lookup_code,product_name,qty,product_price,total_price,final_amount,address,admin_order_status_v2,picked_at,payment_bank_account)
 values
  (4,'2030-01-04','${OTHER_BROADCAST}',1,'01012345678','A','g4','c4','other broadcast',1,500,500,500,'other-address','카드결제완료',now(),'bank4');
 update event_roulette_winners set winner_order_ids='["1","4"]' where id='${W}';
`);

const mixedBroadcasts=await register();
assert.equal(mixedBroadcasts.ok,true,'orders from multiple broadcasts should register when every snapshot order belongs to one customer');
assert.equal(mixedBroadcasts.orderGroupId,'g4','the latest valid submitted order should receive the gift');

reset();
await seed();
await sql(`
 insert into orders(id,created_at,broadcast_id,customer_id,customer_phone,youtube_nickname,order_group_id,order_lookup_code,product_name,qty,product_price,total_price,final_amount,address,admin_order_status_v2,picked_at,payment_bank_account)
 values
  (4,'2030-01-04','${OTHER_BROADCAST}',2,'01099999999','A','g4','c4','different customer',1,500,500,500,'different-address','카드결제완료',now(),'bank4');
 update event_roulette_winners set winner_order_ids='["1","4"]' where id='${W}';
`);

const ambiguous=await register();
assert.equal(ambiguous.ok,false);
assert.equal(ambiguous.code,'AMBIGUOUS_CUSTOMER','same nickname must never merge different customers');
assert.equal(await sql('select count(*) from event_custom_gift_receipts'),'0');
assert.equal(await sql('select count(*) from orders where event_gift_winner_id is not null'),'0');

console.log('PASS submitted-order gift source: cross-broadcast match, mixed-broadcast latest order, ambiguous customer blocked');
