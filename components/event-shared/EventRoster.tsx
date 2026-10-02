"use client";
import SurvivalCharacter from './SurvivalCharacter';
export default function EventRoster({names,characters=false,castSeed}: {names: string[];characters?:boolean;castSeed?:number}) {
  const fontSize = names.length > 100 ? 12 : names.length > 40 ? 14 : names.length > 16 ? 16 : 20;
  const showCharacters=characters&&names.length<=24;
  const dense=characters&&names.length>60;
  return <section aria-label="시작 전 참가자 명단" style={{height:'100%',boxSizing:'border-box',padding:characters?10:20,display:'flex',flexDirection:'column',gap:characters?8:16,color:'#fff',background:'linear-gradient(155deg,#332535,#171923)',borderRadius:16}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
      <strong style={{fontSize:characters?'clamp(12px,4cqw,20px)':20}}>참가자 명단</strong><span style={{fontSize:characters?'clamp(11px,3cqw,16px)':16,color:'#F0C45A'}}>총 {names.length}명</span>
    </header>
    <style>{`.survival-roster-avatar{display:flex;justify-content:center;margin-bottom:4px}@container(max-width:380px){.survival-roster-avatar[data-roster-many=true]{display:none}}`}</style>
    {names.length ? <div style={{flex:1,minHeight:0,overflowY:'auto',display:'grid',gridTemplateColumns:dense?'repeat(6,minmax(0,1fr))':`repeat(auto-fit,minmax(${names.length>24?64:90}px,1fr))`,alignContent:'start',gap:dense?1:names.length>24?4:8}}>
      {names.map((name,i)=><div key={`${i}:${name}`} title={name} style={{fontSize:characters?dense?'clamp(8px,2.5cqw,12px)':`clamp(11px,3cqw,${fontSize}px)`:fontSize,fontWeight:800,lineHeight:dense?1.2:1.4,padding:dense?0:names.length>24?'3px 4px':'9px 8px',textAlign:'center',overflowWrap:'anywhere',borderRadius:dense?0:9,background:dense?'transparent':'rgba(255,255,255,.08)',border:dense?'none':'1px solid rgba(255,255,255,.13)'}}>{showCharacters?<div className="survival-roster-avatar" data-roster-many={names.length>12}><SurvivalCharacter castSeed={castSeed} index={i} total={names.length} sizeOverride="32px"/></div>:null}{name}</div>)}
    </div> : <div style={{flex:1,display:'grid',placeItems:'center',color:'#cbc6cf'}}>참가자 명단을 불러와 주세요.</div>}
    <div style={{fontSize:13,color:'#cbc6cf',textAlign:'center'}}>시작 대기</div>
  </section>;
}
