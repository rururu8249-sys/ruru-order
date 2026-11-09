"use client";

// components/admin-live/AdminSiteChatBox.tsx
// [2026-11-10 사장님 05:54 「관리자 PC 오른쪽 채팅 칸에서 사이트 채팅을 보고 관리」]
//   오른쪽 「방송·채팅」 칸의 «사이트 채팅» 탭. 읽기 = /api/admin-live/live-chat?bc= (관리자만) + 새 글은 소식(window 'ruru-live-chat').
//   글쓰기 = 총관리자(금색 왕관) 회원 이름으로. 글에 마우스를 올리면 고정·지우기·30초·5분·차단.
//   주문·돈·포인트 무접촉(채팅 표만).
import { useCallback, useEffect, useRef, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { mergeChat, parseChatMessage, type LiveChatMessage } from "@/lib/liveChat";
import type { ChatEmoji } from "@/lib/liveChatEmoji";
import { ChatBodyView, emojiMapOf } from "@/components/customer/ChatBodyView";

const BADGE_LABEL: Record<string, string> = { crown: "관리자", crown_pink: "관리자", mod: "R", bot: "AI" };
const BADGE_CLS: Record<string, string> = {
  crown: "bg-[#FFF3BF] text-[#8A6100]",
  crown_pink: "bg-[#FFDEEB] text-[#A61E4D]",
  mod: "bg-surface-2 text-ink",
  bot: "bg-[#E7F5FF] text-[#1864AB]",
};

function timeText(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}

export default function AdminSiteChatBox({ broadcastId }: { broadcastId: string | null }) {
  const [list, setList] = useState<LiveChatMessage[]>([]);
  const [pinned, setPinned] = useState<LiveChatMessage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // 이모티콘 — 채팅 그림 + 관리자 글에 넣기(관리자는 늘 쓸 수 있음)
  const [emojis, setEmojis] = useState<ChatEmoji[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiMap = emojiMapOf(emojis);
  useEffect(() => {
    const loadEmojis = () => {
      fetch("/api/live-chat/emoji", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.ok) setEmojis(Array.isArray(j.items) ? j.items : []); }).catch(() => {});
    };
    loadEmojis();
    window.addEventListener("ruru-chat-emoji-changed", loadEmojis);
    return () => window.removeEventListener("ruru-chat-emoji-changed", loadEmojis);
  }, []);
  const stickRef = useRef(true);

  const load = useCallback(async () => {
    if (!broadcastId) return;
    try {
      const r = await fetch(`/api/admin-live/live-chat?bc=${encodeURIComponent(broadcastId)}`, { cache: "no-store" }).then((res) => res.json());
      if (!r?.ok) { setLoadError(r?.message || "채팅을 못 불러왔어요."); return; }
      setLoadError("");
      setList(mergeChat([], (r.messages || []).map(parseChatMessage).filter(Boolean) as LiveChatMessage[]));
      setPinned(r.pinned ? parseChatMessage(r.pinned) : null);
    } catch {
      setLoadError("채팅을 못 불러왔어요.");
    }
  }, [broadcastId]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0); // 방송이 바뀌면 새로 읽음(목록은 load 가 통째로 바꿈)
    return () => window.clearTimeout(t);
  }, [load]);

  // 새 글·지움·고정 소식 — 대시보드가 받은 소식을 창 이벤트로 넘겨 준다(같은 소식 연결 하나로)
  useEffect(() => {
    if (!broadcastId) return;
    const onChat = (ev: Event) => {
      const m = parseChatMessage((ev as CustomEvent).detail);
      if (!m || m.broadcastId !== broadcastId) return;
      setList((prev) => mergeChat(prev, [m]));
      setPinned((prev) => (m.pinned ? m : prev && prev.id === m.id ? null : prev));
    };
    window.addEventListener("ruru-live-chat", onChat);
    // 소식이 끊겨도 30초마다 한 번 맞춤
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { window.removeEventListener("ruru-live-chat", onChat); window.clearInterval(t); };
  }, [broadcastId, load]);

  // 맨 아래 보고 있으면 새 글 따라 내려감
  useEffect(() => {
    const el = boxRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [list]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !broadcastId) return;
    setSending(true);
    try {
      const r = await fetch("/api/admin-live/live-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "post", bc: broadcastId, body }) }).then((res) => res.json());
      if (!r?.ok) { showAdminToast(r?.message || "못 보냈어요.", "error"); return; }
      setText("");
      stickRef.current = true;
      const m = parseChatMessage(r.message);
      if (m) setList((prev) => mergeChat(prev, [m]));
    } catch {
      showAdminToast("못 보냈어요.", "error");
    } finally {
      setSending(false);
    }
  };

  const act = async (m: LiveChatMessage, action: "hide" | "mute30s" | "mute5m" | "ban" | "pin" | "unpin") => {
    if (busyId) return;
    if (action === "ban") {
      const ok = await showAdminConfirm("글을 지우고 사이트 접속을 차단해요. 풀기는 고객 › 회원 목록 「차단해제」.", { title: `${m.nickname}님 차단`, confirmText: "차단", cancelText: "그만두기", tone: "danger" });
      if (!ok) return;
    }
    setBusyId(m.id);
    try {
      const r = await fetch("/api/admin-live/live-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, messageId: m.id }) }).then((res) => res.json());
      showAdminToast(r?.message || (r?.ok ? "처리했어요." : "처리 못 했어요."), r?.ok ? "success" : "error");
      if (r?.ok) {
        if (action === "pin") setPinned(m);
        else if (action === "unpin") setPinned(null);
        else { setList((prev) => prev.filter((x) => x.id !== m.id)); setPinned((p) => (p?.id === m.id ? null : p)); }
      }
    } catch {
      showAdminToast("처리 못 했어요.", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (!broadcastId) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-ink-mute">방송을 시작하면 사이트 채팅이 여기 나와요.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {pinned ? (
        <div className="flex items-start gap-2 border-b border-line bg-surface-2 px-3 py-2">
          <span className="shrink-0 text-[12px] font-bold text-ink-mute">고정</span>
          <span className="min-w-0 flex-1 text-[13px] text-ink"><b className="font-bold">{pinned.nickname}</b> <ChatBodyView body={pinned.body} emojis={emojiMap} /></span>
          <button type="button" onClick={() => void act(pinned, "unpin")} className="shrink-0 text-[12px] font-bold text-ink-mute hover:text-ink">해제</button>
        </div>
      ) : null}
      <div
        ref={boxRef}
        onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
        role="log"
        aria-label="사이트 채팅"
      >
        {loadError ? <div className="p-3 text-[13px] text-danger-tx">{loadError}</div> : null}
        {!loadError && list.length === 0 ? <div className="p-6 text-center text-[13px] text-ink-mute">아직 글이 없어요. 아래 칸에 쓰면 손님 화면에 바로 올라가요.</div> : null}
        {list.map((m) => (
          <div key={m.id} className="group relative flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2">
            {m.badge === "bot" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/ruru-ai-avatar.png" alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : m.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatar} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-line text-[12px] font-bold text-ink-soft">{m.nickname.slice(0, 1)}</span>
            )}
            <div className="min-w-0 flex-1 text-[14px] leading-5 text-ink">
              <span className="mr-1 font-bold text-ink-soft">{m.nickname}</span>
              {m.badge ? <span className={`mr-1 inline-flex h-[18px] items-center rounded px-1 align-[1px] text-[11px] font-bold ${BADGE_CLS[m.badge] || ""}`}>{BADGE_LABEL[m.badge]}</span> : null}
              <span className="break-words"><ChatBodyView body={m.body} emojis={emojiMap} size="1.6em" /></span>
              <span className="ml-1 text-[11px] text-ink-mute">{timeText(m.createdAt)}</span>
            </div>
            {m.badge === "bot" ? null : (
              <div className="absolute right-1 top-0.5 hidden gap-1 rounded-lg border border-line bg-surface p-0.5 shadow-sm group-hover:flex group-focus-within:flex">
                {([
                  [pinned?.id === m.id ? "unpin" : "pin", pinned?.id === m.id ? "고정 해제" : "고정"],
                  ["hide", "지우기"],
                  ["mute30s", "30초"],
                  ["mute5m", "5분"],
                  ["ban", "차단"],
                ] as const).map(([a, label]) => (
                  <button key={a} type="button" disabled={busyId === m.id} onClick={() => void act(m, a)}
                    className={`h-7 rounded-lg px-2 text-[12px] font-bold hover:bg-surface-2 disabled:opacity-40 ${a === "ban" ? "text-danger-tx" : "text-ink"}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {emojiOpen && emojis.length > 0 ? (
        <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto border-t border-line p-2">
          {emojis.map((e) => (
            <button key={e.id} type="button" title={e.name} aria-label={`이모티콘 ${e.name}`} onClick={() => setText((t) => (t + `:${e.name}:`).slice(0, 100))}
              className="flex h-11 items-center justify-center rounded-lg hover:bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.url} alt="" className="h-8 w-8 object-contain" />
            </button>
          ))}
        </div>
      ) : null}
      <form className="flex gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); setEmojiOpen(false); void send(); }}>
        {emojis.length > 0 ? (
          <button type="button" onClick={() => setEmojiOpen((v) => !v)} aria-label="이모티콘" aria-pressed={emojiOpen}
            className={`h-10 w-10 shrink-0 rounded-lg border ${emojiOpen ? "border-ink bg-surface-2" : "border-line bg-surface"}`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mx-auto text-ink-soft"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" /><circle cx="9" cy="10" r="0.6" fill="currentColor" /><circle cx="15" cy="10" r="0.6" fill="currentColor" /></svg>
          </button>
        ) : null}
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 100))} placeholder="관리자로 채팅 쓰기" aria-label="사이트 채팅 쓰기"
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-ink" />
        <button type="submit" disabled={sending || !text.trim()} className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-40">보내기</button>
      </form>
    </div>
  );
}
