import assert from 'node:assert/strict';
import {parseDirectorChoice} from '../lib/liveAutomationFocus.ts';
assert.equal(parseDirectorChoice('{}',['봄이']).reason,'invalid-speaker');
assert.equal(parseDirectorChoice('{"speaker":null}',['봄이']).reason,'invalid-speaker');
assert.equal(parseDirectorChoice('{"speaker":""}',['봄이']).reason,'model-chose-silence');
import {run} from './test-ai-product-director-20261120.mjs';
for (const mode of ['live','paused','replay']) {
 const quiet=await run({mode,modelSilence:true});
 assert.equal(quiet.prompts.length,1,mode+': deliberate silence must not trigger more generation');
 assert.equal(quiet.sent.length,0);
 const useful=await run({mode,text:'MX-107 와인 총장은 몇 cm인가요?'});
 assert.equal(useful.sent.length,1,mode+': useful card question remains possible');
 assert.equal(useful.sent[0].text ?? useful.sent[0].body, 'MX-107 와인 총장은 몇 cm인가요?');
}
console.log('PASS deliberate silence and unmodified useful model text');
