"use client";

import { formatEventWinnerLabel } from "@/lib/eventCustomGift";
import type { GiftState } from "./useEventCustomGift";

export default function EventCustomGiftStatus({
  states,
  retry,
}: {
  states: Record<string, GiftState>;
  retry: (id: string) => Promise<void>;
}) {
  return (
    <div aria-live="polite">
      {Object.entries(states).map(([id, state]) => {
        const added = state.status === "added" && state.result?.ok ? state.result : null;

        return (
          <div
            key={id}
            style={{ padding: "8px 12px", marginTop: 4, border: "1px solid #ddd", borderRadius: 8, overflowWrap: "anywhere" }}
          >
            {added ? (
              <>
                <div style={{ fontWeight: 800 }}>
                  경품 추가 완료 · {formatEventWinnerLabel(added.nickname, added.customerName)}
                </div>
                <div className="note" style={{ marginTop: 2 }}>
                  {added.productName} · 주문 {added.lookupCode || added.orderGroupId || added.orderId}
                  {added.targetState !== "active" ? " (현재 취소/삭제 상태)" : ""}
                </div>
              </>
            ) : state.status === "adding" ? (
              "경품을 주문서에 추가 중…"
            ) : (
              state.message || "경품 처리 대기"
            )}
            {["failed", "unknown", "pending"].includes(state.status) ? (
              <button className="btn" onClick={() => void retry(id)}>등록 재확인·재시도</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
