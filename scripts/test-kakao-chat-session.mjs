import assert from 'node:assert/strict';import {createUiLoader} from './admin-ui-test-loader.mjs';
let signing=true,userOk=true,claims=null,cookies=[];
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('oauth/token')?{access_token:'verified-token'}:String(url).includes('/user/me')?{id:123,kakao_account:{phone_number:'+82 10-1234-5678',profile:{nickname:'Person'}}}:{shipping_addresses:[]}),{status:String(url).includes('/user/me')&&!userOk?401:200});
const load=createUiLoader({'next/server':{NextResponse:{json(data,init){const r=new Response(JSON.stringify(data),init);r.cookies={set:(...args)=>cookies.push(args)};return r}}},'@supabase/supabase-js':{createClient(){throw Error('no db needed')}},'@/lib/liveChatSession':{CHAT_SESSION_COOKIE:'ruru_chat_identity',chatCookieOptions:()=>({httpOnly:true}),signChatIdentity(p){if(!signing)throw Error('no signing key');claims=p;return 'signed'}}});
const route=load('app/api/auth/kakao/route.ts');
let r=await route.GET(new Request('https://shop.test/api/auth/kakao?code=one'));assert.equal(r.status,200);assert.equal(claims.sub,'123');assert.equal(claims.phone,'01012345678');assert.equal(cookies.length,1);
signing=false;r=await route.GET(new Request('https://shop.test/api/auth/kakao?code=two'));assert.equal(r.status,200,'optional chat identity must not break established shopping login');assert.equal((await r.json()).chat_identity,undefined);
userOk=false;r=await route.GET(new Request('https://shop.test/api/auth/kakao?code=three'));assert.equal(r.status,502,'provider failure cannot issue an identity');
console.log('PASS Kakao provider identity/phone, optional chat signing and failed provider guards');
