"use client";
// [2026-11-10] 채팅 글 그리기 — 글자 사이 이모티콘 그림.
//   [06:57 사장님 「글씨가 안 보여, 너무 작아」] 그림은 둘레 여백을 잘라 저장하고(관리 창), 크기는:
//     [07:11 사장님 「유튜브와 같은 조건으로」] 유튜브는 이모티콘만 보내도 크기가 같음 → 늘 높이 2em(15px 글자에서 30px)
//   가로로 긴 글씨 스티커는 가로로 긴 그대로(높이만 맞춤, 최대 3배 폭). 글자 크기 설정(중간·크게)을 따라 같이 커짐.
//   지웠거나 꺼진 이모티콘은 «:이름:» 글자로.
//   [07:32 사장님] 그림은 손가락을 받지 않음(pointer-events none) → 꾹 누르면 «이미지 저장» 대신 글 줄의 관리 창이 뜸.
import { splitChatBody, type ChatEmoji } from "@/lib/liveChatEmoji";

export const EMOJI_INLINE_EM = 2;
export const EMOJI_ONLY_EM = 2;

export function ChatBodyView({ body, emojis, scale = 1 }: { body: string; emojis: Map<string, ChatEmoji>; scale?: number }) {
  const parts = splitChatBody(body);
  const shown = parts.filter((p) => p.type === "emoji" && emojis.get(p.id)?.on);
  const onlyEmoji = shown.length > 0 && parts.every((p) => (p.type === "emoji" ? Boolean(emojis.get(p.id)?.on) : !p.text.trim()));
  const h = `${(onlyEmoji ? EMOJI_ONLY_EM : EMOJI_INLINE_EM) * scale}em`;
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return onlyEmoji ? null : <span key={i}>{p.text}</span>;
        const e = emojis.get(p.id);
        if (!e || !e.on) return <span key={i}>:{p.name}:</span>;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={e.url} alt={`:${e.name}:`} title={e.name} draggable={false}
            style={{ display: "inline-block", height: h, width: "auto", maxWidth: `calc(${h} * 3)`, objectFit: "contain", verticalAlign: "middle", margin: "-0.25em 0.06em 0", userSelect: "none", pointerEvents: "none", WebkitTouchCallout: "none" }} />
        );
      })}
    </>
  );
}

export function emojiMapOf(items: ChatEmoji[]): Map<string, ChatEmoji> {
  return new Map(items.map((e) => [e.id, e]));
}
