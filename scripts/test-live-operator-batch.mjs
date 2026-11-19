import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader({});
const {resolveOperatorCodes,buildBatchAnnouncement}=load('lib/liveOperatorBatch.ts');
const {buildDetailChatLine}=load('lib/productDetailModel.ts');
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
// Registered option names can contain /, |, middle dots and spaces. Only commas
// separate options (lib/optionSplit.ts, 2026-09-08 user decision).
const candidate=(code,sizes,colors=[])=>({
  productId:code,detailName:`${code} 블랙`,texts:[`${code} 블랙`],sizes,soldOut:false,
  line:buildDetailChatLine({detailName:`${code} 블랙`,price:100000,colors,sizes}),
});
const grouped=[candidate('MC-101',['XS/S','M/L']),candidate('MC-102',['XS/S','M/L'])];
assert.equal(buildBatchAnnouncement(grouped),'✅ MC-101 블랙 / MC-102 블랙 👉 100,000원 / 사이즈 XS/S·M/L');
const different=[candidate('MC-101',['XS/S']),candidate('MC-102',['XS/M'])];
assert.equal(buildBatchAnnouncement(different),different.map(item=>`✅ ${item.line}`).join('\n'),'different slash-size names must not be grouped');
const exact=[candidate('MC-101',['S|M','롱 · 숏']),candidate('MC-102',['S|M','롱 · 숏'])];
assert.ok(buildBatchAnnouncement(exact).endsWith('사이즈 S|M·롱 · 숏'),'characters inside each option name are preserved');
const pipeCollision=[candidate('MC-101',['S|M','L']),candidate('MC-102',['S','M|L'])];
assert.equal(buildBatchAnnouncement(pipeCollision),pipeCollision.map(item=>`✅ ${item.line}`).join('\n'),'array boundaries must not be lost when comparing size names');
const noSizes=[candidate('MC-101',[],['블랙/사이즈업']),candidate('MC-102',[],['블랙/사이즈업'])];
assert.equal(buildBatchAnnouncement(noSizes),noSizes.map(item=>`✅ ${item.line}`).join('\n'),'a color name must not invent a size when the registered list is empty');
const misleadingColors=[candidate('MC-101',['XS/S'],['블랙/사이즈업']),candidate('MC-102',['XS/S'],['블랙/사이즈업'])];
assert.ok(buildBatchAnnouncement(misleadingColors).endsWith('사이즈 XS/S'),'registered sizes take priority over words embedded in color names');
const legacy=grouped.map(({sizes,...item})=>item);
assert.equal(buildBatchAnnouncement(legacy),buildBatchAnnouncement(grouped),'legacy candidates without a size array retain explicit size-field support');
console.log('PASS operator batch: exact codes, option-name preservation, grouping, different-price/size safety, ambiguity');
