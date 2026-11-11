import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const original={fetch:globalThis.fetch,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,now:Date.now};
let time=Date.now(),fail=false;const intervals=new Set();
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
globalThis.setInterval=(fn)=>{intervals.add(fn);return fn};globalThis.clearInterval=fn=>intervals.delete(fn);Date.now=()=>time;
globalThis.fetch=async()=>{if(fail)throw new Error('network down');return {ok:true,json:async()=>({ready:true,state:'running',budget:{broadcast_id:'id',enabled:true,cap_krw:40000,committed_krw:1000,worker_seen_at:new Date(time).toISOString(),stop_reason:null}})}};
let tree;
try {
 const Panel=createUiLoader()('components/admin-live/VoiceBudgetPanel.tsx').default;
 await act(async()=>{tree=Renderer.create(React.createElement(Panel,{broadcastId:'id',onProducts(){}}))});
 assert.match(JSON.stringify(tree.toJSON()),/작동 중/);
 fail=true;time+=45000;
 await act(async()=>{for(const tick of intervals)tick()});
 assert.match(JSON.stringify(tree.toJSON()),/연결 끊김/);
 assert.doesNotMatch(JSON.stringify(tree.toJSON()),/작동 중/,'failed polling must not preserve stale working status');
 await act(async()=>tree.unmount());assert.equal(intervals.size,0);
 console.log('PASS actual polling lifecycle: stale running state expires, failures visible, cleanup');
}finally{globalThis.fetch=original.fetch;globalThis.document=original.document;globalThis.setInterval=original.setInterval;globalThis.clearInterval=original.clearInterval;Date.now=original.now;}
