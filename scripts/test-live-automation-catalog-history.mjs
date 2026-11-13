import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let card={productId:'2',name:'미우2',detailName:''},history=[{product_id:1,product_name:'막스1'}],historyError=null;
const queries=[];
const products=[{id:1,product_name:'막스1'},{id:2,product_name:'미우2'},{id:3,product_name:'버3'}];
const db={from(table){const query={table,filters:[]};queries.push(query);const q={select(){return q},eq(...a){query.filters.push(['eq',...a]);return q},in(...a){query.filters.push(['in',...a]);return q},gte(...a){query.filters.push(['gte',...a]);return q},or(...a){query.filters.push(['or',...a]);return q},is(...a){query.filters.push(['is',...a]);return q},order(){return q},range(){return q},limit(){return q},then(resolve){return Promise.resolve({data:table==='broadcast_products'?products.map(p=>({product_id:p.id,is_visible:true})):table==='products'?products:history,error:table==='orders'?historyError:null}).then(resolve)}};return q}};
const module=createUiLoader({
 './autoTestOrder':{AUTO_TEST_ORDERED_SINCE:'2026-11-06T00:00:00+09:00',productChoices:p=>[{productId:String(p.id),productName:p.product_name,color:'',size:'',unitPrice:100,group:'normal'}]},
 './cartHoldDetail':{buildCartHoldSnapshotItem:c=>c},
 './liveAutomationDialogueServer':{readDialogueCard:async()=>card},
})('lib/liveAutomationCatalog.ts');
const settings={shipping:{}};
let choices=await module.loadAutomationChoices(db,'broadcast',settings);
assert.deepEqual(choices.map(c=>c.productId),['1','2'],'only actual order history or the current card is eligible');
const filters=queries.find(q=>q.table==='orders').filters;
assert.ok(filters.some(f=>f[0]==='or'&&f[1]==='is_test_order.is.null,is_test_order.eq.false'));
assert.ok(filters.some(f=>f[0]==='is'&&f[1]==='automation_actor_id'&&f[2]===null));
card=null;history=[];
assert.deepEqual(await module.loadAutomationChoices(db,'broadcast',settings),[],'no fallback to unrelated products');
card={productId:'9',name:'다른방송',detailName:''};
assert.deepEqual(await module.loadAutomationChoices(db,'broadcast',settings),[]);
card={productId:'2',name:'다른 세부상품',detailName:'다른 세부상품'};
assert.deepEqual(await module.loadAutomationChoices(db,'broadcast',settings),[],'same parent ID does not authorize a different detail');
historyError={message:'unavailable'};
await assert.rejects(module.loadAutomationChoices(db,'broadcast',settings),/ORDER_HISTORY_UNAVAILABLE/);
console.log('PASS current broadcast order history/current-card eligibility, generated-order exclusion and fail-closed history');
