"use client";
import {eventSeed,seededRandom} from '@/lib/eventPlayback';

export type SurvivalVisualFx={type:string;key:number;accent:string;streaks:{id:number;pts:string;br:string[]}[]};
export function SurvivalArtStyles(){return <style>{`
 @keyframes survivalAvatarHit{0%{transform:scale(1)}25%{transform:translateY(-8px) rotate(-12deg)}60%{transform:rotate(12deg)}100%{transform:scale(.8)}}
 @keyframes survivalAvatarWin{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
 @keyframes survivalAvatarIdle{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-3px) rotate(2deg)}}
 @keyframes survivalStormPulse{0%,100%{opacity:0}18%{opacity:.32}38%{opacity:.12}65%{opacity:0}}
 @keyframes survivalBolt{0%{opacity:0}12%{opacity:1}55%{opacity:.85}100%{opacity:0}}
 @keyframes survivalWave{0%{transform:translateX(-110%)}100%{transform:translateX(130%)}}
 @keyframes survivalTornado{0%{transform:translateX(-110%) rotate(-8deg);opacity:0}20%{opacity:.9}100%{transform:translateX(180%) rotate(8deg);opacity:0}}
 @keyframes survivalImpact{0%{transform:scale(.25);opacity:0}25%{transform:scale(1.15);opacity:1}100%{transform:scale(1.8);opacity:0}}
 @keyframes survivalDebris{0%{transform:translate(0,0) rotate(0);opacity:0}15%{opacity:1}100%{transform:translate(150px,-50px) rotate(220deg);opacity:0}}
 @keyframes survivalMeteor{0%{transform:translate(-50%,-80%);opacity:0}15%{opacity:1}100%{transform:translate(100%,100%);opacity:0}}
 @keyframes survivalHail{0%{transform:translateY(-5vh);opacity:0}15%{opacity:1}100%{transform:translateY(88vh);opacity:0}}
 @media(prefers-reduced-motion:reduce){[data-survival-art] *{animation:none!important;filter:none!important}[data-survival-flash]{display:none!important}}
 `}</style>}

// Bounded visual layers, seeded independently. Server scene and result are immutable.
export default function SurvivalDisaster({fx}:{fx:SurvivalVisualFx}){
 const rand=seededRandom(eventSeed('visual:'+fx.key));
 const lightning=fx.type==='lightning',meteor=fx.type==='meteor';
 return <div data-survival-art data-disaster={fx.type} key={fx.key+':'+fx.type} style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:22}}>
  <div style={{position:'absolute',inset:0,background:lightning?'linear-gradient(#0c1434cc,transparent 55%)':fx.type==='wave'?'linear-gradient(transparent,#073a6a66)':fx.type==='wind'?'radial-gradient(ellipse,#527e8580,transparent 75%)':'none'}}/>
  {lightning&&<>
   <div data-survival-flash style={{position:'absolute',inset:0,background:'#bdeeff',animation:'survivalStormPulse .8s ease-out both'}}/>
   <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height:'100%',position:'absolute',inset:0,animation:'survivalBolt .82s ease-out both'}}>
    {fx.streaks.slice(0,24).map(s=><g key={s.id}>
     <polyline points={s.pts} fill="none" stroke="#3489ff" strokeWidth="12" opacity=".42" vectorEffect="non-scaling-stroke"/>
     <polyline points={s.pts} fill="none" stroke="#9eeaff" strokeWidth="5" vectorEffect="non-scaling-stroke"/>
     <polyline points={s.pts} fill="none" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
     {s.br.map((br,i)=><polyline key={i} points={br} fill="none" stroke="#baf1ff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}
    </g>)}
   </svg>
  </>}
  {fx.type==='wave'&&<>
   {[0,1].map(layer=><svg key={layer} viewBox="0 0 600 400" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:layer?.8:1,animation:`survivalWave ${layer? .82:.68}s ease-out ${layer?.08:0}s both`}}>
    <path d="M0 400V170C80 170 125 180 160 135C215 60 160 15 115 65C145 -5 245 -20 298 70C332 128 318 190 357 210C420 243 462 190 520 230L600 270V400Z" fill={layer?'#086bb9':'#219edf'}/>
    <path d="M0 170C80 170 125 180 160 135C215 60 160 15 115 65C145 -5 245 -20 298 70C332 128 318 190 357 210C420 243 462 190 520 230L600 270" fill="none" stroke="#d5f9ff" strokeWidth="18"/>
    <path d="M10 220Q105 240 175 180M220 300Q300 230 410 290M360 350Q460 295 595 340" fill="none" stroke="#7ee2ff" strokeWidth="9" opacity=".7"/>
   </svg>)}
   {Array.from({length:24},(_,i)=><i key={i} style={{position:'absolute',left:`${rand()*100}%`,top:`${30+rand()*60}%`,width:5+i%5,height:10+i%7,borderRadius:'60% 60% 80% 80%',background:'#d5f9ff',animation:`survivalDebris .7s ease-out ${i%4*.03}s both`}}/>)}
  </>}
  {fx.type==='wind'&&<>
   <svg viewBox="0 0 300 420" style={{position:'absolute',left:0,bottom:'8%',height:'80%',width:'60%',animation:'survivalTornado .82s ease-out both'}}>
    <path d="M15 30Q150 -20 290 35L220 190L170 380L120 410L100 250Z" fill="#bfe9eb" opacity=".3"/>
    {Array.from({length:10},(_,i)=><ellipse key={i} cx={150+Math.sin(i)*8} cy={35+i*35} rx={130-i*10} ry={18-i*.9} fill="none" stroke={i%2?'#efffff':'#88c8d0'} strokeWidth={6-i*.35} opacity=".85"/>)}
   </svg>
   {Array.from({length:16},(_,i)=><span key={i} style={{position:'absolute',left:`${rand()*70}%`,top:`${rand()*85}%`,color:'#ceeaca',fontSize:12+i%3*5,animation:`survivalDebris .8s ease-out ${i%4*.03}s both`}}>🍃</span>)}
  </>}
  {fx.type==='hail'&&Array.from({length:36},(_,i)=><i key={i} style={{position:'absolute',top:'-10%',left:`${rand()*100}%`,width:8+i%5*2,height:8+i%5*2,borderRadius:'40%',background:'linear-gradient(135deg,#fff,#96cfff)',border:'1px solid #dff6ff',boxShadow:'0 0 8px #c4e9ff80',animation:`survivalHail ${.6+rand()*.18}s linear ${i%5*.02}s both`}}/>)}
  {meteor&&<>
   {fx.streaks.slice(0,20).map(s=><svg key={s.id} viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',animation:'survivalBolt .8s ease-out both'}}><polyline points={s.pts} fill="none" stroke="#e54425" strokeWidth="20" opacity=".22" vectorEffect="non-scaling-stroke"/><polyline points={s.pts} fill="none" stroke="#ffae38" strokeWidth="5" vectorEffect="non-scaling-stroke"/></svg>)}
   <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 80%,#ff711966,transparent 65%)',animation:'survivalBolt .8s ease-out both'}}/>
  </>}
 </div>;
}
