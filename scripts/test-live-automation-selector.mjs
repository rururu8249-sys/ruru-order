import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let Component;try{Component=createUiLoader()('components/customer/AutomationNicknamePicker.tsx').AutomationNicknamePicker}catch{}
assert.ok(Component,'the composer-adjacent nickname selector must exist');
const chosen=[],state={available:true,selected:null,ready:true,busy:false,open:true,message:'',recent:[],setOpen:()=>{},refresh:async()=>true,choose:async id=>chosen.push(id),reset:async()=>{},actors:[{id:'one',nickname:'One',activity:{present:true,cart:false,orders:0},inUse:false,mine:false},{id:'two',nickname:'Two',activity:{present:false,cart:true,orders:0},inUse:true,mine:false}]};
let root;await act(async()=>{root=Renderer.create(React.createElement(Component,{state,dark:true}))});
const rows=root.root.findAllByProps({'data-actor-option':true});
assert.equal(rows.length,2);assert.equal(rows[0].props.disabled,false);assert.equal(rows[1].props.disabled,true);
await act(async()=>{await rows[0].props.onClick()});assert.deepEqual(chosen,['one']);
await act(async()=>{root.update(React.createElement(Component,{state:{...state,available:false},dark:true}))});assert.equal(root.toJSON(),null);
await act(async()=>root.unmount());
console.log('PASS actor activity labels, one-click selection, other-operator exclusion and no customer-facing controls');
