import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const load=createUiLoader(),E=load('lib/liveChatEmoji.ts');
// Registering 49 existing + 24 new must not silently truncate the tail.
const entries=Array.from({length:81},(_,i)=>({id:`gif${String(i).padStart(5,'0')}`,name:`그림${i}`,url:`https://example.com/${i}.gif`,on:true}));
assert.equal(E.parseChatEmojiSetting({items:entries.slice(0,73)}).items.length,73);
assert.equal(E.parseChatEmojiSetting({items:entries}).items.length,80);
const G=load('lib/liveChatEmojiGif.ts');
const bytes=Uint8Array.from(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
assert.equal(G.chatEmojiGifError(bytes),null);
for(const length of [13,20,bytes.length-1]) assert.ok(G.chatEmojiGifError(bytes.slice(0,length)),`truncated GIF ${length} bytes must fail`);
const big=bytes.slice();big[6]=1;big[7]=1;assert.match(G.chatEmojiGifError(big),/256/);
const empty=bytes.slice();empty[6]=0;empty[7]=0;assert.ok(G.chatEmojiGifError(empty));
assert.ok(G.chatEmojiGifError(new Uint8Array(20)));
assert.ok(G.chatEmojiGifError(bytes.slice(0,9)));
assert.match(G.chatEmojiGifError(new Uint8Array(1024*1024+1)),/1MB/);
const atLimit=bytes.slice();atLimit[6]=0;atLimit[7]=1;assert.equal(G.chatEmojiGifError(atLimit),null);
assert.equal(G.chatEmojiImageExtension('image/gif'),'gif');assert.equal(G.chatEmojiImageExtension('image/webp'),'webp');assert.equal(G.chatEmojiImageExtension('image/png'),'png');assert.equal(G.chatEmojiImageExtension('image/jpeg'),'jpg');
console.log('PASS 73 preserved / 80 cap, GIF header, dimensions, bytes, and upload extensions');
// Multi-frame data must bypass canvas and remain byte-for-byte identical.
const animated=Uint8Array.from([...bytes.subarray(0,-1),...bytes.subarray(19,-1),0x3b]);
const file=new File([animated],'two-frames.gif',{type:'image/gif'});
assert.equal(await G.preserveChatEmojiGif(file),file);
assert.deepEqual(new Uint8Array(await (await G.preserveChatEmojiGif(file)).arrayBuffer()),animated);
await assert.rejects(()=>G.preserveChatEmojiGif(new Blob([big],{type:'image/gif'})),/256/);
await assert.rejects(()=>G.preserveChatEmojiGif(new Blob([new Uint8Array(1024*1024+1)],{type:'image/gif'})),/1MB/);

// Exercise the actual upload handler with storage/auth/settings doubles; no network or financial calls.
let saved=null,uploaded=null,removed=null,current={...E.CHAT_EMOJI_DEFAULT,items:entries.slice(0,73)};
const sb={from(table){assert.equal(table,'settings');return {async upsert(rows){saved=JSON.parse(rows[0].value);return {error:null};}}},storage:{from(bucket){assert.equal(bucket,'product-images');return {async upload(path,body,options){uploaded={path,body,options};return {error:null};},getPublicUrl(path){return {data:{publicUrl:'https://example.com/storage/v1/object/public/product-images/'+path}};},async remove(paths){removed=paths;return {error:null};}}}}};
const route=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>true},'@/lib/youtube':{getServiceClient:()=>sb},'@/lib/liveChatEmojiServer':{EMOJI_PUBLIC_BUCKET:'product-images',readEmojiSetting:async()=>current,clearEmojiAccessCache(){}}})('app/api/admin-live/live-chat-emoji/route.ts');
async function upload(data,mime='image/gif',replaceId){const form=new FormData();form.append('file',new File([data],'test.gif',{type:mime}));form.append('name','움직임');if(replaceId)form.append('replaceId',replaceId);return route.POST(new Request('https://example.com/api/admin-live/live-chat-emoji',{method:'POST',body:form}));}
let response=await upload(animated);assert.equal(response.status,200);assert.equal(saved.items.length,74);assert.ok(uploaded.path.endsWith('.gif'));assert.equal(uploaded.options.contentType,'image/gif');assert.deepEqual(new Uint8Array(await uploaded.body.arrayBuffer()),animated);
const target={id:'replacegif',name:'바꾸기',on:true,url:'https://example.com/storage/v1/object/public/product-images/live-emoji/replacegif.png'};current={...current,items:[target]};
response=await upload(animated,'image/gif',target.id);assert.equal(response.status,200);assert.equal(saved.items[0].id,target.id);assert.ok(saved.items[0].url.endsWith('.gif'));assert.deepEqual(removed,['live-emoji/replacegif.png']);
for(const invalid of [big,new Uint8Array(20),new Uint8Array(1024*1024+1)]){uploaded=null;response=await upload(invalid);assert.equal(response.status,400);assert.equal(uploaded,null);}
current={...current,items:entries.slice(0,80)};uploaded=null;response=await upload(animated);assert.equal(response.status,400);assert.equal(uploaded,null);
console.log('PASS animated bytes preserved, actual API new/replacement upload, invalid GIF and count rejection');
