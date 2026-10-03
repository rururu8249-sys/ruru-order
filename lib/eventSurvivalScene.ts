import {calculateEventDurationMs,seededRandom,survivalGapMs,compactSurvivalGapMs,compactSurvivalPace,legacySurvivalGapMs,previousSurvivalGapMs,previousSurvivalPace,survivalPace,survivalKillCount,winnerIndices,type PlaybackInput} from './eventPlayback';
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
type MotionCue={at:number;speed:number;pose:NonNullable<SurvivalPlayer['pose']>};
function warningStart(rounds:Round[],index:number){
 const previous=index?rounds[index-1].at:0;
 const gap=rounds[index].at-previous;
 return rounds[index].at-Math.min(900,index?Math.max(150,gap-950):gap/2);
}
// Motion follows the same warning/impact clock as the effects. It has no access
// to future victims or winner identity and never consumes selection randomness.
function motionCues(rounds:Round[]):MotionCue[]{
 const cues:MotionCue[]=[{at:0,speed:.15,pose:'look'},{at:450,speed:.55,pose:'run'}];
 rounds.forEach((r,i)=>{
  const start=warningStart(rounds,i);
  cues.push({at:start,speed:.12,pose:'look'},{at:start+Math.min(160,(r.at-start)/3),speed:1.2,pose:'run'},
   {at:r.at,speed:.15,pose:'duck'},{at:r.at+220,speed:.35,pose:'look'},{at:r.at+850,speed:.55,pose:'run'});
 });
 return cues.sort((a,b)=>a.at-b.at);
}
function motionState(cues:MotionCue[],time:number){
 const t=Math.max(0,time);let clock=0,current=cues[0];
 for(let i=1;i<cues.length;i++){
  const end=Math.min(t,cues[i].at);
  clock+=Math.max(0,end-current.at)*current.speed;
  if(cues[i].at>t)return {clock,speed:current.speed,pose:current.pose};
  current=cues[i];
 }
 return {clock:clock+(t-current.at)*current.speed,speed:current.speed,pose:current.pose};
}
function actorMotion(p:SurvivalPlayer,clock:number){
  const period=2600+p.id%7*140,t=Math.max(0,clock)+p.id%5*170,segment=Math.floor(t/period),fraction=(t%period)/period;
  const centerX=Math.max(15,Math.min(85,p.x)),centerY=Math.max(28,Math.min(82,p.y));
  const point=(step:number)=>{
    if(step===0)return {x:centerX,y:centerY};
    const rand=seededRandom((p.id+1)*7919+step*104729);
    return {x:Math.max(15,Math.min(85,centerX+(rand()-.5)*20)),y:Math.max(28,Math.min(82,centerY+(rand()-.5)*16))};
  };
  const from=point(segment),to=point(segment+1),smooth=fraction*fraction*(3-2*fraction);
  return {x:from.x+(to.x-from.x)*smooth,y:from.y+(to.y-from.y)*smooth,facing:to.x>=from.x?1:-1};
}
export function buildSurvivalScene(input:PlaybackInput,seed:number):SurvivalScene {
  const rand=seededRandom(seed),n=input.participants.length,cols=Math.max(1,Math.min(n,8)),rows=Math.max(1,Math.ceil(n/cols));
  const players=input.participants.map((name,i)=>({id:i,name,x:4.5+(i%cols+.5)*(91/cols)+rand()*.8-.4,y:27+(Math.floor(i/cols)+.5)*(58/rows)+rand()*.8-.4,dead:false,hit:false,dtype:null}));
  const winnerIds=winnerIndices(input.participants,input.winners),keep=new Set(winnerIds),pool=players.filter(p=>!keep.has(p.id)).map(p=>p.id),rounds:Round[]=[];
  const legacy=input.durationMs===survivalPace(pool.length,true).durationMs;
  const previous=!legacy&&input.durationMs===previousSurvivalPace(pool.length).durationMs;
  const compact=!legacy&&!previous&&input.durationMs===compactSurvivalPace(pool.length).durationMs;
  const pace=compact?compactSurvivalPace(pool.length):previous?previousSurvivalPace(pool.length):survivalPace(pool.length,legacy);
  let at=pace.startMs;
  // No winner is a waiting/empty scene, never an invented elimination result.
  if(winnerIds.length)while(pool.length){
    const count=survivalKillCount(pool.length),victims:number[]=[];
    for(let i=0;i<count;i++)victims.push(pool.splice(Math.floor(rand()*pool.length),1)[0]);
    // Presentation weighting only; server-selected winners remain protected.
    // Lightning 40%; wave, wind, hail and meteor 15% each.
    const effectRoll=rand();
    const dis=DISASTERS[effectRoll<.4?0:Math.min(4,1+Math.floor((effectRoll-.4)/.15))];
    const impactClock=motionState(motionCues([...rounds,{at:Math.round(at),victims,dis,streaks:[]}]),Math.round(at)).clock;
    const streaks=dis.id==='lightning'||dis.id==='meteor'?victims.map(id=>{
      const p=actorMotion(players[id],impactClock),fromX=p.x-(dis.id==='meteor'?25:0),pts:number[][]=[[fromX,0]];
      for(let j=1;j<7;j++)pts.push([fromX+(p.x-fromX)*j/7+rand()*8-4,p.y*j/7+rand()*3-1.5]);pts.push([p.x,p.y]);
      const br:string[]=[];const count=2+Math.floor(rand()*2);
      for(let b=0;b<count;b++){const start=pts[1+Math.floor(rand()*(pts.length-3))],dir=rand()<.5?-1:1,bp=[start];let x=start[0],y=start[1];for(let j=0;j<3;j++){x+=dir*(3+rand()*5);y+=4+rand()*6;bp.push([x,y]);}br.push(bp.map(p=>p.join(',')).join(' '));}
      return {id,pts:pts.map(p=>p.join(',')).join(' '),br:dis.id==='meteor'?[]:br};
    }):[];
    rounds.push({at:Math.round(at),victims,dis,streaks});at+=(legacy?legacySurvivalGapMs(pool.length):previous?previousSurvivalGapMs(pool.length):compact?compactSurvivalGapMs(pool.length):survivalGapMs(pool.length,rounds.length-1))*pace.scale;
  }
  return {players,winnerIds,rounds,durationMs:legacy||previous||compact?pace.durationMs:calculateEventDurationMs('survival',input.participants,input.winners,seed)};
}
export function sampleSurvivalScene(scene:SurvivalScene,elapsedMs:number){
  const done=elapsedMs>=scene.durationMs,dead=new Map<number,string>();let latest:Round|undefined;
  for(const r of scene.rounds){if(r.at>elapsedMs)break;latest=r;for(const id of r.victims)dead.set(id,r.dis.id);}
  const age=latest?elapsedMs-latest.at:Infinity;
  const nextIndex=scene.rounds.findIndex(r=>r.at>elapsedMs),next=scene.rounds[nextIndex];
  const warnStart=next?warningStart(scene.rounds,nextIndex):Infinity;
  const warning=!done&&elapsedMs>=0&&!!next&&elapsedMs>=warnStart;
  const cues=motionCues(scene.rounds),motion=motionState(cues,Math.min(scene.durationMs,elapsedMs));
  const beat=done?'winner':elapsedMs<0?'waiting':warning?'warning':age<850?'impact':elapsedMs<4200?'opening':next?'breather':'finale';
  const players=scene.players.map(p=>{
    const eliminated=done?!scene.winnerIds.includes(p.id):dead.has(p.id);
    const hit=!done&&age<850&&!!latest?.victims.includes(p.id);
    // Impact freezes at the struck position, matching the bolt and reaction artwork.
    const position=actorMotion(p,hit?motionState(cues,latest!.at).clock:motion.clock);
    return {...p,...position,strideElapsedMs:motion.clock+p.id%5*170,dead:eliminated,hit,dtype:dead.get(p.id)||null,pose:done?'rest' as const:motion.pose};
  });
  // The headline is a count of visible survivors. Keep the full stage framed so
  // an impact cannot temporarily crop living actors and make that count look wrong.
  const camera={scale:1,x:50,y:50,left:0,right:100,top:0,bottom:100};
  return {phase:done?'done' as const:elapsedMs<0?'ready' as const:'running' as const,players,winners:done?scene.winnerIds.map(id=>players[id]):[],
    fx:!done&&latest&&age<850?{type:latest.dis.id,key:latest.at,streaks:latest.streaks,accent:latest.dis.accent}:null,
    bursts:!done&&latest&&age<(['lightning','wave','wind'].includes(latest.dis.id)?800:650)?latest.victims.map(id=>({id:id+'-'+latest!.at,x:players[id].x,y:players[id].y,emoji:latest!.dis.emoji,accent:latest!.dis.accent,dtype:latest!.dis.id})):[],
    shaking:!done&&age<320&&!!latest&&['meteor','lightning'].includes(latest.dis.id),
    beat,
    motionSpeed:done?0:motion.speed,
    camera,
    warning:warning?{type:next!.dis.id,remainingMs:next!.at-elapsedMs,progress:(elapsedMs-warnStart)/(next!.at-warnStart)}:null,
    message:warning?{label:next!.dis.id==='wave'?'🌊 멀리서 파도가 다가옵니다… 피하세요!':next!.dis.id==='hail'?'❄️ 우박 주의! 몸을 낮추세요!':next!.dis.id==='wind'?'🌪️ 바람이 거세집니다… 도망가요!':next!.dis.id==='meteor'?'☄️ 하늘을 보세요… 운석 접근!':'⛈️ 먹구름이 몰려옵니다… 조심하세요!',dead:[]}:latest?{label:latest.dis.label,dead:latest.victims.map(id=>players[id].name)}:null};
}

// Dialogue uses the visible scene only, never future victims or winner identity.
export function survivalDialogue(frame:ReturnType<typeof sampleSurvivalScene>,elapsedMs:number):{actorId:number;text:string;impact:boolean}[]{
 if(frame.phase!=='running'||!Number.isFinite(elapsedMs))return [];
 const lines:Record<string,string[][]>={
  lightning:[['번개다! 도망쳐!','으악! 번개 온다!'],['빨리! 여기 피해!','몸 낮춰! 조심해!'],['으아악!!','꺄악!!']],
  wave:[['파도 온다! 뛰어!','물이야! 도망쳐!'],['같이 가! 빨리!','높은 곳으로 피해!'],['살려줘!!','으아악!!']],
  wind:[['회오리다! 피해!','바람에 날아가겠어!'],['꽉 잡아! 놓지 마!','살려줘! 도망쳐!'],['꺄아악!!','으아악!!']],
  hail:[['우박이야! 피해!','으악! 머리 조심!'],['몸 낮춰! 빨리!','여기로 피해! 어서!'],['아악!!','으악!!']],
  meteor:[['운석이다! 도망쳐!','위험해! 위를 봐!'],['거기서 비켜! 빨리!','으악! 떨어진다!'],['으아악!!','꺄악!!']],
 };
 const warning=frame.warning;
 const type=warning?.type||frame.fx?.type;
 if(!type||!lines[type])return [];
 const impact=!warning;
 const key=impact?frame.fx!.key:Math.round(elapsedMs+warning!.remainingMs);
 const age=impact?elapsedMs-key:warning!.progress;
 if(impact&&(age<0||age>220)||!impact&&(age<.12||age>.95))return [];
 const candidates=impact?frame.bursts.map(b=>Number(b.id.split('-')[0])):frame.players.filter(p=>!p.dead).map(p=>p.id);
 const rand=seededRandom(key*31+17),ordered=[...candidates].sort((a,b)=>a-b);
 // Separate selection stream: dialogue cannot affect draw results or movement.
 for(let i=ordered.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
 const picked:number[]=[];
 for(const id of ordered){
  const p=frame.players[id];
  if(picked.every(other=>Math.hypot(p.x-frame.players[other].x,p.y-frame.players[other].y)>22))picked.push(id);
  if(picked.length===2)break;
 }
 return picked.flatMap((actorId,i)=>{
  if(!impact&&(i===0?age>.73:age<.42))return [];
  const stage=impact?2:i;
  return [{actorId,text:lines[type][stage][(key+actorId)%lines[type][stage].length],impact}];
 });
}
