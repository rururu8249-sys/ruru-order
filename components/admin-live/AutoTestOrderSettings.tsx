"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {showAdminConfirm} from '@/lib/adminConfirm';
import {showAdminToast} from '@/lib/adminToast';
import type {AutomationFeature,AutomationState} from '@/lib/liveAutomation';
import {supabase} from '@/lib/supabase';

type Usage={model:string;used:number|null;limit:number;blockedUntil:number};
const time=(value:string|number)=>new Date(value).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
const button='min-h-11 rounded-xl px-3 text-[13px] font-bold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

export default function AutoTestOrderSettings(){
 const [state,setState]=useState<AutomationState|null>(null);
 const [usage,setUsage]=useState<Usage[]>([]),[orders,setOrders]=useState(0);
 const [details,setDetails]=useState(false),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[runningOnce,setRunningOnce]=useState(false);
 const [pace,setPace]=useState<'low'|'normal'|'high'>('normal');
 const reads=useRef(0),writing=useRef(false);
 const load=useCallback(async()=>{
   if(writing.current)return;
   const stamp=++reads.current;
   try{
     const r=await fetch('/api/admin-live/auto-test-order',{cache:'no-store'}),j=await r.json();
     if(stamp!==reads.current)return;
     if(!r.ok||!j.ok)throw Error(j.message||'실행 상태를 확인하지 못했어요.');
     setState(j.state);setPace(j.pace==='low'||j.pace==='high'?j.pace:'normal');setUsage(Array.isArray(j.gemini)?j.gemini:[]);setOrders(Number(j.testOrders)||0);setError('');
   }catch(e){if(stamp===reads.current)setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}
 },[]);
 const active=Boolean(state?.orders||state?.chat||state?.viewers||state?.manualAction||runningOnce);
 useEffect(()=>{void load();const visible=()=>{if(document.visibilityState==='visible')void load()};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}},[load]);
 useEffect(()=>{if(!active&&!details)return;const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},10000);return()=>window.clearInterval(timer)},[active,details,load]);
 useEffect(()=>{
   if(!state?.broadcastId)return;
   const channel=supabase.channel('live-automation:'+state.broadcastId).on('broadcast',{event:'changed'},()=>{void load()}).subscribe();
   return()=>{void supabase.removeChannel(channel)};
 },[state?.broadcastId,load]);
 const post=async(body:Record<string,unknown>)=>{
   ++reads.current;
   const r=await fetch('/api/admin-live/auto-test-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),j=await r.json();
   if(!r.ok||!j.ok)throw Error(j.message||'처리하지 못했어요.');
   if(j.state)setState(j.state);return j;
 };
 const control=async(feature:AutomationFeature|'all',enabled:boolean)=>{
   if(!state||writing.current)return;writing.current=true;setBusy(true);setError('');
   try{await post({action:'control',feature,enabled,revision:state.revision})}
   catch(e){writing.current=false;await load();setError(e instanceof Error?e.message:'다시 시도해 주세요.')}
   finally{writing.current=false;setBusy(false)}
 };
 const run=async()=>{
   setRunningOnce(true);setError('');
   try{const j=await post({action:'run'});if(j.result?.ok===false)throw Error(j.result.message||'주문을 제출하지 못했어요.');showAdminToast(j.result?.phase==='submitted'?'주문서 제출을 확인했어요.':'주문 처리 상태를 확인하고 있어요.','success')}
   catch(e){setError(e instanceof Error?e.message:'주문 상태를 확인해 주세요.')}
   finally{setRunningOnce(false);void load()}
 };
 const changePace=async(next:'low'|'normal'|'high')=>{
   if(next===pace||writing.current)return;const prev=pace;setPace(next);setError('');
   try{await post({action:'pace',pace:next});showAdminToast(next==='low'?'주문을 적게 넣어요.':next==='high'?'주문을 많이 넣어요.':'주문 양을 보통으로 했어요.','success')}
   catch(e){setPace(prev);setError(e instanceof Error?e.message:'다시 시도해 주세요.')}
   finally{void load()}
 };
 const remove=async()=>{
   if(!state||writing.current||runningOnce)return;
   writing.current=true;setBusy(true);++reads.current;
   try{
     const message=active
       ? `자동 실행을 중지하고 생성 주문서 ${orders}건을 삭제할까요? 대기 중인 자동 알림도 중지됩니다. 일반 회원 주문은 유지됩니다.`
       : `자동 생성된 주문서 ${orders}건을 삭제할까요? 일반 회원 주문은 유지됩니다.`;
     if(!await showAdminConfirm(message,{title:'생성 주문 삭제',confirmText:active?'중지 후 삭제':'삭제'}))return;
     setError('');
     if(active)await post({action:'control',feature:'all',enabled:false,revision:state.revision});
     const j=await post({action:'delete'});
     showAdminToast(`${j.groups}건을 삭제했어요.`,'success');
     window.dispatchEvent(new Event('ruru-admin-orders-refresh'));
     writing.current=false;await load();
   }catch(e){writing.current=false;await load();setError(e instanceof Error?e.message:'삭제하지 못했어요.')}
   finally{writing.current=false;setBusy(false)}
 };

 return <section className="mt-3 border-t border-line pt-3" aria-label="자동 실행">
   <div className="mb-3 flex items-center justify-between gap-2">
     <div><div className="text-[16px] font-bold text-ink">자동 실행</div><div className="mt-1 text-[13px] text-ink-soft">주문 · 채팅 · 시청자</div></div>
     <span className="text-[13px] text-ink-soft" role="status">{!state?'확인 중':error?'연결 확인 필요':active?'실행 중':'중지됨'}</span>
   </div>
   <button type="button" className={`${button} w-full bg-ink text-white`} disabled={busy||(!error&&(!state||(!active&&(!state.ready||!state.broadcastId))))} onClick={()=>{if(error&&!active)void load();else void control('all',!active)}}>{busy?'변경 중…':active?'중지':error?'다시 확인':'시작'}</button>
   <div className="mt-2 flex items-center gap-2" role="group" aria-label="주문 양"><span className="shrink-0 text-[13px] font-bold text-ink">주문 양</span>{([['low','적게'],['normal','보통'],['high','많게']] as const).map(([k,l])=><button key={k} type="button" aria-pressed={pace===k} disabled={!state?.ready} onClick={()=>void changePace(k)} className={`${button} flex-1 ${pace===k?'bg-ink text-white':'border border-line text-ink'}`}>{l}</button>)}</div>
   <div className="mt-1 flex items-center justify-between gap-2">
     <a href="/order" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-ink">방송화면 열기 ↗</a>
     <button type="button" className="min-h-11 text-[13px] text-ink-soft" aria-expanded={details} aria-controls="live-automation-details" onClick={()=>setDetails(!details)}>{details?'접기':'상세 설정'}</button>
   </div>
   {error?<p role="alert" className="mt-1 text-[13px] text-danger-tx">{error}</p>:null}
   {state?.viewers?<p className="mt-1 text-[13px] text-ink-soft">시청 중 {state.activeViewers}명 · 보통 2~30명 · 최대 50명</p>:null}
   {state?.orders&&state.nextOrderAt?<p className="mt-1 text-[13px] text-ink-soft" role="status">{Date.parse(state.nextOrderAt)>Date.now()?`다음 주문 ${time(state.nextOrderAt)}쯤`:'주문 준비·제출 확인 중'}</p>:null}
   {state?.last?<p className={`mt-1 text-[13px] leading-relaxed ${state.last.ok?'text-ink-soft':'text-danger-tx'}`}>{time(state.last.at)} · {state.last.message}</p>:null}
   {state&&!state.ready?<p className="text-[13px] text-ink-soft">실행 기능을 준비 중이에요.</p>:null}
   {details?<div id="live-automation-details" className="mt-2 space-y-3 border-t border-line pt-3">
     {([['orders','자동 주문'],['chat','AI 채팅'],['viewers','시청자 입장·퇴장']] as const).map(([key,label])=><button key={key} type="button" role="switch" aria-checked={Boolean(state?.[key])} aria-label={label} disabled={!state||busy||!state.ready} onClick={()=>void control(key,!state?.[key])} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-[13px] disabled:opacity-50"><span>{label}</span><span className={`rounded-full px-3 py-1 text-[13px] font-bold ${state?.[key]?'bg-ink text-white':'bg-surface-2 text-ink-soft'}`}>{state?.[key]?'켜짐':'꺼짐'}</span></button>)}
     <p className="text-[13px] leading-relaxed text-ink-soft">시청자는 보통 2~30명, 가끔 최대 50명까지 늘어요. 주문은 조용한 시간과 몰리는 시간을 섞습니다. 입금 알림은 생성 주문용이며 실제 입금 처리는 하지 않아요.</p>
     <div className="border-t border-line pt-3 text-[13px] text-ink-soft">
       <div className="mb-2 font-bold text-ink">AI 사용량</div>
       {usage.length?usage.map(g=><div key={g.model} className="mb-1 flex flex-wrap justify-between gap-x-2"><span>{g.model.replace('gemini-','').replace('-flash-lite',' Lite').replace('-flash',' Flash')}</span><span>{g.used===null?'확인 불가':`${g.used} / ${g.limit}회`}{g.blockedUntil>Date.now()?` · ${time(g.blockedUntil)}까지 대기`:''}</span></div>):<div>사용량을 확인하지 못했어요.</div>}
       <p className="mt-2 leading-relaxed">이 사이트에서 집계한 호출 수예요. 미국 서부 자정에 초기화됩니다. 질문·상품 인식·관리자 기능을 우선 처리하고 자동 채팅은 잠시 기다립니다.</p>
     </div>
     <button type="button" className={`${button} w-full border border-line text-ink`} disabled={!state?.ready||busy||runningOnce||Boolean(state.manualAction)} onClick={()=>void run()}>{runningOnce?'주문 처리 중…':'주문 1회 실행'}</button>
     {orders>0?<button type="button" className={`${button} w-full text-danger-tx`} disabled={!state||busy||runningOnce} onClick={()=>void remove()}>생성 주문 {orders}건 삭제</button>:null}
   </div>:null}
 </section>;
}
