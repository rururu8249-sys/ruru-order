'use client';
// [2026-11-12 사장님 「그립처럼 처음 온 손님 선물」] 방송 제목 아래 흰 알약 「처음 오신 선물 2,000P 0:24 (?)」.
//   화면을 보고 있을 때만 초가 줄어들고, 0 이 되면 서버에 «받기» 요청 → 서버가 조건을 다시 확인해 기존 포인트 지급 RPC 로 한 번만 지급.
//   지급되면 'ruru-point-gift-refresh' 소식 → 기존 포인트 선물 카드가 뜸. 「?」 = 설명 말풍선(「확인」으로 닫음).
//   여기서는 금액을 정하지 않는다(서버가 정함) — 화면은 보여 주기만.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {POINT_GIFT_REFRESH_EVENT, welcomeCouponHint} from '@/lib/welcomePoint';

// [2026-11-14 사장님 「30초 얼마 60초 얼마 구간」] tiers = 구간들(done = 이미 받음), tierIndex = 다음 받을 구간, ticket = 서버가 서명한 보기 시작 시각.
type Tier = {sec: number; amount: number; done?: boolean};
type Offer = {kind: 'first' | 'back'; amount: number; watchSec: number; tiers?: Tier[]; tierIndex?: number; ticket?: string; label: string; help: {title: string; lines: string[]}};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function LiveWelcomeChip() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [idx, setIdx] = useState(0); // 다음 받을 구간
  const [elapsed, setElapsed] = useState(0); // 이번에 보기 시작한 뒤 지난 초(화면 볼 때만)
  const [helpOpen, setHelpOpen] = useState(false);
  const claiming = useRef(false);
  const who = useRef<{kakao: string; phone: string} | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    const w = who.current;
    if (!w) return;
    const seq = ++loadSeq.current;
    fetch(`/api/live-welcome-point?kakao=${encodeURIComponent(w.kakao)}&phone=${encodeURIComponent(w.phone)}`, {cache: 'no-store'})
      .then((r) => r.json())
      .then((j) => {
        if (seq !== loadSeq.current) return;
        if (!j?.ok || !j.offer) { setOffer(null); return; }
        const o = j.offer as Offer;
        setOffer(o);
        setIdx(Math.max(0, Math.floor(Number(o.tierIndex) || 0)));
        setElapsed(0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let kakao = '';
    let phone = '';
    try {
      kakao = String(window.localStorage.getItem('ruru_kakao_id') || '').trim();
      phone = String(window.localStorage.getItem('ruru_customer_phone') || '').replace(/[^0-9]/g, '');
    } catch { /* 저장소 못 읽으면 안 보여 줌 */ }
    if (!kakao || phone.length < 10) return;
    who.current = {kakao, phone};
    load();
    return () => { loadSeq.current++; };
  }, [load]);

  const tiers: Tier[] = useMemo(() => (offer ? (offer.tiers && offer.tiers.length ? offer.tiers : [{sec: offer.watchSec, amount: offer.amount}]) : []), [offer]);
  const target = tiers[idx];
  const left = target ? Math.max(0, target.sec - elapsed) : 0;

  // 화면을 보고 있을 때만 1초씩
  useEffect(() => {
    if (!offer || !target || left <= 0) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setElapsed((v) => v + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [offer, target, left]);

  // [2026-11-14 사장님 「다른 거 하러 나가면 리셋」] 다른 앱·탭으로 가거나 화면이 꺼지면 처음부터 다시 셈.
  //   돌아오면 서버에서 새 «보기 시작 표»를 받아 다음 구간부터 다시(서버도 그 시각부터 셈).
  useEffect(() => {
    if (!offer) return;
    const onVis = () => {
      if (claiming.current) return;
      if (document.visibilityState === 'hidden') { loadSeq.current++; setElapsed(0); }
      else load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [offer, load]);

  useEffect(() => {
    if (!offer || !target || left > 0 || claiming.current || !who.current) return;
    claiming.current = true;
    fetch('/api/live-welcome-point', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store',
      body: JSON.stringify({kakao_id: who.current.kakao, phone: who.current.phone, ticket: offer.ticket || ''}),
    })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (j?.ok) window.dispatchEvent(new CustomEvent(POINT_GIFT_REFRESH_EVENT, {detail: {hint: welcomeCouponHint(tiers, idx)}}));
        const next = j?.ok && typeof j.next === 'number' && tiers[j.next] ? j.next : null;
        if (next != null) setIdx(next); // 같은 표로 다음 구간 이어서 셈(시간은 처음부터 누적)
        else { setOffer(null); setHelpOpen(false); }
      })
      .catch(() => { setOffer(null); setHelpOpen(false); })
      .finally(() => { claiming.current = false; });
  }, [offer, target, left, tiers, idx]);

  if (!offer || !target) return null;
  const total = tiers.reduce((n, t) => n + t.amount, 0);
  // [2026-11-14 사장님 「손님이 인지·체류」] 구간 여러 개면 처음엔 «최대 합계», 다음 구간부터는 «N P 더»
  const amt = tiers.length > 1 ? (idx === 0 ? `최대 ${total.toLocaleString('ko-KR')}P` : `${target.amount.toLocaleString('ko-KR')}P 더`) : `${target.amount.toLocaleString('ko-KR')}P`;
  const multi = tiers.length > 1;
  const lastSec = tiers[tiers.length - 1].sec || 1;
  return <span style={{position: 'relative', display: 'inline-flex', pointerEvents: 'auto', maxWidth: '100%'}}>
    <span style={{position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 4px 0 4px', borderRadius: 9999, background: '#fff', color: '#111', boxShadow: '0 2px 8px #0003', maxWidth: '100%'}}>
      {multi ? <span aria-hidden style={{position: 'absolute', left: 14, right: 14, bottom: 2, height: 3, borderRadius: 9999, background: '#E5E5E5'}}>
        <span style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (Math.min(elapsed, lastSec) / lastSec) * 100)}%`, borderRadius: 9999, background: '#D30005', transition: 'width 1s linear'}} />
        {tiers.map((t, i) => <span key={i} style={{position: 'absolute', top: -1, width: 5, height: 5, marginLeft: -2.5, borderRadius: 9999, left: `${Math.min(100, (t.sec / lastSec) * 100)}%`, background: i < idx || t.done ? '#D30005' : '#fff', border: '1px solid #D30005', boxSizing: 'border-box'}} />)}
      </span> : null}
      <span aria-hidden style={{width: 24, height: 24, borderRadius: 9999, background: '#D30005', display: 'grid', placeItems: 'center', flexShrink: 0}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
      </span>
      <span style={{fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{offer.label} {amt}</span>
      {target.sec > 0 ? <span aria-label={`${left}초 남음`} style={{fontSize: 13, fontWeight: 800, color: '#D30005', fontVariantNumeric: 'tabular-nums', flexShrink: 0}}>{fmt(left)}</span> : null}
      <button type="button" onClick={() => setHelpOpen((v) => !v)} aria-label="선물 설명 보기" aria-expanded={helpOpen}
        style={{width: 32, height: 32, margin: '0 -4px 0 -4px', padding: 0, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0}}>
        <span aria-hidden style={{width: 20, height: 20, borderRadius: 9999, border: '1.5px solid #707072', color: '#707072', fontSize: 12, fontWeight: 700, lineHeight: '17px', textAlign: 'center', fontFamily: 'inherit'}}>?</span>
      </button>
    </span>
    {helpOpen ? <span role="dialog" aria-label={offer.help.title}
      style={{position: 'absolute', top: 40, left: 0, zIndex: 5, width: 'min(300px, calc(100vw - 32px))', boxSizing: 'border-box', padding: 16, borderRadius: 16, background: '#fff', color: '#111', boxShadow: '0 8px 24px #0004', display: 'grid', gap: 10, textAlign: 'left'}}>
      <span style={{fontSize: 15, fontWeight: 700, lineHeight: '21px'}}>{offer.help.title}</span>
      <span style={{display: 'grid', gap: 4}}>
        {offer.help.lines.map((l) => <span key={l} style={{display: 'flex', gap: 6, fontSize: 13, lineHeight: '19px', color: '#333', wordBreak: 'keep-all'}}><span aria-hidden>•</span><span>{l}</span></span>)}
      </span>
      <button type="button" onClick={() => setHelpOpen(false)}
        style={{height: 44, border: 0, borderRadius: 9999, background: '#111', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer'}}>확인</button>
    </span> : null}
  </span>;
}
