import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const bc='00000000-0000-0000-0000-000000000001',video='abcdefghijk',target={productId:'77',detailName:'MC-335'};
let admin=true,mod=false,origin=true,status='ON',deleted=false,widget=true,recorded=[],rotations=[],catalog=[{...target,texts:['MC-335'],soldOut:false}],lookups=0,cleared=[];
const load=createUiLoader({
 'next/server':{NextResponse:{json:(d,i)=>new Response(JSON.stringify(d),i)}},
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>admin},
 '@/lib/liveChatSession':{sameChatOrigin:()=>origin,chatIdentityFromRequest:()=>mod?{sub:'1'}:null,verifiedChatRole:async()=>({isMod:mod})},
 '@/lib/youtube':{getServiceClient:()=>({from(){lookups++;return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{status,is_deleted:deleted,widget_card_enabled:widget,youtube_live_url:`https://youtu.be/${video}`},error:null};}};}})},
 '@/lib/liveChatProductCommandServer':{loadChatCommandProducts:async()=>catalog,applyProductRotation:async(...args)=>rotations.push(args)},
 '@/lib/productIntroServer':{readProductIntroIndex:async()=>new Map(),productIntroKey:()=>'',saveProductIntros:async(...args)=>{recorded.push(args);return {saved:1,kept:0};},clearProductIntros:async(...args)=>{cleared.push(args);return 2;}},
});
const {GET,POST}=load('app/api/live-chat/product-intro/manage/route.ts');
const req=(body)=>({nextUrl:new URL(`https://example.com/api/live-chat/product-intro/manage?bc=${bc}`),json:async()=>({bc,videoId:video,targets:[target],action:'register',capture:{videoId:video,seconds:115,capturedAt:Date.now()},...body})});
admin=false;assert.equal((await POST(req())).status,403);assert.equal(lookups,0);
admin=true;origin=false;assert.equal((await POST(req())).status,403);assert.equal(recorded.length,0);origin=true;
assert.equal((await POST(req())).status,200);assert.equal(recorded.at(-1).at(-1),'first');assert.equal(rotations.length,0);
assert.equal((await POST(req({action:'change'}))).status,200);assert.equal(recorded.at(-1).at(-1),'replace');
const n=recorded.length;assert.equal((await POST(req({action:'rotate',capture:null}))).status,200);assert.equal(recorded.length,n);assert.equal(rotations.at(-1).at(-1),'replace');
assert.equal((await POST(req({action:'append',capture:null}))).status,200);assert.equal(rotations.at(-1).at(-1),'append');
assert.equal((await POST(req({videoId:'12345678901'}))).status,409);
assert.equal((await POST(req({targets:[{productId:'other',detailName:''}]}))).status,400);
assert.equal((await POST(req({capture:null}))).status,400);
status='OFF';assert.equal((await POST(req({action:'rotate'}))).status,409);assert.equal((await POST(req())).status,200);status='ON';
widget=false;assert.equal((await POST(req({action:'rotate'}))).status,409);widget=true;
deleted=true;assert.equal((await POST(req())).status,404);deleted=false;
admin=false;mod=true;assert.equal((await POST(req())).status,200);assert.equal((await GET(req())).status,200);
mod=false;assert.equal((await GET(req())).status,403);
console.log('PASS admin/verified moderator, origin, exact broadcast/video/catalog, first vs change, widget-only, disabled/deleted gates');
{admin=true;mod=false;origin=true;const before=recorded.length;const r=await POST(req({action:'clear',capture:null}));assert.equal(r.status,200);const j=await r.json();assert.equal(j.removed,2);assert.equal(cleared.at(-1)[1],video);assert.deepEqual(cleared.at(-1)[2],[target]);assert.equal(recorded.length,before);
 origin=false;assert.equal((await POST(req({action:'clear',capture:null}))).status,403);origin=true;}
