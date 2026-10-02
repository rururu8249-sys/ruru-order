import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let timers=new Map(),n=0,audio=0,requests=[];
const timeout=(fn,ms)=>{const id=++n;timers.set(id,{fn,ms});return id;};
globalThis.setInterval=timeout;globalThis.clearInterval=id=>timers.delete(id);
globalThis.requestAnimationFrame=()=>++n;globalThis.cancelAnimationFrame=()=>{};
globalThis.window={location:{origin:'http://localhost:3000',search:'?sound=0'},setTimeout:timeout,clearTimeout:id=>timers.delete(id),innerWidth:1280,innerHeight:720,AudioContext:class{constructor(){audio++;}},addEventListener(){},removeEventListener(){}};
globalThis.document={documentElement:{style:{}},body:{style:{}},visibilityState:'visible',addEventListener(){},removeEventListener(){}};
globalThis.Audio=class{constructor(){audio++;}play(){return Promise.resolve();}pause(){}};
const load=createUiLoader();
const {calculateEventDurationMs}=load('lib/eventPlayback.ts');
const paths={survival:'app/event-survival/live/page.tsx',race:'app/event-race/live/page.tsx',roulette:'components/event-roulette/EventRouletteOverlayClient.tsx',claw:'components/event-claw/EventClawOverlayClient.tsx',mission:'app/event-mission/live/page.tsx'};
for(const [kind,path] of Object.entries(paths)){
 for(const scenario of ['late','future','running']){
 timers.clear();requests=[];audio=0;
 const now=Date.now(),key='fixture-'+kind;
 const startMs=now+(scenario==='future'?30000:scenario==='running'?-3000:-30000);
 globalThis.fetch=async(url,init)=>{requests.push({url,init});assert(!init?.method||init.method==='GET','display must never POST');return {ok:true,status:200,json:async()=>({ok:true,active:true,server_now:now,started_at:new Date(startMs).toISOString(),title:'fixture mission',goalType:'orders',goal:1,current:1,pct:scenario==="late"?100:63,reward:1000,playback:{version:1,key,kind,seed:0,startedAtMs:startMs,durationMs:kind==="mission"?1:calculateEventDurationMs(kind,["A","B","C"],["A"],0)},event:{id:key,title:'fixture '+requests.length,status:'result',participants:[{nickname:'A'},{nickname:'B'},{nickname:'C'}],survivors:['A'],winner_nickname:'A',winner_note:'fixture gift',spin_started_at:new Date(startMs).toISOString(),result_at:new Date(startMs).toISOString(),updated_at:new Date(now+requests.length*1000).toISOString()}})};};
 let tree;const Widget=load(path).default;
 const realRandom=Math.random;
 Math.random=()=>{
   // React act uses a random internal require property. Do not force its
   // browser MessageChannel fallback (which keeps Node ports open).
   if(new Error().stack.split('\n')[2]?.includes('react.development.js'))return realRandom();
   throw new Error(kind+" actual muted renderer must be deterministic");
 };
 await act(async()=>{tree=Renderer.create(React.createElement(Widget,{initialToken:kind+'_luludongi_live'}));});
 const expected=scenario==='late'?'done':scenario==='future'?(kind==='survival'||kind==='race'?'ready':'waiting'):'running';
 const surface=tree.root.findAll(n=>n.props['data-event-phase']===expected);
 assert(surface.length,kind+' '+scenario+' must show '+expected+', never restart the timeline');
 assert(tree.root.findAll(n=>n.props['data-event-clock']==='shared').length,kind+' CSS animation clock must be shared as well');
 assert.equal(audio,0,kind+' admin sound=0 must not instantiate audio');
 if(kind==='claw'){
  const css=tree.root.findAllByType('style').map(n=>n.children.join('')).join('\n');
  assert.match(css,/\.result-name\s*\{[^}]*overflow-wrap:\s*anywhere/,'long unbroken winner name must wrap inside the result card');
 }
 assert(requests.length>0);
 const sameKey=surface[0].props['data-event-key'];
 const poll=[...timers.values()].find(t=>t.ms===2500||t.ms===250);
 assert(poll,kind+" completed polling remains active");
 await act(async()=>poll.fn());
 assert(tree.root.findAll(n=>n.props['data-event-phase']===expected&&n.props['data-event-key']===sameKey).length,kind+" metadata refresh must never restart");
 await act(async()=>tree.unmount());
 Math.random=realRandom;
 }
}
console.log('PASS five actual widgets readonly GET, sound=0 no audio, late join completed state');
