import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let admin=null, identity=null, owner=false, persona=false, error=false, cookie=null;
const load=createUiLoader({
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>admin},
 '@/lib/liveChatSession':{CHAT_SESSION_COOKIE:'c',verifyChatIdentity:()=>cookie,chatIdentityFromRequest:()=>identity,verifiedChatRole:async()=>{if(error)throw Error('unavailable');return {isOwner:owner,isMod:true,persona}},sameChatOrigin:r=>r.headers.get('origin')==='https://shop.example'},
});
let M; try {M=load('lib/liveAutomationManualChat.ts')} catch {}
assert.ok(M,'verified manual operator authorization must exist');
const req=new Request('https://shop.example/api/live-chat',{headers:{origin:'https://shop.example'}});
assert.equal(await M.manualChatOperator(req,{}),null,'client-selected account alone never grants permission');
identity={sub:'123',phone:'01000000000',nonce:'signed'};
assert.equal(await M.manualChatOperator(req,{}),null,'generic moderator is not one of the designated operators');
persona=true;
assert.equal(await M.manualChatOperator(req,{}),'kakao:123','닉네임 골라 보내기 권한');
persona=false; owner=true;
assert.equal(await M.manualChatOperator(req,{}),'kakao:123');
identity=null; admin={sub:'owner'};
assert.equal(await M.manualChatOperator(req,{}),'admin:owner');
admin=null; owner=false; identity=null; cookie={sub:'777',phone:'',nonce:'n'};
assert.equal(await M.manualChatOperator(req,{}),null,'쿠키만 있고 권한 없음 → 거절');
persona=true;
assert.equal(await M.manualChatOperator(req,{}),'kakao:777','쿠키만 + 권한 있음 → 허용');
persona=false; cookie=null;
admin=null; identity={sub:'123',phone:'01000000000',nonce:'signed'};error=true;
await assert.rejects(M.manualChatOperator(req,{}),/unavailable/);
assert.equal(M.validManualSelection({token:'not-a-uuid',clientId:'forged',requestId:'forged'}),false);
console.log('PASS signed admin/designated identity only; client claims and generic moderator rejected; authority lookup fails closed');
