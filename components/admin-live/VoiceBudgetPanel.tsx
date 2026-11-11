"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {DEFAULT_VOICE_CAP_KRW,voiceDisplayState,type VoiceBudget} from "@/lib/voiceAutomation";
type Snapshot={budget:VoiceBudget|null;ready:boolean;state:string};
type Action="save"|"stop"|"resume";
const labels:Record<string,string>={not_ready:"연결 준비 중",running:"작동 중",warning:"한도 임박",budget_stopped:"한도로 중단",paused:"일시 중단",offline:"연결 끊김",error:"오류로 중단"};
const won=(n:number)=>n.toLocaleString("ko-KR")+"원";
export function VoiceBudgetCard({data,busy,error,onAction,onProducts}:{data:Snapshot;busy:boolean;error:string;onAction:(action:Action,cap:number)=>void;onProducts:()=>void}) {
  const [editing,setEditing]=useState(false);
  const [cap,setCap]=useState(String(data.budget?.cap_krw??DEFAULT_VOICE_CAP_KRW));
  useEffect(()=>{if(!editing)setCap(String(data.budget?.cap_krw??DEFAULT_VOICE_CAP_KRW));},[data.budget?.cap_krw,editing]);
  const state=data.state, danger=["budget_stopped","offline","error"].includes(state), warning=state==="warning",active=!!data.budget?.enabled;
  const capValue=Number(cap), invalid=!Number.isSafeInteger(capValue)||capValue<1000||capValue>1000000||capValue<(data.budget?.committed_krw??0);
  const canResume=data.ready&&!!data.budget?.worker_seen_at&&Date.now()-Date.parse(data.budget.worker_seen_at)<30000;
  const btn="min-h-10 rounded-lg border px-3 font-semibold disabled:opacity-40";
  return <section aria-label="음성 자동화 예산" className={`mb-3 rounded-xl border px-3 py-2 text-sm ${danger?"border-red-400 bg-red-50 text-red-950":warning?"border-amber-400 bg-amber-50 text-amber-950":"border-line bg-surface text-ink"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="font-bold">음성 자동화 · {labels[state]??"상태 확인 중"}</div>
      <button type="button" onClick={()=>setEditing(v=>!v)} aria-expanded={editing} className={btn}>{editing?"설정 접기":"예산 설정"}</button>
    </div>
    {(warning||danger)&&<div role="alert" className="mt-2 space-y-1">
      <p className="font-bold">{state==="budget_stopped"?"예산 한도로 자동 상품 전환이 중단됐어요. 직접 상품을 선택해 주세요.":state==="offline"?"음성 서버 연결이 끊겼어요. 자동 상품 전환 상태를 확인해 주세요.":state==="error"?"음성 자동화에 오류가 발생했어요. 직접 상품을 선택해 주세요.":"이번 방송 음성 자동화 한도가 얼마 남지 않았어요."}</p>
      {data.budget?.stopped_at&&<p>중단 시각: {new Date(data.budget.stopped_at).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit"})}</p>}
      <button type="button" onClick={onProducts} className={`${btn} bg-white text-black`}>직접 상품 선택하기</button>
      <p className="text-xs">방송·채팅·주문은 계속 이용할 수 있어요.</p>
    </div>}
    {(data.budget||editing)&&<p className="mt-2 text-xs">예산 계산액 {won(data.budget?.committed_krw??0)} / 한도 {won(data.budget?.cap_krw??DEFAULT_VOICE_CAP_KRW)} · 안전여유 포함</p>}
    {state==="not_ready"&&<p className="mt-1 text-xs">API·음성 서버 연결 전입니다. 아직 유료 인식은 시작되지 않았어요.</p>}
    {editing&&<div className="mt-3 space-y-3 border-t border-current/10 pt-3">
      <label className="flex flex-wrap items-center gap-2 font-semibold">이번 방송 한도
        <input aria-label="이번 방송 한도" type="number" min="1000" max="1000000" step="1000" value={cap} onChange={e=>setCap(e.target.value)} className="min-h-11 w-32 rounded-lg border border-line bg-white px-3 text-black"/>원
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy||invalid} onClick={()=>onAction("save",capValue)} className={`${btn} bg-black text-white`}>한도 저장</button>
        {active?<button type="button" disabled={busy} onClick={()=>onAction("stop",data.budget?.cap_krw??DEFAULT_VOICE_CAP_KRW)} className={btn}>자동화 잠시 중단</button>:<button type="button" disabled={busy||invalid||!canResume} onClick={()=>onAction("resume",capValue)} className={btn}>이 한도로 자동화 재개</button>}
      </div>
      <p className="text-xs leading-relaxed">계산액은 세금·수수료·안전여유를 포함한 요청별 예산입니다. 실제 카드 청구액과 다를 수 있어요. 선불 잔액이 충전돼도 이 한도는 자동으로 올라가지 않아요.</p>
      <p className="text-xs">화면 밖 휴대폰 알림은 음성 서버 연결 단계에서 별도로 확인합니다.</p>
    </div>}
    {error&&<p role="alert" className="mt-2 font-semibold text-red-700">{error}</p>}
  </section>;
}
export default function VoiceBudgetPanel({broadcastId,onProducts}:{broadcastId:string;onProducts:()=>void}) {
  const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [now,setNow]=useState(Date.now);
  const generation=useRef(0);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const version=++generation.current;
    const requestController=new AbortController();
    const abort=()=>requestController.abort();
    signal?.addEventListener("abort",abort,{once:true});
    const timeout=setTimeout(abort,8000);
    try {
      const r=await fetch(`/api/admin-live/voice-budget?broadcastId=${encodeURIComponent(broadcastId)}`,{cache:"no-store",signal:requestController.signal});
      const body=await r.json(); if(!r.ok)throw new Error(body.error??"상태를 확인하지 못했어요.");
      if(version===generation.current){setData(body);setError("");}
    }catch(e){if(version===generation.current&&!signal?.aborted)setError(requestController.signal.aborted?"상태 확인이 지연되고 있어요. 자동화 연결을 확인해 주세요.":e instanceof Error?e.message:"상태를 확인하지 못했어요.");}
    finally {clearTimeout(timeout);signal?.removeEventListener("abort",abort);}
  },[broadcastId]);
  useEffect(()=>{
    const controller=new AbortController(); void load(controller.signal);
    const visible=()=>{if(document.visibilityState==="visible")void load(controller.signal);};
    const timer=setInterval(visible,10000),clock=setInterval(()=>setNow(Date.now()),5000); document.addEventListener("visibilitychange",visible);
    return ()=>{controller.abort();generation.current++;clearInterval(timer);clearInterval(clock);document.removeEventListener("visibilitychange",visible);};
  },[load]);
  const act=async(action:Action,capKrw:number)=>{
    setBusy(true);setError("");
    try {
      const r=await fetch("/api/admin-live/voice-budget",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({broadcastId,action,capKrw})});
      const body=await r.json();if(!r.ok)throw new Error(body.error);await load();
    }catch(e){setError(e instanceof Error?e.message:"저장하지 못했어요.");}finally{setBusy(false);}
  };
  if(!data)return error?<p role="alert" className="mb-3 rounded-xl border border-red-300 p-3 text-sm text-red-700">{error}</p>:null;
  const current={...data,state:voiceDisplayState(data.budget,data.ready,now)};
  return <VoiceBudgetCard data={current} busy={busy} error={error} onAction={act} onProducts={onProducts}/>;
}
