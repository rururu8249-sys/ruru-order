import type {DiscountSetting} from '@/lib/productDiscount';
export default function DiscountDisplayEditor({value,onChange,actualPrice}:{value:DiscountSetting;onChange:(value:DiscountSetting)=>void;actualPrice:number}){
 return <div style={{marginTop:16,padding:12,border:'1px solid var(--color-line)',borderRadius:8}}>
  <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600}}><input type="checkbox" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>사이트 할인 표시</label>
  {value.enabled&&<label style={{display:'block',fontSize:13,fontWeight:600,marginTop:8}}>원래 판매가<input aria-label="원래 판매가" inputMode="numeric" value={value.original_price||''} onChange={e=>onChange({...value,original_price:Number(e.target.value.replace(/\D/g,''))||0})} style={{display:'block',width:'100%',height:36,boxSizing:'border-box',padding:'0 12px',border:'1px solid var(--color-line)',borderRadius:8,marginTop:4,fontSize:13}}/>{value.original_price<=actualPrice&&<span style={{display:'block',marginTop:4,fontSize:12,fontWeight:400,color:'var(--color-danger-tx)'}}>실제 판매가보다 큰 금액을 넣어 주세요.</span>}</label>}
  <div style={{fontSize:12,color:'var(--color-ink-mute)',marginTop:6}}>결제 금액은 실제 판매가 그대로 · 방송 위젯에는 할인 표시 없음</div>
 </div>;
}
