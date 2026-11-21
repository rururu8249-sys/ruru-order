import assert from 'node:assert/strict';
import {run} from './test-ai-product-director-20261120.mjs';
const now=Date.parse('2026-11-21T06:50:00Z');
const card={productId:'823',name:'CP-1 올리브',detailName:'',colors:[],sizes:['S','M']};
const ordered={productId:'822',name:'HR-7 블랙',detailName:'HR-7 블랙',colors:[],sizes:['38','40']};
const prior=[{id:20,body:'CP-1 올리브 색감이 차분하네요',automation_actor_id:'a',created_at:new Date(now-180000).toISOString()},
{id:19,body:'MC-315 초코는 어떤 핏일지 궁금하네요',automation_actor_id:'b',created_at:new Date(now-360000).toISOString()}];
for(const mode of ['live','paused','replay']){
 const result=await run({mode,clockNow:now,rate:80,focused:true,normalText:'HR-7 블랙 디자인이 깔끔하네요',cardOverride:card,orderedCards:[ordered],visible:prior,hidden:prior,
 drafts:['HR-7 블랙 디자인이 깔끔하네요','HR-7 블랙은 관리 방법도 따져보고 고를래요']});
 assert.equal(result.prompts.length,2,mode+': room-rejected repeated interest gets bounded recovery');
 assert.equal(result.sent.length,1,mode+': later admissible draft survives room validation');
 assert.ok(result.sent[0].body.includes('관리'));
}
console.log('PASS actual production mixed-topic rejection recovers via an admissible grounded draft in all modes');
