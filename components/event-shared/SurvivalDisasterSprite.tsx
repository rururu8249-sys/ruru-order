"use client";
import {useEffect,useRef,type CSSProperties} from 'react';

type FluidParticle={x:number;y:number;width:number;height:number;opacity:number;angle:number;depth:number};
type FluidKind='tornado'|'tsunami';
const TAU=Math.PI*2;
// Ping-pong through the atlas: never freeze after 700ms or jump 7 -> 0.
export function sampleWaveFrames(ageMs:number){
 const age=Math.max(0,Number.isFinite(ageMs)?ageMs:0);
 const phase=(age/160)%14,position=phase<=7?phase:14-phase;
 const from=Math.floor(position);
 return {from,to:Math.min(7,from+1),mix:position-from};
}
export function sampleWaveEdge(ageMs:number){
 const t=Math.max(0,Number.isFinite(ageMs)?ageMs:0)/1000;
 return Array.from({length:64},(_,i)=>{
  const y=i/64,end=96-5*Math.sin(y*Math.PI)-3*Math.sin(y*8-t*6);
  return {y,height:1/64,start:end-12-y*4,end};
 });
}
// The event clock is the sole time source: reconnects and OBS see the same flow.
export function sampleDisasterFluid(kind:FluidKind,ageMs:number,variant=0,detail=true){
 const age=Math.max(0,Number.isFinite(ageMs)?ageMs:0),t=age/1000;
 const v=Math.abs(Number.isFinite(variant)?variant:0)%3;
 const particles:FluidParticle[]=[],bands:{y:number;height:number;offset:number}[]=[],vortices:{x:number;y:number;radius:number;angle:number;opacity:number}[]=[];
 if(kind==='tornado'){
  const rows=detail?20:10,columns=detail?6:4;
  for(let i=0;i<18;i++){
   const h=i/17;
   vortices.push({x:50+Math.sin(h*3+v+t*2)*h*(1-h)*(v===2?26:12),y:11+h*78,radius:3+Math.pow(1-h,1.1)*(v===1?31:37),angle:-t*(7+h*5)+h*9,opacity:.22+Math.sin(h*Math.PI)*.26});
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
   const h=((row+.3+col*.37)/rows+t*.13)%1;
   const theta=col/columns*TAU+h*11-t*(10+v*1.7);
   const radius=3+Math.pow(1-h,1.1)*(v===1?31:37);
   const bend=Math.sin(h*3+v+t*2)*h*(1-h)*(v===2?26:12);
   const front=(Math.sin(theta)+1)/2;
   particles.push({x:50+bend+Math.cos(theta)*radius,y:11+h*78+Math.sin(theta)*(2+(1-h)*5),width:14+(1-h)*23,height:9+(1-h)*12,opacity:(.08+front*.22)*Math.min(1,h*12,(1-h)*12),angle:theta*.3,depth:h*200+front});
  }
 }else{
  for(let i=0;i<32;i++)bands.push({y:i/32,height:1/32,offset:Math.sin(i*.36-t*12)*(.8+i/32*1.9)});
  for(let i=0;i<64;i++){
   const life=((t*1.7+i*.618)%1),side=Math.sin(i*2.4);
   // A curling crest sheds material; foam separates and falls ballistically.
   const theta=i/64*TAU+t*7;
   const crestX=69+Math.cos(theta)*14,crestY=22+Math.sin(theta)*14;
   particles.push({x:crestX+life*(12+side*18),y:crestY-life*18+life*life*43,width:1.2+(1-life)*3.4,height:.7+(1-life)*2.2,opacity:(1-life)*.72,angle:theta,depth:i});
  }
 }
 return {particles:particles.sort((a,b)=>a.depth-b.depth),bands,vortices};
}

const imageLoads=new Map<string,Promise<HTMLImageElement|null>>();
function loadFluidImage(src:string){
 let promise=imageLoads.get(src);
 if(!promise){promise=new Promise<HTMLImageElement|null>(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=src;});imageLoads.set(src,promise);}
 return promise;
}
function FluidCanvas({kind,ageMs,variant,detail}:{kind:FluidKind;ageMs:number;variant:number;detail:boolean}){
 const ref=useRef<HTMLCanvasElement>(null);
 const maskRef=useRef<HTMLCanvasElement|null>(null);
 useEffect(()=>{
  let cancelled=false;
  Promise.all([loadFluidImage(kind==='tornado'?'/event-art/storm-cloud-01.png':'/event-art/storm-puff-00.png'),loadFluidImage(kind==='tornado'?'/event-art/storm-cloud-03.png':'/event-art/storm-puff-05.png'),kind==='tsunami'?loadFluidImage('/event-art/survival-tsunami-v2.png'):Promise.resolve(null),kind==='tornado'?loadFluidImage('/event-art/storm-vortex.png'):Promise.resolve(null)]).then(([puff,other,wave,vortex])=>{
   if(cancelled||!ref.current)return;
   const canvas=ref.current,ctx=canvas.getContext('2d');if(!ctx)return;
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const age=reduced?300:Math.max(0,Number.isFinite(ageMs)?ageMs:0);
   const fluid=sampleDisasterFluid(kind,age,variant,detail);
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/100,canvas.height/100);
   if(kind==='tornado'&&vortex){
    // Project independently rotating smoke cross-sections into perspective.
    // No solid cone or straight edge hides the moving texture.
    for(const ring of fluid.vortices){
     ctx.save();ctx.globalAlpha=ring.opacity;ctx.translate(ring.x,ring.y);ctx.scale(1,.28);ctx.rotate(ring.angle);
     ctx.drawImage(vortex,-ring.radius,-ring.radius,ring.radius*2,ring.radius*2);ctx.restore();
    }
   }
   if(kind==='tsunami'&&wave){
    const frames=sampleWaveFrames(age),cw=wave.width/4,ch=wave.height/2;
    // Cross-fade adjacent poses, with each depth independently deforming.
    // Additive premultiplied layers preserve opacity at transparent crest edges.
    for(const [frame,alpha] of [[frames.from,1-frames.mix],[frames.to,frames.mix]]){
     if(!alpha)continue;
     ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation='lighter';
     const sx=frame%4*cw,sy=Math.floor(frame/4)*ch;
     for(const band of fluid.bands)ctx.drawImage(wave,sx,sy+band.y*ch,cw,ch*band.height,band.offset,band.y*100,100,100*band.height);
     ctx.restore();
    }
    // The source atlas has a square trailing edge. Remove it before adding spray:
    // a moving contour fades the water rather than exposing the photo boundary.
    const mask=maskRef.current??(maskRef.current=document.createElement('canvas'));
    if(mask.width!==canvas.width||mask.height!==canvas.height){mask.width=canvas.width;mask.height=canvas.height;}
    const m=mask.getContext('2d');
    if(m){
     m.clearRect(0,0,mask.width,mask.height);m.save();m.scale(mask.width/100,mask.height/100);
     for(const edge of sampleWaveEdge(age)){
      const fade=m.createLinearGradient(edge.start,0,edge.end,0);
      fade.addColorStop(0,'#fff');fade.addColorStop(1,'#ffffff00');m.fillStyle=fade;
      m.fillRect(0,edge.y*100,100,edge.height*100);
     }
     m.restore();ctx.save();ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0,100,100);ctx.restore();
    }
   }
   if(puff)for(let i=0;i<fluid.particles.length;i++){
    const p=fluid.particles[i];ctx.save();ctx.globalAlpha=p.opacity;ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.drawImage(i%2&&other?other:puff,-p.width/2,-p.height/2,p.width,p.height);ctx.restore();
   }
   ctx.restore();
  });
  return()=>{cancelled=true;};
 },[kind,ageMs,variant,detail]);
 return <canvas ref={ref} width={detail?768:256} height={detail?768:256} data-fluid-canvas={kind} aria-hidden="true" style={{display:'block',width:'100%',height:'100%'}}/>;
}

export default function SurvivalDisasterSprite({kind,ageMs=0,style,variant=0,detail=true}:{kind:FluidKind;ageMs?:number;style?:CSSProperties;variant?:number;detail?:boolean}){
 const frame=Math.min(7,Math.floor(Math.max(0,Number.isFinite(ageMs)?ageMs:0)/100));
 const wave=kind==='tsunami'?sampleWaveFrames(ageMs):null;
 return <div aria-hidden="true" data-disaster-sprite={kind} data-sprite-frame={wave?.from??frame} data-sprite-next-frame={wave?.to} data-sprite-blend={wave?.mix} style={{aspectRatio:'1',pointerEvents:'none',...style}}><FluidCanvas kind={kind} ageMs={ageMs} variant={variant} detail={detail}/></div>;
}
