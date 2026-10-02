import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let timers=new Map(),id=0,payload;
globalThis.window={setTimeout(fn,ms){const key=++id;timers.set(key,{fn,ms});return key;},clearTimeout:key=>timers.delete(key)};
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
globalThis.requestAnimationFrame=()=>++id;globalThis.cancelAnimationFrame=()=>{};
globalThis.fetch=async()=>({ok:true,status:200,json:async()=>payload});
const {useEventPlayback}=createUiLoader()('components/event-shared/useEventPlayback.ts');
function Probe(){useEventPlayback({url:'/fixture'});return null;}
const now=Date.now();
for(const [name,extra,want] of [
 ['mission active',{active:true,pct:63},2500],
 ['mission disabled',{active:false},2500],
 ['mission complete',{active:true,pct:100},2500],
 ['idle event',{playback:null,event:{status:'idle'}},2500],
 ['legacy static result',{playback:null,event:{status:'result'}},2500],
 ['running timeline',{playback:{version:1,key:'a',kind:'roulette',seed:1,startedAtMs:now,durationMs:9200}},250],
 ['future timeline',{playback:{version:1,key:'a',kind:'roulette',seed:1,startedAtMs:now+10000,durationMs:9200}},250],
 ['completed timeline',{playback:{version:1,key:'a',kind:'roulette',seed:1,startedAtMs:now-10000,durationMs:9200}},2500],
]){
 timers.clear();payload={ok:true,server_now:now,...extra};let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(Probe));});
 assert.deepEqual([...timers.values()].map(t=>t.ms),[want],name+' should not use active polling without an active timeline');
 await act(async()=>tree.unmount());assert.equal(timers.size,0);
}
console.log('PASS mission/idle/legacy use idle cadence; only active timelines poll fast; cleanup');
