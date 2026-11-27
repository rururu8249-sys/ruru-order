"use client";

// [2026-11-27 사장님 「주문서 보고 채팅기록 찾는 것도 쉽게」] 어디서든 창 이벤트로 여는 채팅 기록 오른쪽 창.
//   window.dispatchEvent(new CustomEvent("ruru-open-chat-log", { detail: { nickname, broadcastId } }))
import { useEffect, useState } from "react";
import AdminLiveSideDrawer from "./AdminLiveSideDrawer";
import YoutubeChatLogPanel from "./YoutubeChatLogPanel";

export const OPEN_CHAT_LOG_EVENT = "ruru-open-chat-log";

export function openChatLog(nickname: string, broadcastId?: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_LOG_EVENT, { detail: { nickname, broadcastId: broadcastId || "" } }));
}

export default function YoutubeChatLogDrawer() {
  const [open, setOpen] = useState<{ nick: string; bc: string; key: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setOpen({ nick: String(d.nickname || ""), bc: String(d.broadcastId || ""), key: Date.now() });
    };
    window.addEventListener(OPEN_CHAT_LOG_EVENT, on);
    return () => window.removeEventListener(OPEN_CHAT_LOG_EVENT, on);
  }, []);
  if (!open) return null;
  return (
    <AdminLiveSideDrawer title="채팅 기록" width={560} onClose={() => setOpen(null)}>
      <div className="p-4">
        <YoutubeChatLogPanel key={open.key} initialNick={open.nick} initialBroadcastId={open.bc} />
      </div>
    </AdminLiveSideDrawer>
  );
}
