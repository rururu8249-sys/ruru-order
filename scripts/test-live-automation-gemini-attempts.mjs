import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
process.env.GEMINI_API_KEY='fixture-key';
let calls=0,slots=0;
const load=createUiLoader({'@/lib/geminiGate':{acquireGemini:async()=>{slots++;return true},blockGemini:async()=>{},GEMINI_DEFAULT_MODELS:['lite'],GEMINI_FREE_LIMITS:{lite:{},backup:{}}}});
const {callGeminiJson}=load('lib/geminiJson.ts');
for(const status of [400,429,503,200]){
 calls=0;slots=0;globalThis.fetch=async()=>{calls++;return new Response('{}',{status})};
 await callGeminiJson('small chat',{models:['lite','backup'],maxAttempts:1});
 assert.equal(calls,1,'one automatic message must not multiply into configuration/model retries');
 assert.equal(slots,1);
}
console.log('PASS automatic generation bounds actual provider requests, including empty replies and provider failures');
