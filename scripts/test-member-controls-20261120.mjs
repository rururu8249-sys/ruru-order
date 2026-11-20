// Interaction tests use React fixtures only. No network, database, or browser session.
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import { createUiLoader } from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act } = Renderer;
const listeners = new Map();
// Next hydrates at document. React's delegated key handler and the modal hook
// are listeners on the same native target; stopPropagation does not skip the
// next listener on that target. Keep the real EventTarget dispatch semantics.
const documentEvents = new EventTarget();
let reactKeyHandler;
documentEvents.addEventListener('keydown', event => reactKeyHandler?.({
  key: event.key, shiftKey: event.shiftKey, nativeEvent: event,
  altKey: false, ctrlKey: false, metaKey: false,
  preventDefault: () => event.preventDefault(),
  stopPropagation: () => event.stopPropagation(),
}));
const dispatchKey = async (key, shiftKey = false) => {
  const event = new Event('keydown', {bubbles:true, cancelable:true});
  Object.defineProperties(event, {key:{value:key}, shiftKey:{value:shiftKey}});
  await act(async () => documentEvents.dispatchEvent(event));
  return event;
};
class Element {
  style = {}; isConnected = true;
  focus() { document.activeElement = this; }
  contains(node) { return node === this; }
  getClientRects() { return [{}]; }
  getBoundingClientRect() { return {left:100,right:320,top:100,bottom:144,width:220,height:44}; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest() { return null; }
  scrollIntoView() {}
}
globalThis.HTMLElement = Element;
globalThis.document = {
  body: {style:{overflow:''}}, activeElement:new Element(),
  addEventListener(type, fn) { const set=listeners.get(type)||new Set();set.add(fn);listeners.set(type,set);documentEvents.addEventListener(type,fn); },
  removeEventListener(type, fn) { listeners.get(type)?.delete(fn);documentEvents.removeEventListener(type,fn); },
};
globalThis.window = {innerWidth:390,innerHeight:800,addEventListener(){},removeEventListener(){},setTimeout,clearTimeout};
const options = [
  {value:'latest',label:'최근주문순'}, {value:'disabled',label:'사용 불가',disabled:true},
  {value:'lastLogin',label:'최근 로그인순'}, {value:'oldLogin',label:'과거접속순 (오래 안 온 순)'},
  {value:'nickname',label:'닉네임순'},
];
const load=createUiLoader();
const Select=load('components/admin-live/AdminSelect.tsx').default;
const changes=[];
function Harness() {const [value,setValue]=React.useState('latest');return React.createElement(Select,{label:'회원 정렬',value,options,onChange:v=>{changes.push(v);setValue(v);}});}
let tree;
await act(async()=>{tree=Renderer.create(React.createElement(Harness),{createNodeMock:()=>new Element()});});
const combo=()=>tree.root.findByProps({role:'combobox'});
const open=()=>tree.root.findAllByProps({role:'listbox'}).length===1;
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
const key=async value=>{const event={key:value,altKey:false,ctrlKey:false,metaKey:false,isComposing:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};await act(async()=>combo().props.onKeyDown(event));return event;};
try {
  await key('Enter'); assert.ok(open());
  await key('ArrowDown');
  const active=combo().props['aria-activedescendant'];
  assert.equal(text(tree.root.findByProps({id:active})).includes('최근 로그인순'),true,'Arrow skips disabled option');
  const escape=await key('Escape');
  assert.equal(escape.stopped,true,'Escape is consumed before a containing drawer/sheet');
  assert.equal(open(),false); assert.deepEqual(changes,[],'Escape does not commit navigation');
  await key(' '); await key('End'); await key('Enter');
  assert.deepEqual(changes,['nickname']); assert.equal(open(),false);
  await key('Home'); await key('Tab');
  assert.deepEqual(changes,['nickname','latest'],'Tab accepts the navigated option and leaves normal Tab movement');
  await key('Enter');
  await act(async()=>tree.root.findAllByProps({role:'option'}).find(n=>n.props['aria-disabled']).props.onClick());
  assert.deepEqual(changes,['nickname','latest'],'Disabled options cannot commit');
  await key('Escape');
  const closedEscape=await key('Escape'); assert.notEqual(closedEscape.stopped,true,'Closed select allows parent Escape');
  console.log('PASS AdminSelect keyboard, disabled, commit/cancel, parent Escape, Tab');
} finally { await act(async()=>tree.unmount()); }
assert.equal([...listeners.values()].some(set=>set.size>0),false,'Event handlers clean up');

const Toolbar=load('components/admin-live/MemberFilterToolbar.tsx').default;
const callbacks=[];
function ToolbarHarness() {
  const [keyword,setKeyword]=React.useState('');
  const [sort,setSort]=React.useState('latest');
  return React.createElement(Toolbar,{
    keyword,sort,status:'all',buyersOnly:false,profileReady:true,blockReady:true,statsReady:true,
    counts:{all:2,normal:2,blocked:0,attention:0,blockedTotal:0,standalone:0},phoneBlockOpen:false,
    onKeyword:v=>{callbacks.push(['keyword',v]);setKeyword(v);},onSort:v=>{callbacks.push(['sort',v]);setSort(v);},
    onStatus:v=>callbacks.push(['status',v]),onBuyersOnly:v=>callbacks.push(['buyers',v]),
    onReset:()=>callbacks.push(['reset']),onBlockedList:()=>callbacks.push(['blocks']),onPhoneBlock:()=>callbacks.push(['phone']),
  });
}
await act(async()=>{tree=Renderer.create(React.createElement(ToolbarHarness),{createNodeMock:()=>new Element()});});
const filterButton=()=>tree.root.findAllByType('button').find(n=>n.props['aria-haspopup']==='dialog');
const sheet=()=>tree.root.findAllByProps({role:'dialog','aria-label':'회원 필터'})[0];
const sheetCombo=()=>sheet().findByProps({role:'combobox'});
reactKeyHandler = event => sheetCombo().props.onKeyDown(event);
const dispatchSheetKey = dispatchKey;
try {
  await act(async()=>filterButton().props.onClick());
  assert.ok(sheet()); assert.equal(document.body.style.overflow,'hidden');
  await dispatchSheetKey('Enter'); assert.equal(sheet().findAllByProps({role:'listbox'}).length,1);
  await dispatchSheetKey('Escape');
  assert.ok(sheet(),'First Escape closes only the nested selection popup');
  assert.equal(sheet().findAllByProps({role:'listbox'}).length,0);
  await dispatchSheetKey('Escape');
  assert.equal(sheet(),undefined,'Second Escape closes the filter sheet');
  assert.deepEqual(callbacks,[],'Opening, navigating and canceling does not change filters');
  await act(async()=>filterButton().props.onClick());
  await act(async()=>sheet().findByType('input').props.onChange({target:{value:'검증 검색'}}));
  await dispatchSheetKey('Enter');
  await act(async()=>sheet().findAllByProps({role:'option'}).find(n=>text(n)==='최근 로그인순').props.onClick());
  await act(async()=>sheet().findAllByType('button').find(n=>n.props['aria-label']==='회원 필터 닫기').props.onClick());
  assert.ok(text(tree.root.findByProps({role:'combobox'})).includes('최근 로그인순'));
  assert.deepEqual(callbacks,[['keyword','검증 검색'],['sort','lastLogin']],'Closing preserves immediately applied filters');
  assert.equal(document.body.style.overflow,'','Sheet restores document scrolling');
  console.log('PASS mobile filter sheet, nested Escape, unchanged cancel, preserved filters and scroll restoration');
} finally {await act(async()=>tree.unmount());}

const Drawer=load('components/admin-live/AdminLiveSideDrawer.tsx').default;
const drawerChanges=[];
let drawerCloses=0;
const opener=new Element();
opener.focus();
function DrawerHarness() {
  const [visible,setVisible]=React.useState(true);
  const [value,setValue]=React.useState('latest');
  return visible ? React.createElement(Drawer,{title:'정렬 검증',width:560,onClose:()=>{drawerCloses++;setVisible(false);}},
    React.createElement(Select,{label:'주문 이력 정렬',value,options,onChange:next=>{drawerChanges.push(next);setValue(next);}})) : null;
}
await act(async()=>{tree=Renderer.create(React.createElement(DrawerHarness),{createNodeMock:()=>new Element()});});
reactKeyHandler=event=>tree.root.findByProps({role:'combobox'}).props.onKeyDown(event);
try {
  await dispatchKey('Enter'); await dispatchKey('End');
  assert.equal(tree.root.findAllByProps({role:'listbox'}).length,1);
  const canceled=await dispatchKey('Escape');
  assert.equal(canceled.defaultPrevented,true,'The select cancels the native Escape event');
  assert.equal(tree.root.findAllByProps({role:'listbox'}).length,0);
  assert.equal(tree.root.findAllByProps({role:'dialog'}).length,1,'First Escape leaves the containing drawer open');
  assert.equal(drawerCloses,0);
  assert.deepEqual(drawerChanges,[],'Canceled navigation does not change sorting');
  assert.equal(document.body.style.overflow,'hidden','The remaining drawer keeps its scroll lock');
  await dispatchKey('Escape');
  assert.equal(tree.root.findAllByProps({role:'dialog'}).length,0,'Second Escape closes the drawer');
  assert.equal(drawerCloses,1);
  assert.equal(document.activeElement,opener,'Closing the drawer restores the opener');
  assert.equal(document.body.style.overflow,'','Closing the drawer restores scrolling');
  console.log('PASS document-root event dispatch: popup Escape, subsequent drawer Escape, sorting, focus and scrolling');
} finally {reactKeyHandler=undefined;await act(async()=>tree.unmount());}
assert.equal([...listeners.values()].some(set=>set.size>0),false,'Native handlers clean up after nested controls');
