import {normalizeSwatchMap, type ColorSwatchMap} from '@/lib/productColorSwatches';

export function ColorSwatch({hex}:{hex:unknown}) {
  const value=normalizeSwatchMap({color:hex}).color;
  if(!value)return null;
  return <span aria-hidden="true" style={{display:'inline-block',width:18,height:18,flexShrink:0,borderRadius:4,backgroundColor:value,border:'1px solid rgba(0,0,0,.35)',boxShadow:'inset 0 0 0 1px rgba(255,255,255,.35)'}}/>;
}

export default function ProductColorSwatches({value}:{value:ColorSwatchMap}) {
  const entries=Object.entries(normalizeSwatchMap(value)).filter((entry):entry is [string,string]=>Boolean(entry[1]));
  if(!entries.length)return null;
  return <div aria-label="상품 색상" style={{display:'flex',flexWrap:'wrap',gap:6,margin:'7px 0'}}>
    {entries.map(([label,hex])=><span key={label} title={label} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:'#655d61',maxWidth:'100%'}}><ColorSwatch hex={hex}/><span style={{overflowWrap:'anywhere'}}>{label}</span></span>)}
  </div>;
}
