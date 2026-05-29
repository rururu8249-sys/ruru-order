"use client";

// components/customer/CustomerPointBadge.tsx
// 목적: 고객 화면 공통 포인트 표시 UI
// 주의: 고객 전화번호 기준 read-only 조회만 수행합니다. 주문금액/정산/입금/배송/포인트 차감 로직 없음.

import { useEffect, useState } from "react";

type CustomerPointBadgeProps = {
  className?: string;
};

type PointState = {
  loading: boolean;
  text: string;
};

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function formatPointText(value: unknown): string {
  const amount = Math.max(0, Math.floor(Number(value || 0)));

  if (!Number.isFinite(amount)) {
    return "포인트 0원";
  }

  return `포인트 ${amount.toLocaleString("ko-KR")}원`;
}

export default function CustomerPointBadge({ className = "" }: CustomerPointBadgeProps) {
  const [pointState, setPointState] = useState<PointState>({
    loading: false,
    text: "포인트 0원",
  });

  useEffect(() => {
    let alive = true;

    const phone = normalizePhone(window.localStorage.getItem("ruru_customer_phone") || "");

    if (phone.length < 10) {
      setPointState({ loading: false, text: "포인트 0원" });
      return () => {
        alive = false;
      };
    }

    const loadPoints = async () => {
      setPointState((current) => ({ ...current, loading: true }));

      try {
        const response = await fetch(`/api/customer-points?phone=${encodeURIComponent(phone)}`, {
          method: "GET",
          cache: "no-store",
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || "포인트 조회 실패");
        }

        if (!alive) return;

        const text =
          typeof payload.current_points_text === "string" && payload.current_points_text.trim()
            ? `포인트 ${payload.current_points_text.trim()}`
            : formatPointText(payload.current_points);

        setPointState({
          loading: false,
          text,
        });
      } catch {
        if (!alive) return;

        setPointState({
          loading: false,
          text: "포인트 0원",
        });
      }
    };

    void loadPoints();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-end gap-1 text-right text-[15px] font-black leading-tight tracking-[-0.04em] text-blue-700 whitespace-nowrap ${className}`}
      title="보유 포인트"
    >
      <span>💰</span>
      <span>{pointState.loading ? "포인트 조회중" : pointState.text}</span>
    </div>
  );
}
