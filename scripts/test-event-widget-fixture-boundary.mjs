import assert from 'node:assert/strict';
import http from 'node:http';
import {createFixtureBoundary} from './event-widget-sync-fixtures.mjs';
let forwarded=0;
const upstream=http.createServer((req,res)=>{forwarded++;res.end('asset');});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
const boundary=createFixtureBoundary({upstreamPort:upstream.address().port});
await new Promise(resolve=>boundary.server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${boundary.server.address().port}`;
try{
 for(const kind of ['survival','race','roulette','claw','mission']){
  const r=await fetch(`${origin}/api/event-${kind}/overlay`),data=await r.json();
  assert.equal(r.status,200);assert.equal(data.playback.kind,kind);assert.equal(data.event.mode,'test');assert(Number.isFinite(data.server_now));
 }
 for(const path of ['/api/admin-live/customer-points','/api/admin-live/event-roulette','/api/orders']){
  const r=await fetch(origin+path,{method:'POST',body:JSON.stringify({action:'grant',amount:1000})});
  assert.equal(r.status,403);
 }
 assert.equal(forwarded,0,'all API requests intercepted before reaching Next/server data');
 const asset=await fetch(origin+'/asset');
 assert.equal(await asset.text(),'asset');
 assert.equal(asset.headers.get('content-security-policy'),"connect-src 'self'; img-src 'self' data:; media-src 'self'");
 assert.equal(forwarded,1);
}finally{await new Promise(r=>boundary.server.close(r));await new Promise(r=>upstream.close(r));}
console.log('PASS loopback fixtures never forward APIs, reject monetary/operational writes, block external browser connections');
