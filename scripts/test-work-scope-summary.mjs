import assert from 'node:assert/strict';
import {
  summarizeWorkScope,eligibleWorkScopeOrders,chosenPickingVisibleCount,scopeCountLabel
} from '../lib/adminWorkScopeSummary.ts';

const mk=(id,paymentStatus,rest={})=>({id:String(id),groupId:String(id),paymentStatus,items:[{id:String(id),qty:1}],...rest});
const eleven=[
 ...Array.from({length:8},(_,i)=>mk(i+1,'paid')),
 mk(9,'canceled'),mk(10,'canceled'),mk(11,'canceled')
];
const scope=summarizeWorkScope(eleven,'picking');
assert.deepEqual(scope,{total:11,paid:8,unpaid:0,canceled:3,excluded:0,eligible:8});
assert.deepEqual(summarizeWorkScope([...eleven], 'picking'),scope,'same broadcast and current filter must match');
assert.equal(scopeCountLabel(scope),'정상 주문서 8건');
assert.equal(eligibleWorkScopeOrders(eleven,'picking').length,8);
assert.equal(chosenPickingVisibleCount(scope,'paid'),8);
assert.equal(chosenPickingVisibleCount(scope,'all'),8);
assert.equal(summarizeWorkScope([...eleven,...eleven],'picking').total,11,'duplicate records must not inflate labels');

const mixed=[mk(1,'paid'),mk(2,'unpaid'),mk(3,'manual_match_needed'),mk(4,'card_unpaid'),mk(5,'canceled'),mk(6,'paid',{excludeFromPicking:true}),mk(7,'paid',{excludeFromShipping:true})];
const pick=summarizeWorkScope(mixed,'picking');
assert.deepEqual(pick,{total:7,paid:2,unpaid:3,canceled:1,excluded:1,eligible:5});
assert.equal(chosenPickingVisibleCount(pick,'paid'),2);
assert.equal(chosenPickingVisibleCount(pick,'all'),5);
assert.equal(eligibleWorkScopeOrders(mixed,'picking').length,5,'unpaid stays in picker data for in-panel toggle');
assert.ok(eligibleWorkScopeOrders(mixed,'picking').some(o=>o.paymentStatus==='unpaid'));
assert.deepEqual(summarizeWorkScope(mixed,'invoice'),{total:7,paid:2,unpaid:3,canceled:1,excluded:1,eligible:5});
assert.equal(eligibleWorkScopeOrders(mixed,'invoice').some(o=>o.excludeFromShipping===true),false);
assert.equal(eligibleWorkScopeOrders(mixed,'invoice').some(o=>o.excludeFromPicking===true),true);

const transferred=mk(1,'paid',{pickPull:{pulledFor:'2026-11-18',broadcastId:'bc1'}});
assert.equal(summarizeWorkScope([mixed[0],transferred],'picking').total,2,'original and transferred identity are distinct');
assert.equal(summarizeWorkScope([transferred,transferred],'picking').total,1);
assert.deepEqual(summarizeWorkScope([],'picking'),{total:0,paid:0,unpaid:0,canceled:0,excluded:0,eligible:0});
console.log('PASS scope summary 11=8 paid+0 unpaid+3 canceled, no data loss, payment view, 7-case partition, dedupe, transferred items');
