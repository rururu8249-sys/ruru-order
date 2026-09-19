"use client";

// [2026-09-20 사장님 요청] 「오른쪽 아래 떠 있는 🔔 버튼이 거슬린다 → 하단 메뉴에 빨간 숫자 배지로」
//
// 안 읽은 쪽지·공지 개수를 한 곳에서 관리한다. 개수는 쪽지함(CustomerSiteAlertPopup)이
// `ruru-note-unread` 이벤트로 알려준다(기존 배선 그대로 — 서버 호출·읽음 처리 로직 무변경).
//
// 배지 치수 근거: Material Design 3 「Badge」 specs (m3.material.io/components/badges/specs, 2026-09-20 확인)
//   · Large badge(숫자 있음): 높이 16dp · 모서리 8dp · 한 자리 16×16dp · 최대 글자수 컨테이너 16×34dp
//   · Small badge(점): 6dp · 모서리 3dp
//   · 색: error / on-error (빨강 바탕 + 흰 글씨)
//   · 아이콘 오른쪽 위 모서리 기준 large badge 는 14×12dp 떨어진 자리
// 표시 전용 — 주문·금액·입금과 무관.

import { useEffect, useState } from "react";
import { noteBadgeText } from "@/lib/noteBadge";

/** 안 읽은 개수 구독 (쪽지함이 보내주는 값). */
export function useNoteUnread(): number {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const onCount = (e: Event) => {
      const n = Number((e as CustomEvent).detail);
      setUnread(Number.isFinite(n) && n > 0 ? n : 0);
    };
    window.addEventListener("ruru-note-unread", onCount as EventListener);
    return () => window.removeEventListener("ruru-note-unread", onCount as EventListener);
  }, []);
  return unread;
}

/** 아이콘 오른쪽 위에 붙이는 빨간 숫자 배지. 0이면 아무것도 안 그린다. */
export default function CustomerNoteUnreadBadge({ count, offset }: { count: number; offset?: { top: number; right: number } }) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: `${offset?.top ?? -2}px`,
        right: `${offset?.right ?? -4}px`,
        height: "16px",
        minWidth: "16px",
        maxWidth: "34px",
        padding: "0 5px",
        borderRadius: "8px",
        background: "#E23B3B",
        color: "#fff",
        fontSize: "11px",
        fontWeight: 900,
        lineHeight: "16px",
        textAlign: "center",
        boxSizing: "border-box",
        boxShadow: "0 0 0 2px #fff",
      }}
    >
      {noteBadgeText(n)}
    </span>
  );
}
