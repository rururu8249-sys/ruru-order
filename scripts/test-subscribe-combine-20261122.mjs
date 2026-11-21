#!/usr/bin/env node
// Regression scenarios using the SAME pure fee/date/address helpers as the real site.
// These are in-memory policy simulations, not a paid order, live SQL write or browser E2E.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateShippingBreakdown, shippingFeeByGroup,
} from '../lib/shippingGroups.ts';
import { applySubscribeWaiver } from '../lib/subscribeFreeShip.ts';
import { resolveCombineShippingLookupWindow } from '../lib/admin-v2/combineShipping.ts';
import { shippingAddressKey } from '../lib/shippingAddressKey.ts';

const app = fs.readFileSync('app/order/page.tsx', 'utf8');
const server = fs.readFileSync('app/api/customer-orders/submit/route.ts', 'utf8');
const sql = fs.readFileSync('supabase/migrations/20261122_subscribe_once_point_rate.sql', 'utf8');

// This used to be the exact wrong exclusion created by our previous patch.
assert(!app.includes('if (order?.subscribe_promo_redemption === true) return false;'), 'CLIENT still excludes promo first order');
assert(!server.includes('if (row?.subscribe_promo_redemption === true) return false;'), 'SERVER still excludes promo first order');
assert(!sql.includes('UPDATE public.orders o SET subscribe_promo_redemption=true'), 'Legacy orders falsely marked as promo-used');
assert(app.includes('const paidShippingOrders = activeCombineShippingOrders.filter'), 'Client combine needs eligible orders');
assert(server.includes('const withinCurrentCombine = sameAddressOrders.filter'), 'Server combine needs current period');
assert(sql.includes('point_earn_rate_snapshot=v_promo_rate') && sql.includes('point_earn_rate_snapshot=v_earn_rate'), 'Order point snapshot missing');
assert(sql.includes('kakao_id text PRIMARY KEY'), 'One coupon per Kakao account guard missing');

const fees = {
  normalFee: 4000, normalRemoteFee: 7000,
  vendorFee: 5000, vendorRemoteFee: 8000,
  overseasFee: 6500, overseasRemoteFee: 9500,
};
const promo = { groups: ['normal','vendor','vendor2','overseas'], waiveRemote: true };
const primaryAddress = ['서울특별시 중구 세종대로 110', '101호'];
const differentAddress = ['서울특별시 중구 세종대로 110', '202호'];
const account = 'qa_kakao_A';
const windowA = {
  enabled:true,
  startAt: '2026-11-21T10:00:00.000Z', // 11/21 19:00 KST
  endAt: '2026-11-21T18:00:00.000Z',   // 11/22 03:00 KST
};
const windowB = {
  enabled:true,
  startAt: '2026-11-22T10:00:00.000Z', // 11/22 19:00 KST
  endAt: '2026-11-22T18:00:00.000Z',   // 11/23 03:00 KST
};

function prior({group='normal', at='2026-11-21T12:00:00.000Z', address=primaryAddress, canceled=false, deleted=false, promoUsed=false, kakaoId=account}={}){
  return {group,at,address,canceled,deleted,promoUsed,kakaoId};
}

// Reproduces the ordering of the production customer/server combine checks while
// calling *actual* fee and window helpers from the repo. Crucially, `promoUsed`
// is NOT an eligibility filter. The two source assertions above guard that fact.
function eligiblePriorGroups(orders, {now,window,address=primaryAddress,kakaoId=account}) {
  const bounds=resolveCombineShippingLookupWindow(window,new Date(now));
  const addressKey=shippingAddressKey(...address);
  const set=new Set();
  for (const order of orders) {
    if (order.kakaoId!==kakaoId || order.canceled || order.deleted) continue;
    if (shippingAddressKey(...order.address)!==addressKey) continue;
    const t=Date.parse(order.at);
    if (t<Date.parse(bounds.startAt) || t>Date.parse(bounds.endAt)) continue;
    set.add(order.group); // includes promoUsed=true, consistent with 2026-07-17 policy
  }
  return {normal:set.has('normal'),vendor:set.has('vendor'),vendor2:set.has('vendor2'),overseas:set.has('overseas')};
}
function price({orders=[],now,window,groups=['normal'],address=primaryAddress,promoAvailable=false,remote=false,feesOverride=fees,waiveRemote=true}){
  const paid=eligiblePriorGroups(orders,{now,window,address});
  const fee=shippingFeeByGroup(feesOverride,remote);
  const full=calculateShippingBreakdown(groups,paid,fee).totalShippingFee;
  const waived=promoAvailable
    ? calculateShippingBreakdown(groups,paid,applySubscribeWaiver(fee,shippingFeeByGroup(feesOverride,false),{...promo,waiveRemote})).totalShippingFee
    : full;
  return {shipping:waived,subscriptionSaving:Math.max(0,full-waived),usedPromotion:promoAvailable && full>waived};
}
let checks=0;
function verify(name,actual,expected){ assert.deepEqual(actual,expected,name);checks++;console.log('PASS '+name) }

const first=price({window:windowA,now:'2026-11-21T12:00:00Z',promoAvailable:true});
verify('1차: 인증 후 최초 일반배송', first, {shipping:0,subscriptionSaving:4000,usedPromotion:true});

const promoFirst=[prior({promoUsed:true})];
verify('2차: 같은 합배송 기간·같은 주소·같은 배송갈래 -> 0원',
  price({orders:promoFirst,window:windowA,now:'2026-11-21T13:00:00Z'}),
  {shipping:0,subscriptionSaving:0,usedPromotion:false});
verify('3차: 같은 기간 동일 조건 -> 0원',
  price({orders:[...promoFirst,prior({at:'2026-11-21T13:00:00Z'})],window:windowA,now:'2026-11-21T15:00:00Z'}),
  {shipping:0,subscriptionSaving:0,usedPromotion:false});

verify('새 합배송 기간 첫 주문: 최초 구독 혜택 소진 -> 정상 4천원',
  price({orders:promoFirst,window:windowB,now:'2026-11-22T11:00:00Z'}),
  {shipping:4000,subscriptionSaving:0,usedPromotion:false});
verify('새 기간 배송비 낸 이후 추가 주문 -> 합배송 0원',
  price({orders:[...promoFirst,prior({at:'2026-11-22T11:00:00Z'})],window:windowB,now:'2026-11-22T12:00:00Z'}),
  {shipping:0,subscriptionSaving:0,usedPromotion:false});

verify('구독 가입하지 않은 고객 첫 주문: 배송비 부과',
  price({window:windowA,now:'2026-11-21T12:00:00Z'}),
  {shipping:4000,subscriptionSaving:0,usedPromotion:false});
verify('일반 고객 배송비 냈다면 해당 회차 추가 주문 합배송',
  price({orders:[prior()],window:windowA,now:'2026-11-21T13:00:00Z'}),
  {shipping:0,subscriptionSaving:0,usedPromotion:false});

verify('같은 기간, 상세주소 다른 배송지 -> 재배송비 부과',
  price({orders:promoFirst,window:windowA,now:'2026-11-21T13:00:00Z',address:differentAddress}),
  {shipping:4000,subscriptionSaving:0,usedPromotion:false});
verify('같은 기간, 일반배송→업체1 추가 -> 업체배송비 별도',
  price({orders:promoFirst,window:windowA,now:'2026-11-21T13:00:00Z',groups:['vendor']}),
  {shipping:5000,subscriptionSaving:0,usedPromotion:false});
verify('같은 기간, 일반배송+업체1 같이 담음 -> 기존 일반 0·새 업체 5천원',
  price({orders:promoFirst,window:windowA,now:'2026-11-21T13:00:00Z',groups:['normal','vendor']}),
  {shipping:5000,subscriptionSaving:0,usedPromotion:false});
verify('해당 기간 이전 주문 취소 -> 합배송 불가',
  price({orders:[prior({canceled:true,promoUsed:true})],window:windowA,now:'2026-11-21T13:00:00Z'}),
  {shipping:4000,subscriptionSaving:0,usedPromotion:false});
verify('이미 삭제된 주문 -> 합배송 불가',
  price({orders:[prior({deleted:true,promoUsed:true})],window:windowA,now:'2026-11-21T13:00:00Z'}),
  {shipping:4000,subscriptionSaving:0,usedPromotion:false});
verify('주문 건의 카카오 계정이 다르면 합배송 불가',
  price({orders:[prior({kakaoId:'OTHER'})],window:windowA,now:'2026-11-21T13:00:00Z'}),
  {shipping:4000,subscriptionSaving:0,usedPromotion:false});

const freeBase={...fees,normalFee:0,normalRemoteFee:0};
verify('관리자 기본배송비 0원: 인증 미사용·일반 적립률 대상',
  price({window:windowA,now:'2026-11-21T13:00:00Z',feesOverride:freeBase,promoAvailable:true}),
  {shipping:0,subscriptionSaving:0,usedPromotion:false});
verify('관리자 일반배송비 0원이어도 업체1 상품 배송비는 별도',
  price({window:windowA,now:'2026-11-21T13:00:00Z',feesOverride:freeBase,groups:['vendor']}),
  {shipping:5000,subscriptionSaving:0,usedPromotion:false});
verify('제주·산간 추가 배송비 무료 설정 OFF는 추가금만 부과',
  price({window:windowA,now:'2026-11-21T13:00:00Z',promoAvailable:true,remote:true,waiveRemote:false}),
  {shipping:3000,subscriptionSaving:4000,usedPromotion:true});
verify('인증은 했어도 이미 사용 완료/기간 만료 -> 새 주문 정상 배송비',
  price({window:windowB,now:'2026-11-22T13:00:00Z',promoAvailable:false}),
  {shipping:4000,subscriptionSaving:0,usedPromotion:false});

// Different point rates are recorded *per order*, not per verification or only by fee=0.
function pointRateForOrder(result,normalRate=2,promoRate=.5){return result.usedPromotion?promoRate:normalRate}
verify('무료배송 실제 1회 이용 주문만 0.5% 적립',pointRateForOrder(first),0.5);
verify('합배송 0원인 두 번째 주문은 일반 적립률',pointRateForOrder(price({orders:promoFirst,window:windowA,now:'2026-11-21T13:00:00Z'})),2);
verify('관리자 배송비 0원 주문도 일반 적립률',pointRateForOrder(price({window:windowA,now:'2026-11-21T13:00:00Z',feesOverride:freeBase,promoAvailable:true})),2);

console.log(`RURU_COMBINE_SCENARIOS_PASS=${checks}`);
console.log('LIMIT=policy simulation with actual pure helpers + static route guards; not full production checkout E2E');
