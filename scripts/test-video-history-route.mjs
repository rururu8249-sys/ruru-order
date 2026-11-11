import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let authorized=false,reads=0,writes=0,conflict=false;
class Conflict extends Error {}
const load=createUiLoader({
 'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}},
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>authorized?{role:'admin'}:null},
 '@/lib/youtube':{getServiceClient:()=>({})},
 '@/lib/broadcastVideoHistoryServer':{
  VideoHistoryConflict:Conflict,
  loadBroadcastVideoHistory:async()=>{reads++;return [{videoId:'abcdefghijk',title:'지난 방송',introCount:5}];},
  replaceBroadcastVideo:async(_,input)=>{writes++;if(conflict)throw new Conflict('변경');return {id:input.broadcastId,youtube_live_url:input.youtubeUrl};},
 },
});
const route=load('app/api/admin-live/video-history/route.ts');
const request=body=>({json:async()=>body});
assert.equal((await route.GET(request())).status,401);assert.equal(reads,0);
assert.equal((await route.POST(request({}))).status,401);assert.equal(writes,0);
authorized=true;assert.equal((await route.GET(request())).status,200);
const body={broadcastId:'00000000-0000-0000-0000-000000000001',title:'오늘',youtubeUrl:'https://youtu.be/abcdefghijk',expectedUrl:''};
for(const patch of [{broadcastId:'bad'},{title:''},{youtubeUrl:'https://example.com'},{expectedUrl:null}])assert.equal((await route.POST(request({...body,...patch}))).status,400);
assert.equal(writes,0);assert.equal((await route.POST(request(body))).status,200);
conflict=true;assert.equal((await route.POST(request(body))).status,409);
console.log('PASS admin-only history/update, input validation and stale-edit conflict response');
