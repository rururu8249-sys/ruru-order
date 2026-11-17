'use client';
import {useCallback,useEffect,useState} from 'react';
type PoolRow={nickname_key:string;nickname:string;category:string;status:string;updated_at:string|null};
type ActorRow={id:string;nickname:string;created_at:string;retired_at:string|null;order_count:number;profile:Record<string,unknown>|null};
type OrderRow={actor_id:string;completed_at:string|null;status:string;items:{name:string;color:string;size:string;qty:number}[]};
type Payload={ok:boolean;message?:string;total:number;unused:number;assigned:number;filtered:number;page:number;pages:number;items:PoolRow[];selected:{key:string;actors:ActorRow[];orders:OrderRow[]}|null};
const dt=(s:string|null|undefined)=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'-';
export default function AdminLiveAiMembersPanel(){
 const [q,setQ]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[key,setKey]=useState('');
 const [data,setData]=useState<Payload|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  const ctrl=new AbortController();setLoading(true);setError('');
  try{const p=new URLSearchParams({page:String(page),q:search});if(key)p.set('key',key);
   const r=await fetch('/api/admin-live/ai-members?'+p.toString(),{cache:'no-store',signal:ctrl.signal});
   const j=await r.json();if(!r.ok||!j.ok)throw Error(j.message||'목록을 가져오지 못했습니다.');setData(j);
  }catch(e){setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}finally{setLoading(false)}
  return()=>ctrl.abort();
 },[page,search,key]);
 useEffect(()=>{void load()},[load]);
 const selected=data?.selected;
 return <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm max-md:p-3" aria-label="AI 회원 관리">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h2 className="text-lg font-black text-ink">AI 회원</h2><p className="mt-1 text-xs text-ink-mute">테스트 계정 전용 · 실제 고객 및 매출과 분리 · 읽기 전용</p></div>
   <button type="button" onClick={()=>void load()} disabled={loading} className="min-h-10 rounded-xl border border-line px-3 text-xs font-bold text-ink disabled:opacity-50">새로고침</button>
  </div>
  <div className="mt-4 grid grid-cols-3 gap-2">
   {([['후보 전체',data?.total],['미사용',data?.unused],['배정됨',data?.assigned]] as const).map(([label,value])=><div key={label} className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-ink-mute">{label}</div><div className="mt-1 text-xl font-black text-ink tabular-nums">{value?.toLocaleString('ko-KR')??'-'}</div></div>)}
  </div>
  <form className="mt-4 flex gap-2" onSubmit={e=>{e.preventDefault();setPage(1);setKey('');setSearch(q)}}>
   <input className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ink" placeholder="AI 닉네임 검색" value={q} onChange={e=>setQ(e.target.value)} aria-label="AI 닉네임 검색"/>
   <button type="submit" className="min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white">검색</button>
  </form>
  {error?<div role="alert" className="mt-3 text-xs text-danger-tx">{error}</div>:null}
  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
   <div className="min-w-0 overflow-hidden rounded-xl border border-line">
    <div className="flex justify-between border-b border-line bg-surface-2 px-3 py-2 text-xs font-bold text-ink-soft"><span>닉네임 후보 {data?.filtered.toLocaleString('ko-KR')??'-'}개</span><span>선택하면 이력 표시</span></div>
    <div className="divide-y divide-line">{(data?.items||[]).map(x=><button key={x.nickname_key} type="button" onClick={()=>setKey(x.nickname_key)} className={`flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left hover:bg-surface-2 ${key===x.nickname_key?'bg-surface-2':''}`}>
     <span className="min-w-0"><span className="block truncate text-sm font-bold text-ink">{x.nickname}</span><span className="block text-[11px] text-ink-mute">{x.category||'기타'} · {dt(x.updated_at)}</span></span>
     <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[11px] text-ink-soft">{x.status==='assigned'?'사용됨':x.status==='unused'?'미사용':'사용 중지'}</span>
    </button>)}{!loading&&data?.items.length===0?<p className="p-4 text-center text-xs text-ink-mute">검색 결과 없음</p>:null}</div>
    <div className="flex items-center justify-between border-t border-line px-3 py-2"><button type="button" className="rounded-lg border border-line px-3 py-2 text-xs disabled:opacity-40" disabled={page<=1} onClick={()=>{setPage(v=>v-1);setKey('')}}>이전</button><span className="text-xs text-ink-mute">{page} / {data?.pages||1}</span><button type="button" className="rounded-lg border border-line px-3 py-2 text-xs disabled:opacity-40" disabled={page>=(data?.pages||1)} onClick={()=>{setPage(v=>v+1);setKey('')}}>다음</button></div>
   </div>
   <aside className="min-w-0 rounded-xl border border-line p-3">
    <h3 className="text-sm font-black text-ink">AI 계정 프로필·이력</h3>
    {!selected?<p className="mt-3 text-xs leading-5 text-ink-mute">왼쪽에서 닉네임을 선택하면 저장된 가상 계정 프로필과 실제 테스트 주문 작업 기록을 확인할 수 있어요.</p>:<>
     <p className="mt-2 text-xs text-ink-soft">같은 닉네임의 과거 가상 계정 {selected.actors.length}건 (최대 15건 표시)</p>
     {selected.actors.map(a=><div key={a.id} className="mt-3 rounded-lg bg-surface-2 p-3">
      <div className="flex justify-between gap-2"><span className="text-sm font-semibold text-ink">{a.nickname}</span><span className="text-[11px] text-ink-mute">{dt(a.created_at)}</span></div>
      <div className="mt-1 text-xs leading-5 text-ink-soft">{a.retired_at?'지난 계정':'활동 계정'} · 테스트 주문 {a.order_count||0}건</div>
      <div className="mt-1 text-xs leading-5 text-ink-soft">말투: {String(a.profile?.style||'미설정')} · 취향: {String(a.profile?.interest||'미설정')}</div>
     </div>)}
     <h4 className="mt-4 text-xs font-bold text-ink">테스트 주문 작업 이력</h4>
     {selected.orders.length?selected.orders.map((o,i)=><div key={i} className="border-b border-line py-2 text-xs text-ink-soft"><div>{dt(o.completed_at)} · {o.status==='succeeded'?'작업 성공':o.status}</div>{o.items.map((it,j)=><div key={j} className="mt-1 text-ink">{it.name} {it.color} {it.size} ×{it.qty}</div>)}</div>):<p className="mt-2 text-xs text-ink-mute">저장된 테스트 주문 작업 없음</p>}
     <p className="mt-3 text-[11px] leading-5 text-ink-mute">같은 이름의 과거 계정은 아직 영구 인물 ID로 연결하지 않았습니다. 현재 정보는 관찰용이며 실제 고객 주문이 아닙니다.</p>
    </>}
   </aside>
  </div>
 </section>;
}
