import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import { resolveAdminLiveDestination, transitionAdminLiveDrawer, resolveDrawerOrder } from '../components/admin-live/adminLiveDrawerState.ts';
import { ADMIN_LIVE_ALL_MENU_KEYS } from '../components/admin-live/adminLiveMenu.ts';

assert.deepEqual(resolveAdminLiveDestination('payments'), {screen:'orders', drawer:{kind:'deposits'}});
for (const key of ADMIN_LIVE_ALL_MENU_KEYS.filter(key => key !== 'payments')) {
  assert.deepEqual(resolveAdminLiveDestination(key), {screen:key, drawer:{kind:'closed'}});
}
let state = {kind:'closed'};
for (const next of [{kind:'order',orderId:'12'}, {kind:'match',orderId:'12'}, {kind:'deposits'}, {kind:'closed'}]) {
  state = transitionAdminLiveDrawer(state, next);
  assert.deepEqual(state, next, 'new drawer replaces the old slot');
}
assert.deepEqual(transitionAdminLiveDrawer({kind:'match',orderId:null}, {kind:'match',orderId:null}), {kind:'closed'}, 'header toggle closes the same drawer');
assert.deepEqual(transitionAdminLiveDrawer({kind:'order',orderId:'1'}, {kind:'order',orderId:'2'}), {kind:'order',orderId:'2'}, 'different order replaces detail');
const orders=[{id:'1'},{id:'2'}];
assert.equal(resolveDrawerOrder({kind:'order',orderId:'1'},orders,[orders[1]],'2'),orders[0],'detail remains pinned after filter changes');
assert.equal(resolveDrawerOrder({kind:'order',orderId:'gone'},orders,orders,'2'),null,'removed detail never silently displays a different customer');
assert.equal(resolveDrawerOrder({kind:'closed'},orders,[orders[1]],'2'),orders[1]);
console.log('PASS admin drawer destination and single-slot transitions');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const listeners=new Map();
class Element {isConnected=true; focus(){document.activeElement=this;} getClientRects(){return [{}];} closest(){return null;}}
globalThis.HTMLElement=Element;
const opener=new Element(), first=new Element(), last=new Element(), panel=new Element();
panel.querySelectorAll=()=>[first,last];
globalThis.document={activeElement:opener,body:{style:{overflow:'auto'}},addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
const Drawer=createUiLoader()('components/admin-live/AdminLiveSideDrawer.tsx').default;
let closed=0, tree;
await act(async()=>{tree=Renderer.create(React.createElement(Drawer,{title:'입금내역',width:560,onClose:()=>closed++},React.createElement('button',null,'목록')),{createNodeMock:()=>panel});});
assert.equal(tree.root.findByProps({role:'dialog'}).props['aria-modal'],'true');
assert.equal(document.activeElement,panel);
assert.equal(document.body.style.overflow,'hidden');
listeners.get('keydown')({key:'Tab',preventDefault(){},shiftKey:false});
assert.equal(document.activeElement,first);
last.focus();
listeners.get('keydown')({key:'Tab',preventDefault(){},shiftKey:false});
assert.equal(document.activeElement,first);
listeners.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
assert.equal(closed,1);
await act(async()=>tree.unmount());
assert.equal(document.activeElement,opener);
assert.equal(document.body.style.overflow,'auto');
assert.equal(listeners.size,0);
console.log('PASS drawer keyboard containment and focus restoration');
