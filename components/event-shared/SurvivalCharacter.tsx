"use client";

// Display identity only. Never use this index for elimination, winner selection or payouts.
const OFFICIALS = [['짱구','01'],['철수','10'],['유리','11'],['훈이','13'],['맹구','12'],['봉미선','03'],['신형만','02'],['짱아','04'],['흰둥이','05'],['키티','kitty'],['봉미소','06'],['원장 선생님','09'],['채성아 선생님','07'],['나미리 선생님','08'],['차은주 선생님','15'],['수지','14'],['흑곰','16'],['이슬이','17'],['옆집 아주머니','22'],['민희와 정훈','23'],['오수','21'],['붉은장미 삼총사','18'],['액션가면','24'],['미미','25'],['부리부리 대마왕','26']];
const HUMAN_ROLES = ['꼬마 모험가','도시 주민','판타지 탐험가','발명가','운동선수','예술가','일하는 이웃','마법사','여행가','요리·정원사'];
const DOOLY_CAST = ['둘리','또치','희동이','고길동','도우너','마이콜'];
const EXTRAS = Array.from({length:80},(_,i)=>i<6?DOOLY_CAST[i]:`창작 ${HUMAN_ROLES[Math.floor(i/8)]} ${i%8+1}`);

const FEATURED_CAST=['쿠로미','마이멜로디','폼폼푸린','시나모롤','포차코','한교동','케로케로케로피','구데타마','배드바츠마루','턱시도샘','코기뮹','딩구리데이즈','키키','라라','페어리루 립','페어리루 해바라기','어그레츠코','꿈속의 뮤','꺼먹살이'];
// Only identities with verified multi-frame locomotion participate. Archive assets stay intact.
const ACTIVE_SOURCE_INDICES=[...Array.from({length:28},(_,i)=>i),...Array.from({length:7},(_,i)=>i+41),...Array.from({length:10},(_,i)=>i+31),...Array.from({length:32},(_,i)=>i+49)];
export const SURVIVAL_CHARACTER_COUNT = ACTIVE_SOURCE_INDICES.length;
export function survivalCharacterSize(total:number){
  return total<=12?'clamp(44px,18cqw,120px)':total<=24?'clamp(36px,13cqw,92px)':total<=48?'clamp(30px,10cqw,76px)':total<=100?'clamp(14px,8cqw,68px)':'clamp(12px,5cqw,52px)';
}
// Measured transparent row separators in the 1122 × 1402 source, not a uniform grid.
const ATLAS_ROW_EDGES = [0,132,280,427,575,725,875,1029,1164,1285,1402];
// Lead characters from each requested series come first, even for a tiny roster.
// Identity remains tied to participant index; survivor count only controls size.
const LEAD_ORDER = [0,9,10,8,1,2,3,4,5,6,7,11,12,13,14,15,105,106,107,108,109,110,111,112,113,114,115,116];
// Swap only unanimated secondary slots, retaining the displaced original people.
const EXTRA_PRIORITY:Record<number,number>={41:117,42:118,43:119,44:120,45:121,46:122,47:123,117:41,118:42,119:43,120:44,121:45,122:46,123:47};
const RUN_CYCLE_ROWS:Record<string,number>={'키티':0,'둘리':1,'흰둥이':2,'철수':3,'유리':4,'맹구':5};
const FAMILY_CYCLE_ROWS:Record<string,number>={'훈이':0,'봉미선':1,'신형만':2};
const DOOLY_CYCLE_ROWS:Record<string,number>={'또치':0,'희동이':1,'고길동':2};
const LAST_CYCLE_ROWS:Record<string,number>={'짱아':0,'도우너':1,'마이콜':2};
const EXPLORER_CYCLE_ROWS:Record<string,number>={'창작 꼬마 모험가 7':0,'창작 꼬마 모험가 8':1};
const CITY_CYCLE_ROWS:Record<string,number>={'창작 도시 주민 1':0,'창작 도시 주민 2':1};
// Measured transparent boundaries, not the grid requested from the image generator.
const CITY_B_CYCLE={asset:'/event-art/survival-city-b-run-cycle-v1.png',rows:3,edges:[0,339,632,941],columns:[0,211,426,629,835,1048,1254,1457,1672],width:1672,height:941};
const CITY_C_CYCLE={asset:'/event-art/survival-city-c-run-cycle-v1.png',rows:3,edges:[0,330,630,941],columns:[0,209,420,625,835,1050,1259,1464,1672],width:1672,height:941};
const SANRIO_A_CYCLE={asset:'/event-art/survival-sanrio-a-run-cycle-v1.png',rows:3,edges:[0,260,515,768],columns:[0,268,524,772,1033,1289,1539,1794,2048],width:2048,height:768};
const SANRIO_B_CYCLE={asset:'/event-art/survival-sanrio-b-run-cycle-v1.png',rows:3,edges:[0,245,502,768],columns:[0,255,507,763,1017,1265,1517,1774,2048],width:2048,height:768};
const SANRIO_C_CYCLE={asset:'/event-art/survival-sanrio-c-run-cycle-v1.png',rows:6,edges:[0,194,357,547,734,884,1086],columns:[0,187,368,552,737,922,1107,1284,1448],width:1448,height:1086};
const FEATURED_D_CYCLE={asset:'/event-art/survival-featured-d-run-cycle-v1.png',rows:7,edges:[0,177,347,501,677,846,1016,1174],columns:[0,184,353,520,682,847,1008,1167,1340],width:1340,height:1174};
const INVENTORS_A_CYCLE={asset:'/event-art/survival-inventors-a-run-cycle-v1.png',rows:3,edges:[0,264,513,768],columns:[0,271,525,773,1031,1294,1550,1794,2048],width:2048,height:768};
const INVENTORS_B_CYCLE={asset:'/event-art/survival-inventors-b-run-cycle-v1.png',rows:5,edges:[0,220,420,620,811,992],columns:[0,202,403,599,795,993,1197,1388,1585],width:1585,height:992};
const ATHLETES_CYCLE={asset:'/event-art/survival-athletes-run-cycle-v1.png',rows:8,edges:[0,172,332,491,652,811,964,1102,1254],columns:[0,162,316,471,627,788,941,1098,1254],width:1254,height:1254};
const ARTISTS_CYCLE={asset:'/event-art/survival-artists-run-cycle-v1.png',rows:8,edges:[0,174,330,486,645,798,958,1099,1254],columns:[0,161,320,477,633,785,941,1097,1254],width:1254,height:1254};
const WORKERS_CYCLE={asset:'/event-art/survival-workers-run-cycle-v1.png',rows:8,edges:[0,171,322,478,641,802,960,1098,1254],columns:[0,166,324,479,632,784,939,1092,1254],width:1254,height:1254};
const EXTRA_CYCLES:Record<string,typeof CITY_B_CYCLE & {row:number}>={
 '창작 일하는 이웃 1':{...WORKERS_CYCLE,row:0},'창작 일하는 이웃 2':{...WORKERS_CYCLE,row:1},'창작 일하는 이웃 3':{...WORKERS_CYCLE,row:2},'창작 일하는 이웃 4':{...WORKERS_CYCLE,row:3},
 '창작 일하는 이웃 5':{...WORKERS_CYCLE,row:4},'창작 일하는 이웃 6':{...WORKERS_CYCLE,row:5},'창작 일하는 이웃 7':{...WORKERS_CYCLE,row:6},'창작 일하는 이웃 8':{...WORKERS_CYCLE,row:7},
 '창작 예술가 1':{...ARTISTS_CYCLE,row:0},'창작 예술가 2':{...ARTISTS_CYCLE,row:1},'창작 예술가 3':{...ARTISTS_CYCLE,row:2},'창작 예술가 4':{...ARTISTS_CYCLE,row:3},
 '창작 예술가 5':{...ARTISTS_CYCLE,row:4},'창작 예술가 6':{...ARTISTS_CYCLE,row:5},'창작 예술가 7':{...ARTISTS_CYCLE,row:6},'창작 예술가 8':{...ARTISTS_CYCLE,row:7},
 '창작 운동선수 1':{...ATHLETES_CYCLE,row:0},'창작 운동선수 2':{...ATHLETES_CYCLE,row:1},'창작 운동선수 3':{...ATHLETES_CYCLE,row:2},'창작 운동선수 4':{...ATHLETES_CYCLE,row:3},
 '창작 운동선수 5':{...ATHLETES_CYCLE,row:4},'창작 운동선수 6':{...ATHLETES_CYCLE,row:5},'창작 운동선수 7':{...ATHLETES_CYCLE,row:6},'창작 운동선수 8':{...ATHLETES_CYCLE,row:7},
 '창작 발명가 4':{...INVENTORS_B_CYCLE,row:0},'창작 발명가 5':{...INVENTORS_B_CYCLE,row:1},'창작 발명가 6':{...INVENTORS_B_CYCLE,row:2},'창작 발명가 7':{...INVENTORS_B_CYCLE,row:3},'창작 발명가 8':{...INVENTORS_B_CYCLE,row:4},
 '창작 발명가 1':{...INVENTORS_A_CYCLE,row:0},'창작 발명가 2':{...INVENTORS_A_CYCLE,row:1},'창작 발명가 3':{...INVENTORS_A_CYCLE,row:2},
 '창작 도시 주민 3':{...CITY_B_CYCLE,row:0},'창작 도시 주민 4':{...CITY_B_CYCLE,row:1},'창작 도시 주민 5':{...CITY_B_CYCLE,row:2},
 '창작 도시 주민 6':{...CITY_C_CYCLE,row:0},'창작 도시 주민 7':{...CITY_C_CYCLE,row:1},'창작 도시 주민 8':{...CITY_C_CYCLE,row:2},
 '쿠로미':{...SANRIO_A_CYCLE,row:0},'마이멜로디':{...SANRIO_A_CYCLE,row:1},'폼폼푸린':{...SANRIO_A_CYCLE,row:2},
 '시나모롤':{...SANRIO_B_CYCLE,row:0},'포차코':{...SANRIO_B_CYCLE,row:1},'한교동':{...SANRIO_B_CYCLE,row:2},
 '케로케로케로피':{...SANRIO_C_CYCLE,row:0},'구데타마':{...SANRIO_C_CYCLE,row:1},'배드바츠마루':{...SANRIO_C_CYCLE,row:2},
 '턱시도샘':{...SANRIO_C_CYCLE,row:3},'코기뮹':{...SANRIO_C_CYCLE,row:4},'딩구리데이즈':{...SANRIO_C_CYCLE,row:5},
 '키키':{...FEATURED_D_CYCLE,row:0},'라라':{...FEATURED_D_CYCLE,row:1},'페어리루 립':{...FEATURED_D_CYCLE,row:2},'페어리루 해바라기':{...FEATURED_D_CYCLE,row:3},
 '어그레츠코':{...FEATURED_D_CYCLE,row:4},'꿈속의 뮤':{...FEATURED_D_CYCLE,row:5},'꺼먹살이':{...FEATURED_D_CYCLE,row:6},
};
// Fully transparent separator rows measured across the 2048 × 768 source.
const DOOLY_RUN_EDGES=[0,231,468,768];
const LAST_RUN_EDGES=[0,228,485,768];
const LEAD_RUN_EDGES=[0,175,371,525,717,897,1086];
const LEAD_RUN_COLUMNS=[0,187,364,545,718,893,1078,1251,1448];
const CITY_RUN_COLUMNS=[0,250,512,768,1024,1280,1536,1792,2048];
const castOrders=new Map<number,number[]>();
function castOrder(seed?:number){
 if(seed===undefined)return ACTIVE_SOURCE_INDICES;
 const key=Number.isFinite(seed)?seed>>>0:0,cached=castOrders.get(key);
 if(cached)return cached;
 const order=ACTIVE_SOURCE_INDICES.slice();let state=key;
 // Independent display PRNG: never consumes the draw's selection randomness.
 for(let i=34;i>0;i--){state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);const j=Math.floor(((t^(t>>>14))>>>0)/4294967296*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 if(castOrders.size>=32)castOrders.delete(castOrders.keys().next().value!);
 castOrders.set(key,order);return order;
}
export function survivalCharacter(index:number,castSeed?:number) {
  const normalized = Number.isFinite(index) ? Math.max(0,Math.floor(index)) % SURVIVAL_CHARACTER_COUNT : 0;
  const sourceIndex=castOrder(castSeed)[normalized];
  const identity=LEAD_ORDER[sourceIndex]??EXTRA_PRIORITY[sourceIndex]??(sourceIndex>=105?sourceIndex-89:sourceIndex);
  const assigned={index:normalized,runCell:identity<16?identity:undefined};
  if(identity>=105){const name=FEATURED_CAST[identity-105],cycle=EXTRA_CYCLES[name];return {...assigned,name,asset:cycle.asset,columns:8,rows:cycle.rows,column:0,row:cycle.row};}
  const officialIndex=identity<10?identity:identity>=16&&identity<31?identity-6:-1;
  if(officialIndex>=0){const [name,id]=OFFICIALS[officialIndex];return {...assigned,name,asset:id==='kitty'?'/event-art/official-v1/hello-kitty.png':`/event-art/official-v1/shinchan-${id}.png`,columns:1,rows:1,column:0,row:0};}
  if(identity<16){const cell=identity-10;return {...assigned,name:EXTRAS[cell],asset:cell===5?'/event-art/michol-cutout-v1.png':'/event-art/dooly-cast-cutouts-v1.png',columns:cell===5?1:3,rows:cell===5?1:2,column:cell%3,row:Math.floor(cell/3)};}
  const cell=identity-25;
  return {...assigned,name:EXTRAS[cell],asset:'/event-art/survival-human-cast-v1.png',columns:8,rows:10,column:cell%8,row:Math.floor(cell/8)};
}

export default function SurvivalCharacter({index,total,castSeed,hit=false,zap=false,winner=false,moving=false,sizeOverride,pose='rest',facing=1,elapsedMs=0}:{index:number;total:number;castSeed?:number;hit?:boolean;zap?:boolean;winner?:boolean;moving?:boolean;sizeOverride?:string;pose?:'look'|'run'|'duck'|'rest';facing?:number;elapsedMs?:number}) {
  const avatar=survivalCharacter(index,castSeed);
  const size=sizeOverride||survivalCharacterSize(total);
  const explorerRow=EXPLORER_CYCLE_ROWS[avatar.name];
  const cityRow=CITY_CYCLE_ROWS[avatar.name];
  const extraCycle=EXTRA_CYCLES[avatar.name];
  const sanrioAvatar=FEATURED_CAST.includes(avatar.name);
  const running=moving&&pose==='run'&&(avatar.runCell!==undefined||explorerRow!==undefined||cityRow!==undefined||extraCycle!==undefined);
  const runCell=avatar.runCell??0;
  const cycleRow=RUN_CYCLE_ROWS[avatar.name];
  const familyRow=FAMILY_CYCLE_ROWS[avatar.name];
  const doolyRow=DOOLY_CYCLE_ROWS[avatar.name];
  const lastRow=LAST_CYCLE_ROWS[avatar.name];
  // One wardrobe for the whole event: idle/look/duck freeze this same sheet,
  // rather than switching back to an unrelated official illustration.
  const multiRun=avatar.name==='짱구'||cycleRow!==undefined||familyRow!==undefined||doolyRow!==undefined||lastRow!==undefined||explorerRow!==undefined||cityRow!==undefined||extraCycle!==undefined;
  const runFrame=running?Math.floor(Math.max(0,Number.isFinite(elapsedMs)?elapsedMs:0)/80)%8:0;
  const cycle=extraCycle??(avatar.name==='짱구'?{asset:'/event-art/shinchan-run-cycle-v1.webp',rows:9,row:1}:cityRow!==undefined?{asset:'/event-art/survival-city-run-cycle-v1.png',rows:2,row:cityRow}:explorerRow!==undefined?{asset:'/event-art/survival-explorers-run-cycle-v1.png',rows:2,row:explorerRow}:lastRow!==undefined?{asset:'/event-art/survival-last-leads-run-cycle-v1.png',rows:3,row:lastRow}:doolyRow!==undefined?{asset:'/event-art/survival-dooly-run-cycle-v1.png',rows:3,row:doolyRow}:familyRow!==undefined?{asset:'/event-art/survival-family-run-cycle-v1.png',rows:3,row:familyRow}:{asset:'/event-art/survival-leads-run-cycle-v2.png',rows:6,row:cycleRow});
  const sprite=multiRun?{...avatar,...cycle,columns:8,column:runFrame}:running?{...avatar,asset:'/event-art/survival-known-run-v1.png',columns:4,rows:4,column:runCell%4,row:Math.floor(runCell/4)}:avatar;
  const measuredCycle=sanrioAvatar||multiRun&&(doolyRow!==undefined||lastRow!==undefined||cycleRow!==undefined||extraCycle!==undefined);
  const edges=measuredCycle?(extraCycle?.edges??(lastRow!==undefined?LAST_RUN_EDGES:doolyRow!==undefined?DOOLY_RUN_EDGES:LEAD_RUN_EDGES)):running?[0,332,675,960,1275]:ATLAS_ROW_EDGES;
  const atlasHeight=measuredCycle?(extraCycle?.height??(cycleRow!==undefined?1086:768)):running?1275:1402;
  const unevenAtlas=measuredCycle||(!multiRun&&(running||sprite.columns===8));
  const rowTop=edges[sprite.row];
  const rowHeight=edges[sprite.row+1]-rowTop;
  const measuredColumns=sanrioAvatar||multiRun&&(cycleRow!==undefined||cityRow!==undefined||extraCycle!==undefined);
  const columns=extraCycle?.columns??(cityRow!==undefined?CITY_RUN_COLUMNS:LEAD_RUN_COLUMNS);
  const atlasWidth=extraCycle?.width??(cityRow!==undefined?2048:1448);
  const displayFrame=multiRun?runFrame:0;
  const columnLeft=measuredColumns?columns[displayFrame]:0;
  const columnWidth=measuredColumns?columns[displayFrame+1]-columnLeft:0;
  const backgroundWidth=measuredColumns?atlasWidth*100/columnWidth:sprite.columns*100;
  const backgroundX=measuredColumns?columnLeft*100/(atlasWidth-columnWidth):sprite.column*100/(sprite.columns-1);
  const aspectRatio=(multiRun||sanrioAvatar)&&extraCycle!==undefined?columnWidth/rowHeight:multiRun&&cityRow!==undefined?columnWidth/384:multiRun&&explorerRow!==undefined?1983/8/(793/2):'1';
  const bodyPose={transform:moving&&pose==='duck'?'scaleY(.8) rotate(-8deg)':moving&&pose==='look'?'rotate(-5deg)':running&&!multiRun?'rotate(6deg)':'none',transformOrigin:'50% 85%'};
  return <div style={{position:'relative',transform:`scaleX(${facing})`}}><div role="img" aria-label={avatar.name} data-survival-art data-survival-character={avatar.index} data-survival-pose={pose} title={avatar.name}
    style={{...bodyPose,width:size,aspectRatio,flexShrink:0,backgroundImage:`url("${sprite.asset}")`,backgroundRepeat:'no-repeat',backgroundSize:sprite.columns===1?'contain':`${backgroundWidth}% ${unevenAtlas?atlasHeight*100/rowHeight:sprite.rows*100}%`,backgroundPosition:sprite.columns===1?'center':`${backgroundX}% ${unevenAtlas?rowTop*100/(atlasHeight-rowHeight):sprite.row*100/(sprite.rows-1)}%`,filter:zap?'brightness(1.8) drop-shadow(0 0 6px #a4eaff)':winner?'drop-shadow(0 0 7px #ffd878)':'drop-shadow(0 3px 2px rgba(0,0,0,.35))',animation:hit?'survivalAvatarHit .65s ease-out':winner?'survivalAvatarWin 1.4s ease-in-out infinite':'none'}}/></div>;
}
