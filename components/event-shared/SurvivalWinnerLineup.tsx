import SurvivalCharacter from './SurvivalCharacter';

// Display-only: retain the server's winner order, identity and saved gift text.
export default function SurvivalWinnerLineup({winners,castSeed,gift}:{winners:{id:number;name:string}[];castSeed:number;gift:string}){
 const columns=Math.min(5,winners.length),rows=Math.ceil(winners.length/5);
 if(!columns)return null;
 const size=rows>2?'clamp(24px,7cqw,54px)':columns===1?'clamp(80px,28cqw,190px)':columns<=3?'clamp(45px,18cqw,125px)':'clamp(35px,12cqw,85px)';
 return <section data-survival-winner-lineup style={{position:'absolute',inset:'24% 4% 15%',zIndex:40,display:'flex',flexDirection:'column',alignItems:'center',gap:'2cqw',color:'#ffe19a',textAlign:'center',minHeight:0}}>
  {gift.trim()?<div style={{flexShrink:0,maxWidth:'100%',padding:'6px 14px',border:'1px solid #f0c45a',borderRadius:12,background:'rgba(18,10,16,.85)'}}><div style={{fontSize:'clamp(11px,2cqw,16px)',color:'#fff1cf'}}>🎁 당첨 선물</div><div data-winner-gift style={{fontSize:'clamp(14px,3cqw,23px)',fontWeight:900,overflowWrap:'anywhere',maxHeight:'16cqh',overflowY:'auto'}}>{gift}</div></div>:null}
  <div style={{width:'100%',minHeight:0,overflowY:'auto',padding:'10px 0',display:'flex',flexDirection:'column',gap:'3cqw',margin:'auto 0'}}>
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
 </section>;
}
