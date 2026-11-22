#!/usr/bin/env node
// No live orders are made. Keep the client shipping-state regression, then run
// the actual POST handler suite and client saved-amount confirmation checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const client=fs.readFileSync('app/order/page.tsx','utf8');

let a=client.indexOf('      const newlyCombinedShippingGroups = new Set(');
let b=client.indexOf('\n\n      if (appliedShippingFeeBreakdown.totalShippingFee > 0)',a);
assert(a>=0&&b>a,'missing updated immediate combined shipping state');
let code=client.slice(a,b).replace(': PaidShippingGroups =', ' =');
let eligible=(i)=>i.product_name && i.qty>0 && i.product_price>0;
const runGroups=new Function('validItems','paidShippingGroupsBeforeSubmit','getChargeableShippingItems','shippingGroupOf',code+'\nreturn nextPaidShippingGroupsAfterSubmit;');
const empty=()=>({normal:false,vendor:false,vendor2:false,overseas:false});
const item=(group='normal',price=15000)=>({group,product_name:'상품',product_price:price,qty:1});
const result=(items,prev=empty())=>runGroups(items,prev,items=>items.filter(eligible),item=>item.group);
let n=0;
function test(name,a,b){assert.deepEqual(a,b,name);n++;console.log('PASS '+name)}
test('무료배송 첫 주문은 다음 합배송의 기준이 됨',result([item()]),{normal:true,vendor:false,vendor2:false,overseas:false});
test('배송 갈래를 혼동하지 않음',result([item('vendor')]),{normal:false,vendor:true,vendor2:false,overseas:false});
test('한 주문에서 여러 배송 갈래 기록',result([item(),item('vendor2')]),{normal:true,vendor:false,vendor2:true,overseas:false});
test('무료나눔 상품은 합배송 시작점 아님',result([item('normal',0)]),empty());
test('이전 합배송 갈래 보존',result([item('overseas')],{normal:true,vendor:false,vendor2:false,overseas:false}),{normal:true,vendor:false,vendor2:false,overseas:true});

assert(client.includes('const withinCurrentCombine') === false || !client.includes('if (order?.subscribe_promo_redemption === true) return false;'));
console.log(`RURU_IMMEDIATE_SHIPPING_STATE_PASS=${n}`);
await import('./test-order-submit-replay-20261122.mjs');
await import('./test-order-submit-amounts-20261122.mjs');
await import('./test-order-pending-cart-20261122.mjs');
console.log('RURU_FINAL_SAFETY_RUNTIME=PASS');
console.log('LIMIT=actual POST with database/framework fixtures plus client success assignments; not a real DB checkout or rendered browser E2E');
