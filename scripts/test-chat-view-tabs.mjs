import assert from 'node:assert/strict';import React from 'react';import Renderer,{act} from 'react-test-renderer';import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},listeners=new Map();let onChat,historyResolve,followed=0;let ytFetches=0;
globalThis.window={location:{hostname:'localhost',reload:noop},localStorage:{getItem:key=>key==='ruru_chat_view_show'?'{"yt":false,"site":true}':null,setItem:noop},matchMedia:()=>({matches:false,addEventListener:noop,removeEventListener:noop}),setTimeout,clearTimeout,setInterval:()=>1,clearInterval:noop};
globalThis.document={visibilityState:'visible',fullscreenEnabled:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{if(String(url).includes('/api/chat-view/youtube'))ytFetches++;if(String(url).includes('/api/live-chat?'))return new Promise(resolve=>{historyResolve=rows=>resolve({json:async()=>({ok:true,messages:rows})});});return{json:async()=>({ok:true,items:[],viewers:25,site:4})};};
const load=createUiLoader({
 '@/lib/supabase':{supabase:{from:()=>({select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:[{id:'A',title:'방송',youtube_live_url:'https://www.youtube.com/watch?v=abcdefghijk'}]})})}},
 '@/lib/liveEvents':{subscribeLiveEvents:(_,{onChat:fn})=>{onChat=fn;return noop;}},
 '@/lib/useLiveChatPrivate':{useLiveChatPrivate:(_a,_b,list)=>({displayMessages:list,onPublicMessage:noop,canReviewDeleted:false,verify:noop})},
 '@/lib/useChatAutoScroll':{useChatAutoScroll:()=>({boxRef:{current:null},contentRef:{current:null},atBottom:true,followLatest:()=>followed++})},
 './chat-view.css':{},
});
const View=load('app/chat-view/ChatViewClient.tsx').default;let tree;
const row=(id,body='새로운 글 '+id)=>({id,broadcast_id:'A',nickname:'가상 손님',body,created_at:new Date().toISOString()});
const tab=key=>tree.root.findByProps({id:'chat-tab-'+key});
const notices=()=>tree.root.findAllByProps({className:'ruru-chat-notice'});
try{
 await act(async()=>{tree=Renderer.create(React.createElement(View));});
 assert.equal(tab('yt').props['aria-selected'],true,'always opens YouTube despite old show settings');
 const iframe=tree.root.findByType('iframe');
 await act(async()=>onChat(row(3)));assert.equal(notices().length,1);
 await act(async()=>historyResolve([row(1,'과거 글'),row(2,'과거 글')]));
 assert.equal(tree.root.findAllByProps({'data-chat-id':3}).length,1,'snapshot cannot overwrite newer realtime');
 assert.equal(notices()[0].props['aria-label'],'사이트 새 글 1개 확인');
 await act(async()=>{onChat(row(4));onChat(row(5));onChat(row(5));});
 assert.equal(notices()[0].props['aria-label'],'사이트 새 글 3개 확인');assert.equal(tree.root.findAllByProps({className:'ruru-chat-notice-row'}).length,2);
 await act(async()=>tab('site').props.onClick());assert.equal(notices().length,0);assert.equal(tree.root.findByProps({id:'chat-panel-site'}).props.hidden,false);assert.equal(tree.root.findByType('iframe'),iframe,'iframe remains mounted across tabs');
 await act(async()=>onChat(row(6)));await act(async()=>tab('yt').props.onClick());assert.equal(notices().length,0,'messages seen in site tab are read');
 await act(async()=>onChat(row(7)));await act(async()=>notices()[0].props.onClick());assert.equal(tab('site').props['aria-selected'],true,'notice opens site');assert.equal(notices().length,0);
 await act(async()=>tab('yt').props.onClick());await act(async()=>{onChat(row(8));onChat({...row(8),hidden:true});});assert.equal(notices().length,0,'deleted message is removed from notice');
 await act(async()=>{onChat({...row(9,'장바구니 담음'),badge:'bot',bot_ref:'c:1'});onChat({...row(10,'결제 완료! 감사합니다'),badge:'bot',bot_ref:'paid:1'});onChat({...row(11,'주문 감사합니다!'),badge:'bot',bot_ref:'o:1'});});
 assert.equal(notices()[0].props['aria-label'],'사이트 새 글 1개 확인');
 await act(async()=>tab('site').props.onClick());assert.equal(tree.root.findAllByProps({'data-chat-id':9}).length,0);assert.equal(tree.root.findAllByProps({'data-chat-id':10}).length,0);assert.equal(tree.root.findAllByProps({'data-chat-id':11}).length,1);
 await act(async()=>tree.update(React.createElement(View)));
 assert.equal(tree.root.findAllByProps({'data-source':'youtube'}).length,0,'no YouTube notice (2026-11-13 removed)');
 assert.equal(tab('yt').findAllByProps({className:'ruru-chat-unread-badge'}).length,0,'no YouTube unread badge');
 assert.equal(ytFetches,0,'never calls YouTube API route');
 assert.ok(followed>=3,'opening site follows latest messages');
 console.log('PASS default YouTube, two previews/count, initial-fetch race, tabs/read, notice click, deletion, persistent iframe, no YouTube API polling');
}finally{await act(async()=>tree?.unmount());globalThis.fetch=originalFetch;}
