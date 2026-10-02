"use client";
import SurvivalDisasterSprite from './SurvivalDisasterSprite';
import SurvivalCharacter,{survivalCharacterSize} from './SurvivalCharacter';

export function SurvivalReactionStyles(){return <style>{`
@keyframes reactionZap{0%{transform:scale(.9) rotate(-6deg);opacity:1}18%{transform:scale(1.12) rotate(7deg)}36%{transform:scale(1.05) rotate(-7deg)}65%{transform:translateY(-7px) rotate(5deg);opacity:1}100%{transform:translateY(28px) rotate(35deg) scale(.6);opacity:0}}
@keyframes reactionXray{0%,10%{opacity:0}18%,64%{opacity:1}88%,100%{opacity:0}}
@keyframes reactionWash{0%{transform:translate(-8px,-4px) rotate(-10deg);opacity:1}18%{transform:translate(18px,-18px) rotate(25deg)}40%{transform:translate(65px,8px) rotate(95deg);opacity:1}65%{transform:translate(125px,30px) rotate(160deg);opacity:.9}100%{transform:translate(220px,65px) rotate(220deg) scale(.55);opacity:0}}
@keyframes reactionWind{0%{transform:translate(0,0) rotate(-14deg);opacity:1}18%{transform:translate(-24px,-12px) rotate(60deg)}36%{transform:translate(28px,-45px) rotate(165deg)}54%{transform:translate(-20px,-80px) rotate(300deg);opacity:1}72%{transform:translate(36px,-120px) rotate(470deg);opacity:.85}100%{transform:translate(165px,-210px) rotate(720deg) scale(.35);opacity:0}}
@keyframes reactionHail{0%{transform:scale(1);opacity:1}15%{transform:translateY(8px) scale(1.2,.7)}35%{transform:translateY(-18px) scale(.85,1.2)}60%{transform:translateY(5px) rotate(-12deg);opacity:1}100%{transform:translateY(26px) rotate(65deg) scale(.65);opacity:0}}
@keyframes reactionMeteor{0%{transform:translate(4px,4px) scale(1.2,.8);opacity:1}28%{transform:translate(-20px,-30px) rotate(-45deg)}100%{transform:translate(-110px,55px) rotate(-240deg) scale(.3);opacity:0}}
@keyframes reactionRing{0%{transform:scale(.35);opacity:0}20%{transform:scale(1);opacity:1}100%{transform:scale(1.8);opacity:0}}
@keyframes reactionVortex{0%{transform:scale(.35);opacity:0}18%{transform:scale(1);opacity:.8}65%{transform:translateY(-35px) scale(.95);opacity:.75}100%{transform:translateY(-110px) scale(.6);opacity:0}}
@media(prefers-reduced-motion:reduce){[data-survival-reaction] *{animation:none!important}[data-reaction-xray]{display:none!important}}
`}</style>}

// Original code-native cartoon reaction, not a copy of the supplied watermarked image.
function ShockSkeleton(){return <svg data-reaction-xray viewBox="0 0 100 130" aria-hidden="true" style={{position:'absolute',inset:'-12% -12%',width:'124%',height:'124%',animation:'reactionXray .78s ease-out both'}}>
 <path d="M48 4C22 0 18 17 24 36L20 51L7 43L1 52L21 68L30 61L27 82L16 101L24 121L37 125L43 112L35 99L48 91L58 100L53 119L70 126L79 118L71 106L77 86L65 67L71 49L86 32L90 12L80 8L73 27L62 37C74 12 68 6 48 4Z" fill="#302119" stroke="#160f0d" strokeWidth="2"/>
 <g fill="#fff6da" stroke="#fff6da" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
  <path d="M48 42L48 77M34 55L59 55M34 63L57 63M37 70L57 70M30 55L15 52M64 46L79 29M79 29L81 18M39 84L29 102L33 115M56 84L65 99L64 116" fill="none"/>
  <ellipse cx="48" cy="80" rx="12" ry="5" fill="none"/>
  <path d="M34 13Q46 2 59 13Q68 27 58 36L57 42H40L38 36Q24 29 34 13Z" strokeWidth="2"/>
 </g>
 <g fill="#302119"><ellipse cx="39" cy="24" rx="5" ry="6"/><ellipse cx="56" cy="24" rx="5" ry="6"/><path d="M46 30L42 35H50Z"/><path d="M45 37H47V43H45ZM51 37H53V43H51Z"/></g>
</svg>}

export default function SurvivalReaction({type,index,total,x,y,ageMs=0}:{type:string;index:number;total:number;x:number;y:number;ageMs?:number}){
 const animation=type==='wave'?'reactionWash':type==='wind'?'reactionWind':type==='hail'?'reactionHail':type==='meteor'?'reactionMeteor':'reactionZap';
 const size=survivalCharacterSize(total);
 return <div data-survival-reaction={type} data-event-local-age style={{position:'absolute',left:`${x}%`,top:`${y}%`,transform:'translate(-50%,-50%)',width:size,aspectRatio:'1',zIndex:27,pointerEvents:'none'}}>
  {type==='wind'?<div data-reaction-vortex style={{position:'absolute',left:'-75%',bottom:'-15%',width:'250%',animation:'reactionVortex .78s ease-out both'}}><SurvivalDisasterSprite kind="tornado" ageMs={ageMs}/></div>:null}
  <div data-reaction-body style={{position:'relative',width:'100%',height:'100%',animation:`${animation} ${['lightning','wave','wind'].includes(type)?'.78':'.62'}s ease-out both`}}>
   {type==='lightning'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-35%',width:'170%',height:'170%',animation:'reactionRing .78s ease-out both'}}><path d="M50 0L57 27L77 9L70 35L100 28L77 48L99 63L72 63L83 92L59 75L48 100L41 75L16 92L29 65L0 66L24 49L1 30L32 35L21 8L43 27Z" fill="#ffe733"/></svg>:null}
   <SurvivalCharacter index={index} total={total} sizeOverride="100%" moving pose="run"/>
   {type==='lightning'?<ShockSkeleton/>:null}
   {type==='wave'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-20%',width:'140%',height:'140%'}}><path d="M0 78Q25 62 43 78T100 76" fill="none" stroke="#bff6ff" strokeWidth="6"/>{[10,28,70,90].map((cx,i)=><circle key={cx} cx={cx} cy={18+i*14} r={4+i%2*2} fill="none" stroke="#c9f9ff" strokeWidth="2"/>)}</svg>:null}
   {type==='hail'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-35% -15%',width:'130%',height:'130%',animation:'reactionRing .62s ease-out both'}}><path d="M50 2L56 19L75 15L62 31L75 44L57 40L50 58L43 40L25 44L38 31L25 15L44 19Z" fill="#ffef72" stroke="#ee9e39" strokeWidth="2"/><path d="M8 23L12 31L20 32L14 38L15 46L8 42L1 46L3 38L0 32L5 31M89 30L93 38L100 39L95 45L96 52L89 49L82 52L84 45L79 39L87 38" fill="#fff5a1"/></svg>:null}
   {type==='meteor'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-40%',width:'180%',height:'180%',animation:'reactionRing .62s ease-out both'}}><path d="M50 0L62 28L89 14L77 40L100 52L73 62L88 90L59 77L48 100L38 75L11 91L24 61L0 49L27 39L12 12L40 25Z" fill="#ffb342" opacity=".8"/></svg>:null}
  </div>
 </div>;
}
