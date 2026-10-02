"use client";
import SurvivalDisasterSprite from './SurvivalDisasterSprite';
import SurvivalCharacter,{survivalCharacterSize} from './SurvivalCharacter';

export function SurvivalReactionStyles(){return <style>{`
@keyframes reactionZap{0%{transform:scale(.9) rotate(-6deg);opacity:1}18%{transform:scale(1.12) rotate(7deg)}36%{transform:scale(1.05) rotate(-7deg)}65%{transform:translateY(-7px) rotate(5deg);opacity:1}100%{transform:translateY(28px) rotate(35deg) scale(.6);opacity:0}}
@keyframes reactionXray{0%,10%{opacity:0}18%,64%{opacity:1}88%,100%{opacity:0}}
@keyframes reactionWash{0%{transform:translate(-8px,-4px) rotate(-10deg);opacity:1}18%{transform:translate(18px,-18px) rotate(25deg)}40%{transform:translate(65px,8px) rotate(95deg);opacity:1}65%{transform:translate(125px,30px) rotate(160deg);opacity:.9}100%{transform:translate(220px,65px) rotate(220deg) scale(.55);opacity:0}}
@keyframes reactionWind{0%{transform:translate(0,0) rotate(-14deg);opacity:1}18%{transform:translate(-24px,-12px) rotate(60deg)}36%{transform:translate(28px,-45px) rotate(165deg)}54%{transform:translate(-20px,-80px) rotate(300deg);opacity:1}72%{transform:translate(36px,-120px) rotate(470deg);opacity:.85}100%{transform:translate(165px,-210px) rotate(720deg) scale(.35);opacity:0}}
@keyframes reactionHail{0%{transform:scale(1);opacity:1}15%{transform:translateY(8px) scale(1.2,.7)}35%{transform:translateY(-18px) scale(.85,1.2)}60%{transform:translateY(5px) rotate(-12deg);opacity:1}100%{transform:translateY(26px) rotate(65deg) scale(.65);opacity:0}}
@keyframes reactionMeteor{0%{transform:translate(0,4px) scale(1.05,.8);opacity:1}20%{transform:translate(0,12px) scale(1.25,.5);opacity:1}36%{transform:translate(-15px,-28px) rotate(-30deg);opacity:1}65%{transform:translate(-65px,-40px) rotate(-130deg);opacity:.9}100%{transform:translate(-110px,55px) rotate(-240deg) scale(.3);opacity:0}}
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

export default function SurvivalReaction({type,index,total,x,y,ageMs=0,castSeed,speech}:{type:string;index:number;total:number;x:number;y:number;ageMs?:number;castSeed?:number;speech?:string}){
 const animation=type==='wave'?'reactionWash':type==='wind'?'reactionWind':type==='hail'?'reactionHail':type==='meteor'?'reactionMeteor':'reactionZap';
 const size=survivalCharacterSize(total);
 return <div data-survival-reaction={type} data-event-local-age style={{position:'absolute',left:`${x}%`,top:`${y}%`,transform:'translate(-50%,-50%)',width:size,aspectRatio:'1',zIndex:27,pointerEvents:'none'}}>
  <svg data-hazard-contact={type} viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-65%',width:'230%',height:'230%',overflow:'visible',opacity:Math.max(0,1-Math.max(0,ageMs-200)/450),pointerEvents:'none'}}>
   {type==='lightning'?<g fill="none" strokeLinejoin="round"><path d="M48 -55L39 -20L52 -27L42 8L54 4L48 40M43 7L24 -1L17 16M49 -22L70 -30L82 -9" stroke="#429eff" strokeWidth="8" opacity=".4"/><path d="M48 -55L39 -20L52 -27L42 8L54 4L48 40M43 7L24 -1L17 16M49 -22L70 -30L82 -9" stroke="#e7fbff" strokeWidth="2"/><ellipse cx="50" cy="47" rx="21" ry="9" stroke="#a4eeff" strokeWidth="2"/></g>:null}
   {type==='meteor'?<g><path d="M-20 -45L47 25L30 39Z" fill="#ff792b" opacity=".8"/><path d="M-10 -35L44 28L36 34Z" fill="#fff3a2"/><path d="M33 20L47 16L58 25L55 39L42 45L29 33Z" fill="#665049" stroke="#ffb249" strokeWidth="3"/><path d="M50 33L66 18L61 41L81 43L65 52L79 72L57 61L49 81L42 59L22 69L33 49L18 39L39 41Z" fill="#ffab2f" opacity=".65"/></g>:null}
   {type==='hail'?<g fill="#dcf5ff" stroke="#85bbdb" strokeWidth="1.5"><path d="M32 -26L29 -4M55 -34L52 -9M72 -21L69 0" stroke="#d6f5ff"/><path d="M27 7L36 2L43 12L38 23L26 21L22 13ZM49 18L59 11L67 22L63 32L52 34L46 26ZM68 2L79 -2L86 8L81 19L68 17L64 9Z"/><path d="M37 30L45 42L57 36L54 48L69 51L54 57L55 71L45 59L33 65L37 52L26 45L40 43Z" fill="#fff6b2" stroke="#f1bc56"/></g>:null}
   {type==='wave'?<g fill="none" stroke="#d9fbff" strokeLinecap="round"><path d="M21 54Q32 45 44 54T73 52M27 62Q40 56 50 63T78 60" strokeWidth="2" opacity=".8"/>{[12,28,48,68,83].map((x,i)=><ellipse key={x} cx={x+Math.min(ageMs,650)/25} cy={38-i%3*9-Math.min(ageMs,650)/40} rx={1.5+i%2} ry="3" fill="#d9fbff" stroke="none" transform={`rotate(${i*23},${x},${38-i%3*9})`}/>)}</g>:null}
   {type==='wind'?<g fill="none" stroke="#b7e4e9" strokeWidth="2" opacity=".8"><path d="M6 27C91 -5 103 49 22 42C-3 36 8 17 71 25M15 51C89 29 96 68 28 62M31 76C82 57 81 86 44 83"/><path d="M-8 38L7 27L1 43M97 48L84 59L90 44"/>{[14,35,64,83].map((x,i)=><path key={x} d={`M${x} ${25+i*13}l7 -4l3 6l-8 4Z`} fill="#aa9270" stroke="none"/>)}</g>:null}
  </svg>
  {type==='meteor'?<svg data-meteor-impact-debris viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-80%',width:'260%',height:'260%',overflow:'visible',opacity:Math.max(0,1-ageMs/620)}}>
   <ellipse cx="50" cy="58" rx={12+Math.min(ageMs,400)/20} ry={4+Math.min(ageMs,400)/70} fill="none" stroke="#ffdd88" strokeWidth="2"/>
   {Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,t=Math.min(ageMs,620)/620,x=50+Math.cos(a)*(6+t*43),y=50+Math.sin(a)*(6+t*33)+t*t*18;return <g key={i} transform={`translate(${x} ${y}) rotate(${i*37+t*240})`}><path d="M-3 -2L1 -4L4 0L2 3L-2 2Z" fill={i%2?'#766054':'#ffb340'} stroke="#ffd080" strokeWidth=".6"/></g>;})}
  </svg>:null}
  {type==='wind'?<div data-reaction-vortex style={{position:'absolute',left:'-75%',bottom:'-15%',width:'250%',animation:'reactionVortex .78s ease-out both'}}><SurvivalDisasterSprite kind="tornado" ageMs={ageMs} variant={index%3} detail={false}/></div>:null}
  {speech&&ageMs<=220?<span data-survival-speech="impact" style={{position:'absolute',left:'50%',bottom:'100%',transform:'translateX(-50%)',whiteSpace:'nowrap',background:'#fff9e7',color:'#241520',border:'3px solid #241520',borderRadius:'12px 12px 12px 2px',padding:'5px 9px',fontWeight:900,fontSize:'clamp(18px,3.4cqw,28px)',boxShadow:'0 3px 0 #241520',zIndex:32}}>{speech}</span>:null}
  <div data-reaction-body style={{position:'relative',width:'100%',height:'100%',animation:`${animation} ${['lightning','wave','wind'].includes(type)?'.78':'.62'}s ease-out both`}}>
   {type==='lightning'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-35%',width:'170%',height:'170%',animation:'reactionRing .78s ease-out both'}}><path d="M50 0L57 27L77 9L70 35L100 28L77 48L99 63L72 63L83 92L59 75L48 100L41 75L16 92L29 65L0 66L24 49L1 30L32 35L21 8L43 27Z" fill="#ffe733"/></svg>:null}
   <div data-reaction-character style={{width:'100%',height:'100%',filter:type==='meteor'&&ageMs>=100?'brightness(.2) sepia(1)':undefined,opacity:type==='lightning'&&ageMs>=140&&ageMs<500?0:1}}><SurvivalCharacter index={index} total={total} castSeed={castSeed} sizeOverride="100%" moving pose="run" elapsedMs={ageMs}/></div>
   {type==='lightning'?<ShockSkeleton/>:null}
   {type==='wave'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-20%',width:'140%',height:'140%'}}><path d="M0 78Q25 62 43 78T100 76" fill="none" stroke="#bff6ff" strokeWidth="6"/>{[10,28,70,90].map((cx,i)=><circle key={cx} cx={cx} cy={18+i*14} r={4+i%2*2} fill="none" stroke="#c9f9ff" strokeWidth="2"/>)}</svg>:null}
   {type==='hail'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-35% -15%',width:'130%',height:'130%',animation:'reactionRing .62s ease-out both'}}><path d="M50 2L56 19L75 15L62 31L75 44L57 40L50 58L43 40L25 44L38 31L25 15L44 19Z" fill="#ffef72" stroke="#ee9e39" strokeWidth="2"/><path d="M8 23L12 31L20 32L14 38L15 46L8 42L1 46L3 38L0 32L5 31M89 30L93 38L100 39L95 45L96 52L89 49L82 52L84 45L79 39L87 38" fill="#fff5a1"/></svg>:null}
   {type==='meteor'?<svg viewBox="0 0 100 100" aria-hidden="true" style={{position:'absolute',inset:'-40%',width:'180%',height:'180%',animation:'reactionRing .62s ease-out both'}}><path d="M50 0L62 28L89 14L77 40L100 52L73 62L88 90L59 77L48 100L38 75L11 91L24 61L0 49L27 39L12 12L40 25Z" fill="#ffb342" opacity=".8"/></svg>:null}
  </div>
 </div>;
}
