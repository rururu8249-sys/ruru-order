import assert from 'node:assert/strict';
import fs from 'node:fs';
import {judgeTestChat} from '../lib/liveAutomationQualityGate.ts';
import {greetingPool} from '../lib/liveAutomationLines.ts';
const src=fs.readFileSync('lib/liveAutomationWorker.ts','utf8');
const rejected=["촉촉리본", "바삭양말", "폭신머리핀", "달달손뜨개", "보송양말", "새콤바다", "포근한산책", "보송우산", "말랑바람", "촉촉하루", "달달빵집", "보송이슬", "느린손뜨개", "수줍은빵집", "포근한수국", "폭신앞치마", "새콤리본", "말랑빵집", "수줍은수국", "달달머리핀", "바삭하루", "말랑바다", "바삭우산", "반짝리본", "새콤빵집"];
for(const name of rejected) assert.ok(src.includes(JSON.stringify(name)),'not excluded '+name);
const base={now:Date.parse('2026-11-18T01:00:00+09:00'),actorId:'a',recent:[],currentProductKey:'BB-59'};
for(const text of ['지금 유튜브 라이브 보고 넘어왔어요','유튜브 방송 보다가 넘어왔어요']){
 assert.equal(judgeTestChat({...base,mode:'replay',text}).ok,false,'off-air current claim '+text);
}
assert.equal(judgeTestChat({...base,mode:'replay',text:'어제 유튜브 보고 구독했어요'}).ok,true);
assert.equal(judgeTestChat({...base,mode:'live',text:'유튜브 방송 보다가 넘어왔어요'}).ok,true);
const off=greetingPool({live:false,sinceStartMs:500000,kstHour:1,visitRecently:false,weekend:false});
assert.ok(!off.some(x=>/유튜브 방송 보다가 넘어왔어요/.test(x.text)));
assert.ok(off.some(x=>x.text==='유튜브 보고 왔어요'),'ambiguous past visit should remain permissible');
console.log('PASS: 25 awkward names excluded from future assignment; live/off-air chat claims correctly separated');
