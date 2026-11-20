import assert from 'node:assert/strict';
import fs from 'node:fs';
import {run} from './test-ai-product-director-20261120.mjs';
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/ai-chat-gemini-20261121.json',import.meta.url),'utf8'));
const expected=[/여밈/,null,/고민/,/드라이클리닝/];
assert.equal(fixtures.length,expected.length);
for(const [i,f] of fixtures.entries()){
 const parsed=JSON.parse(f.raw),drafts=(Array.isArray(parsed)?parsed:parsed.candidates).map(c=>c.text),c=f.context;
 // Advance the synthetic room clock past its existing 12/18-minute quiet
 // interval; preserve the captured Gemini text and topic history unchanged.
 const result=await run({mode:c.mode,focused:true,drafts,visible:c.messages,hidden:c.messages,cardOverride:c.product,clockNow:c.now+12*60000});
 assert.equal(result.sent.length,expected[i]?1:0,`actual Gemini fixture ${f.capturedAt}`);
 assert.equal(result.actions.length,result.sent.length,'at most one action per draft batch');
 if(expected[i])assert.match(result.sent[0].body,expected[i]);
 for(const sent of result.sent)assert.ok(!/손님들은|줄여 부름|«/.test(sent.body));
 console.log('PASS real Gemini replay',c.mode,expected[i]?'one vetted candidate':'all candidates rejected');
}
