import {resolveProductDiscount} from '@/lib/productDiscount';
// [㉜] tone='v2' = 손님화면 새 모양(DESIGN.md §3: 정가 14px mute 취소선 + 「N% 할인」 sale). 기본(없음)은 기존 그대로.
export default function ProductDiscountLabel({note,actualPrice,detail='',tone}:{note:unknown;actualPrice:number;detail?:string;tone?:'v2'}){
  const discount=resolveProductDiscount(note,actualPrice,detail);
  if(!discount)return null;
  if(tone==='v2')return <span data-product-discount style={{display:'inline-flex',flexWrap:'wrap',alignItems:'baseline',gap:6,fontSize:14,lineHeight:1.5}}>
    <del aria-label={`원래 판매가 ${discount.originalPrice.toLocaleString('ko-KR')}원`} style={{color:'#707072',fontWeight:400}}>{discount.originalPrice.toLocaleString('ko-KR')}원</del>
    <span style={{color:'#D30005',fontWeight:600}}>{discount.percent}% 할인</span>
  </span>;
  return <span data-product-discount style={{display:'inline-flex',flexWrap:'wrap',alignItems:'baseline',gap:5,fontSize:12,lineHeight:1.4,fontWeight:700}}>
    <del aria-label={`원래 판매가 ${discount.originalPrice.toLocaleString('ko-KR')}원`} style={{color:'#6B6468'}}>{discount.originalPrice.toLocaleString('ko-KR')}원</del>
    <span style={{color:'#B42318'}}>{discount.percent}% 할인</span>
  </span>;
}
