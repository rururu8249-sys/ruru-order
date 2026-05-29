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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="포인트 선물 알림"
        className="w-full max-w-[360px] overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
      >
        <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-5 pb-5 pt-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-[32px] shadow-[0_14px_30px_rgba(37,99,235,0.28)]">
            🎁
          </div>

          <h2 className="mt-4 text-[24px] font-black leading-tight tracking-[-0.06em] text-slate-950">
            포인트가 도착했어요
          </h2>

          <p className="mt-2 text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            루루동이에서 고객님께 포인트를 선물했어요.
          </p>
        </div>

        <div className="px-5 pb-5">
          <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-4 text-center">
            <div className="text-[13px] font-black tracking-[-0.04em] text-blue-700">지급 포인트</div>
            <div className="mt-1 text-[28px] font-black leading-tight tracking-[-0.07em] text-blue-700">
              {amountText}
            </div>
          </div>

          <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-3 text-center">
            <div className="text-[12px] font-black tracking-[-0.04em] text-slate-500">현재 보유 포인트</div>
            <div className="mt-1 text-[18px] font-black tracking-[-0.05em] text-slate-900">{balanceText}</div>
          </div>

          {reasonText ? (
            <div className="mt-3 rounded-[18px] border border-slate-100 bg-white px-4 py-3 text-center text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
              {reasonText}
            </div>
          ) : null}

          <p className="mt-3 break-keep text-center text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
            아직 주문 결제에 자동 차감되지는 않아요. 포인트 사용 기능은 별도 안내 후 적용됩니다.
          </p>

          <button
            type="button"
            onClick={closeGift}
            disabled={giftState.closing}
            className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-[20px] bg-blue-600 px-4 py-3 text-[16px] font-black tracking-[-0.04em] text-white shadow-[0_14px_30px_rgba(37,99,235,0.25)] transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          >
            {giftState.closing ? "확인 저장중" : "확인했어요"}
          </button>
        </div>
      </section>
    </div>
  );
}
