import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let release,announced=false;
const metrics=new Promise(r=>release=r);
const {GET}=createUiLoader({'next/server':{NextResponse:{json:(body,opts)=>({body,...opts})}},'@/lib/liveMetricsServer':{recordLiveMetricsTick:()=>metrics},'@/lib/liveOrderChatServer':{announceRecentPaid:async()=>{announced=true;return 1;}},'@/lib/youtube':{getServiceClient:()=>({})}})('app/api/cron/live-metrics/route.ts');
const request={headers:new Headers({'user-agent':'vercel-cron/1.0'}),nextUrl:new URL('https://example.test/api/cron/live-metrics')};
const pending=GET(request);await new Promise(r=>setImmediate(r));assert.equal(announced,true,'paid notification must not wait for YouTube metrics');release({ok:true});assert.equal((await pending).body.paidPosted,1);console.log('PASS cron paid fallback independent of slow metrics');
