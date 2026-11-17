import assert from 'node:assert/strict';
import {judgeTestChat as gate,chatIntent} from '../lib/liveAutomationQualityGate.ts';
const now=Date.parse('2026-11-18T02:30:00+09:00');
const base={text:'BB-59 블랙이 예쁘네요',mode:'live',now,actorId:'test-A',currentProductKey:'BB-59',recent:[]};
const cases=[
 ['valid live product reaction',{...base},true],
 ['band prohibited',{...base,text:'밴드 보고 왔어요'},false],
 ['replay cannot ask try-on',{...base,mode:'replay',text:'지금 패딩 입어주세요'},false],
 ['paused can acknowledge ended',{...base,mode:'paused',text:'방송 놓쳤네요'},true],
 ['paused ending question',{...base,mode:'paused',text:'방송 끝난 거죠?',currentProductKey:null},true],
 ['paused cannot claim resuming',{...base,mode:'paused',text:'잠시 쉬는 중이네요'},false],
 ['paused cannot ask try-on',{...base,mode:'paused',text:'지금 패딩 입어주세요'},false],
 ['replay cannot claim paused',{...base,mode:'replay',text:'잠시 쉬는 중이네요'},false],
 ['live allows size question',{...base,text:'BB59 163에 54인데 몇 사이즈요?'},true],
 ['off forbids live size question',{...base,mode:'replay',text:'BB59 163에 54인데 몇 사이즈요?'},false],
 ['same actor same intent repeat',{...base,text:'BB59 블랙이 낫나용?',recent:[{text:'BB59 베이지도 이쁘네요',at:now-40_000,actorId:'test-A',productKey:'BB-59'}]},false],
 ['other actor different color question',{...base,text:'BB59 블랙이 낫나용?',recent:[{text:'BB59 베이지도 이쁘네요',at:now-40_000,actorId:'test-B',productKey:'BB-59'}]},true],
 ['same actor different product',{...base,text:'MC320 블랙이 낫나용?',currentProductKey:'MC-320',recent:[{text:'BB59 베이지도 이쁘네요',at:now-40_000,actorId:'test-A',productKey:'BB-59'}]},true],
 ['same actor after time window',{...base,text:'BB59 블랙이 낫나용?',recent:[{text:'BB59 베이지도 이쁘네요',at:now-22*60_000,actorId:'test-A',productKey:'BB-59'}]},true],
 ['recent exact repetition',{...base,recent:[{text:base.text,at:now-50_000,actorId:'test-B'}]},false],
 ['no context is silence',{...base,text:'어쨌든 그렇네요',currentProductKey:null},false],
 ['replay question with context',{...base,mode:'replay',text:'방송 끝났네요 ㅠ',currentProductKey:null},true],
 ['room replay repeat',{...base,mode:'replay',text:'방송 놓쳤어요',recent:[{text:'방송 끝났네요 ㅠ',at:now-45_000,actorId:'test-B'}]},false],
 ['priority order event',{...base,text:'주문서 제출했어요',priority:true},true],
 ['reply exemption',{...base,text:'BB59 블랙 색 고민되네요',replyingToHuman:true,recent:[{text:'BB59 베이지도 이쁘네요',at:now-40_000,actorId:'test-A',productKey:'BB-59'}]},true],
];
for(const [name,args,expected] of cases){const got=gate(args);assert.equal(got.ok,expected,`${name} ${JSON.stringify(got)}`);console.log('PASS',name);}
assert.equal(chatIntent('MC-319 159에 53인데 몇 사이즈요?'),'size');
console.log(`PASS ${cases.length} policy scenarios + intent parser`);
