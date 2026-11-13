import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const C=createUiLoader()('lib/liveAutomationConversation.ts');
const T=createUiLoader()('lib/liveAutomationTempo.ts');
// 처음 쓰는 닉네임은 인사만
assert.equal(C.acceptConversationText('색이 예쁘네요',{ordered:false,firstChat:true},[]),null);
assert.equal(C.acceptConversationText('안녕하세요~',{ordered:false,firstChat:true},[]),'안녕하세요~');
assert.match(C.fallbackGreeting([],3),C.GREETING_RE);
assert.notEqual(C.fallbackGreeting(['안녕하세요~'],0),'안녕하세요~','방금 누가 한 인사와 똑같이 하지 않음');
// 자기 시청 상태 혼잣말 금지
for(const t of ['다시보기로 천천히 구경하는 중이에요','다시 보기 보고 있어요','천천히 구경 중이에요']) assert.equal(C.acceptConversationText(t,{ordered:false},[],'replay'),null,t);
// 다른 닉네임이 방금 한 말과 비슷하면 안 함(답글은 예외)
assert.equal(C.acceptConversationText('예쁜 옷이 많네요 정말',{ordered:false},['네 감사합니다. 예쁜옷이 많네요']),null);
assert.equal(C.acceptConversationText('배송은 언제쯤 오나요',{ordered:true},['예쁜옷이 많네요']),'배송은 언제쯤 오나요');
// 이름 부르면 답 대상
assert.equal(C.mentionsNickname('양말한짝님 감사합니다. 좋은밤 되세요','[테스트]양말한짝수배53'),true);
assert.equal(C.mentionsNickname('양말한짝수배53님 사이즈 뭐 하셨어요?','양말한짝수배53'),true);
assert.equal(C.mentionsNickname('귤껍질님 안녕하세요','양말한짝수배53'),false);
assert.equal(C.mentionsNickname('양말 사러 왔어요','양말한짝수배53'),false,'두 글자 겹침은 부른 게 아님');
// 밤 12~6시
assert.equal(T.isNightKst(Date.parse('2026-11-13T15:30:00Z')),true,'00:30 KST');
assert.equal(T.isNightKst(Date.parse('2026-11-13T20:59:00Z')),true,'05:59 KST');
assert.equal(T.isNightKst(Date.parse('2026-11-13T21:00:00Z')),false,'06:00 KST');
assert.equal(T.isNightKst(Date.parse('2026-11-13T14:59:00Z')),false,'23:59 KST');
console.log('PASS automation chat: 첫 글 인사, 시청 혼잣말 금지, 비슷한 말 금지, 이름 부르면 답, 밤 12~6시 판정');
