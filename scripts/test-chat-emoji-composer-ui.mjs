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
const {removeEmojiTrigger,composeEmojiMessage}=load('lib/chatEmojiComposer.ts');
const emoji={id:'laugh1',name:'웃음',url:'/laugh.png',on:true,keywords:['ㅋㅋㅋ']};
assert.equal(removeEmojiTrigger('ㅋㅋㅋ',3,emoji).text,'');
assert.equal(removeEmojiTrigger('ㅋㅋㅋㅋ',4,emoji).text,'ㅋㅋㅋㅋ','similar recommendation must not delete extra typed characters');
assert.equal(removeEmojiTrigger('정말 ㅋㅋㅋ 다음',6,emoji).text,'정말  다음','only exact trigger before caret is replaced');
assert.equal(removeEmojiTrigger('ㅋㅋㅋ',1,emoji).text,'ㅋㅋㅋ');
assert.equal(removeEmojiTrigger('ㅋㅋㅋㅋ',3,emoji).text,'ㅋㅋㅋㅋ','caret inside a longer word cannot consume its prefix');
assert.equal(composeEmojiMessage('',emoji.name),':웃음:');
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
await change('ㅋㅋㅋ');let suggestion=tree.root.findByProps({'aria-label':'이모티콘 웃음 넣기'});assert.equal(suggestion.props.title,undefined,'no intrusive keyboard tooltip');
await act(async()=>suggestion.props.onKeyDown({key:'Enter',preventDefault(){},repeat:false,nativeEvent:{isComposing:false}}));
assert.equal(input().props.value,'','exact keyword replaced with image, no colon token shown');
assert.equal(sent.length,0,'selection previews; only explicit Send submits');
assert.equal(tree.root.findAllByProps({'data-emoji-drawer':true}).length,1);
assert.equal(tree.root.findAllByProps({alt:'웃음 이모티콘 미리보기'}).length,1);
await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(sent.pop(),':웃음:');
await change('ㅋㅋㅋㅋ');await click('이모티콘 웃음 넣기');assert.equal(input().props.value,'ㅋㅋㅋㅋ');
await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(sent.pop(),'ㅋㅋㅋㅋ :웃음:');
await change('ㅋㅋㅋ');await click('이모티콘 웃음 넣기');await click('선택한 이모티콘 취소');assert.equal(tree.root.findAllByProps({alt:'웃음 이모티콘 미리보기'}).length,0);
await change('ㅋㅋㅋ');await click('이모티콘 웃음 넣기');fail=true;
await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(input().props.value,'');assert.equal(tree.root.findAllByProps({alt:'웃음 이모티콘 미리보기'}).length,1,'failed send preserves one selected image without duplicated token');
await act(async()=>tree.unmount());
desktop=false;greet=true;await act(async()=>{tree=Renderer.create(React.createElement(View,{...props,chat:{...props.chat,messages:[]}}));});
assert.equal(tree.root.findAllByProps({'data-live-greeting':true}).length,1,'empty mobile chat still shows the entry greeting');
await act(async()=>tree.root.findAllByType('button').find(b=>text(b)==='채팅 입력').props.onClick());await change('ㅋㅋㅋ');await click('이모티콘 웃음 넣기');
assert.equal(tree.root.findAllByProps({'aria-label':'키보드'}).length,1,'emoji drawer switches back via explicit keyboard control');
assert.equal(tree.root.findAllByProps({'aria-label':'채팅 쓰기'}).length,1);
await act(async()=>tree.unmount());
console.log('PASS actual composer: exact/extended keyword, caret, image preview, explicit send, failure retention, drawer/keyboard, no auth clutter, greeting scroll ordering and empty mobile chat');
