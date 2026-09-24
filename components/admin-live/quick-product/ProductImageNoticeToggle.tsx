"use client";

// [2026-09-24 사장님] 「체크하면 문구가 들어가고」 — 사진 올리기 «직전»에 켜고 끄는 스위치.
//   설정(설정 › 상품사진 문구)에 저장된 값이 기본이고, 여기서 누르면 이번 화면에서만 뒤집힌다.
//   연출컷엔 넣고 실물컷엔 안 넣는 식으로 상품마다 다르게 쓰려고 사진칸 옆에 둔다.
//   ⚠ 실제로 그리는 곳은 compressProductImage → productImageNoticeClient. 여기는 스위치만.

import { useEffect, useState } from "react";
import {
  getProductImageNoticeSessionOn,
  loadProductImageNotice,
  setProductImageNoticeSessionOn,
} from "./productImageNoticeClient";

export default function ProductImageNoticeToggle() {
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const notice = await loadProductImageNotice();
      if (!alive) return;
      const session = getProductImageNoticeSessionOn();
      setOn(session === null ? notice.on : session);
      setText(notice.text || "");
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return null;

  const toggle = () => {
    const next = !on;
    setOn(next);
    setProductImageNoticeSessionOn(next);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={toggle}
        title={text}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          fontWeight: 800,
          color: on ? "var(--color-rose-deep)" : "var(--color-ink-mute)",
          background: on ? "var(--color-rose-soft)" : "var(--color-surface-2)",
          border: `1px solid ${on ? "var(--color-rose-line)" : "var(--color-line)"}`,
          borderRadius: "8px",
          padding: "6px 8px",
          cursor: "pointer",
        }}
      >
        <span>{on ? "☑" : "☐"}</span>
        <span>사진에 안내문구 넣기</span>
      </button>
      <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>
        {on
          ? `지금 올리는 사진 오른쪽 아래에 「${text.slice(0, 22)}${text.length > 22 ? "…" : ""}」 가 들어갑니다`
          : "문구 없이 사진 그대로 올라갑니다 · 문구 내용은 설정 › 상품사진 문구"}
      </span>
    </div>
  );
}
