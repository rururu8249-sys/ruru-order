"use client";
// Seek CSS decorations too: a new iframe must not start rain, limbs or confetti at t=0.
export function EventClockStyles({elapsedMs,localAgeMs,sync,showStatus=true}:{elapsedMs:number;localAgeMs?:number;sync:string;showStatus?:boolean}){
  const elapsed=Number.isFinite(elapsedMs)?Math.max(0,Math.min(elapsedMs,120000)):0;
  const age=localAgeMs===undefined?elapsed:Math.max(0,localAgeMs);
  return <>
    <style>{`
      [data-event-clock="shared"] *{animation-play-state:paused!important;animation-delay:-${elapsed}ms!important;transition:none!important}
      [data-event-clock="shared"] [data-event-local-age] *{animation-delay:-${age}ms!important}
    `}</style>
    {showStatus&&(sync==="error"||sync==="checking")?<div role="status" style={{position:"fixed",top:4,left:4,zIndex:100,color:"#fff",background:"#334155",padding:"4px 8px",borderRadius:6,fontSize:12}}>{sync==="error"?"이벤트 연결을 확인해 주세요.":"동기화 확인 중"}</div>:null}
  </>;
}
