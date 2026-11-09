"use client";
// [2026-11-10] 채팅 글 그리기 — 글자 사이 이모티콘 그림(유튜브 멤버십 이모티콘처럼 글자 한 줄 높이).
//   크기는 글자 크기를 따라감(1.6em = 기본 15px 글자에서 24px, 유튜브 채팅 이모티콘과 같은 크기).
//   지웠거나 꺼진 이모티콘은 «:이름:» 글자로.
import { splitChatBody, type ChatEmoji } from "@/lib/liveChatEmoji";

export function ChatBodyView({ body, emojis, size = "1.6em" }: { body: string; emojis: Map<string, ChatEmoji>; size?: string }) {
  const parts = splitChatBody(body);
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.text}</span>;
        const e = emojis.get(p.id);
        if (!e || !e.on) return <span key={i}>:{p.name}:</span>;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={e.url} alt={`:${e.name}:`} title={e.name} draggable={false} style={{ display: "inline-block", width: size, height: size, objectFit: "contain", verticalAlign: "middle", margin: "-0.2em 0.06em 0", userSelect: "none" }} />
        );
      })}
    </>
  );
}

export function emojiMapOf(items: ChatEmoji[]): Map<string, ChatEmoji> {
  return new Map(items.map((e) => [e.id, e]));
}
