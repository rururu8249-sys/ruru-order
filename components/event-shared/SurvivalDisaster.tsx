"use client";
import SurvivalDisasterSprite from './SurvivalDisasterSprite';
import {eventSeed,seededRandom} from '@/lib/eventPlayback';

export type SurvivalVisualFx={type:string;key:number;accent:string;streaks:{id:number;pts:string;br:string[]}[]};
// Pure server-clock progress: no local CSS loop and no knowledge of victims.
export function SurvivalWarning({warning}:{warning:{type:string;progress:number}}){
 const p=Math.max(0,Math.min(1,warning.progress)),wave=warning.type==='wave',meteor=warning.type==='meteor';
 return <div data-survival-warning={warning.type} data-warning-progress={p.toFixed(3)} aria-hidden="true" style={{position:'absolute',inset:0,zIndex:18,pointerEvents:'none',overflow:'hidden',background:`radial-gradient(ellipse at center,transparent 35%,rgba(7,11,28,${.15+p*.3}) 100%)`}}>
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
   {wave?<g transform={`translate(${-28+p*13} 0)`} opacity={.45+p*.45}>
    <path d="M0 100V43Q10 30 16 18Q25 2 32 15Q38 26 23 33Q36 36 40 55L40 100Z" fill="#197eb2"/>
    <path d="M1 43Q10 30 16 18Q25 2 32 15Q38 26 23 33" fill="none" stroke="#c8f6ff" strokeWidth="2"/>
   </g>:meteor?<g opacity={.35+p*.5} transform={`translate(${p*8} ${p*9})`}>
    {[14,46,75].map(x=><g key={x}><path d={`M${x-12} 0L${x} 12`} stroke="#ff8846" strokeWidth="2"/><circle cx={x} cy="12" r="2.5" fill="#ffd06a"/></g>)}
   </g>:warning.type==='wind'?<g fill="none" stroke="#b2dde2" strokeWidth="1" opacity={.3+p*.4} transform={`translate(${-18+p*18} 0)`}>
    {[23,36,49].map(y=><path key={y} d={`M0 ${y}Q20 ${y-7} 42 ${y}T83 ${y}Q96 ${y+8} 85 ${y+12}`}/>)}
   </g>:<g transform={`translate(0 ${-7+p*6})`}>
    <path d="M0 26V0H100V24Q88 33 80 23Q64 33 58 23Q42 35 34 24Q20 34 12 24Q4 30 0 26Z" fill={warning.type==='hail'?'#97b9d8':'#11192f'} opacity={.5+p*.4}/>
    {warning.type==='hail'?Array.from({length:10},(_,i)=><circle key={i} cx={7+i*9} cy={27+(i%3)*3+p*6} r={.8+i%2*.3} fill="#e4f6ff" opacity={.4+p*.5}/>):<path d="M20 18Q40 25 60 17T94 20" fill="none" stroke="#647bb6" strokeWidth=".8" opacity={p*.65}/>}
   </g>}
  </svg>
 </div>;
}
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
 @keyframes survivalHail{0%{transform:translate(0,-15px);opacity:0}15%{opacity:1}82%{opacity:1}100%{transform:translate(-12px,115px);opacity:0}}
 @media(prefers-reduced-motion:reduce){[data-survival-art] *{animation:none!important;filter:none!important}[data-survival-flash]{display:none!important}}
 `}</style>}

// Bounded visual layers, seeded independently. Server scene and result are immutable.
export default function SurvivalDisaster({fx,ageMs=0}:{fx:SurvivalVisualFx;ageMs?:number}){
 const rand=seededRandom(eventSeed('visual:'+fx.key));
 const lightning=fx.type==='lightning',meteor=fx.type==='meteor';
 return <div data-survival-art data-disaster={fx.type} key={fx.key+':'+fx.type} style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:22}}>
  <div style={{position:'absolute',inset:0,background:lightning?'linear-gradient(#0c1434cc,transparent 55%)':fx.type==='wave'?'linear-gradient(transparent,#073a6a66)':fx.type==='wind'?'radial-gradient(ellipse,#527e8580,transparent 75%)':'none'}}/>
  {lightning&&<>
   <div data-survival-flash style={{position:'absolute',inset:0,background:'#bdeeff',animation:'survivalStormPulse .8s ease-out both'}}/>
   <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height:'100%',position:'absolute',inset:0,animation:'survivalBolt .82s ease-out both'}}>
    <defs><filter id={`bolt-glow-${fx.key}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".65"/></filter></defs>
    {fx.streaks.slice(0,24).map(s=><g key={s.id}>
     <polyline points={s.pts} fill="none" stroke="#479cff" strokeWidth="13" opacity=".85" filter={`url(#bolt-glow-${fx.key})`} vectorEffect="non-scaling-stroke"/>
     <polyline points={s.pts} fill="none" stroke="#9eeaff" strokeWidth="4" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
     <polyline points={s.pts} fill="none" stroke="white" strokeWidth="1.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
     {s.br.map((br,i)=><g key={i}><polyline points={br} fill="none" stroke="#6ec5ff" strokeWidth="4" opacity=".65" filter={`url(#bolt-glow-${fx.key})`} vectorEffect="non-scaling-stroke"/><polyline points={br} fill="none" stroke="#e5faff" strokeWidth=".75" vectorEffect="non-scaling-stroke"/></g>)}
     {(()=>{const [x,y]=s.pts.trim().split(/\s+/).at(-1)!.split(',').map(Number);return Number.isFinite(x)&&Number.isFinite(y)?<g data-bolt-contact><circle cx={x} cy={y} r="3.8" fill="#d9fbff" opacity=".38"/><circle cx={x} cy={y} r="1.6" fill="white"/><path d={`M${x-5} ${y+2}L${x-2} ${y}M${x+2} ${y}L${x+5} ${y+2}`} stroke="#b7f5ff" strokeWidth=".6"/></g>:null})()}
    </g>)}
   </svg>
  </>}
  {fx.type==='wave'&&<div data-wave-foam style={{position:'absolute',left:0,bottom:0,width:'130%',animation:'survivalWave .82s ease-out both'}}><SurvivalDisasterSprite kind="tsunami" ageMs={ageMs}/></div>}
  {fx.type==='wind'&&<div data-tornado-funnel data-disaster-sprite="tornado" style={{position:'absolute',left:0,bottom:'8%',width:'80%',animation:'survivalTornado .82s ease-out both'}}><SurvivalDisasterSprite kind="tornado" ageMs={ageMs}/></div>}
  {fx.type==='hail'&&<svg data-hail-field viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
   <defs><radialGradient id={`ice-${fx.key}`} cx="30%" cy="20%"><stop stopColor="white"/><stop offset=".55" stopColor="#cbeaff"/><stop offset="1" stopColor="#688eb9"/></radialGradient></defs>
   {Array.from({length:36},(_,i)=>{const x=rand()*110,y=-12+rand()*22,r=.8+i%5*.25;return <g key={i} style={{animation:`survivalHail ${.6+rand()*.18}s linear ${i%5*.02}s both`}}>
    <path d={`M${x+1} ${y-9}L${x} ${y-2}`} stroke="#dcf5ff" strokeWidth=".5" opacity=".55"/>
    <path d={`M${x-r} ${y}L${x-r*.5} ${y-r}L${x+r*.6} ${y-r*.8}L${x+r} ${y+.3}L${x+.3} ${y+r}L${x-r*.7} ${y+r*.6}Z`} fill={`url(#ice-${fx.key})`} stroke="#effaff" strokeWidth=".18"/>
   </g>})}
  </svg>}
  {meteor&&<>
   {fx.streaks.slice(0,20).map(s=><svg key={s.id} viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',animation:'survivalBolt .8s ease-out both'}}><polyline points={s.pts} fill="none" stroke="#e54425" strokeWidth="20" opacity=".22" vectorEffect="non-scaling-stroke"/><polyline points={s.pts} fill="none" stroke="#ffae38" strokeWidth="5" vectorEffect="non-scaling-stroke"/></svg>)}
   <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 80%,#ff711966,transparent 65%)',animation:'survivalBolt .8s ease-out both'}}/>
  </>}
 </div>;
}
