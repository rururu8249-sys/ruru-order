import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {PGlite} from '@electric-sql/pglite';
let authorized=true, written;
const row={id:'fixture',amount_base:119000,adjustments:[{label:'반품비',amount:-4000}],amount_final:115000};
const db={from(table){assert.equal(table,'refund_ledger');return {
  update(payload){written=payload;return {eq(key,id){assert.equal(key,'id');assert.equal(id,'fixture');return {select(){return {single:async()=>({data:{...row,...payload},error:null})};}};}};
}};}};
const load=createUiLoader({
  '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>authorized?{}:null},
  '@supabase/supabase-js':{createClient:()=>db},
});
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const {PATCH}=load('app/api/admin-live/refund-ledger/route.ts');
const patch=body=>PATCH(new Request('https://fixture.invalid/api/admin-live/refund-ledger',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:'fixture',...body})}));
let response=await patch({stage:'완료',mark_done:true,mark_transferred:true});
assert.equal(response.status,200);
let result=await response.json();
assert.equal(result.item.amount_final,115000,'status-only completion must preserve existing refund amount');
assert.equal(Object.hasOwn(written,'amount_base'),false);
assert.equal(Object.hasOwn(written,'adjustments'),false);
assert(written.done_at);
const pg = new PGlite();
await pg.exec("CREATE TABLE refund_ledger (id text PRIMARY KEY, amount_base integer, adjustments jsonb, amount_final integer, stage text, done_at timestamptz, transferred_at timestamptz); INSERT INTO refund_ledger VALUES ('fixture',119000,'[{\"label\":\"반품비\",\"amount\":-4000}]',115000,'처리 필요',NULL,NULL);");
const columns=Object.keys(written);
assert(columns.every(key=>['amount_base','adjustments','amount_final','stage','done_at','transferred_at'].includes(key)));
await pg.query(`UPDATE refund_ledger SET ${columns.map((key,index)=>`${key}=$${index+1}`).join(',')} WHERE id=$${columns.length+1}`, [...columns.map(key=>key==='adjustments'?JSON.stringify(written[key]):written[key]),'fixture']);
const persisted=await pg.query('SELECT amount_base,amount_final,adjustments,stage FROM refund_ledger WHERE id=$1',['fixture']);
assert.deepEqual(persisted.rows[0],{amount_base:119000,amount_final:115000,adjustments:[{label:'반품비',amount:-4000}],stage:'완료'});
await pg.close();
response=await patch({amount_base:199000,adjustments:[]});
assert.equal(response.status,200);
assert.equal((await response.json()).item.amount_final,199000);
response=await patch({amount_base:0,adjustments:[]});
assert.equal(response.status,200);
assert.equal((await response.json()).item.amount_final,0,'explicit zero is not missing');
written=undefined;
response=await patch({amount_base:199000});
assert.equal(response.status,400,'incomplete amount edit must not silently erase existing adjustments');
assert.equal(written,undefined);
authorized=false;
response=await patch({stage:'완료'});
assert.equal(response.status,401);
assert.equal(written,undefined);
console.log('PASS actual refund PATCH preserves amount on status edits, validates complete amount edits and authorization');
