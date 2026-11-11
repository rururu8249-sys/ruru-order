import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const listeners=new Map();
globalThis.window={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
globalThis.location={origin:'https://shop.test'};
let account='old',isAdmin=false,reads=0,hold=false,resolvePending;
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 if(String(url).includes('/me')){reads++;if(hold)return new Promise(resolve=>{resolvePending=resolve;});return new Response(JSON.stringify({ok:true,admin:isAdmin,verified:!!account,player:null,winners:[]}));}
 return new Response(JSON.stringify({ok:true,state:{status:'closed',revision:0},serverTime:new Date().toISOString()}));
};
const load=createUiLoader({
 '@/lib/supabase':{supabase:{channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){}}},
 '@/lib/useLiveChatPrivate':{chatIdentityHeaders:()=>account?{'x-chat-account':account}: {},verifyChatAccount(){}},
});
const {useRpsGame}=load('components/rps/useRpsGame.ts');
let game,tree;function Probe(){game=useRpsGame();return null;}
try{
 await act(async()=>{tree=Renderer.create(React.createElement(Probe));});
 assert.equal(game.admin,false);
 assert.ok(listeners.has('message'),'popup completion must refresh identity immediately');
 let before=reads;
 await act(async()=>listeners.get('message')({origin:'https://evil.test',data:{type:'ruru-chat-verified'}}));
 assert.equal(reads,before,'cross-origin message ignored');
 isAdmin=true;account='verified';
 await act(async()=>listeners.get('message')({origin:location.origin,data:{type:'ruru-chat-verified'}}));
 assert.ok(reads>before);assert.equal(game.admin,true);
 hold=true;
 await act(async()=>{void game.refresh();});
 const stale=resolvePending;
 account='';isAdmin=false;hold=false;
 await act(async()=>listeners.get('ruru-chat-logout')());
 assert.equal(game.admin,false);assert.equal(game.verified,false);
 await act(async()=>stale(new Response(JSON.stringify({ok:true,admin:true,verified:true,player:null,winners:[]}))));
 assert.equal(game.admin,false,'late old-account response cannot restore admin');
 console.log('PASS popup completion refresh, foreign message ignored, logout and stale private response fenced');
}finally{await act(async()=>tree?.unmount());globalThis.fetch=originalFetch;}
