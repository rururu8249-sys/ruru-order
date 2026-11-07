"use client";
// components/admin-live/CardRepayModal.tsx
// 2026-11-01 사장님 — 카드 주문에서 상품 하나를 취소(카드 전체 취소)하고, 남은 상품만 카드결제 링크를 다시 보낼 때.
//   예: 또요 72,000 + 156,000(환불) = 243,960 → 페이스터 전체 취소 → 72,000(+카드추가금 5,040) = 77,040 다시 결제.
//
// 하는 일 = «이미 있는 기능»을 순서대로 부르는 것뿐(새 돈 계산·새 저장 없음):
//   ① 뺄 상품 줄 삭제 — 주문상세 「삭제」와 같은 RPC(admin_delete_order_item): 재고 복구·포인트/배송비 남는 줄로 이동
//   ② 카드결제완료였으면 «카드미결제»로 — 주문상세 「카드미결제로 되돌리기」와 같은 값(cardPaymentStatusPatch)
//   ③ 남은 줄을 DB 에서 다시 읽어 그 금액으로 지금 쓰는 카드결제 창(복사창 + 페이스터)을 연다
// 페이스터 창은 버튼을 누른 «그 순간» 연다(팝업 차단 방지 — 주문표 카드미결제 배지와 같은 순서).
// DESIGN-ADMIN: 확인·고르기 창 = 가운데 모달(폰은 아래에서), 제목 20/700, 주버튼 하나(검정), 합계 표.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { cardPaymentStatusPatch } from "@/lib/cardPaymentStatusUpdate";
import { cardRepayRowFrom, planCardRepay, type CardRepayRow } from "@/lib/cardRepay";
import { deleteOrderItemRow } from "./useLiveOrderItemDelete";
import { openPaysterRightHalf } from "./AdminLiveCardPayPopup";
import type { LiveOrder } from "./types";

type Props = {
  order: LiveOrder;
  /** 환불 이슈로 표시된 줄 — 처음에 «뺄 상품»으로 골라 둔다 */
  defaultRemoveIds: Set<string>;
  onClose: () => void;
  /** 정리가 끝난 주문(남은 줄·새 금액·카드미결제)으로 카드결제 창을 연다 */
  onReady: (order: LiveOrder) => void;
  onAfterChange?: () => void | Promise<void>;
};

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

export default function CardRepayModal({ order, defaultRemoveIds, onClose, onReady, onAfterChange }: Props) {
  const items = useMemo(() => (Array.isArray(order.items) ? order.items : []), [order.items]);
  const wasPaid = order.paymentStatus === "card_paid";
  const [rows, setRows] = useState<CardRepayRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [removeIds, setRemoveIds] = useState<Set<string>>(() => {
    const ids = new Set([...defaultRemoveIds].filter((id) => items.some((it) => String(it.id) === id)));
    return ids.size >= items.length ? new Set() : ids; // 전부 골라져 있으면 비워 둔다(직접 고르게)
  });
  const [cancelledAtPayster, setCancelledAtPayster] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");

  // 줄 금액은 DB 에서 직접(카드추가금·배송비·포인트 반영된 실제 값)
  useEffect(() => {
    let alive = true;
    const ids = items.map((it) => Number(it.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return;
    void (async () => {
      const { data, error } = await supabase.from("orders").select("*").in("id", ids);
      if (!alive) return;
      if (error || !Array.isArray(data)) {
        setLoadError("주문 금액을 못 불러왔어요. 창을 닫고 다시 열어 주세요.");
        return;
      }
      setRows((data as Record<string, unknown>[]).map(cardRepayRowFrom));
    })();
    return () => { alive = false; };
  }, [items]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const plan = planCardRepay(rows, removeIds);
  const needCancelCheck = wasPaid && !cancelledAtPayster;
  const blockReason = loadError || plan.blockReason || (needCancelCheck ? "페이스터에서 전체 취소했는지 체크해 주세요" : "");

  const toggle = (id: string) => {
    if (running) return;
    setRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    if (blockReason || running) return;
    // ⚠ 클릭 «안에서» 먼저 — 비동기 뒤에 열면 팝업 차단에 걸린다
    openPaysterRightHalf();
    setRunning(true);
    setRunError("");
    const removeList = items.filter((it) => removeIds.has(String(it.id)));
    const keepIds = items.filter((it) => !removeIds.has(String(it.id))).map((it) => Number(it.id));
    let removed = 0;
    try {
      for (const it of removeList) {
        const res = await deleteOrderItemRow(Number(it.id), "admin-live 카드 다시 결제 — 상품 빼기", { kind: "card_repay", cardTotalBefore: plan.originalTotal });
        if (!res.ok) {
          setRunError(`「${it.productName || "상품"}」 빼기 실패: ${res.message}${removed > 0 ? ` (앞의 ${removed}개는 이미 뺐어요)` : ""}`);
          return;
        }
        removed += 1;
      }
      if (wasPaid) {
        const { error } = await supabase.from("orders").update(cardPaymentStatusPatch("주문확인전")).in("id", keepIds);
        if (error) {
          setRunError(`상품은 뺐지만 카드미결제로 바꾸지 못했어요: ${error.message} — 주문상세 「카드미결제로 되돌리기」를 눌러 주세요.`);
          return;
        }
      }
      // 남은 줄 실제 금액(배송비 이동·포인트 반영 후)
      const { data, error } = await supabase.from("orders").select("*").in("id", keepIds);
      if (error || !Array.isArray(data) || data.length === 0) {
        setRunError("정리는 끝났는데 새 금액을 못 읽었어요. 주문표에서 「카드미결제」를 눌러 결제창을 여세요.");
        return;
      }
      const fresh = (data as Record<string, unknown>[]).map(cardRepayRowFrom);
      const total = fresh.reduce((s, r) => s + r.total, 0);
      const vat = fresh.reduce((s, r) => s + r.vat, 0);
      const keepSet = new Set(keepIds.map(String));
      showAdminToast(`상품 ${removed}개를 뺐어요. 새 카드결제 ${won(total)}`, "success");
      onReady({
        ...order,
        items: items.filter((it) => keepSet.has(String(it.id))),
        paymentStatus: "card_unpaid",
        cardPaymentTotalAmount: total,
        cardExtraAmount: vat,
        totalAmount: Math.max(0, total - vat),
      });
    } finally {
      setRunning(false);
      await onAfterChange?.();
    }
  };

  const nick = String(order.nickname || "").trim();
  const name = String(order.name || "").trim();

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 sm:items-center sm:p-3" onClick={() => { if (!running) onClose(); }}>
      <div
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col rounded-t-xl bg-surface sm:rounded-xl"
        style={{ boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="일부 취소 · 카드 다시 결제"
      >
        <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold text-ink">일부 취소 · 카드 다시 결제</h2>
            <p className="mt-0.5 truncate text-[13px] text-ink-soft">{nick}{name && name !== nick ? ` · ${name}` : ""} · {order.orderNo}</p>
          </div>
          <button type="button" onClick={onClose} disabled={running} aria-label="닫기" className="h-10 w-10 shrink-0 rounded-lg text-[20px] text-ink-soft hover:bg-surface-2">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="text-[13px] font-semibold text-ink">뺄 상품을 고르세요</div>
          <div className="mt-2 space-y-1.5">
            {items.map((it) => {
              const id = String(it.id);
              const off = removeIds.has(id);
              const row = rowById.get(id);
              return (
                <label key={id} className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${off ? "border-ink bg-surface-2" : "border-line bg-surface"}`}>
                  <input type="checkbox" checked={off} disabled={running} onChange={() => toggle(id)} className="h-5 w-5 shrink-0 accent-[var(--color-ink)]" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] font-semibold ${off ? "text-ink-mute line-through" : "text-ink"}`}>{it.productName || "상품"}</span>
                    <span className="block text-[13px] text-ink-soft">
                      {[it.optionText && it.optionText !== "옵션 없음" ? it.optionText : "", `${it.qty}개`].filter(Boolean).join(" · ")}
                      {defaultRemoveIds.has(id) ? " · 환불 이슈" : ""}
                    </span>
                    {off && it.productId ? <span className="block text-[12px] text-ink-mute">빼면 재고 {it.qty}개가 다시 늘어나요</span> : null}
                  </span>
                  <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${off ? "text-ink-mute line-through" : "text-ink"}`}>{row ? won(row.total) : "…"}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-mute">금액은 카드추가금이 들어간 카드 결제 금액이에요.</p>

          <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between py-1 text-[13px]">
              <span className="text-ink-soft">처음 카드결제</span>
              <span className="tabular-nums text-ink">{won(plan.originalTotal)}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-[13px]">
              <span className="text-ink-soft">빼는 상품 {plan.removeCount}개</span>
              <span className="tabular-nums text-ink">−{won(plan.removeTotal)}</span>
            </div>
            {plan.movedShipping > 0 ? (
              <div className="flex items-center justify-between py-1 text-[12px]">
                <span className="text-ink-mute">배송비는 남는 상품으로 옮겨져요</span>
                <span className="tabular-nums text-ink-mute">{won(plan.movedShipping)} 포함</span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
              <span className="text-[14px] font-semibold text-ink">새 카드결제</span>
              <span className="text-[20px] font-bold tabular-nums text-ink">{won(plan.newTotal)}</span>
            </div>
            {plan.newVat > 0 ? <div className="text-right text-[12px] text-ink-mute">카드추가금 {won(plan.newVat)} 포함</div> : null}
          </div>

          {wasPaid ? (
            <label className={`mt-4 flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${cancelledAtPayster ? "border-ink" : "border-warn-tx bg-warn-bg"}`}>
              <input type="checkbox" checked={cancelledAtPayster} disabled={running} onChange={(e) => setCancelledAtPayster(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--color-ink)]" />
              <span className="text-[14px] font-semibold text-ink">페이스터에서 처음 결제 {won(plan.originalTotal)}을 전체 취소했어요</span>
            </label>
          ) : null}

          {runError ? <p className="mt-3 text-[13px] font-semibold text-danger-tx">{runError}</p> : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <span className="min-w-0 truncate text-[12px] text-ink-mute">{running ? "정리하는 중…" : blockReason}</span>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} disabled={running} className="h-10 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink">취소</button>
            <button type="button" onClick={() => void run()} disabled={Boolean(blockReason) || running} className="h-10 rounded-lg bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-40">
              {running ? "정리하는 중…" : "상품 빼고 결제창 열기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
