import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={dispatchEvent(){}};
let hook;try{hook=createUiLoader()('components/admin-live/useEventCustomGift.ts').useEventCustomGift;}catch{}
assert.ok(hook,'custom gift hook missing');
let state, calls=0, fail=true;
function Harness({winners}){state=hook(winners);return React.createElement('div');}
globalThis.fetch=async()=>{calls++;return {ok:!fail,json:async()=>fail?{ok:false,message:'DB failure'}:{ok:true,status:'added',winnerId:'w',orderId:'123',productName:'선물',targetState:'active'}};};
let tree;const winners=[{winnerId:'w',isTest:false,customGiftName:'선물'}];
await act(async()=>{tree=Renderer.create(React.createElement(Harness,{winners}));});
assert.equal(calls,1);assert.equal(state.states.w.status,'failed');
fail=false;await act(async()=>state.retry('w'));assert.equal(state.states.w.status,'added');assert.equal(calls,2);
await act(async()=>tree.update(React.createElement(Harness,{winners:[...winners]})));assert.equal(calls,2);
await act(async()=>state.retry('w'));assert.equal(calls,2,'success cannot replay');
await act(async()=>tree.update(React.createElement(Harness,{winners:[{winnerId:'test',isTest:true,customGiftName:'선물'},{winnerId:'point',isTest:false,customGiftName:null}]})));assert.equal(calls,2);
await act(async()=>tree.unmount());
console.log('PASS real hook: failure visible, explicit retry, success no replay, metadata no replay, test/point no writes');
