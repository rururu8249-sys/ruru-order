// Local-only visual fixture. Actual component, synthetic products, no API or orders.
import fs from 'node:fs';
import http from 'node:http';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Renderer, {act} from 'react-test-renderer';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = new EventTarget();
const Button = createUiLoader()('components/customer/CustomerPressButton.tsx').default;
function element(node) {
  if (node == null || typeof node === 'string') return node;
  const props = {...node.props};
  for (const key of Object.keys(props)) if (key.startsWith('on') || key === 'ref') delete props[key];
  return React.createElement(node.type, props, ...(node.children || []).map(element));
}
let cards = '';
for (const state of ['기본', '누르는 동안', '품절']) {
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(Button, {
    disabled: state === '품절', style: {width:'100%',height:44,border:0,borderRadius:10,background:state==='품절'?'#ccc':'#7a1e47',color:'#fff',fontSize:16,fontWeight:800},
    children: state === '품절' ? '품절' : '장바구니 담기'
  })); });
  if (state === '누르는 동안') await act(async () => tree.root.findByType('button').props.onPointerDown({button:0,isPrimary:true,defaultPrevented:false}));
  cards += `<section class="ruru-customer-product-card" style="padding:16px;border:1px solid #efe6de;border-radius:14px;background:white"><h2>${state}</h2><div style="height:140px;background:#eee5df;border-radius:10px;display:grid;place-items:center;margin:12px 0">검증용 상품</div><p style="font-weight:800;margin-bottom:12px">19,000원</p>${renderToStaticMarkup(element(tree.toJSON()))}</section>`;
  await act(async () => tree.unmount());
}
const css = await postcss([tailwind()]).process(fs.readFileSync('app/globals.css','utf8'),{from:'app/globals.css'});
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>상품 눌림 상태 검증</title><style>${css.css}</style><body style="background:#faf7f5;color:#201a1c;padding:24px;font-family:system-ui"><h1>실제 버튼 상태 비교 · 가상 상품</h1><main style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;max-width:1000px;margin:24px auto">${cards}</main></body></html>`;
http.createServer((req,res) => {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}).listen(4338,'127.0.0.1',() => console.log('Visual fixture http://127.0.0.1:4338'));
