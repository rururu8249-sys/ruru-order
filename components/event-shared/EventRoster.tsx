"use client";
import SurvivalCharacter from './SurvivalCharacter';
export default function EventRoster({names,characters=false}: {names: string[];characters?:boolean}) {
  const fontSize = names.length > 100 ? 12 : names.length > 40 ? 14 : names.length > 16 ? 16 : 20;
  return <section aria-label="시작 전 참가자 명단" style={{height:'100%',boxSizing:'border-box',padding:20,display:'flex',flexDirection:'column',gap:16,color:'#fff',background:'linear-gradient(155deg,#332535,#171923)',borderRadius:16}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
      <strong style={{fontSize:20}}>참가자 명단</strong><span style={{fontSize:16,color:'#F0C45A'}}>총 {names.length}명</span>
    </header>
    {names.length ? <div style={{flex:1,minHeight:0,overflowY:'auto',display:'grid',gridTemplateColumns:`repeat(auto-fit,minmax(${names.length>40?76:130}px,1fr))`,alignContent:'start',gap:names.length>40?4:8}}>
      {names.map((name,i)=><div key={`${i}:${name}`} title={name} style={{fontSize,fontWeight:800,lineHeight:1.4,padding:names.length>40?'3px 4px':'9px 8px',textAlign:'center',overflowWrap:'anywhere',borderRadius:9,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.13)'}}>{characters?<div style={{display:'flex',justifyContent:'center',marginBottom:4}}><SurvivalCharacter index={i} total={names.length} sizeOverride={names.length>40?'24px':'32px'}/></div>:null}{name}</div>)}
    </div> : <div style={{flex:1,display:'grid',placeItems:'center',color:'#cbc6cf'}}>참가자 명단을 불러와 주세요.</div>}
    <div style={{fontSize:13,color:'#cbc6cf',textAlign:'center'}}>시작 대기</div>
  </section>;
}
