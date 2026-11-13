"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {refreshPublicAvatars} from "./liveChatPublicAvatars";
import { parseChatMessage, type LiveChatMessage } from "@/lib/liveChat";

export function chatIdentityHeaders(): Record<string, string> {
  try {
    const p = JSON.parse(localStorage.getItem("ruru_chat_identity") || "null");
    const current = localStorage.getItem("ruru_kakao_id");
    if (!p?.sub || !p?.nonce || (current && current !== p.sub)) return {};
    return { "x-chat-account": p.sub, "x-chat-session": p.nonce };
  } catch { return {}; }
}
export function verifyChatAccount() {
  const returnTo = location.pathname === "/chat-view" ? "/chat-view" : "/order";
  const url = `/api/live-chat/session?returnTo=${encodeURIComponent(returnTo)}`;
  const popup = window.open(url, "ruru-chat-verification", "width=480,height=720");
  if (!popup) window.location.assign(url);
}
type PrivateState = { testMessages: Record<string,{nickname:string;body:string}>; avatars: Record<string,string>; verified: boolean; canReviewDeleted: boolean; ownIds: number[]; hiddenIds: number[]; deletedMessages: LiveChatMessage[]; commandMessages: LiveChatMessage[] };
const EMPTY: PrivateState = { testMessages: {}, avatars: {}, verified: false, canReviewDeleted: false, ownIds: [], hiddenIds: [], deletedMessages: [], commandMessages: [] };
function currentChatAccount() { try { return localStorage.getItem("ruru_kakao_id") || ""; } catch { return ""; } }

export function useLiveChatPrivate(bc: string, enabled: boolean, messages: LiveChatMessage[]) {
  const [state, setState] = useState<PrivateState>(EMPTY);
  const [receipts, setReceipts] = useState<{ account: string; bc: string; messages: LiveChatMessage[] }>({ account: "", bc: "", messages: [] });
  const [revision, setRevision] = useState(0);
  const serial = useRef(0);
  const receiptEpoch = useRef(0);
  const pending = useRef(false);
  const access = useRef(false);
  const photoRefresh = useRef<ReturnType<typeof setTimeout>|null>(null);
  const knownHidden = useRef(new Set<number>());
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  const commandContext = () => ({ account: currentChatAccount(), epoch: receiptEpoch.current, bc });
  const recordCommand = (m: LiveChatMessage, context: ReturnType<typeof commandContext>) => {
    const { account } = context;
    if (!enabled || context.epoch !== receiptEpoch.current || context.bc !== bc || !account || account !== currentChatAccount() || m.broadcastId !== bc) return;
    setReceipts(prev => ({ account, bc, messages: [...(prev.account === account && prev.bc === bc ? prev.messages.filter(p => p.id !== m.id) : []), { ...m, privateCommand: true }].slice(-200) }));
  };
  const onPublicMessage = useCallback((m: LiveChatMessage) => {
    if (m.hidden) { knownHidden.current.add(m.id); refresh(); }
    else if(access.current && !photoRefresh.current) photoRefresh.current=setTimeout(()=>{photoRefresh.current=null;refresh();},500);
  }, [refresh]);
  useEffect(() => {
    if(enabled&&bc){
      void refreshPublicAvatars(bc);
      const entry=crypto.randomUUID();
      void fetch('/api/live-chat/avatars',{method:'POST',headers:{'Content-Type':'application/json',...chatIdentityHeaders()},body:JSON.stringify({bc,entry})}).then(r=>{if(r.ok)void refreshPublicAvatars(bc)}).catch(()=>{});
    }
    ++receiptEpoch.current;
    knownHidden.current = new Set(); setState(EMPTY); setReceipts({ account: "", bc: "", messages: [] });
    return () => { ++receiptEpoch.current; if(photoRefresh.current)clearTimeout(photoRefresh.current);photoRefresh.current=null; };
  }, [bc, enabled]);
  useEffect(() => {
    if (!bc || !enabled) return;
    const controller = new AbortController();
    const requestId = ++serial.current;
    const headers = chatIdentityHeaders();
    void fetch(`/api/live-chat/private?bc=${encodeURIComponent(bc)}`, { headers, cache: "no-store", signal: controller.signal }).then(async r => {
      const j = await r.json();
      if (controller.signal.aborted || requestId !== serial.current || JSON.stringify(headers) !== JSON.stringify(chatIdentityHeaders())) return;
      // [2026-11-14 사장님 「관리자 프로필 깜박임」] 잠깐 실패(네트워크·서버 지연)엔 직전 화면 유지 — 권한이 실제로 없을 때(401·403)만 비움
      if (!r.ok || !j.ok) { if (r.status === 401 || r.status === 403) { access.current = false; setState(EMPTY); } return; }
      access.current = true;
      const deletedMessages = j.canReviewDeleted ? (j.deletedMessages || []).map((raw: unknown) => {
        const m = parseChatMessage(raw); return m && m.broadcastId === bc ? { ...m, deletedByAuthor: true } : null;
      }).filter(Boolean) as LiveChatMessage[] : [];
      const commandMessages = j.verified ? (j.commandMessages || []).map((raw: unknown) => {
        const m = parseChatMessage(raw); return m && m.broadcastId === bc ? { ...m, privateCommand: true } : null;
      }).filter(Boolean) as LiveChatMessage[] : [];
      setState({ testMessages: j.canReviewDeleted ? (j.testMessages || {}) : {}, avatars: j.canReviewDeleted ? (j.avatars || {}) : {}, verified: j.verified === true, canReviewDeleted: j.canReviewDeleted === true, ownIds: j.ownIds || [], hiddenIds: j.hiddenIds || [], deletedMessages, commandMessages });
    }).catch(() => { /* 네트워크 실패 — 직전 화면 유지(사진이 진짜↔기본으로 깜박이지 않게) */ });
    return () => { ++serial.current; controller.abort(); };
  }, [bc, enabled, revision]);
  useEffect(() => {
    if (!enabled) return;
    const clear = () => { ++serial.current; ++receiptEpoch.current; access.current = false; setState(EMPTY); setReceipts({ account: "", bc: "", messages: [] }); };
    const identityChanged = () => { clear(); refresh(); };
    // Other tabs frequently save carts, product views and display preferences.
    // Those writes must not briefly replace authenticated chat with public rows.
    const storage = (e: StorageEvent) => {
      if (e.key === null || e.key === "ruru_chat_identity" || e.key === "ruru_kakao_id") identityChanged();
    };
    const message = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "ruru-chat-verified") identityChanged(); };
    const visible = () => { if (document.visibilityState === "visible") {refresh();void refreshPublicAvatars(bc);} };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") { void refreshPublicAvatars(bc); if (access.current || Object.keys(chatIdentityHeaders()).length) refresh(); } }, 15000);
    window.addEventListener("storage", storage); window.addEventListener("message", message);
    window.addEventListener("ruru-chat-logout", clear); window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); window.removeEventListener("storage", storage); window.removeEventListener("message", message); window.removeEventListener("ruru-chat-logout", clear); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [bc, enabled, refresh]);
  const displayMessages = useMemo(() => {
    const hidden = new Set([...state.hiddenIds, ...knownHidden.current]);
    const map = new Map(messages.filter(m => !hidden.has(m.id)).map(m => [m.id, m]));
    // Keep deleted rows in chronological context, not as a new block at the bottom.
    if (state.canReviewDeleted) for (const m of state.deletedMessages) if (m.broadcastId === bc) map.set(m.id, m);
    for (const m of state.commandMessages) if (m.broadcastId === bc) map.set(m.id, m);
    if (receipts.bc === bc && receipts.account === currentChatAccount()) for (const m of receipts.messages) map.set(m.id, m);
    return [...map.values()].map(m=>state.canReviewDeleted && !m.hidden && !m.deletedByAuthor && state.testMessages[m.id] ? {...m,body:state.testMessages[m.id].body,...(m.badge==='bot'?{}:{nickname:state.testMessages[m.id].nickname})} : m).map(m=>state.canReviewDeleted && /^https:\/\//.test(state.avatars[m.id] || "") ? {...m,avatar:state.avatars[m.id]} : m).sort((a, b) => a.id - b.id).slice(-200);
  }, [messages, state, revision, bc, receipts]);
  const deleteOwn = async (messageId: number) => {
    if (pending.current) return { ok: false, message: "삭제 중이에요." };
    pending.current = true;
    try {
      const r = await fetch("/api/live-chat/private", { method: "DELETE", headers: { "Content-Type": "application/json", ...chatIdentityHeaders() }, body: JSON.stringify({ bc, messageId }) });
      const j = await r.json();
      if (j.ok) { knownHidden.current.add(messageId); refresh(); }
      return { ok: Boolean(j.ok), message: String(j.message || "") };
    } catch { return { ok: false, message: "삭제하지 못했어요. 다시 시도해 주세요." }; }
    finally { pending.current = false; }
  };
  return { ...state, displayMessages, refresh, onPublicMessage, commandContext, recordCommand, deleteOwn, verify: verifyChatAccount };
}
