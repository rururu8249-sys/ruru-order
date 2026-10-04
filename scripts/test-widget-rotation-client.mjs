import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {writeFileSync} from 'node:fs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const intervals = new Map();
globalThis.window = {innerWidth:280,innerHeight:542,location:{search:''},addEventListener(){},removeEventListener(){},setInterval(fn,ms){intervals.set(ms,fn);return ms;},clearInterval(ms){intervals.delete(ms);},setTimeout,clearTimeout};
globalThis.document = {body:{style:{}},documentElement:{style:{}}};
let mode = 'all';
let pin = false;
const catalog = Array.from({length:1001}, (_,i)=>({id:i+1,product_name:`상품-${i+1}`,price:1000,image_url:`https://example.com/${i+1}.png`,status:i===1?'숨김':'active',is_soldout:i===2}));
const ranges = [];
const supabase = {
  from(table){
    let key = '';
    const q = {
      select(){return q;},eq(col,value){if(col==='key')key=value;return q;},order(){return q;},
      range(a,b){ranges.push([a,b]);return Promise.resolve({data:catalog.slice(a,b+1),error:null});},
      maybeSingle(){return Promise.resolve({data:{value:JSON.stringify(key==='widget_product_history_v2'?[{productId:'4',detailName:'',label:'방송 상품',count:1,lastAt:1},{productId:'1001',detailName:'',label:'미진열 상품',count:1,lastAt:1}]:{mode,paused:false,targets:[{productId:'4',detailName:''},{productId:'1001',detailName:''}]})},error:null});},
      then(resolve,reject){return Promise.resolve({data:[{product_id:1},{product_id:2},{product_id:3},{product_id:4}],error:null}).then(resolve,reject);},
    };return q;
  },
  channel(){const ch={on(){return ch;},subscribe(){return ch;}};return ch;},removeChannel(){},
};
const load = createUiLoader({
  '@/lib/supabase':{supabase},
  '@/components/admin-live/liveBroadcastController':{loadAdminLiveBroadcasts:async()=>[],getActiveBroadcast:()=>({id:'broadcast',widget_pin_mode:pin?'pin':'auto',widget_pin_product_id:1})},
  '@/components/admin-live/quick-product/productImageUrl':{resolveProductImageUrl:x=>x},
});
const Client = load('components/product-widget/ProductWidgetClient.tsx').default;
let tree;
for (mode of ['all','history','selected']) {
  ranges.length=0;
  await act(async()=>{tree=Renderer.create(React.createElement(Client));});
  const rendered=()=>JSON.stringify(tree.toJSON());
  assert.deepEqual(ranges,[[0,999],[1000,1999]],'all registered products must paginate past 1000');
  if(mode==='all'){
    assert(rendered().includes('상품-1'));
    await act(async()=>intervals.get(5000)());
    assert(rendered().includes('상품-4'),'must skip hidden and sold-out within broadcast');
    await act(async()=>intervals.get(5000)());
    assert(rendered().includes('상품-1'),'must wrap inside broadcast; never expose an unlisted catalog product');
  }else {
    assert(rendered().includes('상품-4'),'history and selected retain an eligible broadcast product');
    assert.equal(rendered().includes('상품-1001'),false,'history and selected must reject a non-broadcast target');
    assert.equal(intervals.has(5000),false,'excluded targets must not contribute to rotation or cycle into view');
  }
  await act(async()=>tree.unmount());
}
mode='history';pin=true;
await act(async()=>{tree=Renderer.create(React.createElement(Client));});
assert(JSON.stringify(tree.toJSON()).includes('상품-1'),'manual pin must override history rotation until explicitly released');
const card = tree.root.findByProps({'data-ruru-widget-card':true});
const photo = card.findAll(n=>n.type==='div' && n.props.style?.overflow==='hidden' && n.props.style?.width==='100%').find(n=>n!==card);
assert.equal(photo.props.style.flex,'1 1 200px','photo must yield space to wrapped options so price remains inside the fixed card');
for (const node of card.findAll(n=>Boolean(n.props.style?.WebkitLineClamp))) {
  assert.fail('product name/options must not silently discard lines');
}
await act(async()=>tree.unmount());
if (process.env.WIDGET_LAYOUT_OUTPUT) {
  const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const html = node => {
    if (node == null) return '';
    if (typeof node !== 'object') return escape(node);
    if (Array.isArray(node)) return node.map(html).join('');
    const attrs = Object.entries(node.props || {}).filter(([key])=>!key.startsWith('on') && key!=='children').map(([key,value])=> {
      if(key==='style') value=Object.entries(value).map(([k,v])=>`${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${typeof v==='number' && v!==0 && !['opacity','zIndex','fontWeight','flexShrink','lineHeight'].includes(k)?v+'px':v}`).join(';');
      return `${key}="${escape(value)}"`;
    }).join(' ');
    return `<${node.type} ${attrs}>${html(node.children)}</${node.type}>`;
  };
  let cases='';
  for (const product of [
    {product_name:'DR-403(베이지)·DR-404(블랙)',colors:['DR-403(베이지)','DR-404(블랙)'],sizes:['S/36','M/38','L/40']},
    {product_name:'옵션이 많은 상품',colors:['블랙','화이트','베이지','네이비','그레이','핑크','레드','그린'],sizes:['XS','S','M','L','XL','XXL','3XL']},
  ]) {
    Object.assign(catalog[0],product,{price:259000});
    await act(async()=>{tree=Renderer.create(React.createElement(Client));});
    cases+=`<section style="position:relative;width:280px;height:448px;background:#eee">${html(tree.toJSON())}</section>`;
    await act(async()=>tree.unmount());
  }
  writeFileSync(process.env.WIDGET_LAYOUT_OUTPUT,`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{display:flex;gap:20px;font-family:Arial,sans-serif}section>div{position:absolute!important}[data-ruru-widget-card]{animation:none!important}</style>${cases}`);
}
console.log('PASS real widget component: all/history/selected confined to broadcast; unlisted targets excluded, pagination, hidden/sold-out, manual pin');
