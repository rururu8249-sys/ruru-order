"use client";
import SurvivalDisasterSprite from './SurvivalDisasterSprite';
import {eventSeed,seededRandom} from '@/lib/eventPlayback';

export type SurvivalVisualFx={type:string;key:number;accent:string;streaks:{id:number;pts:string;br:string[]}[]};
function MeteorRock({x,y,size=6,opacity=1}:{x:number;y:number;size?:number;opacity?:number}){
 return <div data-meteor-rock aria-hidden="true" style={{position:'absolute',left:`${x}%`,top:`${y}%`,width:`${size}%`,aspectRatio:'1',transform:'translate(-50%,-50%) rotate(-25deg)',opacity}}>
  <div style={{position:'absolute',bottom:'30%',left:'5%',width:'90%',height:'360%',background:'linear-gradient(to top,#fff4b5 0%,#ff9d33 25%,#e64c1e66 60%,transparent)',clipPath:'polygon(0 100%,22% 0,42% 44%,63% 2%,80% 46%,100% 100%)',filter:'blur(2px)'}}/>
  <div style={{position:'absolute',inset:'-45%',backgroundImage:'url(/event-art/storm-fire.png)',backgroundSize:'100% 100%'}}/>
  <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 30% 24%,#a3998c,#4a3f39 46%,#211a16 80%)',clipPath:'polygon(13% 9%,56% 0,92% 23%,100% 69%,70% 96%,29% 100%,0 65%,4% 30%)',boxShadow:'inset 3px 3px 4px #d8bda3'}}/>
 </div>;
}
// Pure server-clock progress: no local CSS loop and no knowledge of victims.
export function SurvivalWarning({warning}:{warning:{type:string;progress:number}}){
 const p=Math.max(0,Math.min(1,warning.progress)),wave=warning.type==='wave',meteor=warning.type==='meteor';
 return <div data-survival-warning={warning.type} data-warning-progress={p.toFixed(3)} aria-hidden="true" style={{position:'absolute',inset:0,zIndex:18,pointerEvents:'none',overflow:'hidden',background:`radial-gradient(ellipse at center,transparent 35%,rgba(7,11,28,${.15+p*.3}) 100%)`}}>
  <div data-warning-weather style={{position:'absolute',inset:0}}>
   {wave||warning.type==='wind'?<div style={{position:'absolute',left:`${-42+p*13}%`,bottom:wave?'0%':'15%',width:wave?'75%':'58%',opacity:.35+p*.5}}><SurvivalDisasterSprite kind={wave?'tsunami':'tornado'} ageMs={p*700}/></div>:meteor?<>{[14,46,75].map(x=><MeteorRock key={x} x={x+p*6} y={-8+p*22} size={4+p*2} opacity={.4+p*.5}/>)}</>:<>
    {Array.from({length:12},(_,i)=><div key={i} style={{position:'absolute',left:`${-12+i*10}%`,top:`${-12+p*9+Math.sin(i*2+p*3)*3}%`,width:'28%',aspectRatio:'1.4',backgroundImage:`url(/event-art/storm-cloud-${i%2?'03':'01'}.png)`,backgroundSize:'100% 100%',filter:warning.type==='hail'?'brightness(.8) sepia(.15)':'brightness(.3) saturate(.5)',opacity:.5+p*.4}}/>)}
    {warning.type==='hail'?Array.from({length:10},(_,i)=><div key={i} style={{position:'absolute',left:`${7+i*9}%`,top:`${19+(i%3)*3+p*6}%`,width:'1.5%',aspectRatio:'1',borderRadius:'40%',background:'radial-gradient(at 30% 20%,white,#b5d9ee)',opacity:.4+p*.5}}/>):null}
   </>}
  </div>
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
 const boltAge=Math.max(0,Number.isFinite(ageMs)?ageMs:0);
 const boltOpacity=boltAge>=820?0:boltAge<160?1:boltAge<300?.55:boltAge<430?1:Math.max(0,(820-boltAge)/390);
 return <div data-survival-art data-disaster={fx.type} key={fx.key+':'+fx.type} style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:22}}>
  <div style={{position:'absolute',inset:0,background:lightning?'linear-gradient(#0c1434cc,transparent 55%)':fx.type==='wave'?'linear-gradient(transparent,#073a6a66)':fx.type==='wind'?'radial-gradient(ellipse,#527e8580,transparent 75%)':'none'}}/>
  {lightning&&<>
   <div data-survival-flash style={{position:'absolute',inset:0,background:'#bdeeff',opacity:boltOpacity*.18}}/>
   <svg data-lightning-bolts viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height:'100%',position:'absolute',inset:0,opacity:boltOpacity}}>
    <defs><filter id={`bolt-glow-${fx.key}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".65"/></filter></defs>
    {fx.streaks.slice(0,16).map(s=><g key={s.id}>
     <polyline points={s.pts} fill="none" stroke="#479cff" strokeWidth="13" opacity=".85" filter={`url(#bolt-glow-${fx.key})`} vectorEffect="non-scaling-stroke"/>
     <polyline points={s.pts} fill="none" stroke="#9eeaff" strokeWidth="4" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
     <polyline points={s.pts} fill="none" stroke="white" strokeWidth="1.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
     {s.br.map((br,i)=><g key={i}><polyline points={br} fill="none" stroke="#6ec5ff" strokeWidth="4" opacity=".65" filter={`url(#bolt-glow-${fx.key})`} vectorEffect="non-scaling-stroke"/><polyline points={br} fill="none" stroke="#e5faff" strokeWidth=".75" vectorEffect="non-scaling-stroke"/></g>)}
     {(()=>{const [x,y]=s.pts.trim().split(/\s+/).at(-1)!.split(',').map(Number);return Number.isFinite(x)&&Number.isFinite(y)?<g data-bolt-contact><circle cx={x} cy={y} r="3.8" fill="#d9fbff" opacity=".38"/><circle cx={x} cy={y} r="1.6" fill="white"/><path d={`M${x-5} ${y+2}L${x-2} ${y}M${x+2} ${y}L${x+5} ${y+2}`} stroke="#b7f5ff" strokeWidth=".6"/></g>:null})()}
    </g>)}
   </svg>
  </>}
  {fx.type==='wave'&&<div data-wave-foam style={{position:'absolute',left:`${-80+Math.min(1,Math.max(0,ageMs)/850)*160}%`,bottom:0,width:'110%'}}><SurvivalDisasterSprite kind="tsunami" ageMs={ageMs}/></div>}
  {fx.type==='wind'&&<div data-tornado-funnel data-disaster-sprite="tornado" style={{position:'absolute',left:`${-55+Math.min(1,Math.max(0,ageMs)/850)*130}%`,bottom:'8%',width:'80%'}}><SurvivalDisasterSprite kind="tornado" ageMs={ageMs} variant={fx.key%3}/></div>}
  {fx.type==='hail'&&<svg data-hail-field viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
   <defs><radialGradient id={`ice-${fx.key}`} cx="30%" cy="20%"><stop stopColor="white"/><stop offset=".55" stopColor="#cbeaff"/><stop offset="1" stopColor="#688eb9"/></radialGradient></defs>
   {Array.from({length:36},(_,i)=>{const x=rand()*110,y=-12+rand()*22,r=.8+i%5*.25;return <g key={i} style={{animation:`survivalHail ${.6+rand()*.18}s linear ${i%5*.02}s both`}}>
    <path d={`M${x+1} ${y-9}L${x} ${y-2}`} stroke="#dcf5ff" strokeWidth=".5" opacity=".55"/>
    <path d={`M${x-r} ${y}L${x-r*.5} ${y-r}L${x+r*.6} ${y-r*.8}L${x+r} ${y+.3}L${x+.3} ${y+r}L${x-r*.7} ${y+r*.6}Z`} fill={`url(#ice-${fx.key})`} stroke="#effaff" strokeWidth=".18"/>
   </g>})}
  </svg>}
  {meteor&&<>
   {fx.streaks.slice(0,20).map(s=>{const [x,y]=s.pts.trim().split(/\s+/).at(-1)!.split(',').map(Number);return Number.isFinite(x)&&Number.isFinite(y)?<MeteorRock key={s.id} x={x} y={y} size={6} opacity={Math.max(0,1-Math.max(0,ageMs)/450)}/>:null;})}
   <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 80%,#ff711966,transparent 65%)',animation:'survivalBolt .8s ease-out both'}}/>
  </>}
 </div>;
}
