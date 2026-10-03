import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// Execute the production request builder, replacing only the external HTTP boundary.
const source=fs.readFileSync('components/admin-live/AdminLiveEventRoulettePanel.tsx','utf8');
const start=source.indexOf('  const loadParticipants = async');
const end=source.indexOf('\n  // [2026-09-08]',start);
for(const groups of [['past-order-1','past-order-2'],[],null]){
 for(const paidOnly of [false,true]){
  let request;
  let savedBroadcast;
  const context={mode:'live',sourceDate:'2026-10-01',broadcastId:'past-broadcast',filteredIdsRef:{current:groups},excludeDailyDup:false,ticketRuleBody:{},participantCacheRef:{current:{}},setBroadcastId(id){savedBroadcast=id;},setLoading(){},setParticipants(){},showAdminToast(){throw new Error('unexpected failure');},requestJson:async(_url,opts)=>{request=JSON.parse(opts.body);return {ok:true,participants:[]};}};
  vm.createContext(context);
  const js=ts.transpileModule(source.slice(start,end)+'\nglobalThis.run=loadParticipants;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(js,context);
  await context.run('live','2026-10-01','past-broadcast',paidOnly);
  assert.deepEqual(request.orderGroupIds,groups??undefined,`paidOnly=${paidOnly}: selected filter must survive, including an empty filter`);
  assert.equal(request.paidOnly,paidOnly||undefined);
  assert.equal(savedBroadcast,'past-broadcast','event persistence must use the participant broadcast');
 }
}
console.log('PASS participant HTTP payload: selected/empty/fallback filters preserved for both sources');
