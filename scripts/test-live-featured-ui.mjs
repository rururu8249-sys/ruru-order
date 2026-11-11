import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const store = {getItem:()=> '1', setItem(){}, removeItem(){}};
globalThis.window = {location:{origin:'https://example.com'},innerHeight:800,innerWidth:390, localStorage:store, sessionStorage:store, addEventListener(){},removeEventListener(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};
globalThis.document = {addEventListener(){},removeEventListener(){},hidden:false};
globalThis.localStorage = store;
const blank = ()=>{};
let desktop = false;
const products = [{id:'10',detailName:'LOE-111 블랙',name:'LOE-111 블랙',imageUrl:'https://example.com/one.jpg',priceText:'190,000원',soldOut:false,pinned:false},{id:'20',name:'가방',imageUrl:'',priceText:'20,000원',soldOut:false,pinned:false}];
let current = products[0];
let featured = products;
let replay={replay:false,products:[],current:null};
const load = createUiLoader({
 '@/components/customer/KakaoExternalOpen':{openOrderInExternalBrowser:blank},
 '@/lib/useIsDesktop':{useIsDesktop:()=>desktop},
 '@/lib/useLiveFeaturedProducts':{useLiveFeaturedProducts:()=>({products:featured,current})},
 '@/lib/useReplayProductCard':{useReplayProductCard:()=>replay},
 '@/lib/useChatAutoScroll':{useChatAutoScroll:()=>({boxRef:{current:null},contentRef:{current:null},atBottom:true,followLatest:blank})},
 '@/lib/useLiveResume':{useLiveResume:()=>({onAction:blank,returnToLive:blank})},
 '@/lib/useProductIntroPlayer':{useProductIntroPlayer:()=>({})},
 '@/lib/productIntroCatalogClient':{loadProductIntroCatalog:async()=>[],invalidateProductIntroCatalog:blank},
});
const View = load('components/customer/LiveWatchView.tsx').default;
const calls=[];
const props={videoId:'abcdefghijk',title:'시험 방송',broadcastId:'one',paused:false,pausedText:'',pinned:null,items:[{id:'10',name:'로에베',brand:true,count:152,priceText:'최저가',imageUrl:'',soldOut:false,pinned:false,details:[]},products[1]],cartCount:0,cartTotalText:'0원',orderToasts:[],onOpenProduct:(...x)=>calls.push(x),onOpenCart:blank,onSwitchToShop:blank};
let tree;
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?.map(text).join('')??'';
const button=label=>tree.root.findAllByType('button').find(n=>text(n)===label);
const click=async n=>act(async()=>n.props.onClick());
await act(async()=>{tree=Renderer.create(React.createElement(View,props));});
assert.equal(tree.root.findAllByProps({'data-featured-product-card':true}).length,1);
assert.equal(tree.root.findByProps({'data-featured-product-card':true}).findAllByType('button').length,1,'no extra browse row consumes chat height');
await click(tree.root.findByProps({'aria-label':'LOE-111 블랙 상품 선택'}));
assert.equal(calls.length,0,'multiple featured products open the explicit filtered panel');
assert.equal(tree.root.findAllByProps({role:'dialog'})[0].props['aria-label'],'지금 소개하는 상품');
assert.ok(text(tree.toJSON()).includes('전체 153개 중 소개 중인 상품이에요.'));
assert.ok(text(tree.toJSON()).includes('LOE-111 블랙'));
await act(async()=>tree.root.findByProps({'aria-label':'방송 상품 찾기'}).props.onChange({target:{value:'없는 상품'}}));
await click(button('전체 상품 153개 보기 →'));
assert.equal(tree.root.findByProps({'aria-label':'방송 상품 찾기'}).props.value,'');
assert.ok(text(tree.toJSON()).includes('로에베'));
await click(tree.root.findByProps({'aria-label':'닫기'}));
await click(tree.root.findByProps({'aria-label':'LOE-111 블랙 상품 선택'}));
await click(tree.root.findByProps({'aria-label':'닫기'}));
await click(tree.root.findByProps({'aria-label':'방송 상품 목록 보기 (153개)'}));
assert.equal(tree.root.findAllByProps({role:'dialog'})[0].props['aria-label'],'방송 상품','bottom catalog must never retain featured filter');
await click(tree.root.findByProps({'aria-label':'닫기'}));
current=products[1];desktop=true;
await act(async()=>tree.update(React.createElement(View,props)));
assert.equal(tree.root.findAllByProps({'data-featured-product-card':true}).length,1,'desktop must not duplicate the card over the video');
await click(tree.root.findByProps({'aria-label':'가방 상품 선택'}));
const rows=tree.root.findAllByProps({role:'dialog'})[0];
await click(rows.findAllByType('button').find(n=>n.props['aria-label']?.includes('가방 상품 선택')));assert.deepEqual(calls.pop(),['20',undefined]);
featured=[products[0]];current=products[0];
await act(async()=>tree.update(React.createElement(View,props)));
await click(tree.root.findByProps({'aria-label':'LOE-111 블랙 상품 선택'}));
assert.deepEqual(calls.pop(),['10','LOE-111 블랙'],'one featured product opens its exact detail directly');
assert.equal(tree.root.findAllByProps({role:'dialog'}).length,0);
replay={replay:true,products,current:products[0]};
await act(async()=>tree.update(React.createElement(View,props)));
assert.ok(text(tree.toJSON()).includes('지금 보는 상품'));
await click(tree.root.findByProps({'aria-label':'LOE-111 블랙 상품 선택'}));
replay={replay:true,products:[products[1]],current:products[1]};
await act(async()=>tree.update(React.createElement(View,props)));
const replayPanel=tree.root.findAllByProps({role:'dialog'})[0];
assert.ok(text(replayPanel).includes('LOE-111 블랙'),'open panel must retain the group being selected as playback advances');
await click(replayPanel.findAllByType('button').find(n=>n.props['aria-label']?.includes('LOE-111 블랙 상품 선택')));
assert.deepEqual(calls.pop(),['10','LOE-111 블랙']);
replay={replay:true,products:[],current:null};
await act(async()=>tree.update(React.createElement(View,props)));
assert.equal(tree.root.findAllByProps({'data-featured-product-card':true}).length,0,'recording without a matching intro must not fall back to live rotation');
await act(async()=>tree.unmount());
console.log('PASS actual LiveWatchView: exact option identity, featured list, total count, full-list reset and one desktop card');
