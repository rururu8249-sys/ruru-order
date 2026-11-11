import assert from 'node:assert/strict';
import React from 'react';import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let clock=100000,timerId=0;const timers=new Map(),listeners=new Map(),audios=[];
const original={now:Date.now,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
Date.now=()=>clock;globalThis.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:clock+delay});return id;};globalThis.clearTimeout=id=>timers.delete(id);
globalThis.document={hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
globalThis.localStorage={getItem:()=>null,setItem(){}};
globalThis.Audio=class{constructor(src){this.src=src;this.duration=1.45;this.currentTime=0;this.muted=false;this.calls=[];this.listeners=new Map();audios.push(this);}addEventListener(n,f){this.listeners.set(n,f);}removeEventListener(n){this.listeners.delete(n);}play(){this.calls.push({at:clock,seek:this.currentTime,muted:this.muted});return Promise.resolve();}pause(){}load(){}};
const {useRpsAudio}=createUiLoader({})('components/rps/useRpsAudio.ts');let audio,tree;
function Probe({state,publicOnly=false}){audio=useRpsAudio(state,publicOnly,clock);return null;}
const state=(status,round,remaining)=>({id:'room',status,round,deadline:new Date(clock+remaining).toISOString(),winners:[],serverTime:new Date(clock).toISOString()});
const render=async(s,publicOnly=false)=>act(async()=>{const el=React.createElement(Probe,{state:s,publicOnly});if(tree)tree.update(el);else tree=Renderer.create(el);});
const advance=async ms=>{const end=clock+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;clock=next[1].at;timers.delete(next[0]);await act(async()=>next[1].fn());}clock=end;};
const starts=()=>audios[0].calls.filter(c=>!c.muted);
try{
 await render(state('lobby',0,300000));await act(async()=>listeners.get('pointerdown')());
 for(const seconds of [10,100]){
  const round=seconds,start=clock;await render(state('choosing',round,seconds*1000));
  assert.equal(starts().filter(c=>c.at>=start).length,0,'no voice at start of selection');
  await advance(seconds*1000-1451);assert.equal(starts().filter(c=>c.at>=start).length,0);
  await advance(1);assert.equal(starts().at(-1).at,start+seconds*1000-1450);
  assert.equal(starts().at(-1).seek,0);await advance(1450);await render(state('reveal',round,0));
 }
 let before=starts().length;await render(state('choosing',101,10000));await act(async()=>audio.toggle());await advance(10000);assert.equal(starts().length,before,'sound off cancels pending playback');
 await act(async()=>audio.toggle());await render(state('choosing',102,10000));await render(state('closed',102,0));await advance(10000);assert.equal(starts().length,before,'close cancels pending playback');
 await render(state('choosing',103,700));assert.equal(starts().length,before+1);assert.ok(Math.abs(starts().at(-1).seek-.75)<.001,'late arrival joins the end of the voice instead of starting late');
 before=starts().length;await render(state('choosing',104,-100));await advance(2000);assert.equal(starts().length,before,'expired rounds never replay');
 await render(state('choosing',105,10000),true);await advance(10000);assert.equal(starts().length,before,'YouTube widget remains silent');
 await render(state('choosing',106,10000));await render(state('paused',106,10000));await advance(10000);assert.equal(starts().length,before,'pause cancels timer');
 await render(state('choosing',107,10000));document.hidden=true;await act(async()=>listeners.get('visibilitychange')());await advance(10000);assert.equal(starts().length,before,'background tab stays silent');document.hidden=false;await act(async()=>listeners.get('visibilitychange')());
 audios[0].duration=2;await act(async()=>audios[0].listeners.get('loadedmetadata')());const adjustedStart=clock;await render(state('choosing',108,10000));await advance(8000);assert.equal(starts().at(-1).at,adjustedStart+8000,'uses loaded audio duration');
 await render({...state('finished',108,0),winners:[{id:'winner'}]});assert.equal(audios[1].calls.filter(c=>!c.muted).length,1,'fanfare once on winner reveal');
 await render({...state('finished',108,0),winners:[{id:'winner'}]});assert.equal(audios[1].calls.filter(c=>!c.muted).length,1);
 console.log('PASS deadline alignment for 10s/100s, cancel on mute/close, late join seek, expiry, silent broadcast widget');
}finally{await act(async()=>tree?.unmount());Date.now=original.now;globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;}
