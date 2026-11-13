import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let admin=null, identity=null, owner=false, error=false;
const load=createUiLoader({
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>admin},
 '@/lib/liveChatSession':{chatIdentityFromRequest:()=>identity,verifiedChatRole:async()=>{if(error)throw Error('unavailable');return {isOwner:owner,isMod:true}},sameChatOrigin:r=>r.headers.get('origin')==='https://shop.example'},
});
let M; try {M=load('lib/liveAutomationManualChat.ts')} catch {}
assert.ok(M,'verified manual operator authorization must exist');
const req=new Request('https://shop.example/api/live-chat',{headers:{origin:'https://shop.example'}});
assert.equal(await M.manualChatOperator(req,{}),null,'client-selected account alone never grants permission');
identity={sub:'123',phone:'01000000000',nonce:'signed'};
assert.equal(await M.manualChatOperator(req,{}),null,'generic moderator is not one of the designated operators');
identity.phone='01083388860';
assert.equal(await M.manualChatOperator(req,{}),'kakao:123');
identity.phone='01000000000'; owner=true;
assert.equal(await M.manualChatOperator(req,{}),'kakao:123');
identity=null; admin={sub:'owner'};
assert.equal(await M.manualChatOperator(req,{}),'admin:owner');
admin=null; identity={sub:'123',phone:'01000000000',nonce:'signed'};error=true;
await assert.rejects(M.manualChatOperator(req,{}),/unavailable/);
assert.equal(M.validManualSelection({token:'not-a-uuid',clientId:'forged',requestId:'forged'}),false);
console.log('PASS signed admin/designated identity only; client claims and generic moderator rejected; authority lookup fails closed');
