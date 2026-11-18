import assert from 'node:assert/strict';
import {assessRoomTurn} from '../lib/liveAutomationTurnPolicy.ts';
import {summarizeRealChatStyle,summarizeRealOrderProducts} from '../lib/liveAutomationRoomSignals.ts';
const now=Date.parse('2026-11-18T12:00:00+09:00');
const ai=(id,minsAgo,actorId='A')=>({id,at:now-minsAgo*60000,actorId,kind:'ai'});
const human=(id,minsAgo)=>({id,at:now-minsAgo*60000,kind:'human'});
const base={now,mode:'live',currentProductKey:'MC352:ivory',replyToId:0,speakerId:'A',room:[]};
function check(name,input,expected){const got=assessRoomTurn({...base,...input});assert.equal(got.ok,expected,`${name}: ${got.reason}`);console.log('PASS',name)}
check('first relevant message',{room:[]},true);
check('no card no context',{currentProductKey:'',room:[]},false);
check('one independent post too soon',{room:[ai(1,1)]},false);
check('independent after a natural gap',{room:[ai(1,4)]},true);
check('third unrelated post blocked',{room:[ai(3,6,'B'),ai(2,9,'A')]},false);
check('carousel rotation cannot bypass two AI turns',{room:[ai(3,6,'B'),ai(2,9,'A')],previousProductKey:'MC351:black'},false);
check('reply to last AI allowed',{room:[ai(3,0.5,'B'),ai(2,3,'A')],replyToId:3},true);
check('stale AI reply denied',{room:[ai(3,0.5,'B'),ai(2,3,'A')],replyToId:2},false);
check('loop fourth AI reply denied',{room:[ai(4,0.5,'A'),ai(3,1,'B'),ai(2,2,'A')],replyToId:4},false);
check('real question can be answered',{room:[human(5,0.3)],replyToId:5},true);
check('no sudden unrelated line right after a real customer',{room:[human(5,0.3)]},false);
check('off-air product conversation allowed',{mode:'paused',room:[]},true);
check('off-air no chatter after AI',{mode:'paused',room:[ai(1,3)]},false);
check('carousel rotation cannot bypass short gap',{room:[ai(3,1,'B')],previousProductKey:'MC351:black'},false);
check('old AI-only activity does not permanently lock room',{room:[ai(3,15,'B'),ai(2,18,'A')]},true);
check('no unrelated second opinion after AI answered human remark',{
 room:[{...ai(12,3.5,'A'),responseToId:11,asksQuestion:false},{...human(11,5),asksQuestion:false}]
},false);
check('cannot bounce an offhand human remark through two AI accounts',{
 room:[{...ai(12,0.5,'A'),responseToId:11,asksQuestion:false},{...human(11,1.5),asksQuestion:false}],replyToId:12
},false);
check('can still respond to a human question with another relevant opinion',{
 room:[{...ai(12,0.5,'A'),responseToId:11,asksQuestion:false},{...human(11,1.5),asksQuestion:true}],replyToId:12
},true);
check('fresh human turn resets an older answered thread',{
 room:[human(15,2),{...ai(12,6,'A'),responseToId:11},human(11,8)]
},true);
const style=summarizeRealChatStyle([
 {body:'안녕하세요',created_at:'2026-11-18T00:00:00Z',kakao_id:'one'},
 {body:'식사하셨어요?',created_at:'2026-11-18T00:00:10Z',kakao_id:'one'},
 ...Array.from({length:8},(_,i)=>({body:`352 아이보리 궁금해요${i}`,created_at:`2026-11-18T00:01:0${i}Z`,kakao_id:String(i)}))
]);
assert.match(style,/같은 작성자 비율/);
assert.deepEqual(summarizeRealOrderProducts([{product_name:'MC-352'},{product_name:'MC-352'},{product_name:'MC-351'}]),['MC-352','MC-351']);
console.log('PASS room policy + anonymized real-style/order signals');
