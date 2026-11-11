'use client';
import type {LiveChatMessage} from '@/lib/liveChat';
import type {ChatEmoji} from '@/lib/liveChatEmoji';
import {ChatBodyView} from '@/components/customer/ChatBodyView';
export function ChatViewNotice({messages,emojis,onOpen,source="site"}:{messages:LiveChatMessage[];emojis:Map<string,ChatEmoji>;onOpen:()=>void;source?:"site"|"youtube"}){
 if(!messages.length)return null;
 const label=source==="youtube"?"유튜브":"사이트";
 const latest=[...messages].sort((a,b)=>a.id-b.id).slice(-2);
 return <button key={latest[latest.length-1].id} type="button" className="ruru-chat-notice" data-source={source} onClick={onOpen} aria-label={`${label} 새 글 ${messages.length}개 확인`}>
  <span className="ruru-chat-notice-heading">{label} 새 글 <span className="ruru-chat-unread-badge">{messages.length>99?'99+':messages.length}</span><span className="ruru-chat-notice-open">확인하기 ›</span></span>
  {latest.map(m=><span className="ruru-chat-notice-row" key={m.id}><b>{m.nickname}</b><span className="ruru-chat-notice-body"><ChatBodyView body={m.body} emojis={emojis} scale={.65}/></span></span>)}
  {messages.length>2&&<span className="ruru-chat-notice-more">+{messages.length-2}개 더 있어요</span>}
 </button>;
}
