// Read-only synthetic visual fixture; no API calls or customer data.
import fs from 'node:fs';
import http from 'node:http';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {IssueCard}=createUiLoader({'@/lib/supabase':{supabase:{}}})('components/admin-live/AdminLiveCustomerIssueRail.tsx');
const task={id:'visual',status:'open',customer_nickname:'검증용 고객',customer_name:'가상 데이터',related_product:'검증용 긴 상품명 트렌치코트 · 베이지 / XXL · 2개',body:'내용: 반품 도착 확인 후 환불 예정\n고객이 남긴 두 번째 줄도 잘리지 않고 표시되어야 합니다.',created_at:'2026-10-10T00:00:00Z'};
const markup=renderToStaticMarkup(React.createElement(IssueCard,{task,index:0,onProcess(){},onResolve(){},amount:{head:'119,000원',sub:'상품금액'},photos:[]}));
const css=await postcss([tailwind()]).process(fs.readFileSync('app/globals.css','utf8'),{from:'app/globals.css'});
const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>고객이슈 모바일 검증</title><style>'+css.css+'</style><body class="bg-canvas"><main class="mx-auto max-w-[1400px] p-4"><h1>고객이슈 · 가상 데이터 검증</h1><section class="mt-4 rounded-xl border border-line bg-surface">'+markup+'</section></main></body></html>';
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}).listen(4320,'127.0.0.1',()=>console.log('http://127.0.0.1:4320'));
