"use client";
import {useEffect,useState,useSyncExternalStore,type CSSProperties} from 'react';
import {avatarVariant} from '@/lib/chatPresentation';
import {avatarInitial,avatarColors} from '@/lib/chatAvatarInitial';
import {avatarSnapshot,subscribeAvatarChanges} from '@/lib/liveChatPublicAvatars';
import {loadAvatarCatalog,avatarCatalogSnapshot,subscribeAvatarCatalog,avatarSource} from '@/lib/chatAvatarCatalog';
export function ChatProfileAvatar({src,nick,size=24,frame,color,style}:{src:string;nick:string;size?:number|string;frame?:string;color?:string;style?:CSSProperties}){
 const [broken,setBroken]=useState<string[]>([]);
 const variant=avatarVariant(src),notice=/^notice:(cart|order|paid|guide):(\d+)$/.exec(src);
 const fallback=variant?.index||0,key=variant?.key||'';
 const index=useSyncExternalStore(subscribeAvatarChanges,()=>avatarSnapshot(key,fallback),()=>fallback);
 const version=notice?2:variant?.version||2;
 const catalog=useSyncExternalStore(subscribeAvatarCatalog,()=>avatarCatalogSnapshot(version),()=>null);
 useEffect(()=>{if(variant||notice)loadAvatarCatalog(version)},[src,version,Boolean(variant),Boolean(notice)]);
 // [2026-11-14 사장님] 알림 봇 사진은 글씨 사진 2개만 — 주문알림·입금요정=RU, 언니이거사·쇼핑도우미=AI (고정 파일이라 깜박임 없음)
 const noticeUrl=notice?(notice[1]==='order'||notice[1]==='paid'?'/chat-notice-ru.svg':'/chat-notice-ai.svg'):'';
 const assigned=variant?avatarSource(catalog,index,false):null;
 const image=assigned&&!broken.includes(assigned.url)?assigned:null;
 const url=noticeUrl || image?.url || (!variant&&!notice&&src!=='autotest'&&!broken.includes(src)?src:'');
 const box:CSSProperties={width:size,height:size,borderRadius:'50%',flexShrink:0,display:'inline-block',overflow:'hidden',verticalAlign:'middle',boxSizing:'border-box',...(frame?{border:'2px solid '+frame}:{}),...style};
 if(url)return <img src={url} alt="" title={image?[image.title,image.author,image.license].filter(Boolean).join(' · '):undefined} loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(prev=>[...prev.slice(-10),url])} style={{...box,objectFit:'cover',background:'#EEE'}} />;
 // 사진 없으면: 첫 글자 하나만 크게 — 배경 = 그 사람 색, 글씨 = 같은 색 진하게(일반 손님·테스트 닉네임 모두)
 const c=avatarColors(nick,color);
 return <span aria-hidden="true" style={{...box,background:c.bg,color:c.fg,fontWeight:700,textAlign:'center',textShadow:'none',lineHeight:typeof size==='number'?size+'px':size,fontSize:typeof size==='number'?Math.round(size*.62):'.62em'}}>{avatarInitial(nick)}</span>;
}
