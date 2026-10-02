// Local-only browser verification boundary. Never forwards /api requests.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {calculateEventDurationMs,eventSeed} from '../lib/eventPlayback.ts';
const kinds=['survival','race','roulette','claw','mission'];
export function createFixtureBoundary({upstreamPort=3106}={}){
 const events=new Map(),requests=[];let generation=0,delayMs=0;
 function start(kind,{count=12,elapsed=0,status='result',pct=63}={}){
  if(!kinds.includes(kind))throw Error('invalid fixture kind');
  const names=Array.from({length:count},(_,i)=>i===0?'긴닉네임당첨자_방송화면과관리자버튼겹침검수':'검수참가자'+(i+1));
  const id=`local-fixture-${kind}-${++generation}`,startMs=Date.now()-elapsed,startedAt=new Date(startMs).toISOString();
  const key=JSON.stringify([kind,id,startedAt,1]),seed=eventSeed(key);
  const durationMs=kind==='mission'?1:calculateEventDurationMs(kind,names,[names[0]],seed);
  const event={id,title:'로컬 검수 · 운영 데이터 아님',mode:'test',is_test:true,status,overlay_token:`${kind}_luludongi_live`,participants:names.map(nickname=>({nickname,tickets:1})),survivors:[names[0]],winner_nickname:names[0],winner_note:'검수 선물',spin_started_at:startedAt,result_at:startedAt,spin_duration_ms:durationMs};
  const payload={ok:true,event,playback:{version:1,key,kind,seed,startedAtMs:startMs,durationMs},active:true,title:event.title,started_at:startedAt,goalType:'count',goal:100,current:pct,pct,reward:1000};
  events.set(kind,payload);return payload;
 }
 for(const kind of kinds)start(kind,{elapsed:3000});
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(url.pathname.startsWith('/__fixture')){
   if(url.pathname==='/__fixture/status')return json({requests,events:[...events.values()],delayMs});
   if(url.pathname==='/__fixture/delay'){delayMs=Math.max(0,Math.min(2000,Number(url.searchParams.get('ms'))||0));return json({ok:true,delayMs});}
   if(url.pathname==='/__fixture/start')return json(start(url.searchParams.get('kind')||'survival',{count:Number(url.searchParams.get('count'))||12,elapsed:Number(url.searchParams.get('elapsed'))||0,pct:url.searchParams.get('done')==='1'?100:63}));
   if(url.pathname==='/__fixture/metadata'){for(const data of events.values()){data.event.title='제목 변경 검수';data.event.updated_at=new Date().toISOString();}return json({ok:true});}
   return json({ok:false},404);
  }
  if(url.pathname.startsWith('/api/')){
   requests.push({method:req.method,path:url.pathname});
   const overlay=url.pathname.match(/^\/api\/event-(survival|race|roulette|claw|mission)\/overlay$/);
   if(overlay&&req.method==='GET'){
    const data=events.get(overlay[1]);
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
    return json({...data,server_now:Date.now()});
   }
   if(req.method==='GET')return json(url.pathname==='/api/admin-live/mission'?{...events.get('mission'),broadcastTitle:'로컬 검수',payouts:[]}:{ok:true,broadcasts:[],participants:[],events:[],winners:[],progress:null});
   let body='';for await(const chunk of req)body+=chunk;
   const action=JSON.parse(body||'{}');
   requests.at(-1).action=action.action;
   if(url.pathname==='/api/admin-live/mission'&&action.action==='payout_history')return json({ok:true,payouts:[]});
   if(url.pathname==='/api/admin-live/event-roulette'){
    if(action.action==='participants')return json({ok:true,participants:[]});
    const kind=action.eventKind||'roulette';
    if(action.action==='create_event'&&action.mode==='test'){
     const data=start(kind,{count:action.participants?.length||12,status:'idle'});
     if(action.participants?.length)data.event.participants=action.participants;
     return json({ok:true,event:data.event});
    }
    if(['spin_event','resolve_survival_event'].includes(action.action)){
     const previous=[...events.values()].find(p=>p.event.id===action.eventId);
     const selected=previous?.playback.kind||kind;
     const data=start(selected,{count:previous?.event.participants.length||12});
     return json({ok:true,event:data.event,winnerId:'local-only',survivors:[data.event.winner_nickname],winners:[{nickname:data.event.winner_nickname,winnerId:'local-only',orderIds:[]}]});
    }
   }
   return json({ok:false,message:'Local verification blocks all other writes'},403);
  }
  // API destinations cannot escape the loopback proxy. CSP also blocks direct
  // browser connections to Supabase/production, even if a component attempts one.
  const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${upstreamPort}`}},response=>{
   res.writeHead(response.statusCode||502,{...response.headers,'Content-Security-Policy':"connect-src 'self'; img-src 'self' data:; media-src 'self'"});response.pipe(res);
  });
  upstream.on('error',()=>json({ok:false,message:'Local Next server unavailable'},502));req.pipe(upstream);
 });
 server.on('upgrade',(req,socket,head)=>{
  if(!req.url?.startsWith('/_next/')){socket.destroy();return;}
  const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,headers:{...req.headers,host:`127.0.0.1:${upstreamPort}`}});
  upstream.on('upgrade',(response,remote,remoteHead)=>{
   socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
   if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);
   remote.pipe(socket);socket.pipe(remote);
  });
  upstream.on('error',()=>socket.destroy());upstream.end();
 });
 return {server,start,requests};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {server}=createFixtureBoundary();server.listen(3107,'127.0.0.1',()=>console.log('Local fixture proxy http://127.0.0.1:3107; all API calls intercepted, external browser connections blocked'));
}
