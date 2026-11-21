import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = Object.fromEntries([
  'app/order/page.tsx',
  'components/customer/CustomerInfoEditBottomSheet.tsx',
  'components/order/OrderCustomerInfoFormCard.tsx',
].map(p => [p, fs.readFileSync(p, 'utf8')]));
let checks = 0;
function test(name, actual, expected = true) { assert.equal(actual, expected, name); checks++; }
function getCallback(file, name, injected) {
  const src = source[file];
  const ast = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert(initializer, `missing actual callback: ${name}`);
  const compiled = ts.transpileModule(`const target = ${initializer.getText(ast)}; globalThis.__callback = target;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  const context = vm.createContext({ ...injected, console, setTimeout: fn => fn() });
  vm.runInContext(compiled, context, { timeout: 5000 });
  return context.__callback;
}
// Page postcode selection: actual deployed callback, isolated DOM/state.
{
 const state = {}, ref = {current:null};
 const cb = getCallback('app/order/page.tsx','handleAddressSearchComplete',{
  setAddressSearchOpen:v=>state.open=v,setAddress:v=>state.address=v,setZipcode:v=>state.zip=v,
  addressPickedHandlerRef:ref,document:{getElementById:id=>({focus:()=>state.focus=id})}
 });
 cb({roadAddress:'서울 중구 세종대로 110',zonecode:'04524'});
 test('road address', state.address,'서울 중구 세종대로 110');
 test('zipcode', state.zip,'04524');
 test('detail input focus',state.focus,'ruru-customer-detail-address');
 test('modal closed',state.open,false);
 test('stable detail field exists',source['components/order/OrderCustomerInfoFormCard.tsx'].includes('id="ruru-customer-detail-address"'));
}
// DB refusal must not falsely confirm a saved address.
async function dbScenario({error=false,kakaoError=false,phoneError=false}) {
 const out={mutations:0};
 const supabase={from:()=>({
   select:()=>({eq:(field)=>({order:()=>({limit:async()=>({data:kakaoError?[]:[{id:9}],error:kakaoError?{message:'KAKAO_FAIL'}:null})}),limit:async()=>({data:[{id:9}],error:phoneError?{message:'PHONE_FAIL'}:null})})}),
   update:()=>({eq:async()=>({error:error?{message:'DATABASE_WRITE_FAIL'}:null})}),
   insert:async()=>({error:error?{message:'DATABASE_WRITE_FAIL'}:null}),
 })};
 const cb=getCallback('app/order/page.tsx','saveShippingAddresses',{
   setShippingAddresses:()=>out.mutations++, onlyNumber:x=>x.replace(/\D/g,''),
   customerPhone:'01012345678',youtubeNickname:'테스트',customerName:'테스트',
   localStorage:{getItem:()=> 'kakao-stub'},supabase
 });
 let failed=false;try{await cb([{name:'배송 받는 분',phone:'01012345678',address:'서울 중구 세종대로 110',zipcode:'04524'}]);}catch{failed=true}
 return {...out,failed};
}
const good=await dbScenario({});test('DB success resolves',good.failed,false);test('DB success commits state once',good.mutations,1);
const bad=await dbScenario({error:true});test('DB error rejects',bad.failed);test('DB error preserves old address',bad.mutations,0);
const lookup=await dbScenario({kakaoError:true});test('Kakao lookup failure rejects',lookup.failed);test('Kakao lookup failure preserves state',lookup.mutations,0);
// Editor must not advance when save has not resolved or failed.
async function editorCase(shouldReject) {
 let settle;const pending=new Promise((resolve,reject)=>{settle=shouldReject?()=>reject(Error('WRITE_FAILED')):resolve});
 const changes={select:[],screens:[],alerts:[],saving:[]};
 const cb=getCallback('components/customer/CustomerInfoEditBottomSheet.tsx','handleSaveAddrForm',{
    savingShipping:false,addrForm:{name:'테스트',phone:'01012345678',address:'서울 중구 세종대로 110',zipcode:'04524',detailAddress:'101호'},
    editingAddrIndex:null,shippingAddresses:[],persistShippingAddresses:()=>pending,
    onSelectShippingAddress:(...a)=>changes.select.push(a),setScreen:x=>changes.screens.push(x),setEditingAddrIndex:()=>{},
    setSavingShipping:x=>changes.saving.push(x),reportShippingSaveError:e=>changes.alerts.push(e.message),window:{alert:x=>changes.alerts.push(x)}
 });
 const promise=cb();
 test('pending save does not change screen',changes.screens.length,0);
 test('pending save does not apply order address',changes.select.length,0);
 settle();await promise;
 return changes;
}
const ok=await editorCase(false);test('successful save moves screen',ok.screens[0],'shipping_list');test('successful save applies selected address',ok.select.length,1);test('successful save no warning',ok.alerts.length,0);
const badEditor=await editorCase(true);test('failed save stays on form',badEditor.screens.length,0);test('failed save keeps current order address',badEditor.select.length,0);test('failed save shows warning',badEditor.alerts.length,1);
test('new address readOnly', source['components/order/OrderCustomerInfoFormCard.tsx'].includes('readOnly\n              onClick={onOpenAddressSearch}'));
test('editor address readOnly',source['components/customer/CustomerInfoEditBottomSheet.tsx'].includes('value={addrForm.address} readOnly'));
test('correct Kakao script', source['app/order/page.tsx'].includes('scriptUrl="https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"'));
console.log(`PASS: ${checks} real-function runtime safety assertions (isolated, no database writes)`);
