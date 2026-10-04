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
assert.deepEqual(selected.map(p=>p.phone).sort(),[phone(1),phone(2)]);
assert.equal(selected.find(p=>p.phone===phone(1)).orderDays,2,'same KST date counts once, not product lines');
assert.equal(selectAlertRecipients(customers,orders,new Set([phone(1)]),options).length,1);
assert.equal(selectAlertRecipients([...customers,customers[0]],orders,new Set(),{...options,limit:1}).length,1);
for(const limit of [0,-1,1.5,NaN,10001])assert.throws(()=>selectAlertRecipients(customers,orders,new Set(),{...options,limit}));
for(const period of [0,NaN,366])assert.throws(()=>selectAlertRecipients(customers,orders,new Set(),{...options,recentDays:period}));
const manifest={broadcastId:'broadcast',actor:'admin',phones:selected.map(p=>p.phone),expires:now+900000};
const token=sealAlertSelection(manifest,'secret');
assert.deepEqual(readAlertSelection(token,'secret','broadcast','admin',now),manifest);
for(const [value,key,bc,actor,time] of [[token+'x','secret','broadcast','admin',now],[token,'wrong','broadcast','admin',now],[token,'secret','other','admin',now],[token,'secret','broadcast','other',now],[token,'secret','broadcast','admin',now+900000]])assert.throws(()=>readAlertSelection(value,key,bc,actor,time));
assert.throws(()=>sealAlertSelection({...manifest,phones:[phone(1),phone(1)]},'secret'));
console.log('PASS consent, KST distinct days, recency, invalid limits, deduplication, fixed signed selection, expiry and broadcast/admin binding');
