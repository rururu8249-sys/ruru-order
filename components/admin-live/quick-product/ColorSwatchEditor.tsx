"use client";

import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {suggestColorName} from '@/lib/adminColorNames';
import {normalizeSwatchMap, type ColorSwatchMap} from '@/lib/productColorSwatches';
import PhotoColorSampler from './PhotoColorSampler';

type Props = {labels: string[]; value: ColorSwatchMap; onChange: (value: ColorSwatchMap) => void};
const button: CSSProperties = {border:'1px solid var(--color-line)',borderRadius:7,padding:'6px 9px',background:'var(--color-surface)',color:'var(--color-ink)',cursor:'pointer',fontSize:12};

/** Display-only editor; mounting never changes a product or replaces an operator's correction. */
export default function ColorSwatchEditor({labels, value, onChange}: Props) {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [photoLabel,setPhotoLabel]=useState('');
  const mounted=useRef(true);
  const latest=useRef({labels,value,onChange});
  latest.current={labels,value,onChange};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const colors=labels.filter(label=>label.trim() && label!=='없음');
  const update=(label:string,hex:string|null)=>onChange({...value,...normalizeSwatchMap({[label]:hex})});
  if(!colors.length)return null;
  return <details style={{margin:'6px 0',maxWidth:'100%',fontSize:12}}>
    <summary style={{cursor:'pointer',fontWeight:700,padding:'6px 0'}}>색상 표시 <span style={{fontWeight:400,color:'var(--color-ink-mute)'}}>· 이름으로 채우거나 직접 선택</span></summary>
    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,margin:'6px 0'}}>
      <button type="button" aria-label="색상 이름으로 표시색 채우기" disabled={busy} style={button} onClick={async()=>{
        setBusy(true);setMessage('');
        const requested=colors.filter(label=>!Object.hasOwn(value,label));
        try {
          const results=await Promise.all(requested.map(async label=>[label,await suggestColorName(label)] as const));
          if(!mounted.current)return;
          const current=latest.current;
          const next={...current.value};
          let count=0;
          for(const [label,hex] of results)if(hex && current.labels.includes(label) && !Object.hasOwn(next,label)){next[label]=hex;count++;}
          if(count)current.onChange(next);
          setMessage(count ? `${count}개 색상을 채웠어요. 실제 상품에 맞게 조정할 수 있어요.` : '새로 채울 색상이 없어요. 색상 칸을 눌러 직접 지정할 수 있어요.');
        } catch {if(mounted.current)setMessage('색상 사전을 불러오지 못했어요. 다시 누르거나 직접 지정해 주세요.');}
        finally {if(mounted.current)setBusy(false);}
      }}>{busy?'불러오는 중…':'이름으로 채우기'}</button>
      <span style={{color:'var(--color-ink-mute)'}}>사진·조명에 따라 실제 색과 다를 수 있어요.</span>
    </div>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
      {colors.map(label=><div key={label} style={{display:'flex',alignItems:'center',gap:7,border:'1px solid var(--color-line)',borderRadius:8,padding:'6px 8px',maxWidth:'100%',background:'var(--color-surface)'}}>
        <label style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
          <input type="color" aria-label={`${label} 표시색`} value={value[label]||'#ffffff'} onChange={event=>update(label,event.target.value)} style={{width:30,height:30,padding:2,border:'1px solid var(--color-line)',borderRadius:5,flexShrink:0,cursor:'pointer'}} />
          <span style={{overflowWrap:'anywhere'}}>{label}{!value[label]?<small style={{display:'block',color:'var(--color-ink-mute)'}}>색상 미지정</small>:null}</span>
        </label>
        <button type="button" aria-label={`${label} 사진에서 색상 선택`} onClick={()=>setPhotoLabel(label)} style={button}>사진</button>
        <button type="button" aria-label={`${label} 색상표시 안 함`} title="색상표시 안 함" onClick={()=>update(label,null)} style={{...button,padding:'4px 7px'}}>×</button>
      </div>)}
    </div>
    {photoLabel && colors.includes(photoLabel)?<PhotoColorSampler key={photoLabel} label={photoLabel} onApply={hex=>{update(photoLabel,hex);setPhotoLabel('');}} onClose={()=>setPhotoLabel('')}/>:null}
    {message?<p role="status" style={{margin:'6px 0',color:'var(--color-ink-soft)'}}>{message}</p>:null}
  </details>;
}
