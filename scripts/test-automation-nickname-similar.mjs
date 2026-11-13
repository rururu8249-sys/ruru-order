import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('lib/liveAutomationNicknames.ts','utf8');
const names=[...src.matchAll(/"nickname": "([^"]+)"/g)].map(m=>m[1]);
const base=n=>n.normalize('NFC').replace(/\s+/g,'').replace(/\d+/g,'').toLowerCase();
const seen=new Map();
for(const n of names){const b=base(n);assert.ok(!seen.has(b),`비슷한 닉네임: ${seen.get(b)} / ${n}`);seen.set(b,n);}
const worker=fs.readFileSync('lib/liveAutomationWorker.ts','utf8');
assert.ok(!/Math\.random\(\)\*90\)\+10/.test(worker),'숫자 붙인 닉네임 생성 금지');
const {createUiLoader}=await import('./admin-ui-test-loader.mjs');
const N=createUiLoader()('lib/liveAutomationNicknames.ts');
const all=new Set();
for(let round=0;round<40;round++){
  const batch=N.generatedNicknameCandidates(80);
  assert.equal(batch.length>=70,true,'한 번에 70개 이상');
  assert.equal(new Set(batch.map(x=>x.nickname)).size,batch.length);
  for(const x of batch){assert.ok(!/[0-9]/.test(x.nickname),'숫자 없음: '+x.nickname);assert.ok(x.nickname.length>=4&&x.nickname.length<=8,x.nickname);assert.ok(!names.includes(x.nickname));all.add(x.nickname);}
}
assert.ok(all.size>1500,'여러 번 채워도 새 이름이 계속 나옴: '+all.size);
assert.ok(/filter\(x=>!\/\[0-9\]\/\.test\(x\.nickname\)\)/.test(worker),'숫자 든 후보 제외');
assert.ok(/generatedNicknameCandidates\(80\)/.test(worker),'후보 채울 때 새 이름도 넣음');
console.log(`PASS automation nicknames: ${names.length}개, 숫자만 다른 비슷한 닉네임 0, 숫자 붙여 새로 만들기 없음`);
