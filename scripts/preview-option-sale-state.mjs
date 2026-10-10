// Synthetic, read-only visual fixture. No database writes or credentials.
import fs from 'node:fs';
import http from 'node:http';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Renderer,{act} from 'react-test-renderer';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={innerWidth:1200,addEventListener(){},removeEventListener(){}};
globalThis.document={addEventListener(){},removeEventListener(){}};
const load=createUiLoader({'@/lib/supabase':{supabase:{}},'@/lib/adminToast':{showAdminToast(){}}});
const Form=load('components/admin-live/quick-product/QuickProductFastForm.tsx').default;
const text=node=>node.children.map(c=>typeof c==='string'?c:typeof c==='object'?text(c):'').join('');
const product={id:9001,product_name:'검증용 셔츠 · 가상 데이터',price:10000,stock:0,color_options:['베이지'],size_options:['M','L'],product_note:JSON.stringify({stock_management_enabled:false,stock_variants:[{color:'베이지',size:'M',stock:0,manual_soldout:true},{color:'베이지',size:'L',stock:0}]})};
let tree;
await act(async()=>{tree=Renderer.create(React.createElement(Form,{initialProduct:product,activeBroadcastId:null}));});
const more=tree.root.findAllByType('button').find(b=>text(b).includes('자세히 열기'));
if(more)await act(async()=>more.props.onClick());
function element(node){if(node==null||typeof node==='string')return node;if(Array.isArray(node))return node.map(element);const props={...node.props};for(const key of Object.keys(props))if(key.startsWith('on')||key==='ref')delete props[key];return React.createElement(node.type,props,...(node.children||[]).map(element));}
const markup=renderToStaticMarkup(element(tree.toJSON()));
const css=await postcss([tailwind()]).process(fs.readFileSync('app/globals.css','utf8'),{from:'app/globals.css'});
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>옵션 품절 시각 검증 · 가상 데이터</title><style>'+css.css+'</style><body><main style="max-width:760px;margin:auto;padding:16px">'+markup+'</main></body></html>');}).listen(4321,'127.0.0.1',()=>console.log('Read-only fixture http://127.0.0.1:4321'));
