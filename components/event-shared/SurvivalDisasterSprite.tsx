import type {CSSProperties} from 'react';

export default function SurvivalDisasterSprite({kind,ageMs=0,style}:{kind:'tornado'|'tsunami';ageMs?:number;style?:CSSProperties}){
 const frame=Math.min(7,Math.floor(Math.max(0,Number.isFinite(ageMs)?ageMs:0)/100));
 return <div aria-hidden="true" data-disaster-sprite={kind} data-sprite-frame={frame} style={{aspectRatio:'1',pointerEvents:'none',backgroundImage:`url(/event-art/survival-${kind}-v2.png)`,backgroundSize:'400% 200%',backgroundRepeat:'no-repeat',backgroundPosition:`${frame%4*100/3}% ${Math.floor(frame/4)*100}%`,...style}}/>;
}
