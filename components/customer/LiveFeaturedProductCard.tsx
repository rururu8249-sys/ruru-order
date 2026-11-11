'use client';
import type {LiveWatchItem} from '@/lib/liveWatch';

export function LiveFeaturedProductCard({product, count, onOpen, onShowProducts}: {
  product: LiveWatchItem | null; count: number;
  onOpen: (id: string, detailName?: string) => void;
  onShowProducts: () => void;
}) {
  if (!product || count < 1) return null;
  return <div data-featured-product-card style={{pointerEvents: 'auto', flexShrink: 0, borderRadius: 14, background: '#fff', color: '#111', overflow: 'hidden', boxShadow: '0 2px 12px #0002'}}>
    <button type="button" disabled={product.soldOut} onClick={() => count > 1 ? onShowProducts() : onOpen(product.id, product.detailName)} aria-label={`${product.name} 상품 선택`}
      style={{width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer'}}>
      <span data-featured-image style={{width: 48, height: 56, flexShrink: 0, background: '#f5f5f5', borderRadius: 8, overflow: 'hidden'}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {product.imageUrl ? <img src={product.imageUrl} alt="" style={{width: '100%', height: '100%', objectFit: 'contain'}} /> : null}
      </span>
      <span style={{minWidth: 0, flex: 1, display: 'grid', gap: 2}}>
        <span data-featured-label style={{fontSize: 11, color: '#9b3600', fontWeight: 700}}>지금 소개하는 상품</span>
        <span style={{fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{product.name}</span>
        <span style={{fontSize: 15, fontWeight: 800}}>{product.priceText}</span>
      </span>
      <span style={{flexShrink: 0, minHeight: 44, padding: '0 12px', borderRadius: 24, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700}}>상품 선택</span>
    </button>

  </div>;
}
