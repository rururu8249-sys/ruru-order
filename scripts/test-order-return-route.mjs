import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the real POST; replace only external authorization/database boundaries.
async function run(options={}) {
  const writes=[];
  const rows=[
    {id:1,order_group_id:'fixture',qty:2,product_price:10000,adjusted_product_price:20000,point_earned_amount:300,point_used_amount:0,customer_phone:'01000000000',product_name:'A'},
    {id:2,order_group_id:'fixture',qty:1,product_price:10000,adjusted_product_price:10000,point_earned_amount:300,point_used_amount:0,customer_phone:'01000000000',product_name:'B'},
  ];
  if(options.zero) rows[0].adjusted_product_price=0;
  const db={from(table){
    let action='select',payload,filters=[];
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(){return q;},limit(){return q;},
      update(p){action='update';payload=p;return q;},insert(p){action='insert';payload=p;return q;},upsert(p){action='upsert';payload=p;return q;},
      maybeSingle(){return execute();},then(resolve,reject){return execute().then(resolve,reject);}};
    async function execute(){
      if(action!=='select') writes.push({table,action,payload});
      if(table==='orders') return {data:action==='select'?(filters.some(([k])=>k==='id')?rows[0]:rows):null,error:null};
      if(table==='admin_tasks') return {data:options.taskError||options.missingTask?null:{id:'issue-fixture'},error:options.taskError?{message:'issue unavailable'}:null};
      if(table==='customer_point_ledger') return {data:action==='select'?(options.priorError?null:[]):null,error:action==='select'&&options.priorError?{message:'ledger unavailable'}:null};
      if(table==='customer_point_balances') return {data:action==='select'?(options.balanceError||options.missingBalance?null:{current_points:options.invalidBalance?'invalid':1000,total_granted_points:1000,total_used_points:0,total_canceled_points:0,total_adjusted_points:0}):null,error:action==='select'&&options.balanceError?{message:'balance unavailable'}:null};
      throw new Error('Unexpected table '+table);
    }
    return q;
  }};
  const load=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>({})},'@supabase/supabase-js':{createClient:()=>db}});
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  const {POST}=load('app/api/admin-live/order-return/route.ts');
  const response=await POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({mode:options.mode||'refund',refRowId:1,rowIds:[1],rowQty:{1:1}})}));
  return {body:await response.json(),writes};
}
const failures=[];
async function test(name,fn){try{await fn();console.log('PASS',name);}catch(e){failures.push(name);console.error('FAIL',name,e.message);}}
await test('partial quantity uses line total once: 10000 of 30000 earns a 100-point reclaim',async()=>{
  const {body,writes}=await run();
  assert.equal(body.reclaimed,100);
  assert.equal(body.balanceAfter,900);
  assert.equal(writes.find(w=>w.table==='customer_point_ledger').payload.amount,-100);
});
await test('explicit zero line amount does not fall back to list price',async()=>{
  const {body,writes}=await run({zero:true});
  assert.equal(body.reclaimed,0);
  assert.equal(writes.filter(w=>w.table.startsWith('customer_point_')).length,0);
});
for(const flag of ['taskError','priorError','balanceError','missingTask','missingBalance','invalidBalance']) await test(flag+' blocks point mutation and reports incomplete processing',async()=>{
  const {body,writes}=await run({[flag]:true});
  assert.equal(writes.filter(w=>w.table.startsWith('customer_point_')).length,0);
  assert.equal(body.reclaimed,0);
  assert.equal(body.partial,true);
  assert.ok(body.message);
  if(flag==='taskError') assert.equal(body.issueRegistered,false);
});
for(const mode of ['exchange','etc']) await test(mode+' registers issue without point changes',async()=>{
  const {body,writes}=await run({mode});
  assert.equal(body.issueRegistered,true);
  assert.equal(body.taskId,'issue-fixture');
  assert.equal(body.reclaimed,0);
  assert.equal(writes.filter(w=>w.table.startsWith('customer_point_')).length,0);
});
await test('drawer does not announce successful issue creation or continue without an issue id',async()=>{
  const filename='components/admin-live/LiveOrderDetailDrawer.tsx';
  const source=fs.readFileSync(filename,'utf8');
  const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let expression;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='createIssueFromOrder') expression=node.initializer;ts.forEachChild(node,visit);}
  visit(ast);
  const js=ts.transpileModule('const target='+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const notices=[];
  const env={returnSaving:false,items:[{id:1}],setReturnSaving(){},showAdminToast:(message,kind)=>notices.push({message,kind}),fetch:async()=>({json:async()=>({ok:true,partial:true,issueRegistered:false,taskId:'',message:'고객이슈 등록 실패'})})};
  const action=new Function(...Object.keys(env),js+';return target;')(...Object.values(env));
  assert.equal(await action({issueType:'refund',memo:'',selectedRowIds:[1]}),null);
  assert.equal(notices.some(n=>n.kind==='success'),false);
  assert.equal(notices.some(n=>n.message.includes('등록 완료')),false);
});
assert.equal(failures.length,0,failures.join(', '));
