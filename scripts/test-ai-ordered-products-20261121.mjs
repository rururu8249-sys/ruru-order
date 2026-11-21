import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {readOrderedDialogueCards}=createUiLoader()('lib/liveAutomationOrderedProducts.ts');
const now=Date.parse('2026-11-21T05:31:00Z');
async function check({hidden=false,removed=false,renamed=false,errorTable=''}={}){
 const calls=[];
 const order={product_id:1,product_name:'코트',customer_name:'DO_NOT_SEND',size:'private-size',price:999};
 const data={orders:[order,order],products:[{id:1,product_name:renamed?'다른코트':'코트',is_visible:!hidden,color_options:['블랙'],size_options:['S','M']}],broadcast_products:removed?[]:[{product_id:1}]};
 const db={from(table){const ops=[];calls.push({table,ops});const q={};
  for(const method of ['select','eq','is','or','gte','lte','order','limit','in'])q[method]=(...args)=>{ops.push([method,...args]);return q};
  q.then=(resolve,reject)=>Promise.resolve({data:data[table],error:errorTable===table?{message:'failed'}:null}).then(resolve,reject);return q;
 }};
 return {cards:await readOrderedDialogueCards(db,'bc',now),calls};
}
const good=await check();
assert.equal(good.cards.length,1,'same item in multiple orders is one topic');
assert.equal(good.cards[0].name,'코트');
assert.deepEqual(good.cards[0].sizes,['S','M'],'catalog options, not one customer size');
assert.ok(!JSON.stringify(good.cards).includes('DO_NOT_SEND'));
assert.ok(!JSON.stringify(good.cards).includes('private-size'));
const ops=good.calls.find(c=>c.table==='orders').ops;
for(const expected of [['gte','created_at','2026-11-20T15:00:00.000Z'],['lte','created_at','2026-11-21T05:31:00.000Z'],['eq','broadcast_id','bc'],['eq','is_test_order',false],['is','automation_actor_id',null],['or','is_deleted.is.null,is_deleted.eq.false']])assert.ok(ops.some(op=>JSON.stringify(op)===JSON.stringify(expected)),JSON.stringify(expected));
for(const input of [{hidden:true},{removed:true},{renamed:true},...['orders','products','broadcast_products'].map(errorTable=>({errorTable}))])assert.equal((await check(input)).cards.length,0,'missing/unverified source fails closed: '+JSON.stringify(input));
console.log('PASS KST daily order boundaries, real-only, catalog identity/visibility/link revalidation, data minimization, read failures');
