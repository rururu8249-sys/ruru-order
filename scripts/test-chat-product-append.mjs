import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();const {runChatProductCommand}=load('lib/liveChatProductCommandServer.ts');
const {widgetRotationSettingKey,WIDGET_PRODUCT_HISTORY_SETTING_KEY}=load('lib/widgetProductLibrary.ts');
const bc='broadcast';const key=widgetRotationSettingKey(bc);const target=id=>({productId:String(id),detailName:''});
let state,history,writes,conflicts,readError,writeError;
function reset(config){state=config===null?null:JSON.stringify(config);history='[]';writes=[];conflicts=0;readError=false;writeError=false;}
const sb={from(table){let op='read',value;const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},in(){return q;},or(){return q;},order(){return q;},range(){return q;},maybeSingle(){return q;},update(v){op='update';value=v;return q;},insert(v){op='insert';value=v;return q;},then(resolve,reject){
 let data=null,error=null;
 if(table==='broadcast_products')data=[1,2,3].map(product_id=>({product_id}));
 if(table==='product_brand_links')data=[];
 if(table==='products')data=[1,2,3].map(id=>({id,product_name:'MC-'+(330+id),price:1000}));
 if(table==='settings'){
   if(op==='read'){data=filters.some(([k,v])=>k==='key'&&v===WIDGET_PRODUCT_HISTORY_SETTING_KEY)?{value:history}:state===null?null:{value:state};if(readError)error={message:'offline'};}
   else {writes.push({table,op,value,filters});if(writeError)error={message:'write failed'};
     else if(conflicts>0){conflicts--;state=JSON.stringify({mode:'selected',paused:false,targets:[target(3)]});}
     else {if(op==='update')assert.ok(filters.some(([k,v])=>k==='value'&&v===state),'CAS must compare the original value');state=value.value;data={key};}
   }
 }
 if(table==='broadcasts'){writes.push({table,op,value});data={id:bc};}
 if(table==='live_chat_messages'){writes.push({table,op,value});data=value.map((p,i)=>({...p,id:i+1}));}
 return Promise.resolve({data,error}).then(resolve,reject);
 }};return q;}};
const apply=targets=>runChatProductCommand(sb,bc,'',{nickname:'admin',body:'/'},{targets,mode:'append'});
reset({mode:'selected',paused:true,targets:[target(1)]});await apply([target(2),target(1)]);assert.deepEqual(JSON.parse(state),{mode:'selected',paused:false,targets:[target(1),target(2)]});assert.equal(writes.at(-1).value.length,3);
reset({mode:'selected',paused:false,targets:[target(1)]});conflicts=1;await apply([target(2)]);assert.deepEqual(JSON.parse(state).targets,[target(3),target(2)],'retry preserves the other admin’s newer list');
reset({mode:'selected',paused:false,targets:[target(1)]});conflicts=4;await assert.rejects(()=>apply([target(2)]),/다른 관리자/);assert.ok(writes.every(w=>w.table==='settings'),'failed CAS never posts guides or unpins');
reset({mode:'all',paused:true,targets:[]});await apply([target(2)]);assert.equal(JSON.parse(state).mode,'all','append to all retains all');assert.equal(JSON.parse(state).paused,false);
reset(null);await apply([target(2)]);assert.equal(writes[0].op,'insert');assert.equal(JSON.parse(state).mode,'all');
reset({mode:'history',paused:false,targets:[]});history=JSON.stringify([{...target(3),seenAt:'2026-11-11T00:00:00Z'}]);await apply([target(2)]);assert.deepEqual(JSON.parse(state).targets,[target(3),target(2)]);
reset({mode:'selected',paused:false,targets:[target(1)]});readError=true;await assert.rejects(()=>apply([target(2)]));assert.equal(writes.length,0);
reset({mode:'selected',paused:false,targets:[target(1)]});writeError=true;await assert.rejects(()=>apply([target(2)]));assert.equal(writes.length,1);
reset({mode:'selected',paused:false,targets:[target(1)]});await assert.rejects(()=>apply([target(999)]));assert.equal(writes.length,0);
console.log('PASS actual append service: selected/all/history, dedup, concurrent CAS retry, missing setting, fresh target validation and failure without public posts');
