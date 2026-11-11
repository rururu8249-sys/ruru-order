import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const blank=()=>{};
const store={getItem:()=> '1',setItem:blank,removeItem:blank};
globalThis.window={location:{origin:'https://example.com'},innerHeight:844,innerWidth:390,localStorage:store,sessionStorage:store,addEventListener:blank,removeEventListener:blank,setTimeout:()=>1,clearTimeout:blank,setInterval:()=>1,clearInterval:blank};
globalThis.document={addEventListener:blank,removeEventListener:blank,hidden:false};globalThis.localStorage=store;
let verifications=0;
const game={state:null,player:null,admin:false,verified:false,winners:[],error:'',busy:false,now:0,action:async()=>{throw Error('unverified must not run an admin action');},verify:()=>verifications++,refresh:async()=>{}};
const load=createUiLoader({
 '@/components/customer/KakaoExternalOpen':{openOrderInExternalBrowser:blank},
 '@/lib/useIsDesktop':{useIsDesktop:()=>false},
 '@/lib/useLiveFeaturedProducts':{useLiveFeaturedProducts:()=>({products:[],current:null})},
 '@/lib/useReplayProductCard':{useReplayProductCard:()=>({replay:false,products:[],current:null})},
 '@/lib/useLiveGreeting':{useLiveGreeting:()=>({open:false,dismiss:blank})},
 '@/lib/useChatAutoScroll':{useChatAutoScroll:()=>({boxRef:{current:null},contentRef:{current:null},atBottom:true,followLatest:blank})},
 '@/lib/useLiveResume':{useLiveResume:()=>({onAction:blank,returnToLive:blank})},
 '@/lib/useProductIntroPlayer':{useProductIntroPlayer:()=>({})},
 '@/lib/productIntroCatalogClient':{loadProductIntroCatalog:async()=>[],invalidateProductIntroCatalog:blank},
 '@/components/rps/RpsWidget':{RpsWidget:()=>React.createElement('div',{'data-test-rps':true},'game')},
 '@/components/rps/useRpsGame':{useRpsGame:()=>game},
 './rps.css':{},
});
const View=load('components/customer/LiveWatchView.tsx').default;
const props={videoId:'abcdefghijk',title:'test',broadcastId:'A',paused:false,pausedText:'',pinned:null,items:[],cartCount:0,cartTotalText:'0',orderToasts:[],onOpenProduct:blank,onOpenCart:blank,onSwitchToShop:blank,menu:[{key:'me',label:'내정보',onClick:blank}],chat:{messages:[],notice:'',canWrite:true,canModerate:true,canGrant:true,canPin:true,pinned:null,emojis:[],onVerifyIdentity:blank,onModerate:async()=>({ok:true}),onSend:async()=>({ok:true})}};
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?.map(text).join('')??'';
let tree;await act(async()=>{tree=Renderer.create(React.createElement(View,props));});
const button=label=>tree.root.findAllByType('button').find(b=>text(b)===label);
await act(async()=>button('더보기').props.onClick());
assert.ok(button('게임 · 가위바위보'),'existing owner must see game entry before separate verification');
assert.ok(button('내정보'));
assert.ok(!button('내 채팅 본인 확인'),'remove duplicate identity item from More');
await act(async()=>button('게임 · 가위바위보').props.onClick());
assert.ok(button('카카오로 관리자 확인'));
assert.ok(!button('참가자 모집 시작'),'client owner hint must never expose admin controls');
await act(async()=>button('카카오로 관리자 확인').props.onClick());assert.equal(verifications,1);
game.admin=true;game.verified=true;
await act(async()=>tree.update(React.createElement(View,{...props})));
assert.equal(tree.root.findAllByProps({'aria-label':'가위바위보 관리자'}).length,1);
assert.ok(!button('카카오로 관리자 확인'),'successful verification opens settings in place');
await act(async()=>tree.root.findByProps({'aria-label':'관리 설정 닫기'}).props.onClick());
game.admin=false;
await act(async()=>tree.update(React.createElement(View,{...props,chat:{...props.chat,canGrant:false}})));
await act(async()=>button('더보기').props.onClick());
assert.ok(!button('게임 · 가위바위보'),'ordinary customer or chat-only moderator has no game admin entry');
await act(async()=>tree.update(React.createElement(View,{...props,paused:true,pausedText:'방송 휴식 안내'})));
assert.ok(text(tree.toJSON()).includes('방송 휴식 안내'));
game.state={id:'room',broadcastId:'A',status:'lobby'};
await act(async()=>tree.update(React.createElement(View,{...props,paused:true,pausedText:'방송 휴식 안내'})));
assert.ok(!text(tree.toJSON()).includes('방송 휴식 안내'),'central notice cannot bleed through game');
assert.equal(tree.root.findAllByProps({'aria-label':'방송 소리 켜기'}).length,0,'central sound prompt hidden behind game');
assert.equal(tree.root.findAllByProps({'aria-label':'소리 켜기'}).length,1,'top sound control remains available');
game.admin=true;game.setup={revision:2,config:{title:'가위바위보',winners:1,rewardKind:'none',points:1000,gift:'',joinSeconds:300,pickSeconds:5,auto:true}};
game.state={...game.state,status:'closed',revision:4};
await act(async()=>tree.update(React.createElement(View,props)));
assert.equal(tree.root.findAllByProps({'data-live-rps-overlay':true}).length,0,'closed game hides admin overlay despite saved setup');
await act(async()=>button('더보기').props.onClick());
game.action=async()=>true;
await act(async()=>button('게임 · 가위바위보').props.onClick());
await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
assert.equal(tree.root.findAllByProps({'data-live-rps-overlay':true}).length,1,'saving settings explicitly shows launch screen');
game.state={...game.state,status:'lobby',revision:5};
await act(async()=>tree.update(React.createElement(View,props)));
assert.equal(tree.root.findAllByProps({'data-live-rps-overlay':true}).length,1);
game.state={...game.state,status:'closed',revision:6};
await act(async()=>tree.update(React.createElement(View,props)));
assert.equal(tree.root.findAllByProps({'data-live-rps-overlay':true}).length,0,'close after launch does not resurrect setup card');
await act(async()=>tree.unmount());
console.log('PASS owner menu, gated verification, automatic admin view, ordinary/mod hidden, duplicate identity removed');
