import assert from 'node:assert/strict';import React from 'react';import Renderer,{act} from 'react-test-renderer';import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let timers=new Map(),timerId=0,requests=[],visibility;
globalThis.window={setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)};
globalThis.document={visibilityState:'visible',addEventListener:(_n,fn)=>visibility=fn,removeEventListener:()=>{visibility=null}};
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
const {useYoutubeChatNotice}=createUiLoader({})('lib/useYoutubeChatNotice.ts');
let output,tree;
function Harness({active,video='abcdefghijk'}){output=useYoutubeChatNotice('bc',video,active);return null}
const message=id=>({id,broadcastId:'bc',body:'글 '+id,nickname:'시청자',hidden:false});
const respond=async(index,ids)=>{await act(async()=>requests[index].resolve({ok:true,json:async()=>({ok:true,initialized:true,status:'live',videoId:'abcdefghijk',messages:ids.map(message),pollAfterMs:20000})}));};
try{
 await act(async()=>{tree=Renderer.create(React.createElement(Harness,{active:false}))});assert.equal(requests.length,0,'YouTube tab makes ZERO alert API requests');
 await act(async()=>tree.update(React.createElement(Harness,{active:true})));assert.equal(requests.length,1);await respond(0,[1]);assert.equal(output.messages.length,0,'initial history is not unread');
 await act(async()=>{const fn=[...timers.values()][0];timers.clear();fn()});await respond(1,[1,2]);assert.equal(output.messages.length,1);
 await act(async()=>tree.update(React.createElement(Harness,{active:false})));assert.equal(timers.size,0,'YouTube tab clears scheduled request');assert.equal(output.messages.length,0);
 await act(async()=>tree.update(React.createElement(Harness,{active:true})));assert.equal(requests.length,3);
 await act(async()=>{document.visibilityState='hidden';visibility()});assert.equal(requests[2].options.signal.aborted,true,'background aborts in-flight request');assert.equal(timers.size,0);
 await respond(2,[1,2,3]);assert.equal(output.messages.length,0,'aborted result ignored');
 await act(async()=>{document.visibilityState='visible';visibility()});assert.equal(requests.length,4);await respond(3,[1,2,3]);assert.equal(output.messages.length,0,'return to site starts from read baseline');
 await act(async()=>tree.update(React.createElement(Harness,{active:false})));assert.equal(timers.size,0);
 console.log('PASS zero requests in YouTube tab, site-only polling, history baseline, read, hidden cancellation, stale result guard');
}finally{await act(async()=>tree?.unmount());globalThis.fetch=originalFetch;}
