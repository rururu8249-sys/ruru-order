import {resolveProductDiscount} from '@/lib/productDiscount';
export default function ProductDiscountLabel({note,actualPrice,detail=''}:{note:unknown;actualPrice:number;detail?:string}){
  const discount=resolveProductDiscount(note,actualPrice,detail);
  if(!discount)return null;
  return <span data-product-discount style={{display:'inline-flex',flexWrap:'wrap',alignItems:'baseline',gap:5,fontSize:12,lineHeight:1.4,fontWeight:700}}>
    <del aria-label={`원래 판매가 ${discount.originalPrice.toLocaleString('ko-KR')}원`} style={{color:'#6B6468'}}>{discount.originalPrice.toLocaleString('ko-KR')}원</del>
    <span style={{color:'#B42318'}}>{discount.percent}% 할인</span>
  </span>;
}
