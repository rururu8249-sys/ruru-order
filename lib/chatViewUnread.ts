import type { LiveChatMessage } from './liveChat';
export type ChatViewUnread = { bc: string; initialized: boolean; known: Set<number>; unread: Map<number, LiveChatMessage> };
export type ChatViewUnreadAction = { type: 'reset' | 'read' | 'snapshot' | 'event'; bc: string; messages?: LiveChatMessage[]; read?: boolean };
export const createChatViewUnread = (bc: string): ChatViewUnread => ({ bc, initialized: false, known: new Set(), unread: new Map() });
export function reduceChatViewUnread(state: ChatViewUnread, action: ChatViewUnreadAction): ChatViewUnread {
 if (action.type === 'reset') return createChatViewUnread(action.bc);
 if (action.bc !== state.bc) return state;
 if (action.type === 'read') return state.unread.size ? { ...state, unread: new Map() } : state;
 const known = new Set(state.known), unread = new Map(state.unread);
 // A recovery snapshot also removes messages deleted while realtime was disconnected.
 // Older unread entries may fall outside the API's recent-message window; keep those.
 if (action.type === 'snapshot') {
  const visible = (action.messages || []).filter(m => m.broadcastId === state.bc);
  const ids = new Set(visible.map(m => m.id));
  const oldest = visible.length ? Math.min(...ids) : -Infinity;
  for (const id of unread.keys()) if (id >= oldest && !ids.has(id)) unread.delete(id);
 }
 for (const message of action.messages || []) {
  if (message.broadcastId !== state.bc) continue;
  const fresh = !known.has(message.id); known.add(message.id);
  if (message.hidden || message.deletedByAuthor || message.privateCommand) { unread.delete(message.id); continue; }
  if (unread.has(message.id) || (fresh && (action.type === 'event' || state.initialized))) unread.set(message.id, message);
 }
 if (action.read) unread.clear();
 return { ...state, initialized: state.initialized || action.type === 'snapshot', known, unread };
}
