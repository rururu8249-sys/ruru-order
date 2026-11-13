import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const store={getItem:()=> '1',setItem(){},removeItem(){}};
globalThis.window={location:{origin:'https://example.com'},innerHeight:844,innerWidth:390,localStorage:store,sessionStorage:store,addEventListener(){},removeEventListener(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};
globalThis.document={addEventListener(){},removeEventListener(){},hidden:false};globalThis.localStorage=store;
let desktop=true,greet=true,fail=false;
const blank=()=>{};
const load=createUiLoader({
 '@/components/customer/KakaoExternalOpen':{openOrderInExternalBrowser:blank},
 '@/lib/useIsDesktop':{useIsDesktop:()=>desktop},
 '@/lib/useLiveFeaturedProducts':{useLiveFeaturedProducts:()=>({products:[],current:null})},
 '@/lib/useReplayProductCard':{useReplayProductCard:()=>({replay:false,products:[],current:null})},
 '@/lib/useLiveGreeting':{useLiveGreeting:()=>({open:greet,dismiss:()=>{greet=false;}})},
 '@/lib/useChatAutoScroll':{useChatAutoScroll:()=>({boxRef:{current:null},contentRef:{current:null},atBottom:true,followLatest:blank})},
 '@/lib/useLiveResume':{useLiveResume:()=>({onAction:blank,returnToLive:blank})},
 '@/lib/useProductIntroPlayer':{useProductIntroPlayer:()=>({})},
 '@/lib/productIntroCatalogClient':{loadProductIntroCatalog:async()=>[],invalidateProductIntroCatalog:blank},
});
const View=load('components/customer/LiveWatchView.tsx').default;
const {emojiTriggerLength}=load('lib/chatEmojiComposer.ts');
const emoji={id:'laugh1',name:'웃음',url:'/laugh.png',on:true,keywords:['ㅋㅋ']};
// [2026-11-13] 추천 이모티콘 = 낱말 끝의 부르는 말만 그림으로(«ㅋㅋㅋ» → «ㅋ» + 그림)
assert.equal(emojiTriggerLength('ㅋㅋ',emoji),2);
assert.equal(emojiTriggerLength('ㅋㅋㅋ',emoji),2,'extra ㅋ stays as text');
assert.equal(emojiTriggerLength('정말 ㅋㅋㅋㅋ',emoji),2);
assert.equal(emojiTriggerLength('웃음',emoji),2,'name works too');
assert.equal(emojiTriggerLength('하하',emoji),0,'not a suffix → keep text, add image after');
assert.equal(emojiTriggerLength('ㅋㅋ ',emoji),0,'after a space nothing is removed');
assert.equal(emojiTriggerLength('',emoji),0);
const msg=id=>({id,nickname:'손님',body:`글${id}`,createdAt:'2026-11-11',badge:null,avatar:'',broadcastId:'A'});
const sent=[];
const props={videoId:'abcdefghijk',title:'시험',broadcastId:'A',paused:false,pausedText:'',pinned:null,items:[],cartCount:0,cartTotalText:'0',orderToasts:[],onOpenProduct:blank,onOpenCart:blank,onSwitchToShop:blank,chat:{messages:[msg(1)],notice:'',canWrite:true,canModerate:false,canGrant:false,canPin:false,pinned:null,canEmoji:true,emojis:[emoji],onVerifyIdentity:blank,onModerate:async()=>({ok:true}),onSend:async body=>{sent.push(body);return {ok:!fail};}}};
let tree;await act(async()=>{tree=Renderer.create(React.createElement(View,props));});
const input=()=>tree.root.findByProps({'aria-label':'채팅 메시지'});
const change=async text=>act(async()=>{input().props.onFocus();input().props.onChange({target:{value:text,selectionStart:text.length,selectionEnd:text.length}});});
const click=async label=>act(async()=>tree.root.findByProps({'aria-label':label}).props.onClick());
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?.map(text).join('')??'';
assert.ok(!text(tree.toJSON()).includes('내 글 삭제 · 카카오 본인 확인'));
const log=tree.root.findByProps({role:'log'});assert.equal(log.findAllByProps({'data-live-greeting':true}).length,1,'greeting belongs inside scrollable chat');
await act(async()=>tree.update(React.createElement(View,{...props,chat:{...props.chat,messages:[msg(1),msg(2)]}})));
assert.ok(text(log).indexOf('인사하기')<text(log).indexOf('글2'),'new chat appears after greeting, not above a pinned banner');
await act(async()=>tree.update(React.createElement(View,{...props,chat:{...props.chat,messages:[msg(2)]}})));
assert.equal(tree.root.findAllByProps({'data-live-greeting':true}).length,0,'trimmed history cannot reinsert old greeting at bottom');
await act(async()=>tree.unmount());
console.log('PASS greeting ordering + emoji trigger length (composer is checked in the browser test)');
