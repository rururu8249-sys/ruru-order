"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {showAdminConfirm} from '@/lib/adminConfirm';
import {showAdminToast} from '@/lib/adminToast';
import type {AutomationFeature,AutomationState} from '@/lib/liveAutomation';
import {supabase} from '@/lib/supabase';

type Usage={model:string;used:number|null;limit:number;blockedUntil:number};
const time=(value:string|number)=>new Date(value).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
// [2026-11-13] AI 채팅이 한 번 건너뛴 기록(정상)은 빨간 오류로 띄우지 않는다
const AI_SKIP=/^(NO_SUITABLE_MESSAGE|UNGROUNDED_DIALOGUE|AI_WAIT|ORDER_REPORT_REPETITION|UNOWNED_PRODUCT_ORDER|NO_CURRENT_CARD|FEATURED_CHANGED|CURRENT_CARD_CHANGED|BROADCAST_MODE_CHANGED|CHAT_SKIPPED|SILENT)$/;
const button='min-h-11 rounded-xl px-3 text-[13px] font-bold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

export default function AutoTestOrderSettings(){
 const [state,setState]=useState<AutomationState|null>(null);
 const [usage,setUsage]=useState<Usage[]>([]),[orders,setOrders]=useState(0);
 const [details,setDetails]=useState(false),[usageOpen,setUsageOpen]=useState(false),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[runningOnce,setRunningOnce]=useState(false);
 const [pace,setPace]=useState<'low'|'normal'|'high'>('normal');
 const [chatPace,setChatPace]=useState<'low'|'normal'|'high'>('normal');
 const [memoryPublic,setMemoryPublic]=useState(false);
 const reads=useRef(0),writing=useRef(false);
 const load=useCallback(async()=>{
   if(writing.current)return;
   const stamp=++reads.current;
   try{
     const r=await fetch('/api/admin-live/auto-test-order',{cache:'no-store'}),j=await r.json();
     if(stamp!==reads.current)return;
     if(!r.ok||!j.ok)throw Error(j.message||'실행 상태를 확인하지 못했어요.');
     setState(j.state);setPace(j.pace==='low'||j.pace==='high'?j.pace:'normal');setChatPace(j.chatPace==='low'||j.chatPace==='high'?j.chatPace:'normal');setMemoryPublic(j.memoryPublic===true);setUsage(Array.isArray(j.gemini)?j.gemini:[]);setOrders(Number(j.testOrders)||0);setError('');
   }catch(e){if(stamp===reads.current)setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}
 },[]);
 const active=Boolean(state?.orders||state?.chat||state?.viewers||state?.manualAction||runningOnce);
 const primaryUsage=usage.find(g=>g.model.includes('3.5-flash-lite'))||usage[0];
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
 const changeChatPace=async(next:'low'|'normal'|'high')=>{
   if(next===chatPace||writing.current)return;const prev=chatPace;setChatPace(next);setError('');
   try{await post({action:'chat-pace',pace:next});showAdminToast(next==='low'?'AI 채팅을 적게 해요.':next==='high'?'AI 채팅을 많이 해요.':'AI 채팅 양을 보통으로 했어요.','success')}
   catch(e){setChatPace(prev);setError(e instanceof Error?e.message:'다시 시도해 주세요.')}
 };
 const toggleMemory=async()=>{
   if(writing.current)return;const next=!memoryPublic;setMemoryPublic(next);setError('');
   try{await post({action:'memory-public',on:next});showAdminToast(next?'구매 얘기가 모든 손님 화면에 보여요.':'구매 얘기는 테스트 권한 화면에만 보여요.','success')}
   catch(e){setMemoryPublic(!next);setError(e instanceof Error?e.message:'다시 시도해 주세요.')}
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

 return <section className="mt-2 shrink-0 rounded-2xl border border-line bg-surface p-3" aria-label="자동 실행" data-ruru-automation-workspace="v2">
   <div className="mb-3 flex items-center justify-between gap-2">
     <div className="min-w-0">
       <h2 className="text-[15px] font-black text-ink">자동 실행</h2>
       <p className="mt-0.5 text-[11px] text-ink-mute">주문 · AI 채팅 · 시청자</p>
     </div>
     <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${active?'bg-ink text-white':'bg-surface-2 text-ink-soft'}`} role="status">{!state?'확인 중':error?'확인 필요':active?'실행 중':'중지됨'}</span>
   </div>
   <button type="button" className={`${button} min-h-10 w-full ${active?'bg-ink text-white':'border border-line bg-surface text-ink'}`} disabled={busy||(!error&&(!state||(!active&&(!state.ready||!state.broadcastId))))} onClick={()=>{if(error&&!active)void load();else void control('all',!active)}}>{busy?'변경 중…':active?'전체 중지':error?'다시 확인':'전체 시작'}</button>
   <div className="mt-3 space-y-1.5" role="group" aria-label="자동 실행 기능">
     {([['orders','자동 주문'],['chat','AI 채팅'],['viewers','시청자 입장·퇴장']] as const).map(([key,label])=><button key={key} type="button" role="switch" aria-checked={Boolean(state?.[key])} aria-label={label} disabled={!state||busy||!state.ready} onClick={()=>void control(key,!state?.[key])} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-2.5 text-left text-[13px] font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50"><span>{label}</span><span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${state?.[key]?'bg-ink text-white':'border border-line bg-surface text-ink-soft'}`}>{state?.[key]?'켜짐':'꺼짐'}</span></button>)}
   </div>
   <div className="mt-3 rounded-xl border border-line bg-surface-2/40 p-2.5">
     <div className="flex items-center justify-between gap-2">
       <span className="text-[12px] font-bold text-ink">주문 양</span>
       <div className="flex min-w-0 gap-1" role="group" aria-label="주문 양">{([['low','적게'],['normal','보통'],['high','많게']] as const).map(([k,l])=><button key={k} type="button" aria-pressed={pace===k} disabled={!state?.ready} onClick={()=>void changePace(k)} className={`min-h-9 rounded-lg px-2 text-[12px] font-bold transition disabled:opacity-50 ${pace===k?'bg-ink text-white':'border border-line bg-surface text-ink'}`}>{l}</button>)}</div>
     </div>
     <div className="mt-2 flex items-center justify-between gap-2">
       <span className="text-[12px] font-bold text-ink">채팅 양</span>
       <div className="flex min-w-0 gap-1" role="group" aria-label="채팅 양">{([['low','적게'],['normal','보통'],['high','많게']] as const).map(([k,l])=><button key={k} type="button" aria-pressed={chatPace===k} disabled={!state?.ready} onClick={()=>void changeChatPace(k)} className={`min-h-9 rounded-lg px-2 text-[12px] font-bold transition disabled:opacity-50 ${chatPace===k?'bg-ink text-white':'border border-line bg-surface text-ink'}`}>{l}</button>)}</div>
     </div>
   </div>
   <div className="mt-3 space-y-1 text-[12px] text-ink-soft">
     {state?.viewers?<p>시청 중 <strong className="text-ink">{state.activeViewers}명</strong></p>:null}
     {state?.orders&&state.nextOrderAt?<p role="status">{Date.parse(state.nextOrderAt)>Date.now()?`다음 주문 ${time(state.nextOrderAt)}쯤`:'주문 준비·제출 확인 중'}</p>:null}
     {state?.last&&!AI_SKIP.test(String(state.last.message||''))?<p className={`leading-snug ${state.last.ok?'text-ink-soft':'text-danger-tx'}`}>{time(state.last.at)} · {state.last.message}</p>:null}
     {state&&!state.ready?<p>실행 기능을 준비 중이에요.</p>:null}
   </div>
   <div data-ruru-ai-usage-card="v2" className="mt-3 rounded-xl border border-line bg-surface-2/40 p-2.5">
     <button type="button" className="flex min-h-10 w-full items-center justify-between gap-2 text-left" aria-expanded={usageOpen} aria-controls="ruru-ai-usage-details" onClick={()=>setUsageOpen(v=>!v)}>
       <span className="text-[12px] font-bold text-ink">AI 사용량 <span className="font-normal text-ink-mute">· 사이트 집계</span></span>
       <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink-soft">{primaryUsage?(primaryUsage.used===null?'확인 불가':`${primaryUsage.used} / ${primaryUsage.limit}`):'확인 중'} <span aria-hidden="true">{usageOpen?'⌃':'⌄'}</span></span>
     </button>
     {primaryUsage&&primaryUsage.used!==null?<div className="h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-ink" style={{width:`${Math.min(100,Math.max(0,primaryUsage.used/Math.max(1,primaryUsage.limit)*100))}%`}} /></div>:null}
     {usageOpen?<div id="ruru-ai-usage-details" className="mt-3 space-y-3 border-t border-line pt-3">
       {usage.length?usage.map(g=><div key={g.model} className="text-[12px] text-ink-soft">
         <div className="flex items-center justify-between gap-2"><span>{g.model.replace('gemini-','').replace('-flash-lite',' Lite').replace('-flash',' Flash')}</span><span className="tabular-nums">{g.used===null?'확인 불가':`${g.used} / ${g.limit}`}</span></div>
         <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-ink" style={{width:`${g.used===null?0:Math.min(100,Math.max(0,g.used/Math.max(1,g.limit)*100))}%`}} /></div>
         {g.blockedUntil>Date.now()?<div className="mt-1">{time(g.blockedUntil)}까지 대기</div>:null}
       </div>):<div className="text-[12px] text-ink-soft">사용량을 확인하지 못했어요.</div>}
       <p className="text-[11px] leading-relaxed text-ink-mute">이 숫자는 사이트 자체 호출 집계예요. 실제 무료 API 한도는 Google AI Studio에서 확인해 주세요.</p>
     </div>:null}
   </div>
   <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
     <a href="/order" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[12px] font-semibold text-ink">방송화면 ↗</a>
     <button type="button" className="inline-flex min-h-11 items-center rounded-lg px-2 text-[12px] font-bold text-ink-soft hover:bg-surface-2" aria-expanded={details} aria-controls="live-automation-details" onClick={()=>setDetails(!details)}>{details?'고급 설정 접기 −':'고급 설정 +'} </button>
   </div>
   {error?<p role="alert" className="mt-1 text-[12px] leading-relaxed text-danger-tx">{error}</p>:null}
   {details?<div id="live-automation-details" className="mt-2 space-y-3 rounded-xl border border-line bg-surface-2/30 p-2.5">
     <div className="rounded-lg border border-line bg-surface-2/40 p-2.5">
       <div className="mb-1 text-[12px] font-bold text-ink">실전 연습 설정</div>
       <div className="flex items-center justify-between gap-2">
         <div className="min-w-0"><div className="text-[12px] font-semibold text-ink">과거 구매 테스트 문구 공개</div><p className="mt-1 text-[11px] leading-relaxed text-ink-mute">연습 후 반드시 꺼 주세요. 켜면 일반 손님 화면에도 테스트 구매 문구가 보일 수 있어요.</p></div>
         <button type="button" role="switch" aria-checked={memoryPublic} disabled={!state?.ready} onClick={()=>void toggleMemory()} className={`${button} shrink-0 ${memoryPublic?'bg-ink text-white':'border border-line text-ink'}`}>{memoryPublic?'켬':'끔'}</button>
       </div>
     </div>
     <button type="button" className={`${button} w-full border border-line text-ink`} disabled={!state?.ready||busy||runningOnce||Boolean(state.manualAction)} onClick={()=>void run()}>{runningOnce?'주문 처리 중…':'테스트 주문 1회 실행'}</button>
     {orders>0?<button type="button" className={`${button} w-full border border-line text-danger-tx`} disabled={!state||busy||runningOnce} onClick={()=>void remove()}>테스트 주문 {orders}건 삭제</button>:null}
   </div>:null}
 </section>;
}
