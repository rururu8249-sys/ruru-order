import {calculateEventDurationMs,seededRandom,survivalGapMs,survivalKillCount,winnerIndices,type PlaybackInput} from './eventPlayback';
export type SurvivalPlayer={id:number;name:string;x:number;y:number;dead:boolean;hit:boolean;dtype:string|null};
const DISASTERS=[
  {id:'lightning',label:'⛈️ 번개가 번쩍!',accent:'#F0C45A',emoji:'💀'},
  {id:'wave',label:'🌊 파도가 덮쳤어요!',accent:'#6FC3E8',emoji:'🌊'},
  {id:'wind',label:'🌪️ 돌풍이 몰아쳐요!',accent:'#B8E8C4',emoji:'💨'},
  {id:'hail',label:'❄️ 우박이 쏟아져요!',accent:'#E0EAFF',emoji:'❄️'},
  {id:'meteor',label:'☄️ 운석이 떨어져요!',accent:'#FF8A5A',emoji:'🔥'},
];
type Round={at:number;victims:number[];dis:typeof DISASTERS[number];streaks:{id:number;pts:string;br:string[]}[]};
export type SurvivalScene={players:SurvivalPlayer[];winnerIds:number[];rounds:Round[];durationMs:number};
export function buildSurvivalScene(input:PlaybackInput,seed:number):SurvivalScene {
  const rand=seededRandom(seed),n=input.participants.length,rows=Math.max(1,Math.ceil(n/12));
  const players=input.participants.map((name,i)=>({id:i,name,x:4.5+(i%12+.5)*(91/12)+rand()*4-2,y:27+(Math.floor(i/12)+.5)*(66/rows)+rand()*4-2,dead:false,hit:false,dtype:null}));
  const winnerIds=winnerIndices(input.participants,input.winners),keep=new Set(winnerIds),pool=players.filter(p=>!keep.has(p.id)).map(p=>p.id),rounds:Round[]=[];
  let at=900;
  // No winner is a waiting/empty scene, never an invented elimination result.
  if(winnerIds.length)while(pool.length){
    const count=survivalKillCount(pool.length),victims:number[]=[];
    for(let i=0;i<count;i++)victims.push(pool.splice(Math.floor(rand()*pool.length),1)[0]);
    const dis=DISASTERS[Math.floor(rand()*DISASTERS.length)];
    const streaks=dis.id==='lightning'||dis.id==='meteor'?victims.map(id=>{
      const p=players[id],fromX=p.x-(dis.id==='meteor'?25:0),pts:number[][]=[[fromX,0]];
      for(let j=1;j<7;j++)pts.push([fromX+(p.x-fromX)*j/7+rand()*8-4,p.y*j/7+rand()*3-1.5]);pts.push([p.x,p.y]);
      const br:string[]=[];const count=2+Math.floor(rand()*2);
      for(let b=0;b<count;b++){const start=pts[1+Math.floor(rand()*(pts.length-3))],dir=rand()<.5?-1:1,bp=[start];let x=start[0],y=start[1];for(let j=0;j<3;j++){x+=dir*(3+rand()*5);y+=4+rand()*6;bp.push([x,y]);}br.push(bp.map(p=>p.join(',')).join(' '));}
      return {id,pts:pts.map(p=>p.join(',')).join(' '),br:dis.id==='meteor'?[]:br};
    }):[];
    rounds.push({at,victims,dis,streaks});at+=survivalGapMs(pool.length);
  }
  return {players,winnerIds,rounds,durationMs:calculateEventDurationMs('survival',input.participants,input.winners,seed)};
}
export function sampleSurvivalScene(scene:SurvivalScene,elapsedMs:number){
  const done=elapsedMs>=scene.durationMs,dead=new Map<number,string>();let latest:Round|undefined;
  for(const r of scene.rounds){if(r.at>elapsedMs)break;latest=r;for(const id of r.victims)dead.set(id,r.dis.id);}
  const age=latest?elapsedMs-latest.at:Infinity;
  const players=scene.players.map(p=>({...p,dead:done?!scene.winnerIds.includes(p.id):dead.has(p.id),hit:!done&&age<850&&!!latest?.victims.includes(p.id),dtype:dead.get(p.id)||null}));
  return {phase:done?'done' as const:elapsedMs<0?'ready' as const:'running' as const,players,winners:done?scene.winnerIds.map(id=>players[id]):[],
    fx:!done&&latest&&age<850?{type:latest.dis.id,key:latest.at,streaks:latest.streaks,accent:latest.dis.accent}:null,
    bursts:!done&&latest&&age<(latest.dis.id==='lightning'?800:650)?latest.victims.map(id=>({id:id+'-'+latest!.at,x:players[id].x,y:players[id].y,emoji:latest!.dis.emoji,accent:latest!.dis.accent,dtype:latest!.dis.id})):[],
    shaking:!done&&age<320&&!!latest&&['meteor','lightning'].includes(latest.dis.id),
    message:latest?{label:latest.dis.label,dead:latest.victims.map(id=>players[id].name)}:null};
}
