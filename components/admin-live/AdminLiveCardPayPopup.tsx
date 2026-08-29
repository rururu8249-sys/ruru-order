"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import type { LiveOrder } from "./types";

const PAYSTER_URL = "https://user.service.payster.co.kr/#/payment/smspayment";

// 페이스터는 카드결제 팝업 내부 iframe으로 표시합니다. 별도 창(window.open)은 더 이상 사용하지 않습니다.
// LiveOrderTable 등 기존 호출부 호환을 위해 함수 시그니처만 유지(no-op).
export function openPaysterRightHalf() {
  /* no-op */
}

type Props = {
  order: LiveOrder;
  onClose: () => void;
  onAfterStatusChange?: () => void | Promise<void>;
};

function orderSummary(order: LiveOrder) {
  const items = Array.isArray(order.items) ? order.items : [];
  const first = items[0]?.productName?.trim() || "상품";
  return items.length > 1 ? `${first} 외 ${items.length - 1}건` : first;
}

function cardAmount(order: LiveOrder) {
  return Number(order.cardPaymentTotalAmount || 0) || Number(order.totalAmount || 0);
}

function phoneDigits(order: LiveOrder) {
  return String(order.phone || "").replace(/[^0-9]/g, "");
}

export default function AdminLiveCardPayPopup({ order, onClose, onAfterStatusChange }: Props) {
  const [copiedKey, setCopiedKey] = useState("");
  const [saving, setSaving] = useState(false);
  // [2026-08-29] 카톡으로 결제링크 보낸 뒤, 유튜브 채팅에 자동 안내
  const [chatNoticeSending, setChatNoticeSending] = useState(false);
  const [chatNoticeSent, setChatNoticeSent] = useState(false);

  const amount = cardAmount(order);
  const summary = orderSummary(order);
  const phone = phoneDigits(order);

  const fields: { key: string; label: string; value: string; hint?: string; highlight?: boolean }[] = [
    { key: "product", label: "상품명", value: summary },
    { key: "amount", label: "결제금액", value: String(amount), hint: "카드 7% 포함" },
    { key: "nickname", label: "닉네임", value: order.nickname || "", hint: "매칭 기준 · 이름 아님", highlight: true },
    { key: "phone", label: "전화번호", value: phone, hint: "- 없이" },
  ];

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? "" : k)), 1500);
    } catch {
      showAdminToast("복사 실패 — 길게 눌러 직접 복사해주세요.", "warning");
    }
  };

  // [2026-08-29 사장님 요청] 카톡 발송했다고 유튜브 채팅에 자동 안내.
  //   ⚠️ 주문상태·금액·입금·배송은 전혀 건드리지 않는다. 채팅 글만 올린다.
  //   ⚠️ 문구·닉네임은 서버가 DB에서 확인해서 만든다(화면 값 그대로 안 보냄).
  const handleChatNotice = async () => {
    const items = Array.isArray(order.items) ? order.items : [];
    const rowIds = items.map((i) => Number(i.id)).filter((id) => Number.isFinite(id));

    if (rowIds.length === 0) {
      showAdminToast("주문 번호가 없어 채팅 안내를 보낼 수 없습니다.", "warning");
      return;
    }

    const ok = await showAdminConfirm(
      [
        "유튜브 채팅에 이렇게 올릴까요?",
        "",
        `💳 ${order.nickname}님 카카오톡으로 카드결제 링크 보내드렸어요! 📩 확인하시고 결제 부탁드립니다 🙏`,
        "",
        "※ 금액·전화번호는 공개 채팅이라 넣지 않습니다.",
      ].join("\n"),
    );

    if (!ok) return;

    setChatNoticeSending(true);
    try {
      const res = await fetch("/api/admin-live/card-pay-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ orderRowIds: rowIds }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !payload?.ok) {
        showAdminToast("채팅 안내 실패\n\n" + (payload?.error || "잠시 후 다시 시도해 주세요."), "error");
        return;
      }

      setChatNoticeSent(true);
      showAdminToast("유튜브 채팅에 안내를 올렸습니다.", "success");
    } catch (e) {
      showAdminToast("채팅 안내 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setChatNoticeSending(false);
    }
  };

  // 결제완료처리: LiveOrderDetailDrawer.handleCardPaymentStatusChange와 동일 패턴(주문상태만 변경, 금액/배송/송장 로직 무변경)
  const handleComplete = async () => {
    const items = Array.isArray(order.items) ? order.items : [];
    const rowIds = items.map((i) => Number(i.id)).filter((id) => Number.isFinite(id));

    if (rowIds.length === 0) {
      showAdminToast("상태 변경할 주문 ID가 없습니다.", "warning");
      return;
    }

    const ok = await showAdminConfirm(
      [
        "카드결제완료 처리할까요?",
        "",
        "실제 카드결제가 확인된 경우에만 진행하세요.",
        "주문상태만 카드결제완료로 변경합니다.",
      ].join("\n"),
    );

    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          admin_order_status_v2: "카드결제완료",
          order_manage_status: "카드결제완료",
        })
        .in("id", rowIds);

      if (error) {
        showAdminToast("카드결제 상태 변경 실패\n\n" + error.message, "error");
        return;
      }

      showAdminToast("카드결제완료 처리됐습니다.", "success");
      await onAfterStatusChange?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ display: "flex", flexDirection: "row", width: "960px", maxWidth: "95vw", height: "600px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ width: "50%", height: "100%", background: "var(--color-surface)", overflowY: "auto" }}>
        <div className="flex items-center justify-between border-b border-rose-line px-5 py-3">
          <span className="text-[15px] font-black text-ink">💳 카드결제 — {order.nickname}</span>
          <button type="button" onClick={onClose} className="text-lg leading-none text-ink-mute hover:text-ink">
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 text-[12px] font-bold text-ink-soft">필요한 칸 복사 → 페이스터에 붙여넣기</div>

          <div className="space-y-2">
            {fields.map((f) => (
              <div
                key={f.key}
                className={[
                  "flex items-center gap-2 rounded-xl border px-3 py-2",
                  f.highlight ? "border-rose-line bg-rose-soft/50" : "border-line",
                ].join(" ")}
              >
                <div className="w-[64px] shrink-0">
                  <div className={["text-[11px] font-black", f.highlight ? "text-rose-deep" : "text-ink-mute"].join(" ")}>{f.label}</div>
                  {f.hint ? <div className="text-[9px] font-bold text-ink-mute">{f.hint}</div> : null}
                </div>
                <div className={["min-w-0 flex-1 truncate text-[14px] font-black", f.highlight ? "text-rose-deep" : "text-ink"].join(" ")}>
                  {f.value || <span className="text-ink-mute">없음</span>}
                </div>
                <button
                  type="button"
                  onClick={() => copyValue(f.key, f.value)}
                  disabled={!f.value}
                  className={[
                    "h-8 shrink-0 rounded-lg px-2.5 text-[11px] font-black transition disabled:opacity-40",
                    copiedKey === f.key ? "bg-emerald-600 text-white" : "border border-info-tx bg-info-bg text-info-tx hover:bg-info-bg",
                  ].join(" ")}
                >
                  {copiedKey === f.key ? "복사됨" : "⧉ 복사"}
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={chatNoticeSending}
            onClick={handleChatNotice}
            title="카카오톡으로 결제링크를 보낸 뒤 누르세요. 유튜브 채팅에 안내글이 자동으로 올라갑니다."
            className={[
              "mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-black shadow-sm transition disabled:opacity-50",
              chatNoticeSent
                ? "border border-emerald-600 bg-emerald-50 text-emerald-700"
                : "bg-rose-deep text-white hover:opacity-90",
            ].join(" ")}
          >
            {chatNoticeSending ? "채팅 올리는 중…" : chatNoticeSent ? "✔ 채팅 안내 완료 · 다시 보내기" : "📢 카톡 발송완료 → 채팅 안내"}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleComplete}
            className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-surface-3"
          >
            {saving ? "처리 중…" : "✔ 카드결제완료 처리"}
          </button>

          <div className="mt-3 rounded-xl bg-info-bg px-3 py-2 text-[10px] font-bold leading-4 text-info-tx">
            닉네임으로 넣어야 나중에 어느 주문인지 매칭됩니다(이름 X). 페이스터는 남의 서버라 자동 채우기가 안 돼요 — 칸별로 복사해 붙여넣어 주세요.
          </div>
        </div>
        </div>
        <div style={{ width: "50%", height: "100%", background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)" }}>
          <iframe src={PAYSTER_URL} title="페이스터 결제" style={{ width: "100%", height: "100%", border: 0 }} />
        </div>
      </div>
    </div>
  );
}
