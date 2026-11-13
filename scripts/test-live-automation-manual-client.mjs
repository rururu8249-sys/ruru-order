import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const events=new EventTarget();globalThis.window=events;
const doc=new EventTarget();doc.hidden=false;globalThis.document=doc;
globalThis.location={origin:'https://shop.test'};
let state,root,actor={id:'actor-a',nickname:'Chosen',activity:{present:true,cart:false,orders:0},inUse:false,mine:false,expiresAt:null};
let available=true,requests=[],callback,failSend=true,requestIds=[];
globalThis.fetch=async(url,opts={})=>{
 requests.push({url,opts});const body=opts.body?JSON.parse(opts.body):null;
 if(!body)return new Response(JSON.stringify({ok:available,actors:[actor]}),{status:available?200:403});
 if(body.action==='select') {actor={...actor,inUse:true,mine:true,expiresAt:new Date(Date.now()+90000).toISOString()};return new Response(JSON.stringify({ok:true,lease:{token:'lease-a',actor_id:actor.id,expires_at:actor.expiresAt}}));}
 if(body.action==='release'){actor={...actor,inUse:false,mine:false};return new Response(JSON.stringify({ok:true}));}
 return new Response(JSON.stringify({ok:true,lease:{token:'lease-a',actor_id:actor.id,expires_at:new Date(Date.now()+90000).toISOString()}}));
};
const channel={on(_a,_b,fn){callback=fn;return channel},subscribe(){return channel}};
const load=createUiLoader({'@/lib/supabase':{supabase:{channel:()=>channel,removeChannel:async()=>{}}},'@/lib/useLiveChatPrivate':{chatIdentityHeaders:()=>({})}});
let useManual;try{useManual=load('lib/useManualAutomationChat.ts').useManualAutomationChat}catch{}
assert.ok(useManual,'manual client must synchronize ownership and preserve retry identity');
function Harness(){state=useManual('broadcast-a',true);return null}
await act(async()=>{root=Renderer.create(React.createElement(Harness));await new Promise(r=>setTimeout(r,0));});
assert.equal(state.available,true);
const realNow=Date.now;Date.now=()=>realNow()+7000;
const selectBefore=requests.filter(r=>r.opts.body&&JSON.parse(r.opts.body).action==='select').length;
await act(async()=>{await Promise.all([state.choose(actor.id),state.choose(actor.id)])});
assert.equal(requests.filter(r=>r.opts.body&&JSON.parse(r.opts.body).action==='select').length-selectBefore,1,'double tap while checking freshness only acquires once');
Date.now=realNow;
await act(async()=>{await state.choose(actor.id)});
assert.equal(state.selected.nickname,'Chosen');
await act(async()=>{const event=new Event('storage');Object.defineProperty(event,'key',{value:'unrelated-cart'});events.dispatchEvent(event)});
assert.equal(state.selected?.nickname,'Chosen','unrelated storage changes must not clear the selected nickname');
const sender=async(_body,selection)=>{requestIds.push(selection.requestId);return {ok:!failSend,message:failSend?'network':''}};
await act(async()=>{await state.send('hello',sender)});
failSend=false;await act(async()=>{await state.send('hello',sender)});
assert.equal(requestIds[0],requestIds[1],'lost response retries keep the same message identity');
await act(async()=>{await state.send('hello',sender)});
assert.notEqual(requestIds[1],requestIds[2],'confirmed next message receives a new ID');
actor={...actor,mine:false,inUse:true};
await act(async()=>{callback();await new Promise(r=>setTimeout(r,0));});
assert.equal(state.ready,false,'remote takeover disables sending without page reload');
const before=requestIds.length;
await act(async()=>{const r=await state.send('blocked',sender);assert.equal(r.ok,false)});
assert.equal(requestIds.length,before);
await act(async()=>{await state.reset()});assert.equal(state.selected,null);
await act(async()=>root.unmount());
console.log('PASS live ownership invalidation, no stale-identity sending, stable retries, own-identity reset and cleanup');
