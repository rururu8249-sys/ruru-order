import assert from 'node:assert/strict';
import {parseChatCandidates,conversationInterest,rankChatCandidates,buildChatCandidatePrompt,hasUnseenVisualClaim} from '../lib/liveAutomationCandidates.ts';
const now=Date.parse('2026-11-21T08:00:00+09:00');
const candidates=parseChatCandidates(JSON.stringify({candidates:[
 {speaker:'봄이',replyTo:0,text:'MC-310 아이보리 2번 총장 차이는요?',intent:'다른주제'},
 {speaker:'봄이',replyTo:0,text:'MC-310 아이보리 세탁은 어떻게 하나요?'},
 {speaker:'봄이',replyTo:0,text:'겨울에 어떤 스타일이랑 입을지 고민되네요.'},
 {speaker:'봄이',replyTo:0,text:'네 번째는 무시'},
]}),['봄이']);
assert.equal(candidates.length,3);
assert.equal(parseChatCandidates(JSON.stringify([{speaker:'봄이',replyTo:0,text:'세탁은 어떻게 하나요?'}]),['봄이']).length,1,'actual Gemini bare-array response retains bounded validation');
assert.equal(parseChatCandidates('{bad',['봄이']).length,0);
assert.equal(parseChatCandidates('{"candidates":[{"speaker":"없는사람","text":"안녕"}]}',['봄이']).length,0);
assert.equal(parseChatCandidates('{"candidates":[{"speaker":"봄이","replyTo":22,"text":"네"}]}',['봄이']).length,0,'proactive draft cannot invent a reply');
assert.equal(conversationInterest('MC-310 아이보리 후드는 분리되나요?'),'structure','product color is not the conversational interest');
assert.equal(conversationInterest('MC-310 아이보리 가슴둘레 단면 차이는요?'),'measurements');
assert.equal(hasUnseenVisualClaim('블랙은 지퍼 디테일이 눈에 띄네요'),true);
assert.equal(hasUnseenVisualClaim('아이보리 컬러가 코디하기 편해 보인다.'),true);
assert.equal(hasUnseenVisualClaim('저는 아이보리 쪽이 좋아요'),false);
assert.equal(hasUnseenVisualClaim('MC-310 여밈은 어떤 방식인가요?'),false);
assert.equal(hasUnseenVisualClaim('지퍼가 예뻐 보여요, 세탁은 어떻게 하나요?'),true,'a question cannot legitimize an accompanying visual claim');
const recent=[{text:'MC-310 아이보리 가슴단면은요?',at:now-240000},{text:'MC-342 블랙 총장 차이는요?',at:now-480000}];
const ranked=rankChatCandidates(candidates,recent,now);
assert.equal(ranked.length,2,'third independent measurement variant is withheld');
assert.ok(ranked.every(x=>!x.text.includes('총장')));
assert.equal(rankChatCandidates(candidates,recent.map(r=>({...r,at:now-91*60000})),now).length,3,'room topic restriction expires');
const prompt=buildChatCandidatePrompt({now,mode:'paused',cardText:'MC-310 아이보리(제니패딩)',product:{name:'MC-310 아이보리(제니패딩)',colors:[],sizes:['0','1']},actors:[{nickname:'봄이'}],messages:[{id:9,body:'/private-command',nickname:'admin'},{id:8,body:'실제 대화',nickname:'손님'}],questionPending:true},recent);
assert.ok(!prompt.includes('private-command'));
assert.ok(prompt.includes('실제 대화'));
assert.ok(prompt.includes('답을 기다리는 질문이 있음'));
assert.ok(prompt.includes('질문이 아닌'));
assert.ok(prompt.includes('candidates'));
console.log('PASS bounded candidates, semantic interests, repetition, phase and command isolation');
