"use client";

// Display identity only. Never use this index for elimination, winner selection or payouts.
const OFFICIALS = [['짱구','01'],['철수','10'],['유리','11'],['훈이','13'],['맹구','12'],['봉미선','03'],['신형만','02'],['짱아','04'],['흰둥이','05'],['키티','kitty'],['봉미소','06'],['원장 선생님','09'],['채성아 선생님','07'],['나미리 선생님','08'],['차은주 선생님','15'],['수지','14'],['흑곰','16'],['이슬이','17'],['옆집 아주머니','22'],['민희와 정훈','23'],['오수','21'],['붉은장미 삼총사','18'],['액션가면','24'],['미미','25'],['부리부리 대마왕','26']];
const HUMAN_ROLES = ['꼬마 모험가','도시 주민','판타지 탐험가','발명가','운동선수','예술가','일하는 이웃','마법사','여행가','요리·정원사'];
const DOOLY_CAST = ['둘리','또치','희동이','고길동','도우너','마이콜'];
const EXTRAS = Array.from({length:80},(_,i)=>i<6?DOOLY_CAST[i]:`창작 ${HUMAN_ROLES[Math.floor(i/8)]} ${i%8+1}`);

export const SURVIVAL_CHARACTER_COUNT = OFFICIALS.length + EXTRAS.length;
// Measured transparent row separators in the 1122 × 1402 source, not a uniform grid.
const ATLAS_ROW_EDGES = [0,132,280,427,575,725,875,1029,1164,1285,1402];
export function survivalCharacter(index:number) {
  const normalized = Number.isFinite(index) ? Math.max(0,Math.floor(index)) % SURVIVAL_CHARACTER_COUNT : 0;
  // Required casts come first: 10 Shin-chan/Kitty, six Dooly friends, then remaining casts.
  const officialIndex=normalized<10?normalized:normalized>=16&&normalized<31?normalized-6:-1;
  if(officialIndex>=0){const [name,id]=OFFICIALS[officialIndex];return {index:normalized,name,asset:id==='kitty'?'/event-art/official-v1/hello-kitty.png':`/event-art/official-v1/shinchan-${id}.png`,columns:1,rows:1,column:0,row:0};}
  if(normalized<16){const cell=normalized-10;return {index:normalized,name:EXTRAS[cell],asset:cell===5?'/event-art/michol-cutout-v1.png':'/event-art/dooly-cast-cutouts-v1.png',columns:cell===5?1:3,rows:cell===5?1:2,column:cell%3,row:Math.floor(cell/3)};}
  const cell=normalized<16?normalized-10:normalized-25;
  return {index:normalized,name:EXTRAS[cell],asset:'/event-art/survival-human-cast-v1.png',columns:8,rows:10,column:cell%8,row:Math.floor(cell/8)};
}

export default function SurvivalCharacter({index,total,hit=false,zap=false,winner=false,moving=false,sizeOverride}:{index:number;total:number;hit?:boolean;zap?:boolean;winner?:boolean;moving?:boolean;sizeOverride?:string}) {
  const avatar=survivalCharacter(index);
  const rows=Math.max(1,Math.ceil(Math.max(1,total)/12));
  const size=sizeOverride||`clamp(14px, min(5.6vw, ${52/rows}vh), 68px)`;
  const unevenAtlas=avatar.columns===8;
  const rowTop=ATLAS_ROW_EDGES[avatar.row];
  const rowHeight=ATLAS_ROW_EDGES[avatar.row+1]-rowTop;
  return <div role="img" aria-label={avatar.name} data-survival-art data-survival-character={avatar.index} title={avatar.name}
    style={{width:size,aspectRatio:'1',flexShrink:0,backgroundImage:`url("${avatar.asset}")`,backgroundRepeat:'no-repeat',backgroundSize:avatar.columns===1?'contain':`${avatar.columns*100}% ${unevenAtlas?1402*100/rowHeight:avatar.rows*100}%`,backgroundPosition:avatar.columns===1?'center':`${avatar.column*100/(avatar.columns-1)}% ${unevenAtlas?rowTop*100/(1402-rowHeight):avatar.row*100/(avatar.rows-1)}%`,filter:zap?'brightness(1.8) drop-shadow(0 0 6px #a4eaff)':winner?'drop-shadow(0 0 7px #ffd878)':'drop-shadow(0 3px 2px rgba(0,0,0,.35))',animation:hit?'survivalAvatarHit .65s ease-out':winner?'survivalAvatarWin 1.4s ease-in-out infinite':moving?`survivalAvatarIdle ${1.8+avatar.index%5*.15}s ease-in-out infinite`:'none'}}/>;
}
