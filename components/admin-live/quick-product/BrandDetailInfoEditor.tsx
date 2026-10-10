import type { CSSProperties } from 'react';
import { normalizeDetailChips, type DetailInfo } from '@/lib/productDetailInfo';

type Preview = {chips:string[];description:string};
const field:CSSProperties={width:'100%',boxSizing:'border-box',padding:12,border:'1px solid var(--color-line)',borderRadius:8,background:'var(--color-surface)',color:'var(--color-ink)',fontSize:14};
export default function BrandDetailInfoEditor({value,onChange,parentPreview}:{value:DetailInfo;onChange:(value:DetailInfo)=>void;parentPreview:Preview}) {
  const preview = value.mode==='inherit'?parentPreview:value.mode==='hidden'?{chips:[],description:''}:{chips:normalizeDetailChips(value.chips),description:value.description};
  return <section style={{display:'grid',gap:14}}>
    <label style={{fontSize:14,fontWeight:800}}>정보 적용 방식
      <select aria-label="정보 적용 방식" value={value.mode} onChange={event=>onChange({...value,mode:event.target.value as DetailInfo['mode']})} style={{...field,marginTop:6}}>
        <option value="inherit">브랜드 정보 따름</option><option value="custom">이 상품 정보 사용</option><option value="hidden">표시 안 함</option>
      </select>
    </label>
    {value.mode==='custom' && <>
      <label style={{fontSize:14,fontWeight:800}}>한눈에 정보
        <input aria-label="한눈에 정보" value={value.chips.join(',')} onChange={event=>onChange({...value,chips:event.target.value.split(/[,\n]/)})} onBlur={()=>onChange({...value,chips:normalizeDetailChips(value.chips)})} placeholder="면 100%, 국내배송, 세탁기 가능" style={{...field,marginTop:6}} />
        <small style={{display:'block',marginTop:6,color:'var(--color-ink-mute)',fontWeight:400}}>쉼표로 구분해 주세요. 아래 미리보기에 실제 표시됩니다.</small>
      </label>
      <label style={{fontSize:14,fontWeight:800}}>상세설명
        <textarea aria-label="상세설명" value={value.description} onChange={event=>onChange({...value,description:event.target.value})} rows={6} placeholder="소재, 핏, 실측, 관리 방법 등을 적어주세요." style={{...field,marginTop:6,resize:'vertical',lineHeight:1.6}} />
      </label>
    </>}
    <div aria-label="고객 표시 미리보기" style={{padding:16,border:'1px solid var(--color-line)',borderRadius:10,background:'var(--color-surface-2)'}}>
      <strong style={{fontSize:13}}>고객 표시 미리보기</strong>
      {value.mode==='hidden'?<p style={{color:'var(--color-ink-mute)'}}>상품 정보를 표시하지 않습니다.</p>:<>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}>{preview.chips.map(chip=><span key={chip} style={{maxWidth:'100%',boxSizing:'border-box',overflowWrap:'anywhere',padding:'5px 10px',borderRadius:20,color:'var(--color-rose-deep)',background:'var(--color-rose-soft)',fontSize:13,fontWeight:700}}>{chip}</span>)}</div>
        <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.6,fontSize:14}}>{preview.description||'등록된 상세설명이 없습니다.'}</p>
      </>}
    </div>
    <small style={{color:'var(--color-ink-mute)'}}>상품 정보만 편집합니다. 주문 안내 문구는 별도 설정을 유지합니다.</small>
  </section>;
}
