import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const load = createUiLoader({ '@/lib/admin-auth': { getAdminAuthConfig: () => ({ sessionSecret: 'isolated-test-secret-only' }) } });
const auth = load('lib/liveChatSession.ts');
const identity = { sub: '123456', phone: '01012345678', nonce: 'browser-nonce' };
const token = auth.signChatIdentity(identity);
assert.deepEqual(auth.verifyChatIdentity(token)?.sub, identity.sub);
assert.equal(auth.verifyChatIdentity(token + 'forged'), null);
assert.equal(auth.verifyChatIdentity(auth.signChatIdentity(identity, -1)), null);
const req = (id, nonce) => ({ cookies: { get: () => ({ value: token }) }, headers: new Headers({ 'x-chat-account': id, 'x-chat-session': nonce }) });
assert.equal(auth.chatIdentityFromRequest(req('123456', 'browser-nonce'))?.sub, '123456');
assert.equal(auth.chatIdentityFromRequest(req('999999', 'browser-nonce')), null);
assert.equal(auth.chatIdentityFromRequest(req('123456', 'wrong')), null);
console.log('PASS signed chat identity: forged/expired/account mismatch/browser nonce');

const bc = '00000000-0000-0000-0000-000000000001';
let admin = false, writes = [], readTables = [], failWrite = false;
const row = (id, kid, hidden_by = null) => ({ id, kakao_id: kid, broadcast_id: bc, nickname: 'test', body: `original-${id}`, created_at: '2026-11-11', badge: null, pinned_at: id === 1 ? '2026-11-11' : null, hidden_at: hidden_by ? '2026-11-11' : null, hidden_by });
let rows = [row(1, '123456'), row(2, '999999'), row(3, '999999', 'author'), row(4, '999999', 'admin')];
const sb = { from(table) {
  const filters = []; let single = false, update = null;
  readTables.push(table);
  const q = { select(){return q;}, eq(k,v){filters.push(r=>String(r[k])===String(v));return q;}, is(k,v){filters.push(r=>r[k]===v);return q;}, not(k,op,v){filters.push(r=>r[k]!==v);return q;}, order(){return q;}, limit(){return q;}, maybeSingle(){single=true;return q;}, update(v){update=v;return q;}, then(resolve,reject){
    let data = table === 'settings' ? [{value:JSON.stringify({mods:['01099999999']})}] : table === 'operator_test_accounts' ? [] : rows;
    if(table==='live_chat_messages') data = data.filter(r=>filters.every(f=>f(r)));
    if(update){writes.push({update,ids:data.map(r=>r.id)});if(!failWrite)data.forEach(r=>Object.assign(r,update));}
    return Promise.resolve({data:single?data[0]??null:data,error:failWrite&&update?{}:null}).then(resolve,reject);
  }}; return q;
}};
const apiLoad = createUiLoader({
  'next/server': {NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}},
  '@/lib/admin-auth': {getAdminAuthConfig:()=>({sessionSecret:'isolated-test-secret-only'}), verifyAdminSessionFromRequest:async()=>admin?{role:'admin'}:null},
  '@/lib/youtube': {getServiceClient:()=>sb},
});
const route = apiLoad('app/api/live-chat/private/route.ts');
const request = (options={}) => ({
  nextUrl: new URL(`https://shop.test/api/live-chat/private?bc=${bc}`),
  cookies:{get:()=>options.noAuth?undefined:{value:options.token||token}},
  headers:new Headers({'origin':options.origin||'https://shop.test','x-chat-account':options.kid||'123456','x-chat-session':options.nonce||'browser-nonce'}),
  json:async()=>({bc,messageId:options.id??1}),
});
let res = await route.GET(request({noAuth:true})); assert.equal(res.status,401);
res = await route.GET(request());let body = await res.json();
assert.deepEqual(body.ownIds,[1]);assert.deepEqual(body.deletedMessages,[]);assert.equal(body.canReviewDeleted,false);
assert.ok(!JSON.stringify(body).includes('original-'));assert.ok(!readTables.includes('customers'),'editable profile phone must never authorize originals');
const modToken = auth.signChatIdentity({...identity,phone:'01099999999'});
res=await route.GET(request({token:modToken}));body=await res.json();
assert.equal(body.canReviewDeleted,true);assert.equal(body.deletedMessages.length,1);assert.equal(body.deletedMessages[0].body,'original-3');assert.equal(body.deletedMessages[0].deletedByAuthor,true);
assert.ok(!JSON.stringify(body).includes('kakao_id'));assert.match(res.headers.get('cache-control'),/private, no-store/);
admin=true;res=await route.GET(request({noAuth:true}));assert.equal((await res.json()).canReviewDeleted,true);admin=false;
rows.push(row(5,'123456','command'),row(6,'999999','command'));
res=await route.GET(request());body=await res.json();
assert.deepEqual(body.commandMessages.map(m=>m.id),[5],'only the verified author recovers command history');
assert.equal(body.commandMessages[0].body,'original-5');
res=await route.GET(request({token:modToken}));body=await res.json();
assert.deepEqual(body.commandMessages.map(m=>m.id),[5],'moderator cannot read another admin command');
admin=true;res=await route.GET(request({noAuth:true}));body=await res.json();
assert.deepEqual(body.commandMessages,[],'admin cookie alone has no command author identity');admin=false;
for(const options of [{noAuth:true},{kid:'999999'},{nonce:'forged'},{id:2},{id:9000000000001},{origin:'https://evil.test'}]) {
  writes=[];res=await route.DELETE(request(options));assert.ok(res.status>=400);assert.equal(writes.length,0);
}
res=await route.DELETE(request());assert.equal(res.status,200);assert.equal(rows[0].body,'original-1');assert.equal(rows[0].hidden_by,'author');assert.equal(rows[0].pinned_at,null);assert.deepEqual(writes[0].ids,[1]);
writes=[];res=await route.DELETE(request());assert.equal(res.status,200);assert.equal(writes.length,0,'repeat deletion is idempotent');
const publicParser=load('lib/liveChat.ts').parseChatMessage;
assert.equal(publicParser(rows[0]).body,'');assert.equal(publicParser(rows[0]).pinned,false);
rows[0]=row(1,'123456');failWrite=true;res=await route.DELETE(request());assert.equal(res.status,503);assert.equal(rows[0].hidden_at,null);
console.log('PASS private API: author-only atomic soft delete, pin clear, idempotency, spoof/CSRF/DB failure, moderator-only originals, public redaction');

const responseWithCookies = (response) => { response.setCookies = new Map(); response.cookies = {set:(name,value,options)=>response.setCookies.set(name,{value,options})};return response; };
const sessionLoad=createUiLoader({
  'next/server':{NextResponse:{json:(data,init)=>responseWithCookies(new Response(JSON.stringify(data),init)),redirect:url=>responseWithCookies(new Response(null,{status:307,headers:{location:url}}))}},
  '@/lib/admin-auth':{getAdminAuthConfig:()=>({sessionSecret:'isolated-test-secret-only'})},
});
const session=sessionLoad('app/api/live-chat/session/route.ts');
const start=await session.GET(request());
const stateToken=start.setCookies.get('ruru_chat_oauth_state');
const stateValue=new URL(start.headers.get('location')).searchParams.get('state');
assert.match(stateValue,/^ruru_chat_/);assert.equal(stateToken.options.httpOnly,true);assert.equal(stateToken.options.maxAge,600);
const callback=(state=stateValue)=>({...request(),cookies:{get:()=>({value:stateToken.value})},json:async()=>({code:'isolated-code',state})});
const originalFetch=globalThis.fetch;let fetchCalls=0,userOK=true;
try {
  globalThis.fetch=async url=>{fetchCalls++;return new Response(JSON.stringify(String(url).includes('/oauth/token')?{access_token:'test-token'}:{id:123456,kakao_account:{phone_number:'+82 10-1234-5678'}}),{status:String(url).includes('/user/me')&&!userOK?500:200});};
  res=await session.POST(callback('attacker-state'));assert.equal(res.status,401);assert.equal(fetchCalls,0,'invalid state must never exchange code');
  res=await session.POST(callback());body=await res.json();assert.equal(body.sub,'123456');assert.ok(body.nonce);assert.ok(!JSON.stringify(body).includes('access_token'));
  const issued=res.setCookies.get('ruru_chat_identity');assert.equal(issued.options.httpOnly,true);assert.equal(auth.verifyChatIdentity(issued.value).phone,'01012345678');assert.equal(res.setCookies.get('ruru_chat_oauth_state').options.maxAge,0);
  userOK=false;res=await session.POST(callback());assert.equal(res.status,401);assert.equal(res.setCookies.has('ruru_chat_identity'),false);
  res=await session.DELETE(request());assert.equal(res.setCookies.get('ruru_chat_identity').options.maxAge,0);
} finally {globalThis.fetch=originalFetch;}
console.log('PASS OAuth chat-only session: browser state, verified provider response, normalized provider phone, HttpOnly expiry, logout');

failWrite=false;let grants=0;
const grantLoad=createUiLoader({
  'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)},after:()=>{}},
  '@/lib/admin-auth':{getAdminAuthConfig:()=>({sessionSecret:'isolated-test-secret-only'}),verifyAdminSessionFromRequest:async()=>admin?{role:'admin'}:null},
  '@/lib/youtube':{getServiceClient:()=>sb},
  '@/lib/liveChatServer':{chatRoleOfKakao:async()=>({isMod:true,isOwner:true}),setChatManager:async()=>{grants++;return {ok:true,message:'done'};}},
});
const grantRoute=grantLoad('app/api/live-chat/route.ts');
const grantRequest=options=>({...request(options),json:async()=>({kakao_id:'123456',messageId:1,action:'grant'})});
for(const options of [{noAuth:true},{kid:'999999'},{nonce:'forged'},{}]) {res=await grantRoute.PATCH(grantRequest(options));assert.equal(res.status,401);}
assert.equal(grants,0,'raw legacy owner lookup cannot grant private access');
admin=true;res=await grantRoute.PATCH(grantRequest({}));assert.equal(res.status,200);assert.equal(grants,1);admin=false;
console.log('PASS role-grant escalation blocked despite forged legacy owner role; authenticated admin permitted');
