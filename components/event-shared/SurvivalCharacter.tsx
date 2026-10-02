"use client";

// Display identity only. Never use this index for elimination, winner selection or payouts.
const OFFICIALS = [['짱구','01'],['철수','10'],['유리','11'],['훈이','13'],['맹구','12'],['봉미선','03'],['신형만','02'],['짱아','04'],['흰둥이','05'],['키티','kitty'],['봉미소','06'],['원장 선생님','09'],['채성아 선생님','07'],['나미리 선생님','08'],['차은주 선생님','15'],['수지','14'],['흑곰','16'],['이슬이','17'],['옆집 아주머니','22'],['민희와 정훈','23'],['오수','21'],['붉은장미 삼총사','18'],['액션가면','24'],['미미','25'],['부리부리 대마왕','26']];
const HUMAN_ROLES = ['꼬마 모험가','도시 주민','판타지 탐험가','발명가','운동선수','예술가','일하는 이웃','마법사','여행가','요리·정원사'];
const DOOLY_CAST = ['둘리','또치','희동이','고길동','도우너','마이콜'];
const EXTRAS = Array.from({length:80},(_,i)=>i<6?DOOLY_CAST[i]:`창작 ${HUMAN_ROLES[Math.floor(i/8)]} ${i%8+1}`);

export const SURVIVAL_CHARACTER_COUNT = OFFICIALS.length + EXTRAS.length;
export function survivalCharacterSize(total:number){
  return total<=12?'clamp(44px,18cqw,120px)':total<=24?'clamp(36px,13cqw,92px)':total<=48?'clamp(30px,10cqw,76px)':total<=100?'clamp(14px,8cqw,68px)':'clamp(12px,5cqw,52px)';
}
// Measured transparent row separators in the 1122 × 1402 source, not a uniform grid.
const ATLAS_ROW_EDGES = [0,132,280,427,575,725,875,1029,1164,1285,1402];
// Lead characters from each requested series come first, even for a tiny roster.
// Identity remains tied to participant index; survivor count only controls size.
const LEAD_ORDER = [0,9,10,8,1,2,3,4,5,6,7,11,12,13,14,15];
export function survivalCharacter(index:number) {
  const normalized = Number.isFinite(index) ? Math.max(0,Math.floor(index)) % SURVIVAL_CHARACTER_COUNT : 0;
  const identity=LEAD_ORDER[normalized]??normalized;
  const assigned={index:normalized,runCell:identity<16?identity:undefined};
  const officialIndex=identity<10?identity:identity>=16&&identity<31?identity-6:-1;
  if(officialIndex>=0){const [name,id]=OFFICIALS[officialIndex];return {...assigned,name,asset:id==='kitty'?'/event-art/official-v1/hello-kitty.png':`/event-art/official-v1/shinchan-${id}.png`,columns:1,rows:1,column:0,row:0};}
  if(identity<16){const cell=identity-10;return {...assigned,name:EXTRAS[cell],asset:cell===5?'/event-art/michol-cutout-v1.png':'/event-art/dooly-cast-cutouts-v1.png',columns:cell===5?1:3,rows:cell===5?1:2,column:cell%3,row:Math.floor(cell/3)};}
  const cell=identity-25;
  return {...assigned,name:EXTRAS[cell],asset:'/event-art/survival-human-cast-v1.png',columns:8,rows:10,column:cell%8,row:Math.floor(cell/8)};
}

export default function SurvivalCharacter({index,total,hit=false,zap=false,winner=false,moving=false,sizeOverride,pose='rest',facing=1}:{index:number;total:number;hit?:boolean;zap?:boolean;winner?:boolean;moving?:boolean;sizeOverride?:string;pose?:'look'|'run'|'duck'|'rest';facing?:number}) {
  const avatar=survivalCharacter(index);
  const size=sizeOverride||survivalCharacterSize(total);
  const running=moving&&pose==='run'&&avatar.runCell!==undefined;
  const runCell=avatar.runCell??0;
  const sprite=running?{...avatar,asset:'/event-art/survival-known-run-v1.png',columns:4,rows:4,column:runCell%4,row:Math.floor(runCell/4)}:avatar;
  const edges=running?[0,332,675,960,1275]:ATLAS_ROW_EDGES;
  const atlasHeight=running?1275:1402;
  const unevenAtlas=running||sprite.columns===8;
  const rowTop=edges[sprite.row];
  const rowHeight=edges[sprite.row+1]-rowTop;
  const bodyPose={transform:moving&&pose==='duck'?'scaleY(.8) rotate(-8deg)':moving&&pose==='look'?'rotate(-5deg)':running?'rotate(6deg)':'none',transformOrigin:'50% 85%'};
  return <div style={{position:'relative',transform:`scaleX(${facing})`}}><div role="img" aria-label={avatar.name} data-survival-art data-survival-character={avatar.index} data-survival-pose={pose} title={avatar.name}
    style={{...bodyPose,width:size,aspectRatio:'1',flexShrink:0,backgroundImage:`url("${sprite.asset}")`,backgroundRepeat:'no-repeat',backgroundSize:sprite.columns===1?'contain':`${sprite.columns*100}% ${unevenAtlas?atlasHeight*100/rowHeight:sprite.rows*100}%`,backgroundPosition:sprite.columns===1?'center':`${sprite.column*100/(sprite.columns-1)}% ${unevenAtlas?rowTop*100/(atlasHeight-rowHeight):sprite.row*100/(sprite.rows-1)}%`,filter:zap?'brightness(1.8) drop-shadow(0 0 6px #a4eaff)':winner?'drop-shadow(0 0 7px #ffd878)':'drop-shadow(0 3px 2px rgba(0,0,0,.35))',animation:hit?'survivalAvatarHit .65s ease-out':winner?'survivalAvatarWin 1.4s ease-in-out infinite':'none'}}/></div>;
}
