'use client';

import {useEffect, useState} from 'react';

type AccessRow = {at?: string; ip?: string; region?: string; source?: string};
type AccessResult = {loading: boolean; error: boolean; records: AccessRow[]; message: string};

export default function MemberAccessHistory({kakaoId}: {kakaoId: string}) {
  const [result, setResult] = useState<AccessResult>({loading: true, error: false, records: [], message: ''});
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!/^\d{1,30}$/.test(kakaoId)) {
      setResult({loading: false, error: false, records: [], message: '카카오 미연동 회원은 접속 기록을 확인할 수 없습니다.'});
      return;
    }
    setResult({loading: true, error: false, records: [], message: ''});
    fetch(`/api/admin-live/customer-access?kakaoId=${encodeURIComponent(kakaoId)}`, {cache: 'no-store'})
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.message || '조회 실패');
        return payload;
      })
      .then(payload => {
        if (mounted) setResult({loading: false, error: false, records: payload.records || [], message: payload.message || ''});
      })
      .catch(() => {
        if (mounted) setResult({loading: false, error: true, records: [], message: '접속 기록을 불러오지 못했습니다.'});
      });
    return () => {mounted = false;};
  }, [kakaoId, retryKey]);

  return <section aria-label="회원 접속 기록" className="min-w-0">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-bold text-ink">접속 IP · 지역</h3>
      <span className="text-xs text-ink-mute">참고 기록</span>
    </div>
    <p className="mt-1 text-xs leading-5 text-ink-soft">IP 지역은 실제 거주지와 다를 수 있습니다.</p>
    {result.loading ? <p role="status" className="py-6 text-center text-[13px] text-ink-mute">접속 기록을 불러오는 중…</p>
      : result.error ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-danger-tx">
        <span>{result.message}</span>
        <button type="button" onClick={() => setRetryKey(key => key + 1)} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink">다시 조회</button>
      </div>
      : result.records.length ? <div className="mt-3 divide-y divide-line border-y border-line">{result.records.map((record, index) => <div key={`${record.at}-${index}`} className="py-3 text-[13px]">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
          <strong className="font-semibold text-ink">{record.region || '지역 미기록'}</strong>
          <time className="text-xs tabular-nums text-ink-mute">{record.at ? new Date(record.at).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) : '-'}</time>
        </div>
        <p className="mt-1 break-all text-xs tabular-nums text-ink-soft">{record.ip || 'IP 기록 없음'}</p>
      </div>)}</div>
      : <p className="py-6 text-[13px] text-ink-mute">{result.message || '확인 가능한 접속 기록이 없습니다.'}</p>}
    <p className="mt-3 text-xs leading-5 text-ink-mute">동일 브라우저·닉네임 연결이며, 계정 소유 증거는 아닙니다.</p>
  </section>;
}
