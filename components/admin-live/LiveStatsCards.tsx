"use client";

import { useState } from "react";
import type { LiveOrder } from "./types";
import { showAdminToast } from "@/lib/adminToast";
import TelegramReportSendModal from "./TelegramReportSendModal";
import { formatSettlementReport } from "@/lib/telegramReportFormat";

type Props = {
  orders: LiveOrder[];
  criteriaLabel?: string;
  /** [2026-10-25] 다른 방송/날짜에서 «옮겨 온» 주문 id(원래 주문 id) — 받은 돈·미결제에 포함되고 괄호로 따로 보여 준다 */
  movedInIds?: ReadonlySet<string>;
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

export default function LiveStatsCards({ orders, criteriaLabel = "최근 주문 500건 전체", movedInIds }: Props) {
  // [2026-08-31 사장님 요청] 현재 시점 결산을 텔레그램으로 — 기존 「지금 결산 보내기」(설정→텔레그램)와 같은 API.
  //   방송중이면 방송 기준(시작~지금), 아니면 오늘 기준. 상품 TOP3·큰손 TOP3 포함. 읽기 전용.
  const [tgSending, setTgSending] = useState(false);
  // [2026-10-22 폰] 숫자 띠는 폰에서 한 줄 요약(받은 돈 · 미결제) + 「펼치기」. PC 는 그대로
  const [mobileOpen, setMobileOpen] = useState(false);
  // [2026-10-22 사장님] 보내기 전 포인트 사용금액 직접 입력 창
  const [tgModalOpen, setTgModalOpen] = useState(false);
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
      if (j?.ok) showAdminToast("지금 보고 있는 조회범위 그대로 텔레그램에 보냈어요.", "success");
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
  // [2026-08-31 사장님 요청] 유치원생 기준 두 숫자 — 📦 상품값(순수 상품금액) vs 💳 실제 받은 돈(수수료·배송비 포함, 포인트 차감)
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
      sub: `미입금 ${bankUnpaid.length}건`,
      icon: "⏱",
      color: "bg-danger-bg text-danger-tx",
    },
    {
      label: "카드 결제완료",
      amount: money(cardPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `결제완료 ${cardPaid.length}건`,
      icon: "💳",
      color: "bg-[var(--color-cardpay)]/12 text-[var(--color-cardpay)]",
    },
    {
      label: "카드미결제",
      amount: money(cardUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `카드미결제 ${cardUnpaid.length}건`,
      icon: "💳",
      color: "bg-danger-bg text-danger-tx",
    },
  ];

  // 지금 화면 숫자 그대로 만드는 보고 텍스트 — [2026-10-22] 문구는 lib/telegramReportFormat(방송 종료 결산과 같은 형식)
  const pointUsedActual = paidOrders.reduce((s2, o) => s2 + Math.max(0, Number(o.pointUsedAmount || 0)), 0);
  const buildRangeReportText = (pointUsedManual: number | null) => {
    const bankUnpaidSum = bankUnpaid.reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0);
    const cardUnpaidSum = cardUnpaid.reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0);
    // 상품별 판매개수(결제완료 · 상품명 기준 · 이벤트 선물 제외)
    const qtyByProduct = new Map<string, number>();
    for (const o of paidOrders) {
      for (const it of Array.isArray(o.items) ? o.items : []) {
        if (it.eventGiftWinnerId) continue;
        const name = String(it.productName || "").trim() || "상품";
        qtyByProduct.set(name, (qtyByProduct.get(name) || 0) + (Number(it.qty) || 1));
      }
    }
    return formatSettlementReport({
      kind: "조회범위 보고",
      title: criteriaLabel,
      when: "",
      paidSum: paidAmount,
      paidCount: paidOrders.length,
      bankPaidSum: bankPaid.reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0),
      cardPaidSum: cardPaid.reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0),
      goodsSum: goodsPaid,
      pointUsedActual,
      pointUsedManual,
      unpaidSum: bankUnpaidSum + cardUnpaidSum,
      unpaidBankCount: bankUnpaid.length,
      unpaidCardCount: cardUnpaid.length,
      products: [...qtyByProduct.entries()].map(([name, qty]) => ({ name, qty })),
    });
  };

  // [2026-10-25 사장님] 옮겨 온 주문 금액은 이 화면 숫자에 포함 — 얼마가 옮겨 온 건지 괄호로 따로(합계 계산은 그대로)
  const isMovedIn = (o: LiveOrder) => Boolean(movedInIds && movedInIds.has(String(o.id)));
  const movedPaidSum = paidOrders.filter(isMovedIn).reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0);
  const movedUnpaidSum = [...bankUnpaid, ...cardUnpaid].filter(isMovedIn).reduce((s2, o) => s2 + Number(o.totalAmount || 0), 0);
  const movedNote = (sum: number) => (sum > 0 ? <span className="ml-1 text-[11px] font-bold text-ink-mute">(옮겨 온 주문 {money(sum)} 포함)</span> : null);
  const unpaidTotal = bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0)+cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0);
  return (
    <div className="mb-1 rounded-2xl border border-rose-line bg-surface md:mb-4 md:border-0 md:p-0">
    <button type="button" onClick={() => setMobileOpen((v) => !v)} aria-expanded={mobileOpen}
      className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-[13px] font-bold md:hidden">
      <span className="text-ink-soft">받은 돈 <span className="text-ink tabular-nums">{money(paidAmount)}</span>{movedNote(movedPaidSum)}</span>
      <span className="text-ink-soft">미결제 <span className="text-danger-tx tabular-nums">{money(unpaidTotal)}</span>{movedNote(movedUnpaidSum)}</span>
      <span className="ml-auto text-[12px] text-ink-mute">{mobileOpen ? "접기" : "펼치기"}</span>
    </button>
    <div className={`${mobileOpen ? "flex" : "hidden"} flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-rose-line bg-surface px-4 py-2.5 text-[13px] font-black max-md:border-t md:flex md:gap-y-1 md:border md:text-[12px] [&>span]:max-w-full [&>span>span]:inline-block [&>span>span]:whitespace-nowrap [&>span>span]:tabular-nums`}>
      {/* [UI 2026-07-06] 기준 명시 — 정산 팝업(이번달 자동조회)과 숫자가 달라 헷갈리던 것 방지 */}
      {/* [2026-08-31 사장님 요청] 유치원생 기준 — 상품값과 실제 받은 돈을 나란히 크게 */}
      <span className="text-ink-soft" title="결제완료 주문의 순수 상품금액만 합친 것 — 카드수수료·배송비·포인트 반영 전">상품값 <span className="text-ink text-[13px]">{money(goodsPaid)}</span></span>
      <span className="text-ink-soft" title="손님이 실제로 낸 돈 — 상품값 + 카드수수료 + 배송비 − 포인트 (결제완료 건만, 미입금·취소·정산제외 미포함)">실제 받은 돈<span className="ml-1 text-[11px] font-bold text-ink-mute">(결제완료만 · 현재 조회범위)</span> <span className="text-ink text-[13px]">{money(paidAmount)}</span>{movedNote(movedPaidSum)}</span>
      <span className="text-line">|</span>
      <span className="text-ink-soft" title="무통장 주문 중 입금확인된 금액">무통장 입금확인 <span className="text-ok-tx">{money(bankPaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft" title="카드 주문 중 결제완료된 금액">카드결제완료 <span className="text-ok-tx">{money(cardPaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-line">|</span>
      <span className="text-ink-soft" title="무통장 주문 중 미입금·매칭필요 금액">미입금 <span className="text-warn-tx">{money(bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft">카드미결제 <span className="text-warn-tx">{money(cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft" title="미입금 + 카드미결제 — 아직 못 받은 돈 전체">미결제 합계 <span className="text-danger-tx">{money(bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0)+cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span>{movedNote(movedUnpaidSum)}</span>
      {tgModalOpen ? (
        <TelegramReportSendModal
          title="텔레그램 보고"
          scopeLabel={criteriaLabel}
          pointUsedActual={pointUsedActual}
          sending={tgSending}
          onClose={() => setTgModalOpen(false)}
          onSend={async (manual) => { await sendTelegramReport(buildRangeReportText(manual)); setTgModalOpen(false); }}
        />
      ) : null}
      <button
        type="button"
        disabled={tgSending}
        onClick={() => setTgModalOpen(true)}
        title="지금 화면(현재 조회범위·필터) 숫자 그대로 텔레그램으로 — 매출·상품값·포인트·미결제·상품별 판매개수"
        className="ml-auto shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft transition hover:bg-surface-2 disabled:opacity-50"
      >
        {tgSending ? "전송 중…" : "텔레그램"}
      </button>
    </div>
    </div>
  );
}
