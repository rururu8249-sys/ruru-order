"use client";

// components/customer/CustomerPointGiftPopup.tsx
// 목적: 고객 포인트 선물/지급 알림 팝업
// 주의: customer_point_ledger.customer_seen_at 확인 시각만 저장합니다.
// 주문금액/입금/정산/배송/포인트 잔액/포인트 차감/포인트 사용 로직 없음.

import { useEffect, useState } from "react";
// [2026-09-20] 가운데 확인창 «한 벌» 틀 — ✕·배경·뒤로가기도 「확인했어요」와 같은 closeGift(확인 기록). 지급 로직 무관.
import CustomerDialog from "./CustomerDialog";

type PointGift = {
  id: string;
  amount: number;
  amount_text: string;
  balance_after: number;
  balance_after_text: string;
  reason?: string;
  created_at?: string | null;
};

type GiftState = {
  loading: boolean;
  gift: PointGift | null;
  closing: boolean;
};

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function fallbackMoney(value: unknown): string {
  const amount = Math.max(0, Math.floor(Number(value || 0)));

  if (!Number.isFinite(amount)) {
    return "0원";
  }

  return `${amount.toLocaleString("ko-KR")}원`;
}

export default function CustomerPointGiftPopup() {
  const [giftState, setGiftState] = useState<GiftState>({
    loading: false,
    gift: null,
    closing: false,
  });

  useEffect(() => {
    let alive = true;

    const phone = normalizePhone(window.localStorage.getItem("ruru_customer_phone") || "");

    if (phone.length < 9) {
      return () => {
        alive = false;
      };
    }

    const loadGift = async () => {
      setGiftState((current) => ({ ...current, loading: true }));

      try {
        const response = await fetch(`/api/customer-point-gifts?phone=${encodeURIComponent(phone)}`, {
          method: "GET",
          cache: "no-store",
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || "포인트 선물 조회 실패");
        }

        if (!alive) return;

        setGiftState({
          loading: false,
          gift: payload.gift || null,
          closing: false,
        });
      } catch {
        if (!alive) return;

        setGiftState({
          loading: false,
          gift: null,
          closing: false,
        });
      }
    };

    void loadGift();

    return () => {
      alive = false;
    };
  }, []);

  const closeGift = async () => {
    const phone = normalizePhone(window.localStorage.getItem("ruru_customer_phone") || "");
    const gift = giftState.gift;

    if (!gift || !gift.id || phone.length < 9) {
      setGiftState({ loading: false, gift: null, closing: false });
      return;
    }

    setGiftState((current) => ({ ...current, closing: true }));

    try {
      await fetch("/api/customer-point-gifts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          phone,
          gift_id: gift.id,
        }),
      });
    } catch {
      // 알림 확인 저장 실패가 주문서/고객 화면 사용을 막으면 안 됩니다.
    } finally {
      setGiftState({ loading: false, gift: null, closing: false });
    }
  };

  if (!giftState.gift) {
    return null;
  }

  const amountText = giftState.gift.amount_text || fallbackMoney(giftState.gift.amount);
  const balanceText = giftState.gift.balance_after_text || fallbackMoney(giftState.gift.balance_after);
  const reasonText = String(giftState.gift.reason || "").trim();

  return (
    <CustomerDialog
      open
      onClose={closeGift}
      closeDisabled={giftState.closing}
      title="🎁 포인트 선물이 도착했어요!"
      ariaLabel="포인트 선물 알림"
      hideCancel
      primary={{ label: giftState.closing ? "확인 저장중" : "확인했어요", onClick: closeGift, disabled: giftState.closing }}
    >
      <p style={{ fontSize: "13px", fontWeight: 700, color: "#666" }}>루루동이님이 보낸 선물 · 감사합니다 💝</p>
      <div style={{ marginTop: "10px", borderRadius: "16px", border: "1px solid #D9C5CC", background: "#F5E6EB", padding: "14px", textAlign: "center" }}>
        <div style={{ fontSize: "13px", fontWeight: 800, color: "#7B2D43" }}>지급 포인트</div>
        <div style={{ marginTop: "4px", fontSize: "28px", fontWeight: 800, lineHeight: 1.2, color: "#7B2D43" }}>{amountText}</div>
      </div>
      <div style={{ marginTop: "10px", borderRadius: "14px", background: "#FAF6F2", padding: "10px 16px", textAlign: "center" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: "#888" }}>현재 보유 포인트</div>
        <div style={{ marginTop: "2px", fontSize: "18px", fontWeight: 800, color: "#222" }}>{balanceText}</div>
      </div>
      {reasonText ? (
        <div style={{ marginTop: "10px", borderRadius: "14px", border: "1px solid #E8E2DD", background: "#fff", padding: "10px 16px", textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#666" }}>
          {reasonText}
        </div>
      ) : null}
      {/* [2026-09-20] 예전 문구 「아직 주문 결제에 자동 차감되지 않아요·별도 안내 후 적용」은 사실과 달라 정정 — 주문서에서 바로 쓸 수 있다. */}
      <p style={{ marginTop: "10px", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "#999" }}>
        주문서 확인 화면의 「포인트 전부 쓰기」로 바로 쓸 수 있어요.
      </p>
    </CustomerDialog>
  );
}
