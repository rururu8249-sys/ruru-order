#!/usr/bin/env node
// No live orders are made. These tests execute extracted real patched expressions
// and guard the idempotency policy with a mocked DB query.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const client=fs.readFileSync('app/order/page.tsx','utf8');
const server=fs.readFileSync('app/api/customer-orders/submit/route.ts','utf8');

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

const start=server.indexOf('    const promoClaimed = orderRows.some(');
// Use the next declaration: comment wording is not a code boundary.
const end=server.indexOf('\n    const cartSessionKey = (() => {',start);
assert(start>=0&&end>start,'missing retry gate source');
const retrySnippet=server.slice(start,end).replace('(prior: AnyRow)', '(prior)');
const runRetry=new Function('orderRows','supabase','kakaoId','phone','activeSubscribeWaiverFor','text','firstOrderValue',`return (async()=>{${retrySnippet}\n return true;})()`);
const same=(s)=>String(s??'').trim();
const read=(rows,key)=>rows[0]?.[key];
const mockDB=(records,error=null)=>({
  from(table) {
    assert.equal(table,'orders');
    return {
      select(names) {
        assert(names.includes('kakao_id'));
        return {
          eq(key,grp) {
            assert.equal(key,'order_group_id');
            assert.equal(grp,'GROUP_1');
            return { limit:async()=>({data:records,error}) };
          }
        };
      }
    };
  }
});
const promoRow={order_group_id:'GROUP_1',ruru_subscribe_waiver_requested:true};
async function gate(name,rows,existing,available,expected,err=null){
 const run=runRetry(rows,mockDB(existing,err),'K_1','010-1234-5678',async()=>available?{groups:['normal']}:null,same,read);
 if(expected){assert.equal(await run,true,name)}else{await assert.rejects(run, {message: err ? '기존 주문 확인이 지연되고 있습니다. 다시 시도해 주세요.' : '구독 인증 무료배송은 1회만 사용할 수 있습니다. 새로고침 후 배송비를 확인해 주세요.'})};
 n++;console.log('PASS '+name);
}
await gate('최초 혜택 주문 허용',[promoRow],[],true,true);
await gate('혜택 소진 후 새로운 주문 차단',[promoRow],[],false,false);
await gate('동일 주문번호 + 동일 고객의 구독 사전 검사 통과',[promoRow],[{id:7,kakao_id:'K_1',customer_phone:'01012345678'}],false,true);
await gate('타인 주문번호 재전송 차단',[promoRow],[{id:7,kakao_id:'OTHER',customer_phone:'01012345678'}],false,false);
await gate('전화번호 불일치 주문 재전송 차단',[promoRow],[{id:7,kakao_id:'K_1',customer_phone:'01011112222'}],false,false);
await gate('DB 장애 때 혜택 우회 불가',[promoRow],[],false,false,{message:'DATABASE_FAILURE'});
await gate('일반 합배송 주문은 혜택 소진과 무관',[{order_group_id:'GROUP_2',ruru_subscribe_waiver_requested:false}],[],false,true);
assert(client.includes('const withinCurrentCombine') === false || !client.includes('if (order?.subscribe_promo_redemption === true) return false;'));
console.log(`RURU_FINAL_SAFETY_RUNTIME_PASS=${n}`);
console.log('LIMIT=isolated shipping-state and promo retry-gate checks; downstream purchase-limit/cart-hold checks and complete checkout replay are not exercised');
