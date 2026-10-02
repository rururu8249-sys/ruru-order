import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let pathname='/event-survival/live',calls=[],timers=new Map(),id=0,storageReads=0;
globalThis.window={localStorage:{getItem(){storageReads++;return 'visitor-fixture-key';},setItem(){}},setInterval(fn,ms){const key=++id;timers.set(key,{fn,ms});return key;},clearInterval:key=>timers.delete(key)};
globalThis.fetch=async(url,init)=>{calls.push({url,init});return {ok:true};};
const noop={default:()=>null};
const Layout=createUiLoader({'next/navigation':{usePathname:()=>pathname},'./globals.css':{},'@/components/admin-live/AdminConfirmHost':noop,'@/components/DeployChunkReloadGuard':noop,'@/components/customer/CustomerAccessBlockGuard':noop,'@/components/customer/CustomerSiteAlertPopup':noop})('app/layout.tsx').default;
for(const path of ['/event-survival/live','/event-race/live','/event-roulette/live','/event-roulette/overlay','/event-claw/overlay','/event-mission/live']){
 pathname=path;calls=[];storageReads=0;let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(Layout,null,React.createElement('div',null,'widget')));});
 assert.equal(calls.length,0,path+' root heartbeat must not write visitor presence');
 assert.equal(storageReads,0,'display-only routes do not read identity');assert.equal(timers.size,0);
 await act(async()=>tree.unmount());
}
for(const [path,pageType] of [['/admin-live','admin'],['/order','order_form']]){
 pathname=path;calls=[];let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(Layout));});
 assert.equal(calls[0].url,'/api/presence');assert.equal(JSON.parse(calls[0].init.body).pageType,pageType);
 assert.equal(timers.size,1);
 pathname='/event-claw/overlay';await act(async()=>tree.update(React.createElement(Layout,null,'next')));
 assert.equal(timers.size,0,'navigating into widget cancels heartbeat');
 await act(async()=>tree.unmount());
}
console.log('PASS root widget paths do not write/read presence; admin/customer heartbeat retained and cleaned up');
