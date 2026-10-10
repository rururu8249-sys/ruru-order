"use client";
import {useEffect,useState} from 'react';
import {sampleColorPixel} from '@/lib/productColorSwatches';

/** Local image only: no upload, no remote canvas/CORS dependency, no automatic save. */
export default function PhotoColorSampler({label,onApply,onClose}:{label:string;onApply:(hex:string)=>void;onClose:()=>void}) {
  const [url,setUrl]=useState('');
  const [sample,setSample]=useState<string|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
  return <section aria-label={`${label} 사진 색상 추출`} style={{width:'100%',maxWidth:440,padding:12,border:'1px solid var(--color-line)',borderRadius:10,background:'var(--color-surface)'}}>
    <strong>{label} · 사진에서 색상 선택</strong>
    <p style={{margin:'6px 0'}}>사진을 고른 뒤 옷의 원하는 부분을 눌러 주세요. 사진은 업로드되지 않습니다.</p>
    <input type="file" accept="image/*" aria-label="색상을 추출할 사진" onChange={event=>{
      const file=event.target.files?.[0];event.target.value='';
      if(!file)return;
      setSample(null);setError('');setUrl('');
      if(!file.type.startsWith('image/') || file.size>25*1024*1024){setError('25MB 이하 이미지 파일을 선택해 주세요.');return;}
      setUrl(URL.createObjectURL(file));
    }} />
    {url?<img key={url} src={url} alt="색상 추출용 사진 — 원하는 부분을 누르세요" onError={()=>{setError('사진을 읽지 못했어요. JPG 또는 PNG로 다시 선택해 주세요.');setSample(null);}} onClick={event=>{
      const image=event.currentTarget,rect=image.getBoundingClientRect();
      if(!image.naturalWidth || !image.naturalHeight || !rect.width || !rect.height)return;
      const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
      if(x<0 || y<0 || x>=1 || y>=1)return;
      try{
        const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas');
        ctx.drawImage(image,Math.floor(x*image.naturalWidth),Math.floor(y*image.naturalHeight),1,1,0,0,1,1);
        const color=sampleColorPixel(ctx.getImageData(0,0,1,1).data,1,1,0,0);
        setSample(color);setError(color?'':'투명한 부분입니다. 옷 부분을 다시 눌러 주세요.');
      }catch{setSample(null);setError('이 사진에서 색상을 읽지 못했어요. 다른 사진이나 직접 선택을 이용해 주세요.');}
    }} style={{display:'block',width:'100%',height:'auto',margin:'8px 0',cursor:'crosshair'}}/>:null}
    {error?<p role="alert">{error}</p>:null}
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:8}}>
      {sample?<><span aria-hidden="true" style={{width:28,height:28,border:'1px solid #888',borderRadius:5,background:sample}}/><span>{sample}</span></>:null}
      <button type="button" aria-label="선택한 색 적용" disabled={!sample} onClick={()=>{if(sample)onApply(sample);}}>이 색 적용</button>
      <button type="button" aria-label="사진 색상 추출 취소" onClick={onClose}>취소</button>
    </div>
    <p style={{color:'var(--color-ink-mute)',marginBottom:0}}>키보드로는 이전 화면의 색상 선택칸을 이용할 수 있어요.</p>
  </section>;
}
