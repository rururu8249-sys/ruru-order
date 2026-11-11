import type { LiveChatMessage } from './liveChat';
import { includeChatViewMessage } from './chatViewFilter';

export type YoutubeViewerMessage = LiveChatMessage & {sourceId: string; authorChannelId: string};
export type YoutubeViewerState = {
 videoId: string; chatId: string; pageToken: string; sequence: number; initialized: boolean;
 status: 'connecting' | 'live' | 'offline' | 'unavailable';
 messages: YoutubeViewerMessage[];
};
export const emptyYoutubeViewer = (videoId: string): YoutubeViewerState => ({videoId, chatId:'', pageToken:'', sequence:0, initialized:false, status:'connecting', messages:[]});
export type YoutubeViewerResponse = {
 ok: true; videoId: string; initialized: boolean; status: YoutubeViewerState['status'];
 messages: LiveChatMessage[]; pollAfterMs: number;
};
type YoutubeItem = {id?: string; snippet?: {type?:string; displayMessage?:string; publishedAt?:string; textMessageDetails?:{messageText?:string}; messageDeletedDetails?:{deletedMessageId?:string}; userBannedDetails?:{bannedUserDetails?:{channelId?:string}}}; authorDetails?:{channelId?:string; displayName?:string; profileImageUrl?:string; isChatOwner?:boolean; isChatModerator?:boolean}};
export function mergeYoutubeViewer(state: YoutubeViewerState, items: YoutubeItem[], bc: string, botChannel: string): YoutubeViewerState {
 const messages = state.messages.map(m=>({...m}));
 let sequence = state.sequence;
 for (const item of items) {
  const snippet = item.snippet || {};
  if (snippet.type === 'messageDeletedEvent' || snippet.type === 'userBannedEvent') {
   const deleted = snippet.messageDeletedDetails?.deletedMessageId;
   const banned = snippet.userBannedDetails?.bannedUserDetails?.channelId;
   for (const m of messages) if ((deleted && m.sourceId===deleted) || (banned && m.authorChannelId===banned)) { m.hidden=true; m.body=''; }
   continue;
  }
  if (!item.id || messages.some(m=>m.sourceId===item.id)) continue;
  // Membership/gift/system events without ordinary chat text do not create alerts.
  if (snippet.type !== 'textMessageEvent' && snippet.type !== 'superChatEvent') continue;
  const body = String(snippet.displayMessage || snippet.textMessageDetails?.messageText || '').slice(0,2000);
  if (!body) continue;
  const author=item.authorDetails || {};
  const badge=botChannel && author.channelId===botChannel ? 'bot' : author.isChatOwner ? 'crown' : author.isChatModerator ? 'mod' : null;
  const avatar = /^https:\/\/(?:[a-z0-9.-]+\.)?(?:googleusercontent\.com|ytimg\.com)\//i.test(author.profileImageUrl || '') ? author.profileImageUrl! : '';
  const m:YoutubeViewerMessage={id:++sequence,sourceId:item.id,authorChannelId:author.channelId||'',broadcastId:bc,nickname:String(author.displayName||'시청자').slice(0,100),body,createdAt:snippet.publishedAt||'',badge,pinned:false,avatar,botRef:'',hidden:false};
  if (includeChatViewMessage(m)) messages.push(m);
 }
 return {...state,initialized:true,status:'live',sequence,messages:messages.slice(-150)};
}
export function publicYoutubeViewer(state:YoutubeViewerState):YoutubeViewerResponse {
 return {ok:true,videoId:state.videoId,initialized:state.initialized,status:state.status,pollAfterMs:20000,messages:state.messages.map(m=>({id:m.id,broadcastId:m.broadcastId,nickname:m.nickname,body:m.body,createdAt:m.createdAt,hidden:m.hidden,badge:m.badge,pinned:m.pinned,avatar:m.avatar,botRef:m.botRef}))};
}
