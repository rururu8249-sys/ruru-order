import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load = createUiLoader({'@/lib/supabase':{supabase:{}}});
const {isRefundKindTask} = load('components/admin-live/AdminLiveCustomerIssueRail.tsx');

// Exercise the actual event handlers; only network/dialog/state boundaries are replaced.
const file = 'components/admin-live/AdminLiveCustomerIssueRail.tsx';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name, env) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(initializer, `${name} handler exists`);
  const js = ts.transpileModule(`const target = ${initializer.getText(ast)};`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(env), js + '\nreturn target;')(...Object.values(env));
}
const refund = {id:'issue-1', task_type:'refund', body:'주문번호: TEST-ORDER'};
let confirms = [], writes = [], notices = [], bulkRuns = 0;
const base = {
  clean:v=>String(v??'').trim(),
  isDeleted:()=>false, isResolved:()=>false,
  isRefundKindTask,
  showAdminConfirm:async(message)=>{confirms.push(message); return false;},
  showAdminToast:m=>notices.push(m),
  runBulk:async()=>{bulkRuns++;}, patchOne:async()=>true,
};
await handler('bulkResolve', {...base, selectedTasks:[refund]})();
assert.equal(confirms.length,0,'refunds must not enter generic bulk completion confirmation');
assert.equal(bulkRuns,0);
assert(notices.some(m=>/개별/.test(m)), 'tell operator to verify refund individually');
assert.equal(isRefundKindTask({task_type:'general',raw_payload:{issue_types:['general','refund']}}),true,'secondary refund type must not bypass safety checks');

confirms=[]; notices=[];
await handler('bulkResolve', {...base, selectedTasks:[{id:'general',task_type:'general'},refund]})();
assert.equal(confirms.length,0,'mixed selection cannot silently complete only part of the selection');

await handler('bulkResolve', {...base, selectedTasks:[{id:'general',task_type:'general'}]})();
assert.equal(confirms.length,1,'ordinary inquiries retain bulk completion');

confirms=[];
const ledger = {id:'ledger-1', order_lookup_code:'TEST-ORDER', admin_task_id:'issue-1', amount_final:119000, method:'계좌이체', stage:'처리 필요', done_at:null};
const env = {...base,
  extractBodyField:()=> 'TEST-ORDER',
  primaryByOrder:{'TEST-ORDER':ledger},
  fetch:async(url, options)=>{
    if (!options?.method) return {ok:true,json:async()=>({ok:true,items:[ledger]})};
    writes.push({url,options}); return {ok:true,json:async()=>({ok:true})};
  },
  setIssuePage(){}, setReloadKey(){},
  window:{dispatchEvent(){}}, Event:class {},
};
await handler('resolveIssueTask',env)(refund);
assert.equal(writes.length,0,'cancelled confirmation must never write');
assert.match(confirms[0],/119,000/,'confirmation identifies amount being recorded');
assert.match(confirms[0],/계좌이체/);
assert.match(confirms[0],/실행하지 않/,'confirmation does not imply money is moved');

confirms=[]; writes=[];
await handler('resolveIssueTask',{...env,showAdminConfirm:async(m)=>{confirms.push(m);return true;}})(refund);
assert.equal(writes.length,2);
assert.equal(JSON.parse(writes[0].options.body).mark_done,true);
assert.equal(JSON.parse(writes[1].options.body).action,'resolve');
confirms=[]; writes=[];
await handler('resolveIssueTask',{...env,
  fetch:async(url,options)=>{
    if (!options?.method) return {ok:false,json:async()=>({ok:false,message:'lookup failed'})};
    writes.push({url,options}); return {ok:true,json:async()=>({ok:true})};
  },
  showAdminConfirm:async(m)=>{confirms.push(m);return true;},
})(refund);
assert.equal(writes.length,0,'refund read failure cannot resolve or complete from cached state');
assert.equal(confirms.length,0,'unknown refund state cannot be presented as verified');
for (const items of [
  [ledger,{...ledger,id:'ledger-2'}],
  [{...ledger,admin_task_id:'other-issue'}],
]) {
  confirms=[]; writes=[];
  await handler('resolveIssueTask',{...env,
    fetch:async(url,options)=>{
      if (!options?.method) return {ok:true,json:async()=>({ok:true,items})};
      writes.push({url,options}); return {ok:true,json:async()=>({ok:true})};
    },showAdminConfirm:async(m)=>{confirms.push(m);return true;},
  })(refund);
  assert.equal(writes.length,0,'ambiguous or other-issue refund record is never completed');
  assert.equal(confirms.length,0);
}
writes=[];
await handler('resolveIssueTask',{...env,
  fetch:async(url,options)=>{
    if (!options?.method) return {ok:true,json:async()=>({ok:true,items:[ledger]})};
    writes.push({url,options}); return {ok:false,status:500,json:async()=>({ok:false})};
  },showAdminConfirm:async()=>true,
})(refund);
assert.equal(writes.length,1,'failed ledger completion cannot resolve issue');
console.log('PASS refund completion is explicit and cannot be bypassed through bulk issue resolution');
