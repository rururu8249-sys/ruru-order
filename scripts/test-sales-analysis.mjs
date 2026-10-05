import assert from 'node:assert/strict';
const module = await import('../lib/salesAnalysisLoader.ts').catch(()=>null);
assert.equal(typeof module?.loadSalesAnalysisSnapshot,'function','complete snapshot loader must exist');
const {loadSalesAnalysisSnapshot}=module;
function database({failPage=false,cancel=false}={}) {
  const calls=[];let current=true;
  return {calls,isCurrent:()=>current,db:{from(table){
    let offset=0, ids=[],fields='';const query={select(value){fields=value;return query},order(){return query},range(from){offset=from;return query},in(_field,value){ids=value;return query},
      then(resolve,reject){calls.push({table,offset,ids,fields});let data;
        if(table==='broadcasts')data=offset===0?[{id:7,public_title:'방송',started_at:'2026-10-05'}]:[];
        if(table==='orders')data=offset===0?Array.from({length:1000},(_,i)=>({id:i+1,product_id:42,broadcast_id:7,order_group_id:i===0?'mixed':null,admin_order_status_v2:'입금확인'})): [{id:1001,product_id:43,broadcast_id:null,admin_order_status_v2:'출고완료'}, {id:1002,product_id:99,admin_order_status_v2:'입금확인',is_test_order:true},{id:1003,product_id:98,admin_order_status_v2:'미입금'},{id:1004,product_id:44,broadcast_id:7,order_group_id:'mixed',admin_order_status_v2:'미입금'}];
        if(table==='products')data=ids.map(id=>({id,product_note:'{}'}));
        if(cancel&&table==='orders')current=false;
        return Promise.resolve({data,error:failPage&&table==='orders'&&offset===1000?new Error('page failed'):null}).then(resolve,reject);
      }};return query;
    }}};
}
const ok=database();const snapshot=await loadSalesAnalysisSnapshot(ok.db,ok.isCurrent);
assert.equal(snapshot.orders.length,1004,'second page must not disappear');
assert.notEqual(ok.calls.find(c=>c.table==='orders').fields,'*','analytics cannot download unrelated order columns');
assert(!ok.calls.find(c=>c.table==='orders').fields.includes('address'),'delivery addresses are not needed for analytics');
assert.deepEqual(ok.calls.filter(c=>c.table==='orders').map(c=>c.offset),[0,1000]);
assert.deepEqual(ok.calls.find(c=>c.table==='products').ids,['42','44','43'],'paid group enrichment includes mixed-status siblings, not unrelated unpaid/test products');
assert.equal(snapshot.broadcasts[0].title,'방송');
const failed=database({failPage:true});await assert.rejects(()=>loadSalesAnalysisSnapshot(failed.db,failed.isCurrent),/page failed/);
assert.equal(failed.calls.some(c=>c.table==='products'),false,'failed snapshot cannot continue or publish partial totals');
const stale=database({cancel:true});await assert.rejects(()=>loadSalesAnalysisSnapshot(stale.db,stale.isCurrent),/superseded/);
assert.equal(stale.calls.filter(c=>c.table==='orders').length,1,'stale request stops before next page');
console.log('PASS complete sales snapshot pagination, failure and stale request protection');
