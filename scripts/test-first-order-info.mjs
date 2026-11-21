import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const Intro=load('components/order/OrderCustomerInfoIntro.tsx').default;
const Form=load('components/order/OrderCustomerInfoFormCard.tsx').default;
const markup=renderToStaticMarkup(React.createElement(Intro,{mode:'check'}));
assert.ok(markup.includes('처음 주문 정보 입력'));
assert.ok(markup.includes('저장하면 상품을 보고 주문'));
assert.ok(!markup.includes('정보수정'));
assert.ok(renderToStaticMarkup(React.createElement(Intro,{mode:'edit'})).includes('정보수정'));
const fields={youtubeNickname:'시험닉네임',customerName:'시험',customerPhone:'01000000000',address:'시험 주소',detailAddress:'1층',zipcode:'04524'};
const form=renderToStaticMarkup(React.createElement(Form,{...fields,isEdit:false}));
assert.ok(form.includes('저장하고 상품 보기'));
assert.ok(!form.includes('취소'));
const source=fs.readFileSync('app/order/page.tsx','utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function initializer(name){let result;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)result=n.initializer.getText(ast);ts.forEachChild(n,visit)}visit(ast);assert.ok(result,name);return result;}
function evaluate(expression,context){return vm.runInNewContext(ts.transpileModule('const result = '+expression+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nresult',context);}
for(const existing of [false,true])for(const failure of [false,true]){
 const events=[];let release;
 const state={...fields,hasSavedInfo:existing,isEditingCustomerInfo:true,isEditMode:existing,isKakaoLoginReturn:false,customerInfoEditSheetOpen:false,customerMode:'new'};
 const context={...state,window:{history:{replaceState:(_state,_title,url)=>events.push("url:"+url)}},customerInfoEditSnapshot:null,normalizePhone:x=>x,isOrderablePhone:()=>true,nicknameReconfirmRequired:()=>false,getDuplicateYoutubeNicknameMessage:async()=>'',showCustomerNotice:msg=>events.push(msg),scrollToProductInput:()=>events.push('scroll'),saveCustomer:()=>new Promise((resolve,reject)=>{release=()=>failure?reject(new Error('save failed')):resolve();})};
 for(const key of ['hasSavedInfo','isEditingCustomerInfo','isEditMode','isKakaoLoginReturn','isCustomerInfoOpen','customerInfoEditSheetOpen','customerInfoEditSnapshot','customerMode','pin'])context['set'+key[0].toUpperCase()+key.slice(1)]=v=>{state[key]=v;events.push(key+':'+v)};
 const submit=evaluate(initializer('completeEditCustomerInfo'),context)();
 await new Promise(r=>setImmediate(r));
 assert.equal(state.isEditingCustomerInfo,true,'must stay in form until persistence succeeds');
 release();await submit;
 if(failure){assert.equal(state.isEditingCustomerInfo,true);assert.ok(!events.includes('scroll'));assert.ok(events.some(x=>x.includes('save failed')));}
 else {assert.equal(evaluate(initializer('isAutoLoggedIn'),state),true,'successful save enables product/order UI');assert.equal(events.includes('url:/order'),existing,'successful edit clears mode query');assert.equal(events.includes('scroll'),!existing,'only initial entry moves to products');assert.ok(events.some(x=>x.includes(existing?'고객정보수정이 완료':'상품을 선택')));}
}
assert.match(source,/OrderCustomerInfoIntro mode=\{isEditingCustomerInfo && hasSavedInfo \? "edit" : "check"\}/);
assert.match(source,/isEdit=\{isEditingCustomerInfo && hasSavedInfo\}/);
console.log('PASS first-entry/edit copy and actual save callback: deferred success, failure retention and product gate');

const scrollEvents=[];
const scroll=evaluate(initializer('scrollToProductInput'),{window:{setTimeout:fn=>fn()},document:{getElementById:id=>id==='ruru-shop-top'?{scrollIntoView:opts=>scrollEvents.push(opts.block)}:null}});
scroll();assert.deepEqual(scrollEvents,['start'],'uses the actual rendered catalog anchor, not removed form IDs');
assert.match(source,/section id="ruru-shop-top"/);
