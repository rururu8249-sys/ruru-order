import type {DiscountSetting} from '@/lib/productDiscount';
export default function DiscountDisplayEditor({value,onChange,actualPrice}:{value:DiscountSetting;onChange:(value:DiscountSetting)=>void;actualPrice:number}){
 return <div style={{marginTop:10,padding:12,border:'1px solid var(--color-line)',borderRadius:10}}>
  <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:800}}><input type="checkbox" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>사이트 할인 표시</label>
  {value.enabled&&<label style={{display:'block',fontSize:12,marginTop:8}}>원래 판매가 (원)<input aria-label="원래 판매가" inputMode="numeric" value={value.original_price||''} onChange={e=>onChange({...value,original_price:Number(e.target.value.replace(/\D/g,''))||0})} style={{display:'block',width:'100%',padding:8,border:'1px solid var(--color-line)',borderRadius:8,marginTop:4}}/>{value.original_price<=actualPrice&&<span style={{color:'#B42318'}}>실제 판매가보다 큰 금액을 입력하세요.</span>}</label>}
  <div style={{fontSize:11,color:'var(--color-ink-mute)',marginTop:6}}>결제 금액은 실제 판매가 그대로 · 방송 위젯에는 할인 표시 없음</div>
 </div>;
}
