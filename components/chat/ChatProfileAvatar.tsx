"use client";
import {useEffect,useState,useSyncExternalStore,type CSSProperties} from 'react';
import {avatarVariant} from '@/lib/chatPresentation';
import {avatarSnapshot,subscribeAvatarChanges} from '@/lib/liveChatPublicAvatars';
import {loadAvatarCatalog,avatarCatalogSnapshot,subscribeAvatarCatalog,avatarSource} from '@/lib/chatAvatarCatalog';
export function ChatProfileAvatar({src,nick,size=24,frame,style}:{src:string;nick:string;size?:number|string;frame?:string;style?:CSSProperties}){
 const [broken,setBroken]=useState<string[]>([]);
 const variant=avatarVariant(src),notice=/^notice:(cart|order|paid|guide):(\d+)$/.exec(src);
 const fallback=variant?.index||0,key=variant?.key||'';
 const index=useSyncExternalStore(subscribeAvatarChanges,()=>avatarSnapshot(key,fallback),()=>fallback);
 const catalog=useSyncExternalStore(subscribeAvatarCatalog,avatarCatalogSnapshot,()=>null);
 useEffect(()=>{if(variant||notice)loadAvatarCatalog()},[src,Boolean(variant),Boolean(notice)]);
 const notificationIndex=notice?({cart:0,order:8,paid:18,guide:26}[notice[1] as 'cart'|'order'|'paid'|'guide'])+Number(notice[2]):0;
 const candidates=variant||notice?[0,17,37].map(offset=>avatarSource(catalog,(notice?notificationIndex:index)+offset,!!notice)):[];
 const image=candidates.find(a=>a&&!broken.includes(a.url));
 const url=image?.url || (!variant&&!notice&&src!=='autotest'&&!broken.includes(src)?src:'');
 const box:CSSProperties={width:size,height:size,borderRadius:'50%',flexShrink:0,display:'inline-block',overflow:'hidden',verticalAlign:'middle',boxSizing:'border-box',...(frame?{border:'2px solid '+frame}:{}),...style};
 if(url)return <img src={url} alt="" title={image?[image.title,image.author,image.license].filter(Boolean).join(' · '):undefined} loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(prev=>[...prev.slice(-10),url])} style={{...box,objectFit:'cover',background:'#EEE'}} />;
 return <span aria-hidden="true" style={{...box,background:frame||'#D8E5EF',color:'#233444',textAlign:'center',lineHeight:typeof size==='number'?size+'px':size,fontSize:typeof size==='number'?size*.5:'.7em'}}>{Array.from(nick)[0]||'?'}</span>;
}
