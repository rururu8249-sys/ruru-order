"use client";
import type {CSSProperties} from 'react';
import {avatarInitial,avatarColors} from '@/lib/chatAvatarInitial';
// [2026-11-14 20:06 사장님 «테스트만 글자면 진짜 사람과 구분됨 — 모두 첫 글자로 통일»]
//   채팅 프로필 = 모든 손님(진짜·테스트)·손님 화면·관리자 화면 똑같이: 본인 색 동그라미 + 닉네임 첫 글자 하나.
//   카카오 사진·랜덤 그림은 채팅에 안 씀(src 는 알림 봇 구분에만 사용). 알림 봇은 고정 글씨 사진 2개(RU/AI) 그대로.
export function ChatProfileAvatar({src,nick,size=24,frame,color,style}:{src:string;nick:string;size?:number|string;frame?:string;color?:string;style?:CSSProperties}){
 const notice=/^notice:(cart|order|paid|guide):(\d+)$/.exec(src);
 const box:CSSProperties={width:size,height:size,borderRadius:'50%',flexShrink:0,display:'inline-block',overflow:'hidden',verticalAlign:'middle',boxSizing:'border-box',...(frame?{border:'2px solid '+frame}:{}),...style};
 if(notice){
  const url=notice[1]==='order'||notice[1]==='paid'?'/chat-notice-ru.svg':'/chat-notice-ai.svg';
  return <img src={url} alt="" loading="lazy" style={{...box,objectFit:'cover',background:'#EEE'}} />;
 }
 const c=avatarColors(nick,color);
 return <span aria-hidden="true" style={{...box,background:c.bg,color:c.fg,fontWeight:800,textAlign:'center',textShadow:'none',lineHeight:typeof size==='number'?size+'px':size,fontSize:typeof size==='number'?Math.round(size*.62):'.62em'}}>{avatarInitial(nick)}</span>;
}
