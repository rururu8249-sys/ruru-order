'use client';
// [2026-11-12 사장님 「그립처럼」] 채팅 바로 위 상품 카드를 옆으로 넘겨 보기.
//   카드 순서는 위젯 순환 목록 그대로(고정) — 매 5초마다 순서가 바뀌면 손님이 누르기 어렵다.
//   지금 소개 중인 카드만 「소개 중」 표시, 그 카드가 화면 밖이면 손님이 8초 동안 안 만졌을 때만 그쪽으로 넘김.
//   담기 = 기존 상품 창 열기(onOpen) — 담기·재고·금액 로직 무접촉.
import {useEffect, useRef} from 'react';
import type {LiveWatchItem} from '@/lib/liveWatch';

const keyOf = (p: LiveWatchItem) => `${p.id}|${p.detailName || ''}`;

export function LiveProductCarousel({products, current, label = '소개 중', onOpen, onHide}: {
  products: LiveWatchItem[];
  current: LiveWatchItem | null;
  label?: string;
  onOpen: (id: string, detailName?: string) => void;
  /** 채팅 관리자에게만 — 손님 화면에서 카드 숨김 */
  onHide?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const touchedAt = useRef(0);
  const currentKey = current ? keyOf(current) : '';

  useEffect(() => {
    const row = rowRef.current;
    if (!row || !currentKey || Date.now() - touchedAt.current < 8000) return;
    const card = row.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(currentKey)}"]`);
    if (!card) return;
    const left = card.offsetLeft - row.offsetLeft;
    const visible = left >= row.scrollLeft && left + card.offsetWidth <= row.scrollLeft + row.clientWidth;
    if (!visible) row.scrollTo({left: Math.max(0, left - 4), behavior: 'smooth'});
  }, [currentKey]);

  if (products.length === 0) return null;
  const touch = () => { touchedAt.current = Date.now(); };
  return <div ref={rowRef} data-live-scroll="1" data-live-product-carousel onPointerDown={touch} onTouchStart={touch} onWheel={touch}
    style={{pointerEvents: 'auto', display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', touchAction: 'pan-x', overscrollBehaviorX: 'contain', scrollbarWidth: 'none', paddingBottom: 2}}>
    {products.map((p) => {
      const on = keyOf(p) === currentKey;
      return <div key={keyOf(p)} data-card-key={keyOf(p)} style={{flex: '0 0 auto', width: 236, maxWidth: '78%', boxSizing: 'border-box', borderRadius: 12, background: '#fff', color: '#111', display: 'flex', alignItems: 'center', gap: 8, padding: 6, boxShadow: on ? '0 0 0 2px #D30005' : '0 2px 10px #0002'}}>
        <button type="button" onClick={() => onOpen(p.id, p.detailName)} aria-label={`${p.name} 상품 보기`}
          style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer'}}>
          <span style={{position: 'relative', width: 48, height: 48, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#f5f5f5'}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.imageUrl ? <img src={p.imageUrl} alt="" style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} /> : null}
            {on ? <span style={{position: 'absolute', left: 0, right: 0, bottom: 0, background: '#D30005', color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: '16px', textAlign: 'center'}}>{label}</span> : null}
          </span>
          <span style={{minWidth: 0, flex: 1, display: 'grid', gap: 2}}>
            <span style={{fontSize: 13, lineHeight: '17px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{p.name}</span>
            <span style={{fontSize: 15, lineHeight: '19px', fontWeight: 800}}>{p.priceText}</span>
          </span>
        </button>
        <button type="button" disabled={p.soldOut} onClick={() => onOpen(p.id, p.detailName)}
          style={{flexShrink: 0, height: 36, minWidth: 52, padding: '0 12px', border: 0, borderRadius: 9999, background: p.soldOut ? '#E5E5E5' : '#111', color: p.soldOut ? '#707072' : '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: p.soldOut ? 'default' : 'pointer'}}>
          {p.soldOut ? '품절' : '담기'}
        </button>
      </div>;
    })}
    {onHide ? <button type="button" onClick={onHide} aria-label="사이트 상품 카드 끄기 (관리자)"
      style={{flex: '0 0 auto', width: 56, borderRadius: 12, border: '1px dashed rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer'}}>카드<br />끄기</button> : null}
  </div>;
}
