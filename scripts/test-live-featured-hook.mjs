import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const pending=[];let events,unsubscribed=0;const timers=new Map();let seq=0;
globalThis.window={setTimeout:f=>{timers.set(++seq,f);return seq;},clearTimeout:id=>timers.delete(id),setInterval:()=>99,clearInterval(){}};
globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
const sb = {
  from(table) {
    assert.equal(table, 'settings');
    return {select(cols) {
      assert.equal(cols, 'key,value');
      return {in(col, keys) {
        assert.equal(col, 'key');
        return new Promise(resolve => pending.push({keys, resolve}));
      }};
    }};
  }
};
const load=createUiLoader({
 './supabase':{supabase:sb},'./liveEvents':{subscribeLiveEvents:(_,handlers)=>{events=handlers;return()=>unsubscribed++;}},
 './useWidgetRotationIndex':{useWidgetRotationIndex:()=>0},
});
const {useLiveFeaturedProducts}=load('lib/useLiveFeaturedProducts.ts');
const items=[{id:'1',name:'첫 상품',priceText:'10원',imageUrl:'',soldOut:false},{id:'2',name:'다음 상품',priceText:'20원',imageUrl:'',soldOut:false}];
let result;function Probe(p){result=useLiveFeaturedProducts(p.id,items,p.enabled,null);return null;}
let tree;await act(async()=>{tree=Renderer.create(React.createElement(Probe,{id:'A',enabled:true}));});
const response=(request,id,product)=>request.resolve({data:[{key:`widget_rotation_${id}`,value:JSON.stringify({mode:'selected',paused:false,targets:[{productId:product,detailName:''}]})}],error:null});
assert.equal(result.current,null);
await act(async()=>tree.update(React.createElement(Probe,{id:'B',enabled:true})));
await act(async()=>response(pending[0],'A','1'));assert.equal(result.current,null,'old broadcast response cannot display an old product');
await act(async()=>response(pending[1],'B','2'));assert.equal(result.current.id,'2');
await act(async()=>{events.onCatalog({});for(const [id,f] of [...timers]){timers.delete(id);f();}});
await act(async()=>pending[2].resolve({error:new Error('offline')}));assert.equal(result.current,null,'failed refresh cannot leave a stale card');
await act(async()=>{events.onCatalog({});for(const [id,f] of [...timers]){timers.delete(id);f();}});
await act(async()=>response(pending[3],'B','1'));assert.equal(result.current.id,'1');
await act(async()=>tree.update(React.createElement(Probe,{id:'B',enabled:false})));assert.equal(result.current,null);assert.equal(result.products.length,0);
await act(async()=>tree.update(React.createElement(Probe,{id:'B',enabled:true})));assert.equal(result.current,null,'re-enable waits for fresh settings');
await act(async()=>response(pending[4],'B','2'));assert.equal(result.current.id,'2');
await act(async()=>tree.unmount());assert.equal(unsubscribed,3);
console.log('PASS real featured hook: small settings reads, catalog refresh, stale broadcast rejection, failed read, OFF and re-enable');
