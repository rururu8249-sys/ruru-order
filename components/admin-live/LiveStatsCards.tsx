"use client";

import { useState } from "react";
import type { LiveOrder } from "./types";
import { showAdminToast } from "@/lib/adminToast";

type Props = {
  orders: LiveOrder[];
  criteriaLabel?: string;
};

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function isPaid(order: LiveOrder) {
  return ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus);
}

function isCanceled(order: LiveOrder) {
  return order.paymentStatus === "canceled";
}

export default function LiveStatsCards({ orders, criteriaLabel = "최근 주문 500건 전체" }: Props) {
  // [2026-08-31 사장님 요청] 현재 시점 결산을 텔레그램으로 — 기존 「지금 결산 보내기」(설정→텔레그램)와 같은 API.
  //   방송중이면 방송 기준(시작~지금), 아니면 오늘 기준. 상품 TOP3·큰손 TOP3 포함. 읽기 전용.
  const [tgSending, setTgSending] = useState(false);
  const sendTelegramReport = async () => {
    if (tgSending) return;
    setTgSending(true);
    try {
      const r = await fetch("/api/admin-live/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "send-report" }),
      });
      const j = await r.json().catch(() => null);
      if (j?.ok) showAdminToast("📊 현재 시점 결산을 텔레그램으로 보냈어요.", "success");
      else showAdminToast("텔레그램 전송 실패\n\n" + (j?.reason || j?.error || "설정 → 텔레그램에서 봇 연결을 확인하세요"), "error");
    } catch (e) {
      showAdminToast("텔레그램 전송 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setTgSending(false);
    }
  };
  const settlementOrders = orders.filter((order) => order.excludeFromSettlement !== true);
  const totalOrderAmount = settlementOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const activeOrders = settlementOrders.filter((order) => !isCanceled(order));
  const paidOrders = activeOrders.filter(isPaid);
  const paidAmount = paidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  const bankPaid = activeOrders.filter((order) =>
    order.paymentMethod === "무통장입금" && ["paid", "auto_paid", "manual_paid"].includes(order.paymentStatus)
  );
  const bankUnpaid = activeOrders.filter((order) =>
    order.paymentMethod === "무통장입금" && ["unpaid", "manual_match_needed"].includes(order.paymentStatus)
  );
  const cardPaid = activeOrders.filter((order) => order.paymentMethod === "카드결제" && order.paymentStatus === "card_paid");
  const cardUnpaid = activeOrders.filter((order) => order.paymentMethod === "카드결제" && order.paymentStatus === "card_unpaid");

  const stats = [
    {
      label: "결제완료 매출",
      amount: money(paidAmount),
      sub: `결제완료 ${paidOrders.length}건 · 전체 ${settlementOrders.length}건`,
      icon: "📈",
      color: "bg-rose-soft text-rose-deep",
    },
    {
      label: "무통장 결제완료",
      amount: money(bankPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `결제완료 ${bankPaid.length}건`,
      icon: "🏦",
      color: "bg-ok-bg text-ok-tx",
    },
    {
      label: "미입금",
      amount: money(bankUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `입금대기 ${bankUnpaid.length}건`,
      icon: "⏱",
      color: "bg-danger-bg text-danger-tx",
    },
    {
      label: "카드 결제완료",
      amount: money(cardPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `결제완료 ${cardPaid.length}건`,
      icon: "💳",
      color: "bg-violet-50 text-violet-700",
    },
    {
      label: "카드미결제",
      amount: money(cardUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `카드미결제 ${cardUnpaid.length}건`,
      icon: "💳",
      color: "bg-danger-bg text-danger-tx",
    },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-rose-line bg-surface px-4 py-2.5 text-[12px] font-black">
      {/* [UI 2026-07-06] 기준 명시 — 정산 팝업(이번달 자동조회)과 숫자가 달라 헷갈리던 것 방지 */}
      {/* [2026-08-31 사장님 지적] "매출"이 미결제 포함인지 헷갈렸다 — 결제완료 건만 합산됨을 라벨에 명시 */}
      <span className="text-ink-soft" title="입금확인·카드결제완료 된 주문만 합산 — 미입금·카드미결제·취소·정산제외는 포함 안 됨">매출<span className="ml-1 text-[10px] font-bold text-ink-mute">(결제완료만 · 현재 조회범위)</span> <span className="text-ink text-[13px]">{money(paidAmount)}</span></span>
      <span className="text-line">|</span>
      <span className="text-ink-soft">무통장입금 <span className="text-ok-tx">{money(bankPaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft">카드결제 <span className="text-ok-tx">{money(cardPaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-line">|</span>
      <span className="text-ink-soft">무통장미입금 <span className="text-warn-tx">{money(bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft">카드미결제 <span className="text-warn-tx">{money(cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft">전체미입금 <span className="text-danger-tx">{money(bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0)+cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <button
        type="button"
        disabled={tgSending}
        onClick={() => void sendTelegramReport()}
        title="현재 시점 결산(방송명·번 돈·받을 돈·잘나간 상품 TOP3·큰손 TOP3)을 텔레그램으로 보냅니다"
        className="ml-auto shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft transition hover:bg-surface-2 disabled:opacity-50"
      >
        {tgSending ? "전송 중…" : "📤 텔레그램"}
      </button>
    </div>
  );
}
