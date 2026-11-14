import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('lib/liveAutomationNicknames.ts','utf8');
const names=[...src.matchAll(/"nickname": "([^"]+)"/g)].map(m=>m[1]);
const base=n=>n.normalize('NFC').replace(/\s+/g,'').replace(/\d+/g,'').toLowerCase();
const seen=new Map();
for(const n of names){const b=base(n);assert.ok(!seen.has(b),`비슷한 닉네임: ${seen.get(b)} / ${n}`);seen.set(b,n);}
const worker=fs.readFileSync('lib/liveAutomationWorker.ts','utf8');
assert.ok(!/Math\.random\(\)\*90\)\+10/.test(worker),'숫자 붙인 닉네임 생성 금지');
assert.ok(!/generatedNicknameCandidates/.test(worker),'이어 붙인 이름 만들기 폐지');
assert.ok(/live_automation_pool_recycle/.test(worker),'나간 손님 이름 되돌리기');
assert.ok(/filter\(x=>!\/\[0-9\]\/\.test\(x\.nickname\)\)/.test(worker),'숫자 든 후보 제외');
console.log(`PASS automation nicknames: ${names.length}개, 숫자만 다른 비슷한 닉네임 0, 숫자 붙여 새로 만들기 없음`);
