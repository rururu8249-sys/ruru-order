import assert from 'node:assert/strict';
import {judgeTestChat} from '../lib/liveAutomationQualityGate.ts';
const now=Date.parse('2026-11-21T03:12:15+09:00');
const base={now,mode:'paused',actorId:'next',currentProductKey:'751:BB-60',offAirSince:'2026-11-21T00:00:00+09:00',recent:[],text:'버버60 실물 색감 어때요?'};
const earlier={text:'몽2 네이비 색감 차분한 편인가용?',at:Date.parse('2026-11-21T01:50:50+09:00'),actorId:'prior'};
assert.equal(judgeTestChat({...base,recent:[earlier]}).ok,false,'unanswered offline question stays relevant even after a long silence');
assert.equal(judgeTestChat(base).ok,true,'occasional first offline question is still allowed');
for(const text of ['저는 밝은 색 쪽이 끌려요','천천히 골라봐야겠어요','오늘은 구경만 하려구요'])assert.equal(judgeTestChat({...base,text,recent:[earlier]}).ok,true,'reflection is not another demand: '+text);
assert.equal(judgeTestChat({...base,mode:'live',recent:[earlier]}).ok,true,'live does not inherit offline question pacing');
assert.equal(judgeTestChat({...base,replyingToHuman:true,replySourceIsHuman:true,recent:[earlier]}).ok,true,'actual human clarification still allowed');
assert.equal(judgeTestChat({...base,replyingToHuman:true,recent:[earlier]}).ok,false,'AI replies cannot reset question pacing');
assert.equal(judgeTestChat({...base,recent:[{...earlier,at:now+1000}]}).ok,true,'future rows ignored');
console.log('PASS off-air question flow and grounded reflection');
for(const text of ['저는 네이비에 눈이 가요','핑크 쪽으로 마음이 가요']){
 assert.equal(judgeTestChat({...base,text,recent:[earlier]}).ok,true,'declarative preference is not a question');
 assert.equal(judgeTestChat({...base,recent:[{...earlier,text}]}).ok,true,'preference does not create an unanswered question');
}
assert.equal(judgeTestChat({...base,offAirSince:undefined,recent:[earlier]}).ok,true,'unknown boundary cannot classify old live questions as current off-air backlog');
assert.equal(judgeTestChat({...base,lastHumanAt:earlier.at+1000,recent:[earlier]}).ok,true,'a new actual conversation resets old question pacing');
assert.equal(judgeTestChat({...base,recent:[earlier,...['저는 밝은 쪽이 좋아요','천천히 골라야겠어요','오늘은 구경만 하려구요'].map((text,i)=>({text,at:now-(3-i)*60000,actorId:'r'+i}))]}).ok,true,'new non-question turns permit a later occasional question');
