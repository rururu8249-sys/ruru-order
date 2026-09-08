"use client";

// components/customer/ShopContactLink.tsx
// [2026-09-08] 손님 화면 「문의하기」 버튼 — 설정 › 상점 정보의 문의 방식대로 움직인다.
//   · 카카오톡 채널 / 오픈채팅 → 새 창으로 주소를 연다 (예전 <a href> 그대로)
//   · 카카오톡 ID → 누르면 ID 를 복사하고 "친구 추가해 주세요" 안내로 바뀐다
//   · 겉모습(className/style)은 부르는 쪽이 그대로 정한다. 글자는 children(함수)로 그리거나, 없으면 기본 글자.
// 주의: UI 전용. 주문·금액·입금 로직 없음.

import { useState, type CSSProperties, type ReactNode } from "react";
import { contactHref, contactLabel, type ShopInfo } from "@/lib/shopInfo";
import { useShopInfo } from "@/lib/useShopInfo";

export type ShopContactRenderCtx = {
  info: ShopInfo;
  /** 방금 ID 를 복사했는지(카카오톡 ID 방식일 때만 true 가 된다) */
  copied: boolean;
  /** 지금 보여줄 글자 (복사 직후엔 안내 문구) */
  label: string;
};

type Props = {
  className?: string;
  style?: CSSProperties;
  labelForm?: "short" | "long";
  children?: (ctx: ShopContactRenderCtx) => ReactNode;
};

const COPIED_LABEL = "ID 복사됨 · 카카오톡에서 친구 추가해 주세요";

export default function ShopContactLink({ className, style, labelForm = "short", children }: Props) {
  const info = useShopInfo();
  const [copied, setCopied] = useState(false);
  const href = contactHref(info);
  const label = copied ? COPIED_LABEL : contactLabel(info, labelForm);
  const content = children ? children({ info, copied, label }) : label;

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
        {content}
      </a>
    );
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(info.contactValue);
    } catch {
      /* 복사가 막힌 환경이어도 ID 는 글자로 보이니 손으로 옮길 수 있다 */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button type="button" onClick={copyId} className={className} style={{ cursor: "pointer", ...style }}>
      {content}
    </button>
  );
}
