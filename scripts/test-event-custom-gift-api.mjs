import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let allowed=true, calls=[], result={ok:true,status:'added',winnerId:'33333333-3333-4333-8333-333333333333',orderId:'1',productName:'선물'};
process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
const route=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>allowed},'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return result?.dbError?{error:{message:'failure'}}:{data:result};},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null})})})}});
let api;try{api=route('app/api/admin-live/event-custom-gift/route.ts');}catch{}
assert.ok(api?.POST,'gift endpoint missing');
const request=body=>new NextRequest('http://localhost/api/admin-live/event-custom-gift',{method:'POST',body:JSON.stringify(body)});
allowed=false;assert.equal((await api.POST(request({winnerId:result.winnerId}))).status,401);assert.equal(calls.length,0);
allowed=true;for(const body of [{winnerId:'bad'},{winnerId:result.winnerId,phone:'01012345678'}])assert.equal((await api.POST(request(body))).status,400);
assert.equal(calls.length,0);assert.equal((await api.POST(request({winnerId:result.winnerId}))).status,200);assert.equal(calls[0].name,'admin_register_event_custom_gift');
result={ok:false,code:'AMBIGUOUS_CUSTOMER',message:'ambiguous'};assert.equal((await api.POST(request({winnerId:'33333333-3333-4333-8333-333333333333'}))).status,409);
result={dbError:true};assert.equal((await api.POST(request({winnerId:'33333333-3333-4333-8333-333333333333'}))).status,500);
allowed=false;assert.equal((await api.GET(new NextRequest('http://localhost/api/admin-live/event-custom-gift?winnerId=33333333-3333-4333-8333-333333333333'))).status,401);
console.log('PASS actual gift route: authentication, forged payload rejection, RPC boundary, conflict, DB failure, private GET');
