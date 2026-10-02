import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// Catches a missing winner ID, multi-winner falling through to single payout,
// or visual RAF/load becoming a prerequisite for the existing payout schedule.
const timers=new Map(); let nextTimer=1, raf;
const timeout=(fn,ms=0)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;};
globalThis.requestAnimationFrame=fn=>{raf=fn;return 1;};
globalThis.cancelAnimationFrame=()=>{};
globalThis.window={location:{origin:'http://localhost:3000'},setTimeout:timeout,clearTimeout:id=>timers.delete(id),localStorage:{getItem:()=>null,setItem(){}}};
const db={from(table){const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},maybeSingle:async()=>({data:{is_reward_done:false}}),then(resolve){return Promise.resolve({data:table==='orders'?[{customer_phone:'01012345678'}]:[]}).then(resolve);}};return q;}};
const Panel=createUiLoader({'@/lib/supabase':{supabase:db},'./AdminLiveEventSoundboard':{default:()=>null},'@/lib/adminToast':{showAdminToast(){}},'@/lib/adminConfirm':{showAdminConfirm:async()=>true}})('components/admin-live/AdminLiveEventRoulettePanel.tsx').default;
async function run(kind,runMode='live',gift='point',visual=true){
 timers.clear();raf=null;let tree,event,grants=[],actions=[],winnerRows=[];
 globalThis.fetch=async(url,init)=>{
  let data={ok:true,broadcasts:[],participants:[],events:[],winners:winnerRows};
  if(init?.method==='POST'){
   const body=JSON.parse(init.body); actions.push({url,body});
   if(url==='/api/admin-live/customer-points'){grants.push(body);return {ok:true,json:async()=>({ok:true})};}
   assert.equal(url,'/api/admin-live/event-roulette','fixture must never access another write endpoint');
   if(body.action==='create_event'){event={id:'fixture-'+kind,mode:body.mode,status:'idle',title:'fixture',is_test:body.mode==='test',overlay_token:kind+'_luludongi_live',participants:[{nickname:'A'},{nickname:'B'},{nickname:'C'}]};data={ok:true,event};}
   else if(body.action==='spin_event'||body.action==='resolve_survival_event'){
    event={...event,status:'result',winner_nickname:'A',winner_order_ids:['order-a'],result_at:'2030-01-01T00:00:00Z'};
    data={ok:true,event,winnerId:'winner-a',survivors:['A','B'],winners:[{nickname:'A',winnerId:'winner-a',orderIds:['order-a']},{nickname:'B',winnerId:'winner-b',orderIds:['order-b']}]};
   } else if(body.action==='mark_reward_done')data={ok:true}; // list read may still be stale
  }
  return {ok:true,json:async()=>data};
 };
 await act(async()=>{tree=Renderer.create(React.createElement(Panel,{controlledOpen:true,embedded:true,renderTrigger:false}));});
 const button=prefix=>tree.root.findAllByType('button').find(n=>n.children.join('').startsWith(prefix));
 const labels={roulette:'🎡 룰렛',claw:'🪆 인형뽑기',survival:'⛈️ 서바이벌',race:'🏁 달리기'};
 await act(async()=>button(labels[kind]).props.onClick());
 await act(async()=>button('✎ 수동 입력').props.onClick());
 await act(async()=>tree.root.findByType('textarea').props.onChange({target:{value:'A,B,C'}}));
 if(gift==='custom')await act(async()=>tree.root.findAllByType('select').find(n=>n.props.value==='point').props.onChange({target:{value:'custom'}}));
 else await act(async()=>tree.root.findAllByType('input').find(n=>n.props.placeholder==='당첨 내용(포인트)').props.onChange({target:{value:'2000'}}));
 await act(async()=>button(runMode==='test'?'테스트로 해보기':'▶ 시작').props.onClick());
 const multi=kind==='survival'||kind==='race';
 if(!multi)assert.equal(grants.length,0,'single payout keeps completion delay');
 if(visual&&raf)await act(async()=>raf(performance.now()+10000));
 for(const [id,t] of [...timers])if(t.ms>=4000&&t.ms<=6000){timers.delete(id);await act(async()=>t.fn());}
 const count=runMode==='live'&&gift==='point'?(multi?2:1):0;
 assert.equal(grants.length,count,kind+' grant count');
 assert.deepEqual(grants.map(g=>g.source_key),count?(multi?['event_winner:winner-a','event_winner:winner-b']:['event_winner:winner-a']):[],'use stable winner row IDs, never a second event-level key');
 for(const grant of grants){assert.equal(grant.amount,2000);assert.equal(grant.phone,'01012345678');}
 // Editing metadata and remounting the visual subtree may not schedule rewards.
 await act(async()=>tree.root.findAllByType('input').find(n=>n.props.placeholder==='이벤트 제목').props.onChange({target:{value:'changed title'}}));
 await act(async()=>button('새로고침').props.onClick());
 if(visual&&raf)await act(async()=>raf(performance.now()+20000));
 for(const [id,t] of [...timers])if(t.ms>=4000&&t.ms<=6000){timers.delete(id);await act(async()=>t.fn());}
 assert.equal(grants.length,count,'metadata reload does not replay payout');
 await act(async()=>tree.unmount());
}
for(const kind of ['roulette','claw','survival','race']){
 await run(kind);await run(kind,'test');await run(kind,'live','custom');
}
await run('roulette','live','point',false);
await run('claw','live','point',false);
console.log('PASS real admin reward boundary: stable IDs, single/multi, test/custom, metadata, no visual RAF');
