import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let executions=0;const secret='private-dispatch-secret';
const route=createUiLoader({
 'next/server':{NextResponse:{json:(d,i)=>new Response(JSON.stringify(d),i)}},
 '@/lib/youtube':{getServiceClient:()=>({rpc:async(_n,args)=>({data:args.p_hash===createHash('sha256').update(secret).digest('hex'),error:null})})},
 '@/lib/liveAutomationWorker':{runAutomationTick:async()=>{executions++;return {processed:0}}},
})('app/api/cron/auto-test-order/route.ts');
const req=(token,kind='actions')=>({nextUrl:new URL('https://shop.test/api/cron/auto-test-order'),headers:new Headers({'user-agent':'vercel-cron/1.0',...(token?{authorization:`Bearer ${token}`}:{})}),json:async()=>({kind})});
assert.equal((await route.GET(req())).status,410,'old unauthenticated UA bypass is retired');
assert.equal((await route.POST(req())).status,401);
assert.equal((await route.POST(req('wrong'))).status,401);
assert.equal(executions,0);
assert.equal((await route.POST(req(secret,'wrong'))).status,400);
assert.equal((await route.POST(req(secret))).status,200);assert.equal(executions,1);
console.log('PASS dispatcher requires a server-verified secret, rejects UA spoofing and accepts only bounded job kinds');
