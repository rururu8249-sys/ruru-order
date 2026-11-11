import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const {productIntroKey,readProductIntroIndex,readProductIntro}=load('lib/productIntroServer.ts');
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const va='abc_defghij',vb='12345678901';
const target={productId:'748',detailName:'MC-335 아이보리'};
const bookmark=(videoId,seconds,capturedAt)=>({videoId,seconds,capturedAt,recordedAt:new Date(capturedAt).toISOString()});
const first=bookmark(va,100,100000),second=bookmark(vb,800,200000),corrected=bookmark(va,120,300000);
let rows=[{key:productIntroKey(a,va,target),value:JSON.stringify(first)},{key:productIntroKey(b,vb,target),value:JSON.stringify(second)}];
let failed=false;
const matches=(s,p)=>new RegExp('^'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\\_/g,'_').replace(/\\\\%/g,'%').replace(/(?<!\\)%/g,'.*').replace(/(?<!\\)_/g,'.')+'$').test(s);
// Database boundary: real read helpers execute filters, pagination and merging against stored records.
const db={from(table){assert.equal(table,'settings');const filters=[];return {
 select(){return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},like(k,p){filters.push(r=>matches(r[k],p));return this;},order(){return this;},
 async range(lo,hi){return {data:rows.filter(r=>filters.every(f=>f(r))).slice(lo,hi+1),error:failed?{message:'offline'}:null};},
 async maybeSingle(){return {data:rows.find(r=>filters.every(f=>f(r)))??null,error:failed?{message:'offline'}:null};},
};}};
// A's exact product must restore even while a different sales broadcast owns the selected video.
assert.equal((await readProductIntroIndex(db,b,va)).get(productIntroKey(b,va,target))?.seconds,100,'restore A in another broadcast');
assert.equal((await readProductIntro(db,b,vb,target))?.seconds,800,'B uses B timestamp');
assert.equal((await readProductIntro(db,b,va,target))?.seconds,100,'B → A restores A');
rows.push({key:productIntroKey(b,va,target),value:JSON.stringify(corrected)});
assert.equal((await readProductIntro(db,a,va,target))?.seconds,120,'latest correction wins across broadcasts');
assert.equal(await readProductIntro(db,a,va,{...target,detailName:'MC-334 블랙'}),null,'no match by number or parent alone');
rows.push({key:productIntroKey(a,va,{productId:'wrong',detailName:''}),value:JSON.stringify(second)});
rows.push({key:`product_intro_v1_bad_${va}_`+'f'.repeat(64),value:JSON.stringify(first)});
assert.equal((await readProductIntroIndex(db,b,va)).size,1,'wrong-video values and malformed scope excluded');
failed=true;await assert.rejects(()=>readProductIntroIndex(db,b,va));
console.log('PASS video A/B/A, cross-broadcast restoration, newest capture, exact variant, malformed scope and DB failure');
