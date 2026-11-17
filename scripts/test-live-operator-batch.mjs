import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {resolveOperatorCodes,buildBatchAnnouncement}=createUiLoader({})('lib/liveOperatorBatch.ts');
const items=[
{productId:'1',detailName:'MC-348 블랙',texts:['MC-348 블랙'],line:'MC-348 블랙 / 260,000원 / 사이즈: 0,1,2,3,4',soldOut:false},
{productId:'2',detailName:'MC-349 그레이',texts:['MC-349 그레이'],line:'MC-349 그레이 / 260,000원 / 사이즈: 0,1,2,3,4',soldOut:false},
{productId:'3',detailName:'MC-350 와인',texts:['MC-350 와인'],line:'MC-350 와인 / 260,000원 / 사이즈: 0,1,2,3,4',soldOut:false},
];
const r=resolveOperatorCodes('MC-348, MC-349\nMC-350',items);
assert.equal(r.matched.length,3); assert.deepEqual(r.invalid,[]);
assert.equal(buildBatchAnnouncement(r.matched),'✅ MC-348 블랙 / MC-349 그레이 / MC-350 와인 👉 260,000원 / 사이즈 0·1·2·3·4');
assert.deepEqual(resolveOperatorCodes('MC-348 MC-999',items).invalid,['MC-999']);
assert.equal(resolveOperatorCodes('MC-348 MC-348',items).matched.length,1);
assert.deepEqual(resolveOperatorCodes('MC-348',[items[0],{...items[0],productId:'5'}]).ambiguous,['MC-348']);
assert.ok(buildBatchAnnouncement([items[0],{...items[1],line:'MC-349 그레이 / 270,000원 / 사이즈: 0,1,2,3,4'}]).includes('270,000원'));
assert.ok(!buildBatchAnnouncement([items[0],{...items[1],line:'MC-349 그레이 / 270,000원 / 사이즈: 0,1,2,3,4'}]).includes('👉'));
console.log('PASS operator batch: exact codes, separator handling, grouping, different-price safety, ambiguity');
