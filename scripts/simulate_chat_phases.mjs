// Read-only deterministic regression and audit. This does NOT call Gemini, send chat, or change the database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {greetingPool,farewellPlan,isEndNotice,farewellTimePool} from '../lib/liveAutomationLines.ts';
import {judgeTestChat,planColorTestThread,canContinueOwnTestTurn,canContinueTestConversation,timeAppropriateTestChat} from '../lib/liveAutomationQualityGate.ts';
import {NICKNAME_CANDIDATES,nicknameCollisionKey} from '../lib/liveAutomationNicknames.ts';
const failures=[],flags=[],passes=[];
const test=(label,fn)=>{try{fn();passes.push(label)}catch(e){failures.push({label,error:String(e.message||e)})}};
const now=Date.parse('2026-11-18T03:00:00Z');
for(let h=0;h<24;h++){
 test(`KST ${h}h greeting policy`,()=>{
  const pool=greetingPool({live:true,sinceStartMs:120000,kstHour:h,visitRecently:false,weekend:false});
  assert.equal(pool.some(p=>p.kind==='morning'),h>=6&&h<11);
  assert.equal(pool.some(p=>p.kind==='evening'),h>=18&&h<22);
  assert.ok(!pool.some(p=>p.kind==='off'));
 });
}
for(const mode of ['live','paused','replay']){
 for(const text of ['지금 입어주세요','방송 끝난 거죠?','방송 잠시 쉬는 중인가요?','160에 52인데 몇 사이즈요?']){
  test(`${mode}: ${text}`,()=>{
   const r=judgeTestChat({text,mode,now,actorId:'a',currentProductKey:'bb:59',recent:[]});
   if(mode!=='live'&&/입어|사이즈/.test(text))assert.equal(r.ok,false);
   if(mode==='paused'&&/끝난/.test(text))assert.equal(r.ok,true);
   if(mode==='replay'&&/쉬는/.test(text))assert.equal(r.ok,false);
  });
 }
}
for(let id=1;id<=1000;id++){
 test(`farewell ${id}`,()=>{
  const actors=Array.from({length:10},(_,i)=>'actor-'+i);
  const schedule=farewellPlan(id,actors);
  assert.ok(schedule.length<=4);
  assert.equal(new Set(schedule.map(x=>x.actorId)).size,schedule.length);
  assert.ok(schedule.every(x=>x.delayMs>=25000));
 });
}
test('paused never uses ended greeting',()=>assert.ok(!greetingPool({phase:'paused',live:false,sinceStartMs:300000,kstHour:12,visitRecently:false,weekend:false}).some(x=>x.kind==='off')));
test('replay has ended greeting',()=>assert.ok(greetingPool({phase:'replay',live:false,sinceStartMs:300000,kstHour:12,visitRecently:false,weekend:false}).some(x=>x.kind==='off')));
for(let hour=0;hour<24;hour++){const at=Date.parse('2026-11-18T00:00:00Z')+(hour-9)*3600000;test(`KST clock ${hour}`,()=>{assert.equal(timeAppropriateTestChat('굿모닝',at),hour>=5&&hour<12);assert.equal(timeAppropriateTestChat('점심 맛있게 드세요',at),hour>=10&&hour<15);assert.equal(timeAppropriateTestChat('저녁 맛있게 드세요',at),hour>=16&&hour<22);assert.equal(timeAppropriateTestChat('편히 주무세요',at),hour>=20||hour<6);assert.ok(farewellTimePool(at).length>0)})}
test('end marker',()=>{assert.equal(isEndNotice('✅ 라이브방송이 종료되었습니다'),true);assert.equal(isEndNotice('잠시 쉬는 중'),false)});
test('color thread 2nd turn',()=>{const p=planColorTestThread({mode:'live',stage:2,sourceText:'블랙 예쁘네요',colors:['블랙','베이지'],productKey:'BB-59'});assert.ok(p);assert.ok(p.text.includes('베이지'))});
test('color thread must not invent color',()=>assert.equal(planColorTestThread({mode:'live',stage:2,sourceText:'블랙 예쁘네요',colors:['블랙'],productKey:'BB-59'}),null));
test('own thread only same actor',()=>assert.equal(canContinueOwnTestTurn({mode:'live',now,actorId:'a',replyToMessageId:10,stage:2,lastMessage:{id:10,actorId:'b',at:now-20000}}),false));
test('AI reply only other actor',()=>assert.equal(canContinueTestConversation({mode:'live',now,actorId:'a',replyToMessageId:10,lastMessage:{id:10,actorId:'a',at:now-20000}}),false));
const unique=new Set(),dup=[];
for(const n of NICKNAME_CANDIDATES){const k=nicknameCollisionKey(n.nickname);if(unique.has(k))dup.push(k);unique.add(k)}
if(dup.length)flags.push(`현재 소스 후보 내부 완전 중복 ${dup.length}개`);
const seenByCore=new Map(),related=[];
const stem=s=>nicknameCollisionKey(s).replace(/(맘|엄마|언니|여사|이모|팬|님|네|댁)$/,'');
for(const n of NICKNAME_CANDIDATES){const k=stem(n.nickname);if(k.length<2)continue;if(seenByCore.has(k))related.push([seenByCore.get(k),n.nickname]);else seenByCore.set(k,n.nickname)}
if(related.length)flags.push(`후보 내부 접미어만 달라 보이는 쌍 ${related.length}개 — 수동 검수 필요`);
const pausedOff=greetingPool({phase:'paused',live:false,sinceStartMs:300000,kstHour:12,visitRecently:false,weekend:false}).filter(x=>x.kind==='off');
if(pausedOff.length)flags.push(`일시정지와 다시보기가 greetingPool(live:false)에서 구분되지 않음: off 인사 ${pausedOff.length}개 후보 — 품질 게이트에 의존`);
const result={source:'actual repository pure functions; deterministic offline simulation only',scenarios:passes.length+failures.length,passed:passes.length,failed:failures,flags,nicknameSourceCount:NICKNAME_CANDIDATES.length};
fs.writeFileSync('ai_members_simulation_report.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
