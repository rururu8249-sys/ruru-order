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
  // [2026-08-31 사장님 지적] 필터를 골라놨는데 오늘/방송 기준으로 갔다 → 지금 화면(현재 조회범위) 숫자 그대로 보낸다.
  const sendTelegramReport = async (text: string) => {
    if (tgSending) return;
    setTgSending(true);
    try {
      const r = await fetch("/api/admin-live/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "send-range-report", text }),
      });
      const j = await r.json().catch(() => null);
      if (j?.ok) showAdminToast("📊 지금 보고 있는 조회범위 그대로 텔레그램에 보냈어요.", "success");
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
  // [2026-08-31 사장님 요청] 유치원생 기준 두 숫자 — 📦 옷값(순수 상품금액) vs 💳 실제 받은 돈(수수료·배송비 포함, 포인트 차감)
  const goodsPaid = paidOrders.reduce((sum, order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    return sum + (items.length > 0 ? items.reduce((s, it) => s + Number(it.amount || 0), 0) : Number(order.productAmount || 0));
  }, 0);
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

  // 지금 화면 숫자 그대로 만드는 보고 텍스트 (심플 — 사장님 확정 스타일)
  const buildRangeReportText = () => {
    const bankUnpaidSum = bankUnpaid.reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0);
    const cardUnpaidSum = cardUnpaid.reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0);
    // 잘나간 상품 TOP3 (결제완료 · 수량)
    const qtyByProduct = new Map<string, number>();
    const spentByCustomer = new Map<string, number>();
    for (const o of paidOrders) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const name = String(it.productName || "").trim() || "상품";
        qtyByProduct.set(name, (qtyByProduct.get(name) || 0) + (Number(it.qty) || 1));
      }
      const nick = String(o.nickname || o.name || "").trim() || "이름없음";
      spentByCustomer.set(nick, (spentByCustomer.get(nick) || 0) + Number(o.totalAmount || 0));
    }
    const top3 = [...qtyByProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const big3 = [...spentByCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const lines = [
      `📊 조회범위 보고 — ${criteriaLabel}`,
      "",
      `📦 옷값(상품금액) ${money(goodsPaid)}`,
      `💳 실제 받은 돈 ${money(paidAmount)} · ${paidOrders.length}건`,
      `⏳ 미입금 ${money(bankUnpaidSum + cardUnpaidSum)} (무통장 ${bankUnpaid.length}건 · 카드 ${cardUnpaid.length}건)`,
    ];
    if (top3.length > 0) {
      lines.push("", "🏆 잘나간 상품 TOP3");
      top3.forEach(([name, qty], i) => lines.push(`${i + 1}. ${name} — ${qty}개`));
    }
    if (big3.length > 0) {
      lines.push("", "🧑 큰손 TOP3");
      big3.forEach(([nick, amt], i) => lines.push(`${i + 1}. ${nick} — ${money(amt)}`));
    }
    return lines.join("\n");
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-rose-line bg-surface px-4 py-2.5 text-[12px] font-black">
      {/* [UI 2026-07-06] 기준 명시 — 정산 팝업(이번달 자동조회)과 숫자가 달라 헷갈리던 것 방지 */}
      {/* [2026-08-31 사장님 요청] 유치원생 기준 — 옷값과 실제 받은 돈을 나란히 크게 */}
      <span className="text-ink-soft" title="결제완료 주문의 순수 상품금액(옷값)만 합친 것 — 카드수수료·배송비·포인트 반영 전">📦 옷값<span className="ml-1 text-[10px] font-bold text-ink-mute">(상품금액)</span> <span className="text-ink text-[13px]">{money(goodsPaid)}</span></span>
      <span className="text-ink-soft" title="손님이 실제로 낸 돈 — 옷값 + 카드수수료 + 배송비 − 포인트 (결제완료 건만, 미입금·취소·정산제외 미포함)">💳 실제 받은 돈<span className="ml-1 text-[10px] font-bold text-ink-mute">(결제완료만 · 현재 조회범위)</span> <span className="text-ink text-[13px]">{money(paidAmount)}</span></span>
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
        onClick={() => void sendTelegramReport(buildRangeReportText())}
        title="지금 화면(현재 조회범위·필터) 숫자 그대로 텔레그램으로 — 옷값·실제 받은 돈·미입금·TOP3"
        className="ml-auto shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft transition hover:bg-surface-2 disabled:opacity-50"
      >
        {tgSending ? "전송 중…" : "📤 텔레그램"}
      </button>
    </div>
  );
}
