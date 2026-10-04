import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {selectAlertRecipients,sealAlertSelection,readAlertSelection}=createUiLoader()('lib/liveAlertSelection.ts');
const now=Date.parse('2026-10-04T10:00:00Z');
const phone=n=>'010'+String(n).padStart(8,'0');
const customers=[1,2,3,4,5].map(n=>({customer_phone:phone(n),customer_name:`고객${n}`,live_alert_optin:n!==4,live_alert_optin_at:n===2?'2026-10-03T01:00:00Z':null}));
const orders=[
 {customer_phone:phone(1),created_at:'2026-09-20T01:00:00Z'},
 {customer_phone:phone(1),created_at:'2026-09-20T02:00:00Z'},
 {customer_phone:phone(1),created_at:'2026-09-21T01:00:00Z'},
 {customer_phone:phone(3),created_at:'2026-09-20T01:00:00Z'},
 {customer_phone:phone(3),created_at:'2026-09-20T02:00:00Z'},
 {customer_phone:phone(4),created_at:'2026-09-20T01:00:00Z'},
 {customer_phone:phone(4),created_at:'2026-09-21T01:00:00Z'},
 {customer_phone:phone(5),created_at:'2026-09-20T01:00:00Z',is_test_order:true},
 {customer_phone:phone(5),created_at:'2026-09-21T01:00:00Z',is_deleted:true},
];
const options={limit:300,orderDays:90,recentDays:30,now,random:()=>.5};
const selected=selectAlertRecipients(customers,orders,new Set(),options);
const pool=selectAlertRecipients(customers,orders,new Set(),{...options,includeAllEligible:true});
assert.equal(pool.length,4,'manual search includes opted-in members outside automatic priority criteria');
assert.equal(pool.find(p=>p.phone===phone(3)).orderDays,1);
assert.deepEqual(selected.map(p=>p.phone).sort(),[phone(1),phone(2)]);
assert.equal(selected.find(p=>p.phone===phone(1)).orderDays,2,'same KST date counts once, not product lines');
assert.equal(selectAlertRecipients(customers,orders,new Set([phone(1)]),options).length,1);
assert.equal(selectAlertRecipients([...customers,customers[0]],orders,new Set(),{...options,limit:1}).length,1);
// A lottery favoring recent signups must never swamp buyers with non-buyers.
const mixedCustomers=Array.from({length:700},(_,i)=>({customer_phone:phone(100+i),customer_name:`회원${i}`,live_alert_optin:true,live_alert_optin_at:'2026-10-03T01:00:00Z'}));
const mixedOrders=mixedCustomers.slice(0,300).flatMap(c=>[
 {customer_phone:c.customer_phone,created_at:'2026-10-02T01:00:00Z'},
 {customer_phone:c.customer_phone,created_at:'2026-10-03T01:00:00Z'},
]);
for(const [limit,maxNoOrders] of [[1,0],[19,0],[20,1],[21,1],[100,5],[299,14],[300,15]]){
 let draw=0;
 const picked=selectAlertRecipients(mixedCustomers,mixedOrders,new Set(),{...options,limit,random:()=>++draw<=300?.1:.99});
 assert.equal(picked.length,limit);
 assert.equal(picked.filter(p=>p.orderDays===0).length,maxNoOrders,`non-buyer cap must round down for ${limit}`);
 assert.equal(new Set(picked.map(p=>p.phone)).size,picked.length);
}
const scarce=selectAlertRecipients(mixedCustomers,mixedOrders.slice(0,20),new Set(),options);
assert.equal(scarce.length,25,'10 buyers + at most 15 non-buyers, never backfill to 300');
const newBuyer={customer_phone:phone(999),live_alert_optin:true,live_alert_optin_at:'2026-10-03T01:00:00Z'};
const newBuyerOrders=[{customer_phone:phone(999),created_at:'2026-10-03T01:00:00Z'}];
assert.equal(selectAlertRecipients([customers[0],newBuyer],[...orders,...newBuyerOrders],new Set(),{...options,limit:1})[0]?.phone,phone(1),'equal random draws must favor more order days, not a one-day signup bonus');
assert.equal(selectAlertRecipients([newBuyer],newBuyerOrders,new Set(),{...options,limit:1})[0]?.phone,phone(999),'a recent signup with one order day is a buyer, not in the 5% group');
assert.equal(selectAlertRecipients([newBuyer],[],new Set(),{...options,limit:1}).length,0,'no zero-order exception when the cap is zero');
for(const limit of [0,-1,1.5,NaN,10001])assert.throws(()=>selectAlertRecipients(customers,orders,new Set(),{...options,limit}));
for(const period of [0,NaN,366])assert.throws(()=>selectAlertRecipients(customers,orders,new Set(),{...options,recentDays:period}));
const manifest={broadcastId:'broadcast',actor:'admin',phones:selected.map(p=>p.phone),expires:now+900000};
const token=sealAlertSelection(manifest,'secret');
assert.deepEqual(readAlertSelection(token,'secret','broadcast','admin',now),manifest);
for(const [value,key,bc,actor,time] of [[token+'x','secret','broadcast','admin',now],[token,'wrong','broadcast','admin',now],[token,'secret','other','admin',now],[token,'secret','broadcast','other',now],[token,'secret','broadcast','admin',now+900000]])assert.throws(()=>readAlertSelection(value,key,bc,actor,time));
assert.throws(()=>sealAlertSelection({...manifest,phones:[phone(1),phone(1)]},'secret'));
console.log('PASS consent, KST distinct days, recency, invalid limits, deduplication, fixed signed selection, expiry and broadcast/admin binding');
