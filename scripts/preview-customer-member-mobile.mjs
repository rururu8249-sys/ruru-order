// Read-only fixture of the real component; SSR prevents network effects.
import fs from 'node:fs';
import http from 'node:http';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const Panel=createUiLoader({'@/lib/supabase':{supabase:{}}})('components/admin-live/AdminLiveCustomersPanel.tsx').default;
const markup=renderToStaticMarkup(React.createElement(Panel,{embedded:true,orders:[{id:1,nickname:'검증용매우긴고객닉네임ABCDEFGHIJKLMNOPQRSTUVWXYZ',name:'가상 고객',phone:'01000000000',totalAmount:119000,paymentStatus:'paid',created_at:'2026-10-10T00:00:00Z'}]}));
const css=await postcss([tailwind()]).process(fs.readFileSync('app/globals.css','utf8'),{from:'app/globals.css'});
const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>회원 목록 가상 데이터 검증</title><style>'+css.css+'</style><body><main>'+markup+'</main></body></html>';
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);}).listen(4321,'127.0.0.1',()=>console.log('http://127.0.0.1:4321'));
