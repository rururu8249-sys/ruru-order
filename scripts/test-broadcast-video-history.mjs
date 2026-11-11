import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const {buildBroadcastVideoHistory}=load('lib/broadcastVideoHistory.ts');
const {productIntroKey}=load('lib/productIntroServer.ts');
const bc='00000000-0000-0000-0000-000000000001',a='abcdefghijk',b='12345678901';
const old={broadcastId:bc,videoId:a,title:'11월 1일 방송',date:'2026-11-01T00:00:00Z'};
const current={id:bc,public_title:'새 방송',youtube_live_url:`https://youtu.be/${b}`,started_at:'2026-11-11T00:00:00Z',is_deleted:false};
const intro={videoId:a,seconds:120,capturedAt:Date.parse('2026-11-01T01:00:00Z'),recordedAt:'2026-11-01T01:00:00Z'};
const row={key:productIntroKey(bc,a,{productId:'748',detailName:'MC335'}),value:JSON.stringify(intro)};
let entries=buildBroadcastVideoHistory([current],[old],[row,row]);
assert.equal(entries.length,2);assert.equal(entries[0].videoId,b);
assert.deepEqual(entries[1],{...old,introCount:1});
entries=buildBroadcastVideoHistory([current],[],[row]);
assert.equal(entries.find(x=>x.videoId===a)?.introCount,1,'overwritten video recoverable from old introduction');
assert.equal(buildBroadcastVideoHistory([{...current,is_deleted:true}],[],[]).length,0);
assert.equal(buildBroadcastVideoHistory([current],[{...old,videoId:'bad'}],[{...row,value:'bad'}]).length,1);
assert.equal(buildBroadcastVideoHistory([current],[],[{...row,value:JSON.stringify({...intro,capturedAt:1e20})}]).length,1,'invalid timestamp cannot break the history list');
assert.equal(buildBroadcastVideoHistory([],[{...old,title:{unexpected:true}}],[])[0].title,'지난 방송','malformed metadata cannot crash the picker');

const {replaceBroadcastVideo}=load('lib/broadcastVideoHistoryServer.ts');
let stored={...current,public_title:'11월 1일 방송',youtube_live_url:`https://youtu.be/${a}`,started_at:old.date,status:'ON',paused_at:'2026-11-02T00:00:00Z',order_form_enabled:true},archive=[],failArchive=false,race=false;
const db={from(table){let filters=[],values,op='read';const q={
 select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>r[k]===v);return q;},
 upsert(v){op='archive';values=v;return q;},update(v){op='update';values=v;return q;},maybeSingle(){return q;},
 then(resolve,reject){
  let data=null,error=null;
  if(table==='settings'){assert.equal(op,'archive');if(failArchive)error={message:'offline'};else archive.push(values);}
  else {assert.equal(table,'broadcasts');if(op==='update'&&race)stored={...stored,youtube_live_url:'https://youtu.be/zzzzzzzzzzz'};
   if(filters.every(f=>f(stored))){if(op==='update')stored={...stored,...values};data={...stored};}}
  return Promise.resolve({data,error}).then(resolve,reject);
 },
};return q;}};
const input={broadcastId:bc,title:'오늘 방송',youtubeUrl:`https://youtu.be/${b}`,expectedUrl:`https://youtu.be/${a}`};
failArchive=true;await assert.rejects(()=>replaceBroadcastVideo(db,input));assert.equal(stored.youtube_live_url,input.expectedUrl,'failed archive cannot lose previous video');
failArchive=false;let updated=await replaceBroadcastVideo(db,input);
assert.equal(updated.youtube_live_url,input.youtubeUrl);assert.equal(archive.length,1);
assert.equal(JSON.parse(archive[0].value).videoId,a);
assert.equal(updated.started_at,old.date);assert.equal(updated.status,'ON');assert.equal(updated.order_form_enabled,true);assert.equal(updated.paused_at,'2026-11-02T00:00:00Z','video change preserves sales state');
await assert.rejects(()=>replaceBroadcastVideo(db,input),/변경/,'stale editor cannot overwrite newer video');
const back={...input,youtubeUrl:input.expectedUrl,expectedUrl:input.youtubeUrl};
race=true;await assert.rejects(()=>replaceBroadcastVideo(db,back),/변경/,'concurrent edit detected by conditional update');
console.log('PASS history restore/dedupe, overwritten legacy video, archive failure, sales-state preservation and stale editor');
