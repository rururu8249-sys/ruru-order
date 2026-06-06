"use client";

// components/customer/CustomerPointGiftPopup.tsx
// 목적: 고객 포인트 선물/지급 알림 팝업
// 주의: customer_point_ledger.customer_seen_at 확인 시각만 저장합니다.
// 주문금액/입금/정산/배송/포인트 잔액/포인트 차감/포인트 사용 로직 없음.

import { useEffect, useState } from "react";

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

    if (phone.length < 10) {
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

    if (!gift || !gift.id || phone.length < 10) {
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
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "24px 16px" }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="포인트 선물 알림"
        style={{ width: "100%", maxWidth: "360px", overflow: "hidden", borderRadius: "26px", border: "1px solid #D9C5CC", background: "#fff", boxShadow: "0 24px 70px rgba(15,23,42,0.28)" }}
      >
        <div style={{ background: "#F5E6EB", padding: "24px 20px 20px", textAlign: "center" }}>
          <div style={{ margin: "0 auto", display: "flex", height: "64px", width: "64px", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#7B2D43", fontSize: "32px" }}>
            🎁
          </div>
          <h2 style={{ marginTop: "16px", fontSize: "23px", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.06em", color: "#7B2D43" }}>
            포인트 선물이 도착했어요!
          </h2>
          <p style={{ marginTop: "8px", fontSize: "14px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#666" }}>
            루루동이님이 보낸 선물 · 감사합니다 💝
          </p>
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ borderRadius: "18px", border: "1px solid #D9C5CC", background: "#F5E6EB", padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "-0.04em", color: "#7B2D43" }}>지급 포인트</div>
            <div style={{ marginTop: "4px", fontSize: "28px", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.07em", color: "#7B2D43" }}>{amountText}</div>
          </div>

          <div style={{ marginTop: "12px", borderRadius: "16px", background: "#FAF6F2", padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "-0.04em", color: "#888" }}>현재 보유 포인트</div>
            <div style={{ marginTop: "4px", fontSize: "18px", fontWeight: 800, letterSpacing: "-0.05em", color: "#222" }}>{balanceText}</div>
          </div>

          {reasonText ? (
            <div style={{ marginTop: "12px", borderRadius: "14px", border: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px", textAlign: "center", fontSize: "13px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#666" }}>
              {reasonText}
            </div>
          ) : null}

          <p style={{ marginTop: "12px", wordBreak: "keep-all", textAlign: "center", fontSize: "12px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#999" }}>
            아직 주문 결제에 자동 차감되지는 않아요. 포인트 사용 기능은 별도 안내 후 적용됩니다.
          </p>

          <button
            type="button"
            onClick={closeGift}
            disabled={giftState.closing}
            style={{ marginTop: "16px", display: "flex", minHeight: "54px", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: "16px", border: "none", background: "#7B2D43", padding: "0 16px", fontSize: "16px", fontWeight: 800, letterSpacing: "-0.04em", color: "#fff", cursor: giftState.closing ? "wait" : "pointer", opacity: giftState.closing ? 0.7 : 1 }}
          >
            {giftState.closing ? "확인 저장중" : "확인했어요"}
          </button>
        </div>
      </section>
    </div>
  );
}
