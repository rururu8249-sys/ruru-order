import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.localStorage = {getItem:()=>null};
const keys = new Set();
globalThis.window = {addEventListener:(_,f)=>keys.add(f),removeEventListener:(_,f)=>keys.delete(f)};
globalThis.HTMLInputElement = class {hasAttribute(){return true;}};
const item = (id,name,soldOut=false)=>({productId:String(id),detailName:'',texts:[name,name.split(' ')[0]],line:name,sizes:[],soldOut});
const items = [item(1,'MC-335 아이보리'),item(2,'MC-333 핑크',true),item(3,'BB-58 블랙'),item(4,'LOE-111 버건디'),item(5,'PD-335 블랙'),item(6,'ABC-10 mc 장식'),item(7,'ABC-11 로브')];
let reads=0;
globalThis.fetch=async()=>{reads++;return {json:async()=>({ok:true,items})};};
const {ChatProductPicker}=createUiLoader()('components/customer/ChatProductPicker.tsx');
let tree, selected=[];
const props={broadcastId:'test',query:'몽',busy:false,onSelect:p=>selected.push(p.productId),onClose(){}};
await act(async()=>{tree=Renderer.create(React.createElement(ChatProductPicker,props));});
const options=()=>tree.root.findAllByType('button').filter(n=>n.props.role==='option');
const names=()=>options().map(n=>n.children[0]);
assert.deepEqual(names(),['MC-335 아이보리','MC-333 핑크'],'/몽 must list Moncler products even when catalog texts only contain MC codes');
assert.equal(options()[1].props.disabled,true,'sold-out products remain disabled');
assert.deepEqual(selected,[],'search must not select or send automatically');
for(const [query,expected] of [
 ['몽클',['MC-335 아이보리','MC-333 핑크']],['몽클레르',['MC-335 아이보리','MC-333 핑크']],
 ['moncler',['MC-335 아이보리','MC-333 핑크']],['버',['BB-58 블랙','LOE-111 버건디']],['로',['LOE-111 버건디','ABC-11 로브']],
 ['몽335',['MC-335 아이보리']],['mc335',['MC-335 아이보리']],['335',['MC-335 아이보리','PD-335 블랙']],
 ['아이보리',['MC-335 아이보리']],['없는브랜드',[]],['',items.map(p=>p.line)],
]){await act(async()=>tree.update(React.createElement(ChatProductPicker,{...props,query})));assert.deepEqual(names(),expected,query);}
assert.equal(reads,1,'typing filters the existing catalog without more requests');
await act(async()=>tree.update(React.createElement(ChatProductPicker,props)));
await act(async()=>options()[0].props.onClick());assert.deepEqual(selected,['1']);
const press=async key=>{await act(async()=>{for(const f of keys)f({target:new HTMLInputElement(),key,preventDefault(){},stopPropagation(){}});});};
await press('ArrowDown');await press('Enter');assert.deepEqual(selected,['1'],'keyboard cannot select sold-out item');
await press('ArrowUp');await press('Enter');assert.deepEqual(selected,['1','1'],'keyboard still selects exact product');
await act(async()=>tree.unmount());assert.equal(keys.size,0);
console.log('PASS actual chat picker: brand-only aliases, code/name search, sold-out, selection, keyboard and no typing requests');
