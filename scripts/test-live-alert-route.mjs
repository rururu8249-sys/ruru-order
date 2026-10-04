import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
for(const key of ['SOLAPI_API_KEY','SOLAPI_API_SECRET','SOLAPI_PF_ID','SOLAPI_TEMPLATE_ID','SOLAPI_SENDER','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])process.env[key]='test';
let sent=[],writes=[],received=[],off=false,readError=false;
const customers=[1,2].map(n=>({id:n,customer_phone:`0100000000${n}`,customer_name:`고객${n}`,live_alert_optin:true,live_alert_optin_at:new Date().toISOString()}));
const db={from(table){let mutation=false,rows=[];const q={select(){return q},eq(){return q},gte(){return q},order(){return q},range(){return q},maybeSingle(){return Promise.resolve({data:{id:'broadcast',status:'ON'}})},upsert(value){mutation=true;rows=value;writes.push(value);return q},insert(value){writes.push(value);return Promise.resolve({error:null})},then(resolve,reject){return Promise.resolve(mutation?{data:rows.filter(r=>!received.includes(r.customer_phone)),error:null}:{data:table==='customers'?customers.map(c=>({...c,live_alert_optin:off?false:true})):table==='live_alert_recipients'?received.map(customer_phone=>({customer_phone})):[],error:readError?{message:'unavailable'}:null}).then(resolve,reject)}};return q}};
const {POST}=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>({sub:'admin'})},'@supabase/supabase-js':{createClient:()=>db},solapi:{SolapiMessageService:class{async send(messages){sent.push(...messages);return {failedMessageList:[]}}}}})('app/api/admin-live/live-alert-send/route.ts');
async function call(body){const response=await POST({json:async()=>({broadcastId:'broadcast',mode:'priority',...body})});return {status:response.status,...await response.json()}}
const preview=await call({dryRun:true,limit:1,orderDays:90,recentDays:30});
assert.equal(preview.targetCount,1);assert.equal(sent.length,0);assert.equal(writes.length,0);
assert.equal((await call({selectionToken:'invalid'})).status,409);assert.equal(sent.length,0);
off=true;assert.equal((await call({selectionToken:preview.selectionToken})).status,409);assert.equal(sent.length,0);off=false;
readError=true;assert.equal((await call({selectionToken:preview.selectionToken})).status,503);assert.equal(sent.length,0);readError=false;
const result=await call({selectionToken:preview.selectionToken});assert.equal(result.successCount,1);assert.equal(sent.length,1);assert.equal(sent[0].kakaoOptions.disableSms,true);
received=[sent[0].to];assert.equal((await call({selectionToken:preview.selectionToken})).status,409);assert.equal(sent.length,1);
assert.equal((await call({dryRun:true,limit:0,orderDays:90,recentDays:30})).status,400);
console.log('PASS API preview without sends/writes, exact recipient count, signed selection, consent recheck, fail-closed history, duplicate exclusion, SMS fallback disabled (mock provider only)');
