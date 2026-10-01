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

// Real drawer + confirmation host: only DOM focus/layout and native events are simulated.
const keyboard=new Set(), confirmEvents=new Map();
document.addEventListener=(_key,fn)=>keyboard.add(fn);
document.removeEventListener=(_key,fn)=>keyboard.delete(fn);
globalThis.window={addEventListener:(key,fn)=>confirmEvents.set(key,fn),removeEventListener:key=>confirmEvents.delete(key)};
const confirmPanel=new Element(), cancel=new Element(), confirm=new Element();
confirmPanel.querySelectorAll=()=>[cancel,confirm];
const sharedLoad=createUiLoader();
const RealDrawer=sharedLoad('components/admin-live/AdminLiveSideDrawer.tsx').default;
const Host=sharedLoad('components/admin-live/AdminConfirmHost.tsx').default;
const {ADMIN_CONFIRM_EVENT}=sharedLoad('lib/adminConfirm.ts');
let confirmed;
opener.focus();closed=0;
await act(async()=>{tree=Renderer.create(React.createElement(React.Fragment,null,
 React.createElement(RealDrawer,{title:'미저장 설정',width:420,onClose:()=>closed++},React.createElement('button',null,'저장 후 이동')),
 React.createElement(Host)),{createNodeMock:element=>element.props['aria-label']==='계좌 변경 확인'?confirmPanel:panel});});
await act(async()=>confirmEvents.get(ADMIN_CONFIRM_EVENT)({detail:{id:'bank',message:'계좌 변경',title:'계좌 변경 확인',resolve:ok=>confirmed=ok}}));
assert.equal(document.activeElement,confirmPanel,'topmost financial confirmation takes focus');
const press=key=>{for(const fn of [...keyboard]) fn({key,shiftKey:false,preventDefault(){},stopPropagation(){}});};
press('Tab');assert.equal(document.activeElement,cancel,'keyboard enters topmost confirmation only');
confirm.focus();press('Tab');assert.equal(document.activeElement,cancel);
await act(async()=>press('Escape'));
assert.equal(confirmed,false,'Escape cancels financial confirmation');
assert.equal(closed,0,'Escape must not close underlying draft drawer');
assert.equal(document.activeElement,panel,'confirmation restores underlying focus');
await act(async()=>tree.unmount());
assert.equal(document.activeElement,opener);
assert.equal(keyboard.size,0);
console.log('PASS stacked financial confirmation focus, tab, Escape and restore');
