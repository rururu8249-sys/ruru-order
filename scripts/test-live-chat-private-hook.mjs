import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const listeners = new Map();
const values = new Map([
  ['ruru_kakao_id', 'admin-a'],
  ['ruru_chat_identity', JSON.stringify({sub:'admin-a', nonce:'session-a'})],
]);
globalThis.localStorage = {getItem:key=>values.get(key) ?? null};
globalThis.location = {origin:'https://shop.test'};
globalThis.window = {
  addEventListener:(type,fn)=>listeners.set(type,fn),
  removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);},
  setInterval:()=>0,
};
globalThis.document = {visibilityState:'visible',addEventListener(){},removeEventListener(){}};
const pending = [];
globalThis.fetch = url => String(url).startsWith('/api/live-chat/private?')
  ? new Promise(resolve=>pending.push(resolve))
  : Promise.resolve({ok:true});
const load = createUiLoader({'./liveChatPublicAvatars':{refreshPublicAvatars:async()=>{}}});
const {useLiveChatPrivate} = load('lib/useLiveChatPrivate.ts');
const publicRows = [{id:1,broadcastId:'bc',nickname:'알림',badge:'bot',body:'🛒 손님님 주문 감사합니다',avatar:'public:1'}];
let result;
const renders = [];
function Probe() {
  result = useLiveChatPrivate('bc', true, publicRows);
  renders.push(result.displayMessages.map(m=>({body:m.body,avatar:m.avatar})));
  return null;
}
const reply = (resolve,status=200) => resolve({ok:status===200,status,json:async()=>({
  ok:status===200,verified:true,canReviewDeleted:true,
  avatars:{1:'https://private.example/admin.jpg'},
  testMessages:{1:{nickname:'알림',body:'🛒 [테스트]손님님 주문 감사합니다'}},
})});
let tree;
await act(async()=>{tree=Renderer.create(React.createElement(Probe));});
await act(async()=>reply(pending.shift()));
const authenticated = result.displayMessages;
assert.equal(authenticated[0].avatar,'https://private.example/admin.jpg');
const before = renders.length;
for (const key of ['ruru_order_draft','ruru_viewing_product','ruru_chat_font','ruru_live_watch_boot']) {
  await act(async()=>listeners.get('storage')({key}));
  assert.deepEqual(result.displayMessages,authenticated,`${key} must not remove admin photos or test labels`);
}
assert.equal(renders.length,before,'unrelated tab storage must not reset or refetch chat');
assert.equal(pending.length,0);

// Ordinary refreshes keep the projection until the replacement is verified.
await act(async()=>listeners.get('focus')());
assert.deepEqual(result.displayMessages,authenticated);
const stale = pending.shift();
values.set('ruru_chat_identity',JSON.stringify({sub:'admin-b',nonce:'session-b'}));
values.set('ruru_kakao_id','admin-b');
await act(async()=>listeners.get('storage')({key:'ruru_chat_identity'}));
assert.equal(result.canReviewDeleted,false,'identity change clears immediately');
assert.deepEqual(result.displayMessages,publicRows);
await act(async()=>reply(stale));
assert.deepEqual(result.displayMessages,publicRows,'old identity response cannot restore private photos');
await act(async()=>reply(pending.shift()));
assert.equal(result.canReviewDeleted,true);
await act(async()=>listeners.get('message')({origin:'https://untrusted.test',data:{type:'ruru-chat-verified'}}));
assert.equal(result.canReviewDeleted,true,'foreign popup cannot reset chat');
assert.equal(pending.length,0);
await act(async()=>listeners.get('message')({origin:location.origin,data:{type:'ruru-chat-verified'}}));
assert.deepEqual(result.displayMessages,publicRows,'verified popup invalidates previous identity');
await act(async()=>reply(pending.shift()));
values.set('ruru_kakao_id','admin-c');
await act(async()=>listeners.get('storage')({key:'ruru_kakao_id'}));
assert.deepEqual(result.displayMessages,publicRows,'standalone account switch clears private projection');
await act(async()=>reply(pending.shift()));
await act(async()=>listeners.get('ruru-chat-logout')());
assert.deepEqual(result.displayMessages,publicRows,'logout clears private projection');

await act(async()=>result.refresh());
await act(async()=>reply(pending.shift()));
values.clear();
await act(async()=>listeners.get('storage')({key:null}));
assert.deepEqual(result.displayMessages,publicRows,'storage clear removes private data');
await act(async()=>reply(pending.shift(),401));
assert.equal(result.canReviewDeleted,false);
await act(async()=>tree.unmount());
assert.equal(listeners.size,0);
console.log('PASS private chat hook: unrelated storage stays stable; account change, logout, clear, stale response remain private');
