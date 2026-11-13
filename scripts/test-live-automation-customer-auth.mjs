import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-database-key-not-for-network-testing';
let touched=0;
const load=createUiLoader({
 'next/server':{NextResponse:{json:(d,i)=>new Response(JSON.stringify(d),i)},after:()=>{throw Error('unexpected side effect')}},
 '@supabase/supabase-js':{createClient:()=>({from(){touched++;throw Error('unauthorized database access')},rpc(){touched++;throw Error('unauthorized RPC')}})},
});
const req=body=>({headers:new Headers(),json:async()=>body});
const cart=load('app/api/cart-reservations/route.ts');
let response=await cart.POST(req({action:'clear',sessionKey:'live-auto:reserved',kakaoId:'990000000077'}));
assert.equal(response.status,403,'reserved session clear must reject before ordinary hold cleanup');
const submit=load('app/api/customer-orders/submit/route.ts');
response=await submit.POST(req({customer_phone:'0200000077',kakao_id:'990000000077',cart_session_key:'live-auto:reserved',orderRows:[{product_id:10,product_name:'item',qty:1,product_price:100}]}));
assert.equal(response.status,403,'reserved customer cannot bypass signed per-action authorization');
const presence=load('app/api/presence/route.ts');
response=await presence.POST(req({visitorKey:'live-auto:reserved',kakaoId:'990000000077',path:'/order#live',pageType:'order_form'}));
assert.equal(response.status,403,'reserved viewer needs server session authorization');
response=await presence.POST(req({visitorKey:'ordinary-visitor',batch:true,path:'/order#live',pageType:'order_form'}));
assert.equal(response.status,403,'anonymous visitors cannot request a campaign-wide batch');
const chat=load('app/api/live-chat/route.ts');
response=await chat.POST(req({kakao_id:'990000000077',bc:'00000000-0000-4000-8000-000000000001',body:'hello'}));
assert.equal(response.status,403,'reserved chat identity requires the same signed server-session authority');
assert.equal(touched,0,'invalid automation cannot invoke ordinary mutation/query paths');
console.log('PASS unsigned reserved order/cart/presence identities rejected before customer storage paths');
