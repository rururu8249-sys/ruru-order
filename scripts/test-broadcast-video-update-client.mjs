import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let requests=[],fail=false;
globalThis.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:!fail,status:fail?409:200,json:async()=>fail?{error:'다른 화면에서 영상이 변경됐어요.'}:{data:{id:'bc',youtube_live_url:'https://youtu.be/abcdefghijk'}}};};
const {updateAdminLiveBroadcast}=createUiLoader({
 '@/lib/supabase':{supabase:{from(){return {upsert:async()=>({error:null})};}}},
 '@/lib/adminCatalogWrite':{adminCatalogWrite:async()=>({data:{id:'bc'},error:null})},
})('components/admin-live/liveBroadcastController.ts');
const input={broadcastId:'bc',title:'오늘',youtubeUrl:'https://youtu.be/abcdefghijk',expectedUrl:'https://youtu.be/12345678901'};
await updateAdminLiveBroadcast(input);
assert.equal(requests.length,1,'URL replacement goes through archive-aware endpoint');
assert.equal(requests[0].url,'/api/admin-live/video-history');
assert.equal(requests[0].body.expectedUrl,input.expectedUrl);
fail=true;await assert.rejects(()=>updateAdminLiveBroadcast(input),/변경/);
console.log('PASS client archives before URL change and propagates conflict without false success');
