import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {NextRequest} from 'next/server.js';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture';
let start='2030-01-01T01:00:00Z',operations=[];
const db={from(table){
 let keys=[];
 const q={select(){return q;},in(k,v){keys=v;return q;},gte(k,v){operations.push(['gte',k,v]);return q;},lte(){return q;},order(){return q;},limit(){return q;},range(){return q;},
 then(resolve){
  const settings={mission_active:'true',mission_goal_type:'count',mission_goal_value:'3',mission_reward_amount:'1000',mission_title:'fixture',mission_started_at:start,mission_ended_at:''};
  const data=table==='settings'?keys.map(key=>({key,value:settings[key]})):table==='broadcasts'?[{id:'fixture',started_at:'2030-01-01T00:00:00Z',status:'ON'}]:[{qty:3,order_manage_status:'카드결제완료'}];
  return Promise.resolve({data,error:null}).then(resolve);
 }};return q;
}};
const GET=createUiLoader({'@supabase/supabase-js':{createClient:()=>db}})('app/api/event-mission/overlay/route.ts').GET;
const request=new NextRequest('https://fixture.invalid/api?token=mission_luludongi_live');
for(const expected of ['2030-01-01T01:00:00Z','2030-01-01T00:00:00Z']){
 const before=Date.now(),response=await GET(request),body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.started_at,expected,'return the same real window start used for order aggregation');
 assert(body.server_now>=before&&body.server_now<=Date.now());
 assert.equal(body.current,3);assert.equal(body.pct,100);assert.equal(body.reward,1000);
 assert.equal(operations.at(-1)[2],expected);
 assert.match(response.headers.get('cache-control'),/no-store/);
 start='';
}
console.log('PASS real mission clock: configured window, existing broadcast fallback, aggregation preserved, GET-only');
