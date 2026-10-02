import {calculateEventDurationMs,seededRandom,survivalGapMs,legacySurvivalGapMs,survivalPace,survivalKillCount,winnerIndices,type PlaybackInput} from './eventPlayback';
export type SurvivalPlayer={id:number;name:string;x:number;y:number;dead:boolean;hit:boolean;dtype:string|null;pose?:'look'|'run'|'duck'|'rest';facing?:number};
const DISASTERS=[
  {id:'lightning',label:'⛈️ 번개가 번쩍!',accent:'#F0C45A',emoji:'💀'},
  {id:'wave',label:'🌊 파도가 덮쳤어요!',accent:'#6FC3E8',emoji:'🌊'},
  {id:'wind',label:'🌪️ 돌풍이 몰아쳐요!',accent:'#B8E8C4',emoji:'💨'},
  {id:'hail',label:'❄️ 우박이 쏟아져요!',accent:'#E0EAFF',emoji:'❄️'},
  {id:'meteor',label:'☄️ 운석이 떨어져요!',accent:'#FF8A5A',emoji:'🔥'},
];
type Round={at:number;victims:number[];dis:typeof DISASTERS[number];streaks:{id:number;pts:string;br:string[]}[]};
export type SurvivalScene={players:SurvivalPlayer[];winnerIds:number[];rounds:Round[];durationMs:number};
// Visual motion has its own clock, never consumes the selection random stream.
// Independent, continuous waypoints allow diagonal movement and unsynchronised turns.
function actorMotion(p:SurvivalPlayer,time:number){
  const period=1800+p.id%7*120,t=Math.max(0,time),segment=Math.floor(t/period),fraction=(t%period)/period;
  const point=(step:number)=>{
    if(step===0)return {x:Math.max(15,Math.min(85,p.x)),y:p.y};
    const rand=seededRandom((p.id+1)*7919+step*104729);
    return {x:15+rand()*70,y:28+rand()*54};
  };
  const from=point(segment),to=point(segment+1),smooth=fraction*fraction*(3-2*fraction);
  return {x:from.x+(to.x-from.x)*smooth,y:from.y+(to.y-from.y)*smooth,facing:to.x>=from.x?1:-1};
}
function cameraFrame(actors:SurvivalPlayer[],maximum:number){
  if(!actors.length)return {scale:1,x:50,y:50,left:0,right:100,top:0,bottom:100};
  const minX=Math.min(...actors.map(p=>p.x))-9,maxX=Math.max(...actors.map(p=>p.x))+9;
  const minY=Math.min(...actors.map(p=>p.y))-9,maxY=Math.max(...actors.map(p=>p.y))+9;
  const scale=Math.max(1,Math.min(maximum,100/Math.max(maxX-minX,maxY-minY))),half=50/scale;
  const x=Math.max(half,Math.min(100-half,(minX+maxX)/2)),y=Math.max(half,Math.min(100-half,(minY+maxY)/2));
  return {scale,x,y,left:x-half,right:x+half,top:y-half,bottom:y+half};
}
export function buildSurvivalScene(input:PlaybackInput,seed:number):SurvivalScene {
  const rand=seededRandom(seed),n=input.participants.length,cols=Math.max(1,Math.min(n,8)),rows=Math.max(1,Math.ceil(n/cols));
  const players=input.participants.map((name,i)=>({id:i,name,x:4.5+(i%cols+.5)*(91/cols)+rand()*.8-.4,y:27+(Math.floor(i/cols)+.5)*(58/rows)+rand()*.8-.4,dead:false,hit:false,dtype:null}));
  const winnerIds=winnerIndices(input.participants,input.winners),keep=new Set(winnerIds),pool=players.filter(p=>!keep.has(p.id)).map(p=>p.id),rounds:Round[]=[];
  const legacy=input.durationMs===survivalPace(pool.length,true).durationMs;
  const pace=survivalPace(pool.length,legacy);
  let at=pace.startMs;
  // No winner is a waiting/empty scene, never an invented elimination result.
  if(winnerIds.length)while(pool.length){
    const count=survivalKillCount(pool.length),victims:number[]=[];
    for(let i=0;i<count;i++)victims.push(pool.splice(Math.floor(rand()*pool.length),1)[0]);
    const dis=DISASTERS[Math.floor(rand()*DISASTERS.length)];
    const streaks=dis.id==='lightning'||dis.id==='meteor'?victims.map(id=>{
      const p=actorMotion(players[id],Math.round(at)),fromX=p.x-(dis.id==='meteor'?25:0),pts:number[][]=[[fromX,0]];
      for(let j=1;j<7;j++)pts.push([fromX+(p.x-fromX)*j/7+rand()*8-4,p.y*j/7+rand()*3-1.5]);pts.push([p.x,p.y]);
      const br:string[]=[];const count=2+Math.floor(rand()*2);
      for(let b=0;b<count;b++){const start=pts[1+Math.floor(rand()*(pts.length-3))],dir=rand()<.5?-1:1,bp=[start];let x=start[0],y=start[1];for(let j=0;j<3;j++){x+=dir*(3+rand()*5);y+=4+rand()*6;bp.push([x,y]);}br.push(bp.map(p=>p.join(',')).join(' '));}
      return {id,pts:pts.map(p=>p.join(',')).join(' '),br:dis.id==='meteor'?[]:br};
    }):[];
    rounds.push({at:Math.round(at),victims,dis,streaks});at+=(legacy?legacySurvivalGapMs:survivalGapMs)(pool.length)*pace.scale;
  }
  return {players,winnerIds,rounds,durationMs:legacy?pace.durationMs:calculateEventDurationMs('survival',input.participants,input.winners,seed)};
}
export function sampleSurvivalScene(scene:SurvivalScene,elapsedMs:number){
  const done=elapsedMs>=scene.durationMs,dead=new Map<number,string>();let latest:Round|undefined;
  for(const r of scene.rounds){if(r.at>elapsedMs)break;latest=r;for(const id of r.victims)dead.set(id,r.dis.id);}
  const age=latest?elapsedMs-latest.at:Infinity;
  const next=scene.rounds.find(r=>r.at>elapsedMs);
  const warning=!done&&age>=850&&!!next&&next.at-elapsedMs<=Math.min(1800,(latest?next.at-latest.at:3600)/2);
  const beat=done?'winner':elapsedMs<0?'waiting':warning?'warning':age<850?'impact':elapsedMs<4200?'opening':next?'breather':'finale';
  const players=scene.players.map(p=>{
    const eliminated=done?!scene.winnerIds.includes(p.id):dead.has(p.id);
    const hit=!done&&age<850&&!!latest?.victims.includes(p.id);
    // Impact freezes at the struck position, matching the bolt and reaction artwork.
    const motion=actorMotion(p,hit?latest!.at:elapsedMs);
    return {...p,...motion,dead:eliminated,hit,dtype:dead.get(p.id)||null,pose:(age<850?'duck':elapsedMs<1500?'look':'run') as SurvivalPlayer['pose']};
  });
  // Only focus already-struck actors, never signal future victims or winners.
  const target=!done&&latest&&age<1400&&!warning?cameraFrame(latest.victims.map(id=>players[id]),2.1):cameraFrame([],1);
  const blend=Math.max(0,Math.min(1,age/250,(1400-age)/250)),smooth=blend*blend*(3-2*blend);
  const scale=1+(target.scale-1)*smooth,x=50+(target.x-50)*smooth,y=50+(target.y-50)*smooth,half=50/scale;
  const camera={scale,x,y,left:x-half,right:x+half,top:y-half,bottom:y+half};
  return {phase:done?'done' as const:elapsedMs<0?'ready' as const:'running' as const,players,winners:done?scene.winnerIds.map(id=>players[id]):[],
    fx:!done&&latest&&age<850?{type:latest.dis.id,key:latest.at,streaks:latest.streaks,accent:latest.dis.accent}:null,
    bursts:!done&&latest&&age<(latest.dis.id==='lightning'?800:650)?latest.victims.map(id=>({id:id+'-'+latest!.at,x:players[id].x,y:players[id].y,emoji:latest!.dis.emoji,accent:latest!.dis.accent,dtype:latest!.dis.id})):[],
    shaking:!done&&age<320&&!!latest&&['meteor','lightning'].includes(latest.dis.id),
    beat,
    camera,
    warning:warning?{type:next!.dis.id,remainingMs:next!.at-elapsedMs}:null,
    message:warning?{label:next!.dis.id==='wave'?'🌊 멀리서 파도가 다가옵니다… 피하세요!':next!.dis.id==='hail'?'❄️ 우박 주의! 몸을 낮추세요!':next!.dis.id==='wind'?'🌪️ 바람이 거세집니다… 도망가요!':next!.dis.id==='meteor'?'☄️ 하늘을 보세요… 운석 접근!':'⛈️ 먹구름이 몰려옵니다… 조심하세요!',dead:[]}:latest?{label:latest.dis.label,dead:latest.victims.map(id=>players[id].name)}:null};
}
