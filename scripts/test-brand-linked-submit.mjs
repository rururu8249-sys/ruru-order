import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {customerDetailInputEnabled,canonicalCustomerDetailProductName} from '../lib/customerDetailProductName.ts';
import {registeredProductPriceMode,registeredProductSubmittedPriceValid} from '../lib/registeredProductPricePolicy.ts';
import {submitRowUnitPriceForCheck} from '../lib/submitRowPrice.ts';
const source=fs.readFileSync('app/api/customer-orders/submit/route.ts','utf8');
const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=['text','readSubmitNoteObject','submitComboSurcharge','assertRegisteredProductPrices'];
const code=names.map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast)).join('\n');
const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const validate=new Function('customerDetailInputEnabled','canonicalCustomerDetailProductName','registeredProductPriceMode','registeredProductSubmittedPriceValid','submitRowUnitPriceForCheck','MIN_PRICE_RATIO','SUBMIT_AXIS_JOIN',js+';return assertRegisteredProductPrices;')(customerDetailInputEnabled,canonicalCustomerDetailProductName,registeredProductPriceMode,registeredProductSubmittedPriceValid,submitRowUnitPriceForCheck,0.5,' / ');
let fail=false, failCatalog=false;
const sb={from:table=>{const q={select:()=>q,in:()=>q,order:()=>q,range:()=>q,then:resolve=>Promise.resolve({data:table==='products'?[{id:2,product_name:'임시',price:39000,product_note:{customer_detail_input_enabled:true}}]:[{source_id:2,detail_name:'NEW'}],error:((fail&&table==='product_brand_links')||(failCatalog&&table==='products'))?{message:'unavailable'}:null}).then(resolve)};return q;}};
const row={product_id:'2',product_name:'NEW · 고객 입력',product_price:39000,qty:1};
await validate(sb,[row]);
assert.equal(row.product_name,'NEW · 고객 입력','server canonicalization must use exact moved detail name, not old temporary name');
assert.equal(row.product_id,'2');
fail=true;
await assert.rejects(()=>validate(sb,[{...row}]),/연결/);
fail=false; failCatalog=true;
await assert.rejects(()=>validate(sb,[{...row}]),/상품.*확인/,'catalog read failure must not authorize order using client prices/shipping');
console.log('PASS actual submission validation keeps linked name, original ID and price policy');

// Exercise the complete route as well: an unavailable catalog must not reach
// order persistence, points, inventory, or after-response notifications.
const {createUiLoader}=await import('./admin-ui-test-loader.mjs');
let rpcCalls=0;
const unavailableDb={
  from(table){
    assert.equal(table,'products');
    return {select(){return {in:async()=>({data:null,error:{message:'fixture catalog unavailable'}})};}};
  },
  async rpc(){rpcCalls++;throw new Error('must not persist');},
};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const load=createUiLoader({'@supabase/supabase-js':{createClient:()=>unavailableDb}});
const {POST}=load('app/api/customer-orders/submit/route.ts');
const response=await POST(new Request('https://fixture.invalid/api/customer-orders/submit',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({customer_phone:'01000000000',orderRows:[row]}),
}));
assert.equal(response.status,400);
assert.match((await response.json()).message,/상품 정보를 확인할 수 없어요/);
assert.equal(rpcCalls,0,'failed product verification must never call the order persistence RPC');
console.log('PASS actual POST rejects catalog failure before order persistence');
