'use client';
import {useEffect,useState} from 'react';
type AccessRow={at?:string;ip?:string;region?:string;source?:string};
export default function MemberAccessHistory({kakaoId}:{kakaoId:string}){
  const [result,setResult]=useState<{loading:boolean;records:AccessRow[];message:string}>({loading:true,records:[],message:''});
  useEffect(()=>{
    let mounted=true;
    if(!/^\d{1,30}$/.test(kakaoId)){setResult({loading:false,records:[],message:'카카오 계정이 연결되지 않아 IP를 특정할 수 없습니다.'});return;}
    setResult({loading:true,records:[],message:''});
    fetch(`/api/admin-live/customer-access?kakaoId=${encodeURIComponent(kakaoId)}`,{cache:'no-store'})
      .then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.message||'조회 실패');return j;})
      .then(j=>{if(mounted)setResult({loading:false,records:j.records||[],message:j.message||''});})
      .catch(e=>{if(mounted)setResult({loading:false,records:[],message:e instanceof Error?e.message:'접속기록 조회 실패'});});
    return ()=>{mounted=false;};
  },[kakaoId]);
  return <section aria-label="회원 접속 기록" className="rounded-xl border border-line bg-surface px-4 py-3">
    <div className="flex items-baseline justify-between gap-2"><h3 className="text-[15px] font-semibold text-ink">접속 IP · 지역</h3><span className="text-[12px] text-ink-mute">최근 연결된 기록</span></div>
    <p className="mt-1 break-keep text-[12px] leading-5 text-ink-soft">IP 기반 지역은 추정 정보로 실제 거주지를 뜻하지 않습니다. 과거 기록에는 지역이 없을 수 있습니다.</p>
    {result.loading?<p role="status" className="mt-4 text-[13px] text-ink-soft">접속 기록을 조회하고 있어요…</p>:result.records.length?<div className="mt-3 divide-y divide-line">{result.records.map((r,i)=><div key={`${r.at}-${i}`} className="py-3 text-[13px]">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><strong className="text-ink">{r.region||'지역 미기록'}</strong><time className="text-[12px] text-ink-mute">{r.at?new Date(r.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'-'}</time></div>
      <p className="mt-1 break-all font-mono text-[12px] text-ink-soft">{r.ip||'IP 기록 없음'}</p>
    </div>)}</div>:<p className="mt-4 text-[13px] text-ink-soft">{result.message||'확인 가능한 접속 기록이 없습니다.'}</p>}
    <p className="mt-3 text-[11px] leading-4 text-ink-mute">기존 접속 기록은 동일 브라우저·닉네임 기준의 참고 정보이며, 계정 소유의 확정 증거로 사용하지 마세요.</p>
  </section>;
}
