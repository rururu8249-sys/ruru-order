import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// An absolutely positioned result covering the stage must fail. Drive the real
// admin test-mode flow against local transport fixtures; no live server requests.
let raf,actions=[],unexpected=[];
globalThis.requestAnimationFrame=callback=>{raf=callback;return 1;};
globalThis.cancelAnimationFrame=()=>{};
globalThis.window={location:{origin:'http://localhost:3000'},setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){}}};
globalThis.fetch=async(url,init)=>{
 let data={ok:true,broadcasts:[],participants:[],events:[],winners:[]};
 if(init?.method==='POST'){
  const body=JSON.parse(init.body);
  if(body.action==='participants')return {ok:true,json:async()=>({ok:true,participants:[]})};
  actions.push(body);
  if(url!=='/api/admin-live/event-roulette' || !['create_event','resolve_survival_event'].includes(body.action))unexpected.push(body);
  assert.equal(url,'/api/admin-live/event-roulette','no point/payment endpoint may be called');
  assert(['create_event','resolve_survival_event'].includes(body.action),'unexpected write');
  if(body.action==='create_event'){assert.equal(body.mode,'test');data={ok:true,event:{id:'fixture',mode:'test',status:'idle'}};}
  else data={ok:true,survivors:['긴닉네임당첨자'],winners:[],event:{id:'fixture',mode:'test',status:'result',winner_nickname:'긴닉네임당첨자',winner_note:'테스트 선물',result_at:'2030-01-01T00:00:00Z'}};
 }
 return {ok:true,json:async()=>data};
};
const Panel=createUiLoader({'./AdminLiveEventSoundboard':{default:()=>null},'@/lib/adminToast':{showAdminToast(){}},'@/lib/adminConfirm':{showAdminConfirm:async()=>true}})('components/admin-live/AdminLiveEventRoulettePanel.tsx').default;
let tree;
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{controlledOpen:true,embedded:true,renderTrigger:false}));});
const button=prefix=>tree.root.findAllByType('button').find(node=>node.children.join('').startsWith(prefix));
await act(async()=>button('✎ 수동 입력').props.onClick());
await act(async()=>tree.root.findByType('textarea').props.onChange({target:{value:'긴닉네임당첨자,참가자2,참가자3'}}));
await act(async()=>button('테스트로 해보기').props.onClick());
assert.equal(actions.length,2);
assert.deepEqual(unexpected,[]);
await act(async()=>raf(performance.now()+10000));
const winner=tree.root.findAllByType('div').find(node=>node.children.join('')==='긴닉네임당첨자');
assert(winner,'result should be announced');
let ancestor=winner;
while(ancestor){assert.notEqual(ancestor.props?.style?.position,'absolute','winner must reserve layout space, never cover start controls');ancestor=ancestor.parent;}
assert.equal(button('▶ 시작').props.disabled,false,'start remains usable after result');
await act(async()=>button('테스트로 해보기').props.onClick());
assert.equal(actions.length,4,'restart still works after winner announcement');
await act(async()=>tree.unmount());
console.log('PASS result occupies normal layout, long winner name and restart controls; local test-mode fixtures only');
