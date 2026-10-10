import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const source=fs.readFileSync('app/order/page.tsx','utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function expression(name){let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)found=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(found,name);return found;}
const helpers=createUiLoader()('lib/customerNoticeSource.ts');
const {noticeBarLine}=createUiLoader()('lib/noticeBar.ts');
const title='📢';
const banner=Function('popupNoticeLinked','popupNoticeTitle','popupNoticeBarLine','popupNoticeText','noticeBarLine',`return (${expression('noticeBarText')});`)(true,title,title,'본문은 제목이 아닙니다',noticeBarLine);
assert.equal(banner,title,'linked title must not be replaced by body or legacy summary');
let resolveNotice;const pending=new Promise(r=>resolveNotice=r);const calls={};
const rows=[{key:'popup_notice_id',value:'17'},{key:'popup_notice_title',value:'옛 제목'},{key:'popup_notice_text',value:'옛 본문'}];
const scope=new Proxy({
  ...helpers,ORDER_PURCHASE_CONSENT_KEYS:[],COMBINE_SHIPPING_SETTING_KEYS:[],FINAL_SUBMIT_CONFIRMATION_KEY:'confirmation',
  supabase:{from(table){const q={select(){return this;},in(){return Promise.resolve({data:rows,error:null});},eq(){return this;},maybeSingle(){return pending;}};return q;}},
  localStorage:{getItem(){return null;},setItem(){}},
},{has:()=>true,get(target,key){if(key===Symbol.unscopables)return undefined;if(key in target)return target[key];if(String(key).startsWith('set'))return value=>{calls[key]=value;};if(String(key).startsWith('parse'))return ()=>({steps:[],warn:'',verified:true});return globalThis[key];}});
const fnText=ts.transpileModule(`const fn=${expression('loadOrderSettings')};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const run=Function('scope',`with(scope){${fnText};return fn;}`)(scope);
const promise=run();await new Promise(r=>setImmediate(r));
assert.ok(calls.setPurchaseConsentConfig,'slow notice fetch must not delay purchase consent settings');
assert.ok(calls.setFinalSubmitConfirmationEnabled,'slow notice fetch must not delay confirmation settings');
resolveNotice({data:{id:17,title:'배송 공지',content:'배송 본문',is_visible:true},error:null});await promise;
assert.equal(calls.setPopupNoticeTitle,'배송 공지');assert.equal(calls.setPopupNoticeText,'배송 본문');
Function('setPopupOpen',`return (${expression('openNoticeBox')})();`)(value=>{calls.open=value;});
assert.equal(calls.open,true,'details opens current notice modal directly');
console.log('PASS real order settings/title/details handlers: exact title, independent consent, direct body modal');
