import assert from 'node:assert/strict';import React from 'react';import Renderer,{act} from 'react-test-renderer';import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;let confirmEnd=false;globalThis.window={confirm:()=>confirmEnd};
const {RpsWidget}=createUiLoader({'./rps.css':{},'./useRpsAudio':{useRpsAudio:()=>({sound:false,toggle(){}})}})('components/rps/RpsWidget.tsx');
const calls=[];let verifiedCalls=0,tree;
const s={id:'room',title:'가위·바위·보 루루를 이겨라!',status:'lobby',revision:1,round:0,deadline:new Date(Date.now()+300000).toISOString(),joinSeconds:300,pickSeconds:5,target:10,auto:true,pvp:false,test:false,rewardKind:'points',points:1000,gift:'',total:100,alive:100,winners:[],finals:[],stats:{},note:''};
const config={title:s.title,winners:10,points:1000,rewardKind:'points',gift:'',joinSeconds:300,pickSeconds:5,auto:true};
const base={state:s,setup:{revision:2,config},admin:false,verified:true,player:null,now:Date.now(),winners:[],busy:false,error:'',action:async(name,data)=>calls.push({name,data}),verify:()=>verifiedCalls++};
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.children?.map(text).join('')??'';
const button=label=>tree.root.findAllByType('button').find(b=>text(b)===label);
const render=async(game=base,publicOnly=false)=>act(async()=>{if(tree)tree.update(React.createElement(RpsWidget,{game,publicOnly,broadcastId:'broadcast',onAdmin(){}}));else tree=Renderer.create(React.createElement(RpsWidget,{game,publicOnly,broadcastId:'broadcast',onAdmin(){}}));});
try{
 for(const [seconds,label] of [[300,'5분 00초'],[299,'4분 59초'],[60,'1분 00초'],[59,'0분 59초'],[0,'0분 00초']]){
  await render({...base,now:Date.parse(s.deadline)-seconds*1000});
  assert.ok(tree.root.findByProps({'aria-label':`모집 마감까지 ${label}`}));
  if(seconds===0)assert.equal(button('참가하기').props.disabled,true);
 }

 await render();assert.ok(!tree.root.findAllByType('button').some(b=>/접기|펼치기/.test(b.props['aria-label']||'')));assert.ok(button('참가하기'));await act(async()=>button('참가하기').props.onClick());assert.equal(calls.at(-1).name,'join');
 await render({...base,verified:false});assert.ok(button('참가하기'));await act(async()=>button('참가하기').props.onClick());assert.equal(verifiedCalls,1);
 await render(base,true);assert.equal(tree.root.findAllByType('button').length,0);assert.match(text(tree.toJSON()),/참가자 모집 중/);assert.ok(!text(tree.toJSON()).includes('휴대폰에서'));
 await render({...base,admin:true,state:{...s,auto:false}});assert.ok(button('모집 마감하고 게임 시작'));assert.ok(!button('참가하기'));
 await act(async()=>button('✋보').props.onClick());await act(async()=>button('모집 마감하고 게임 시작').props.onClick());assert.deepEqual(calls.at(-1),{name:'start',data:{hand:'paper'}});
 for(const status of ['lobby','ready','choosing','reveal','paused','finished']){
  await render({...base,admin:true,state:{...s,status}});assert.ok(button('게임 종료'));
  const before=calls.length;await act(async()=>button('게임 종료').props.onClick());assert.equal(calls.length,before,'cancel keeps game');
  confirmEnd=true;await act(async()=>button('게임 종료').props.onClick());assert.equal(calls.at(-1).name,'close');confirmEnd=false;
 }
 await render({...base,admin:true,state:{...s,status:'ready',alive:0,total:0}});
 assert.ok(!button('모집 마감하고 게임 시작'));assert.ok(button('참가자 다시 모집'));
 await act(async()=>button('참가자 다시 모집').props.onClick());assert.deepEqual(calls.at(-1),{name:'lobbyTime',data:{seconds:300}});
 assert.ok(!text(tree.toJSON()).includes('관전 중'));assert.ok(!text(tree.toJSON()).includes('고르고 있어요'));
 const choosing={...s,status:'choosing',round:1};const player={id:'me',nickname:'나',alive:true,winner:false,choice:null,choice_round:1};
 await render({...base,state:choosing,player});await act(async()=>button('✌️가위').props.onClick());assert.equal(calls.at(-1).name,'pick');
 await render({...base,state:choosing,player:{...player,alive:false}});assert.ok(!button('✌️가위'));assert.match(text(tree.toJSON()),/탈락/);
 await render({...base,state:choosing,player:null});assert.ok(!button('✌️가위'));assert.match(text(tree.toJSON()),/관전 중/);
 await render({...base,state:choosing},true);assert.equal(tree.root.findAllByType('button').length,0);
 await render({...base,admin:true,state:{...s,status:'closed'}});assert.ok(button('참가자 모집 시작'));assert.ok(button('연습 게임 시작'));await act(async()=>button('참가자 모집 시작').props.onClick());assert.deepEqual(calls.at(-1).data,{setupRevision:2,broadcastId:'broadcast',test:false});
 await render({...base,state:{...s,status:'closed'}});assert.equal(tree.toJSON(),null);
 await render({...base,state:{...s,status:'finished',winners:Array.from({length:10},(_,i)=>({id:String(i),nickname:'당첨'+i}))}});assert.equal(tree.root.findByProps({'aria-label':'당첨자 명단'}).findAllByType('div').length,11);
 console.log('PASS participant/admin/spectator/YouTube, manual immediate start, forfeited spectator, saved setup start, 10 winners');
}finally{await act(async()=>tree?.unmount());}
