"use client";
import {useLayoutEffect,useRef,useState} from 'react';
import SurvivalCharacter from './SurvivalCharacter';

// Display-only: retain the server's winner order, identity and saved gift text.
export default function SurvivalWinnerLineup({winners,castSeed,gift}:{winners:{id:number;name:string}[];castSeed:number;gift:string}){
 const columns=Math.min(5,winners.length),rows=Math.ceil(winners.length/5);
 // [2026-11-26 사장님 「서바이벌 당첨자 여러 명이면 목록이 잘림」] 실측: 12명(3줄)이면 내용 433px·자리 268px → 2·3줄째가 잘렸고
 // 방송 화면(OBS)은 스크롤을 못 한다. → 내용이 자리보다 크면 «통째로 줄여서» 전부 보이게(이름·순서·선물 무변경).
 const boxRef=useRef<HTMLDivElement>(null),innerRef=useRef<HTMLDivElement>(null);
 const [fit,setFit]=useState(1);
 useLayoutEffect(()=>{const box=boxRef.current,inner=innerRef.current;if(!box||!inner)return;const measure=()=>{const need=inner.scrollHeight,have=box.clientHeight;setFit(need>0&&have>0?Math.min(1,have/need):1);};measure();if(typeof ResizeObserver==='undefined')return;const o=new ResizeObserver(measure);o.observe(box);o.observe(inner);return()=>o.disconnect();},[winners.length,gift]);
 if(!columns)return null;
 const size=rows>2?'clamp(24px,7cqw,54px)':columns===1?'clamp(80px,28cqw,190px)':columns<=3?'clamp(45px,18cqw,125px)':'clamp(35px,12cqw,85px)';
 return <section data-survival-winner-lineup style={{position:'absolute',inset:'24% 4% 15%',zIndex:40,display:'flex',flexDirection:'column',alignItems:'center',gap:'2cqw',color:'#ffe19a',textAlign:'center',minHeight:0}}>
  {gift.trim()?<div style={{flexShrink:0,maxWidth:'100%',padding:'6px 14px',border:'1px solid #f0c45a',borderRadius:12,background:'rgba(18,10,16,.85)'}}><div style={{fontSize:'clamp(11px,2cqw,16px)',color:'#fff1cf'}}>🎁 당첨 선물</div><div data-winner-gift style={{fontSize:'clamp(14px,3cqw,23px)',fontWeight:900,overflowWrap:'anywhere',maxHeight:'16cqh',overflowY:'auto'}}>{gift}</div></div>:null}
  <div ref={boxRef} style={{width:'100%',flex:1,minHeight:0,overflow:'hidden',display:'flex',justifyContent:'center',alignItems:fit<1?'flex-start':'center'}}>
  <div ref={innerRef} data-winner-fit={fit<1?fit.toFixed(2):'1'} style={{width:'100%',padding:'10px 0',display:'flex',flexDirection:'column',gap:'3cqw',transform:fit<1?`scale(${fit})`:undefined,transformOrigin:'top center'}}>
   {Array.from({length:rows},(_,r)=>{
    const row=winners.slice(r*5,r*5+5);
    return <div key={r} data-winner-row={r} style={{display:'flex',justifyContent:'center',alignItems:'flex-end',gap:'1cqw'}}>
     {row.map(w=><div key={w.id} data-winner-slot={w.id} style={{width:`${92/columns}%`,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <span aria-hidden style={{fontSize:'clamp(15px,3cqw,25px)'}}>👑</span>
      <SurvivalCharacter castSeed={castSeed} index={w.id} total={winners.length} sizeOverride={size} winner pose="rest"/>
      <span style={{maxWidth:'100%',boxSizing:'border-box',fontSize:columns<=3?'clamp(22px,5cqw,40px)':'clamp(18px,3.8cqw,30px)',fontWeight:900,overflowWrap:'anywhere',lineHeight:1.25,color:'#231018',background:'#f0c45a',padding:'6px 9px',borderRadius:10,border:'2px solid #ffe8a3'}}>{w.name}</span>
     </div>)}
    </div>;
   })}
  </div>
  </div>
 </section>;
}
