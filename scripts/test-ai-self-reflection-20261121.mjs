import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {advisesOthers}=createUiLoader({})('lib/liveAutomationDirector.ts');
assert.equal(advisesOthers('BB-60은 어떤 이너랑 매치하면 좋을지 계속 보게 되네요.'),false,'own deliberation is not advice to someone else');
for(const t of ['55면 M 하시면 좋아요','한 치수 크게 고르시면 돼요','그건 정사이즈 추천해요','이렇게 하면 좋아요'])assert.equal(advisesOthers(t),true,t);
const {run}=await import('./test-ai-product-director-20261120.mjs');
const r=await run({mode:'paused',clockNow:Date.parse('2026-11-21T07:05:00Z'),hidden:[{id:99,body:'MC-315 초코는 어떤 핏일지 궁금하네요',automation_actor_id:'other',created_at:'2026-11-21T06:31:27Z'}],text:'BB-60은 어떤 이너랑 매치하면 좋을지 계속 보게 되네요.',orderedCards:[{productId:'751',name:'BB-60',detailName:'BB-60',colors:[],sizes:['S','M','L','XL','XXL']}]});
assert.equal(r.sent.length,1,'actual production reflection can reach transport with verified order card');
console.log('PASS production self-reflection versus unsupported advice');
