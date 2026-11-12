'use client';
import type {LiveWatchItem} from '@/lib/liveWatch';

// [2026-11-12 22:46 사장님 「옆으로 넘기지 말고 그 자리에서 바뀌게 · 바뀔 때 자연스럽게 · 폭 조금 줄여」]
//   카드 1장이 제자리에서 바뀜 — 상품이 바뀌면 안쪽만 살짝 아래에서 올라오며 나타남(0.32초, 동작 줄이기 설정이면 안 움직임).
//   폭은 최대 360px(넓은 PC 채팅에서 상품명~담기 사이가 휑하던 것), 폰은 원래대로 채팅 폭.
//   누르는 동작은 예전 그대로 — 여러 개 도는 중이면 «소개 중 상품 목록», 1개면 그 상품 창(바뀌는 순간 잘못 누르는 일 방지).
const keyOf = (p: LiveWatchItem) => `${p.id}|${p.detailName || ''}`;

export function LiveFeaturedProductCard({product, count, label = '지금 소개하는 상품', onOpen, onShowProducts, onHide}: {
  product: LiveWatchItem | null; count: number;
  label?: string;
  onOpen: (id: string, detailName?: string) => void;
  onShowProducts: () => void;
  /** 채팅 관리자에게만 넘김 — 카드 오른쪽 「끄기」(손님 화면에서 카드 숨김) */
  onHide?: () => void;
}) {
  if (!product || count < 1) return null;
  return <div data-featured-product-card style={{pointerEvents: 'auto', flexShrink: 0, width: '100%', maxWidth: 360, boxSizing: 'border-box', borderRadius: 14, background: '#fff', color: '#111', overflow: 'hidden', boxShadow: '0 2px 12px #0002', display: 'flex', alignItems: 'stretch'}}>
    <style>{`@keyframes ruruCardIn{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:none}}@media (prefers-reduced-motion: reduce){[data-featured-swap]{animation:none!important}}`}</style>
    <button key={keyOf(product)} data-featured-swap type="button" disabled={product.soldOut} onClick={() => count > 1 ? onShowProducts() : onOpen(product.id, product.detailName)} aria-label={`${product.name} 상품 선택`}
      style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', fontFamily: 'inherit', cursor: product.soldOut ? 'default' : 'pointer', animation: 'ruruCardIn .32s ease-out'}}>
      <span data-featured-image style={{width: 52, height: 52, flexShrink: 0, background: '#f5f5f5', borderRadius: 8, overflow: 'hidden'}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {product.imageUrl ? <img src={product.imageUrl} alt="" style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block', transform: 'scale(1.05)'}} /> : null}
      </span>
      <span style={{minWidth: 0, flex: 1, display: 'grid', gap: 1}}>
        <span data-featured-label style={{fontSize: 11, lineHeight: '13px', color: '#9b3600', fontWeight: 700}}>{label}</span>
        <span style={{fontSize: 14, lineHeight: '18px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{product.name}</span>
        <span style={{fontSize: 15, lineHeight: '19px', fontWeight: 800}}>{product.priceText}</span>
      </span>
      <span style={{flexShrink: 0, minHeight: 40, padding: '0 14px', borderRadius: 24, background: product.soldOut ? '#E5E5E5' : '#111', color: product.soldOut ? '#707072' : '#fff', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700}}>{product.soldOut ? '품절' : '상품 선택'}</span>
    </button>
    {onHide ? <button type="button" onClick={onHide} aria-label="사이트 상품 카드 끄기 (관리자)" title="손님 화면에서 이 카드를 숨겨요"
      style={{flexShrink: 0, width: 48, border: 0, borderLeft: '1px solid #eee', background: '#f5f5f5', color: '#707072', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2}}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>끄기
    </button> : null}
  </div>;
}
