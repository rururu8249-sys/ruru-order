"use client";
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
     {(()=>{const [x,y]=s.pts.trim().split(/\s+/).at(-1)!.split(',').map(Number);return Number.isFinite(x)&&Number.isFinite(y)?<g data-bolt-contact><circle cx={x} cy={y} r="3.8" fill="#d9fbff" opacity=".38"/><circle cx={x} cy={y} r="1.6" fill="white"/><path d={`M${x-5} ${y+2}L${x-2} ${y}M${x+2} ${y}L${x+5} ${y+2}`} stroke="#b7f5ff" strokeWidth=".6"/></g>:null})()}
    </g>)}
   </svg>
  </>}
  {fx.type==='wave'&&<>
   {[0,1].map(layer=><svg key={layer} viewBox="0 0 600 400" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:layer?.8:1,animation:`survivalWave ${layer? .82:.68}s ease-out ${layer?.08:0}s both`}}>
    <defs><linearGradient id={`wave-${fx.key}-${layer}`} x2="0" y2="1"><stop stopColor="#8fe9f6"/><stop offset=".38" stopColor="#219edf"/><stop offset="1" stopColor="#07385d"/></linearGradient></defs>
    <path d="M0 400V170C80 170 125 180 160 135C215 60 160 15 115 65C145 -5 245 -20 298 70C332 128 318 190 357 210C420 243 462 190 520 230L600 270V400Z" fill={`url(#wave-${fx.key}-${layer})`}/>
    <path d="M0 170C80 170 125 180 160 135C215 60 160 15 115 65C145 -5 245 -20 298 70C332 128 318 190 357 210C420 243 462 190 520 230L600 270" fill="none" stroke="#d5f9ff" strokeWidth="18"/>
    <path d="M10 220Q105 240 175 180M220 300Q300 230 410 290M360 350Q460 295 595 340" fill="none" stroke="#7ee2ff" strokeWidth="9" opacity=".7"/>
    <g data-wave-foam fill="#e4fcff" opacity=".85">{[[32,172],[63,176],[103,168],[140,154],[169,125],[186,89],[178,63],[260,28],[291,64],[305,111],[314,158],[333,192],[377,219],[420,219],[476,215],[532,238],[568,256]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx={8+i%3*3} ry={4+i%4*2} transform={`rotate(${i%2?30:-20} ${x} ${y})`}/>)}</g>
   </svg>)}
   {Array.from({length:24},(_,i)=><i key={i} style={{position:'absolute',left:`${rand()*100}%`,top:`${30+rand()*60}%`,width:5+i%5,height:10+i%7,borderRadius:'60% 60% 80% 80%',background:'#d5f9ff',animation:`survivalDebris .7s ease-out ${i%4*.03}s both`}}/>)}
  </>}
  {fx.type==='wind'&&<>
   <svg data-tornado-funnel viewBox="0 0 300 420" style={{position:'absolute',left:0,bottom:'8%',height:'80%',width:'60%',animation:'survivalTornado .82s ease-out both'}}>
    <defs><linearGradient id={`funnel-${fx.key}`}><stop stopColor="#203b52"/><stop offset=".4" stopColor="#d9eef0"/><stop offset=".65" stopColor="#698c9e"/><stop offset="1" stopColor="#172b41"/></linearGradient></defs>
    <path d="M15 30Q150 -20 290 35Q270 120 220 190Q191 265 170 380L120 410Q98 343 100 250Q77 148 15 30Z" fill={`url(#funnel-${fx.key})`} opacity=".88"/>
    <ellipse cx="150" cy="35" rx="139" ry="28" fill="#31485c" stroke="#bcdce5" strokeWidth="6"/>
    {Array.from({length:10},(_,i)=><ellipse key={i} cx={150+Math.sin(i)*8} cy={35+i*35} rx={130-i*10} ry={18-i*.9} fill="none" stroke={i%2?'#efffff':'#88c8d0'} strokeWidth={6-i*.35} opacity=".85"/>)}
   </svg>
   {Array.from({length:16},(_,i)=><i key={i} style={{position:'absolute',left:`${rand()*70}%`,top:`${rand()*85}%`,width:4+i%3*3,height:3+i%4,borderRadius:i%2?'50%':'15%',background:i%2?'#d6e8e6':'#8b765f',boxShadow:'1px 2px 2px #172b4190',animation:`survivalDebris .8s ease-out ${i%4*.03}s both`}}/>)}
  </>}
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
