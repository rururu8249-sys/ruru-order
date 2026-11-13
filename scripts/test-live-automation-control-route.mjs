import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let auth=false,controls=[],ran=0;
const load=createUiLoader({
 'next/server':{NextResponse:{json:(d,i)=>new Response(JSON.stringify(d),i)}},
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>auth},
 '@/lib/youtube':{getServiceClient:()=>({})},
 '@/lib/liveAutomationServer':{readAutomationState:async()=>({revision:9}),controlAutomation:async(...args)=>{controls.push(args.slice(1));return {revision:10}}},
 '@/lib/liveAutomationWorker':{runAutomationNow:async()=>{ran++;return {ok:true,phase:'submitted'}}},
 '@/lib/autoTestOrderServer':{readAutoTestRows:async()=>[],deleteAutoTestOrders:async()=>({groups:0})},
 '@/lib/geminiGate':{readGeminiUsage:async()=>[]},
});
const route=load('app/api/admin-live/auto-test-order/route.ts');
const request=(body,origin='https://shop.test')=>({nextUrl:new URL('https://shop.test/api/admin-live/auto-test-order'),headers:new Headers({origin}),json:async()=>body});
assert.equal((await route.POST(request({action:'control',feature:'all',enabled:true,revision:9}))).status,401);
auth=true;
assert.equal((await route.POST(request({action:'control',feature:'all',enabled:true,revision:9},'https://foreign.test'))).status,403);
assert.equal((await route.POST(request({action:'control',feature:'all',enabled:true,revision:9}))).status,200);
assert.deepEqual(controls,[['all',true,9]]);
assert.equal((await route.POST(request({action:'control',feature:'all',enabled:'true',revision:9}))).status,400);
assert.equal((await route.POST(request({action:'screen-plan'}))).status,410,'old browser-host path must be retired');
assert.equal((await route.POST(request({action:'run'}))).status,200);assert.equal(ran,1);
console.log('PASS authenticated atomic all-feature controls, strict inputs, retired browser driver and server-session manual run');
