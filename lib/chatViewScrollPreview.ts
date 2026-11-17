import type {LiveChatMessage} from './liveChat';
import {includeChatViewNoticeMessage} from './chatViewFilter';

/** Only unseen human/test conversation and non-transactional AI help, never payment/order bots. */
export function newScrollPreviewMessages(messages:readonly LiveChatMessage[],afterId:number):LiveChatMessage[]{
 return messages.filter(m=>m.id>afterId && !m.hidden && !m.deletedByAuthor && !m.privateCommand && includeChatViewNoticeMessage(m)).sort((a,b)=>a.id-b.id);
}
