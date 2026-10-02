import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {NextRequest} from 'next/server.js';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture';
let row,operations=[];
const db={from(table){operations.push(['from',table]);const q={select(s){operations.push(['select',s]);return q;},like(){return q;},neq(){return q;},eq(){return q;},order(k,o){operations.push(['order',k,o]);return q;},limit(){return q;},maybeSingle:async()=>({data:row,error:null})};return q;}};
const load=createUiLoader({'@supabase/supabase-js':{createClient:()=>db}});
for(const kind of ['roulette','claw','survival','race']){
 const GET=load(`app/api/event-${kind}/overlay/route.ts`).GET;
 const req=token=>new NextRequest('https://fixture.invalid/api?'+(token?'token='+token:''));
 const token=kind+'_luludongi_live';
 assert.equal((await GET(req(''))).status,400);
 if(kind!=='roulette')assert.equal((await GET(req('bad'))).status,403);
 row=null;assert.equal((await GET(req(token))).status,404);
 row={id:'fixture',title:'fixture',mode:'test',is_test:true,status:'result',participant_snapshot:[{nickname:'A',customer_phone:'secret',order_ids:['private'],weight:2},{nickname:'B'}],survivor_nicknames:['A'],winner_nickname:'A',winner_note:'fixture',spin_started_at:'2030-01-01T00:00:00Z',spin_duration_ms:9200,created_at:'2030-01-01T00:00:00Z',updated_at:'2030-01-02T00:00:00Z'};
 operations=[];const before=Date.now(),response=await GET(req(token)),body=await response.json();
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 assert(body.server_now>=before&&body.server_now<=Date.now(),'response server clock supplied');
 assert.equal(body.event.id,'fixture');assert('playback' in body);
 assert.deepEqual(operations.filter(x=>x[0]==='order').map(x=>x[1]),['created_at','id']);
 assert(!JSON.stringify(body).includes('secret'));assert(!JSON.stringify(body).includes('private'));
 assert(!('weight' in body.event.participants[0]));
 assert(operations.find(x=>x[0]==='select')[1].split(',').map(x=>x.trim()).includes('id'));
}
console.log('PASS four real readonly overlay APIs, server clock, immutable ID, latest order, privacy, token/cache semantics');
