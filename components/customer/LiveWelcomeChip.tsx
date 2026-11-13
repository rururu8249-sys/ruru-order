'use client';
// [2026-11-12 사장님 「그립처럼 처음 온 손님 선물」] 방송 제목 아래 흰 알약 「처음 오신 선물 2,000P 0:24 (?)」.
//   화면을 보고 있을 때만 초가 줄어들고, 0 이 되면 서버에 «받기» 요청 → 서버가 조건을 다시 확인해 기존 포인트 지급 RPC 로 한 번만 지급.
//   지급되면 'ruru-point-gift-refresh' 소식 → 기존 포인트 선물 카드가 뜸. 「?」 = 설명 말풍선(「확인」으로 닫음).
//   여기서는 금액을 정하지 않는다(서버가 정함) — 화면은 보여 주기만.
import {useEffect, useRef, useState} from 'react';
import {POINT_GIFT_REFRESH_EVENT} from '@/lib/welcomePoint';

type Offer = {kind: 'first' | 'back'; amount: number; watchSec: number; label: string; help: {title: string; lines: string[]}};


const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function LiveWelcomeChip() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [left, setLeft] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const claiming = useRef(false);
  const who = useRef<{kakao: string; phone: string} | null>(null);

  useEffect(() => {
    let alive = true;
    let kakao = '';
    let phone = '';
    try {
      kakao = String(window.localStorage.getItem('ruru_kakao_id') || '').trim();
      phone = String(window.localStorage.getItem('ruru_customer_phone') || '').replace(/[^0-9]/g, '');
    } catch { /* 저장소 못 읽으면 안 보여 줌 */ }
    if (!kakao || phone.length < 10) return;
    who.current = {kakao, phone};
    fetch(`/api/live-welcome-point?kakao=${encodeURIComponent(kakao)}&phone=${encodeURIComponent(phone)}`, {cache: 'no-store'})
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.ok || !j.offer) return;
        setOffer(j.offer as Offer);
        setLeft(Math.max(0, Math.floor(Number(j.offer.watchSec) || 0)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 화면을 보고 있을 때만 1초씩
  useEffect(() => {
    if (!offer || left <= 0) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setLeft((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [offer, left]);

  // [2026-11-14 사장님 「다른 거 하러 나가면 리셋」] 다른 앱·탭으로 가거나 화면이 꺼지면 처음부터 다시 셈(멈춤 아님)
  useEffect(() => {
    if (!offer) return;
    const full = Math.max(0, Math.floor(Number(offer.watchSec) || 0));
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !claiming.current) setLeft(full);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [offer]);

  useEffect(() => {
    if (!offer || left > 0 || claiming.current || !who.current) return;
    claiming.current = true;
    fetch('/api/live-welcome-point', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store',
      body: JSON.stringify({kakao_id: who.current.kakao, phone: who.current.phone}),
    })
      .then((r) => r.json().catch(() => null))
      .then((j) => { if (j?.ok) window.dispatchEvent(new Event(POINT_GIFT_REFRESH_EVENT)); })
      .catch(() => {})
      .finally(() => { setOffer(null); setHelpOpen(false); });
  }, [offer, left]);

  if (!offer) return null;
  const amt = `${offer.amount.toLocaleString('ko-KR')}P`;
  return <span style={{position: 'relative', display: 'inline-flex', pointerEvents: 'auto', maxWidth: '100%'}}>
    <span style={{display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 4px 0 4px', borderRadius: 9999, background: '#fff', color: '#111', boxShadow: '0 2px 8px #0003', maxWidth: '100%'}}>
      <span aria-hidden style={{width: 24, height: 24, borderRadius: 9999, background: '#D30005', display: 'grid', placeItems: 'center', flexShrink: 0}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
      </span>
      <span style={{fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{offer.label} {amt}</span>
      {offer.watchSec > 0 ? <span aria-label={`${left}초 남음`} style={{fontSize: 13, fontWeight: 800, color: '#D30005', fontVariantNumeric: 'tabular-nums', flexShrink: 0}}>{fmt(left)}</span> : null}
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
