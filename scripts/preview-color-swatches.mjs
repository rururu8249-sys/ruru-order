// Local-only layout fixture with real components and synthetic values. No order/API writes.
import fs from 'node:fs';
import http from 'node:http';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const Editor=load('components/admin-live/quick-product/ColorSwatchEditor.tsx').default;
const Preview=load('components/customer/ProductColorSwatches.tsx').default;
const colors={'블랙':'#000000','화이트':'#FFFFFF','모카':'#9D7651','오트밀':'#C9C1B1','소라':'#9FB9E2','긴이름의혼합색상':null};
const admin=renderToStaticMarkup(React.createElement(Editor,{labels:Object.keys(colors),value:colors,onChange(){}}));
const customer=renderToStaticMarkup(React.createElement(Preview,{value:colors}));
const css=await postcss([tailwind()]).process(fs.readFileSync('app/globals.css','utf8')+'\nbody{color:var(--color-ink)}',{from:'app/globals.css'});
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>색상 표시 레이아웃 검증</title><style>${css.css}body{padding:16px;font-family:system-ui;background:#faf8f6}main{max-width:900px;margin:auto;display:grid;gap:20px}section{padding:16px;background:white;border:1px solid #ddd;border-radius:12px;min-width:0}h1{font-size:20px}h2{font-size:16px}</style><body><main><h1>색상 표시 · 가상 상품 검증</h1><section><h2>상품등록 · 기존 색상 옵션 아래</h2>${admin}</section><section style="max-width:300px"><div style="height:140px;background:#eee5df;border-radius:10px"></div><h2>검증용 가디건</h2>${customer}<strong>49,000원</strong></section><p>실제 컴포넌트의 배치 검증용입니다. 이 정적 화면에서는 저장·사진추출이 실행되지 않습니다.</p></main></body></html>`;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);}).listen(4338,'127.0.0.1',()=>console.log('http://127.0.0.1:4338'));
