import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const {buildCompactConversationPrompt}=load('lib/liveAutomationCompactPrompt.ts');
const {buildChatCandidatePrompt}=load('lib/liveAutomationCandidates.ts');
const now=Date.parse('2026-11-21T06:00:00Z');
const product={name:'CP-1 올리브',colors:[],sizes:['S','M']};
const other={name:'MX-133 초코',colors:[],sizes:['36','38']};
const stale='CP-1 올리브 색감이 고급스러워서 계속 눈길이 가네요';
const fresh='MX-133 초코 총장이 궁금해요';
const messages=[{id:3,body:fresh,automation_actor_id:'b',created_at:new Date(now-30000).toISOString()},{id:2,body:stale,automation_actor_id:'a',created_at:new Date(now-600000).toISOString()},{id:1,body:'실제 고객의 이전 질문',created_at:new Date(now-600000).toISOString()}];
const recent=[{text:stale,at:now-600000},{text:stale,at:now-500000}];
const c={now,mode:'paused',product,cardText:product.name,orderedProducts:[other],actors:[],messages,recentTopics:recent};
for(const p of [buildCompactConversationPrompt(c),buildChatCandidatePrompt(c,recent)]){
 assert.ok(!p.includes(stale),'stale TEST sentences must not become repeated few-shot examples');
 assert.ok(p.includes(fresh),'fresh context remains available');
 assert.ok(p.includes('실제 고객의 이전 질문'),'real human context retained');
 assert.equal(p.split('색상 이름은 음식').length-1,1,'shared catalog instructions appear once, not once per item');
 assert.ok(p.includes('CP-1 올리브 2회')&&p.includes('MX-133 초코 0회'),'grounded recent product distribution guides generation');
}
console.log('PASS stale TEST summary-only, fresh/human context, one shared facts policy, verified product usage');
