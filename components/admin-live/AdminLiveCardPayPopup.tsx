"use client";

import { useEffect, useState } from "react";
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
  // [2026-08-29 사장님 요청] 페이스터는 남의 사이트라 자동 입력이 안 된다(브라우저 동일출처 정책).
  //   예전: 상품명·금액·닉네임·전화번호를 1→2→3→4 순서로 네 번 복사해야 했다.
  //   지금: 닉네임과 상품명을 하나로 합쳐서 "한 번만" 복사한다. 닉네임이 앞에 온다(매칭 기준).
  //         금액·전화번호는 페이스터에서 입력칸이 따로라 합칠 수 없어 보조 복사로 남긴다.
  const amount = cardAmount(order);
  const summary = orderSummary(order);
  // [2026-08-31 사장님 요청] 팝업 가운데 빈 공간에 "이 주문 내용" 확인 카드 — 표시 전용, 데이터 무변경
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const baseAmount = Number(order.totalAmount || 0); // 상품금액 + 배송비
  const cardExtra = Number(order.cardExtraAmount || 0) || Math.max(0, amount - baseAmount);
  const phone = phoneDigits(order);
  const nickname = String(order.nickname || "").trim();

  // 페이스터 「상품명」 칸에 그대로 붙여넣는 값 — 닉네임 먼저, 뒤에 상품명
  const pasteValue = [nickname, summary].filter(Boolean).join(" ");

  // [2026-08-30 사장님 확인] 카드결제 링크는 "돈 내는 사람"에게 간다.
  //   받는 곳이 본인 집이 아닐 수 있지만(선물·다른 집 수령 등) 결제는 계정 주인이 한다.
  //   order.phone = 주문자 번호, order.recipientPhone = 택배 받는분 번호 (별개)
  // [2026-08-31 사장님 지시] 복사 순서: 1 결제금액 → 2 상품명 → 3 주문자 번호 (숫자키도 이 순서)
  const fields: { key: string; label: string; value: string; hint?: string; highlight?: boolean }[] = [
    { key: "amount", label: "결제금액", value: String(amount), hint: "카드 7% 포함" },
    { key: "paste", label: "상품명 칸", value: pasteValue, hint: "닉네임 + 상품명" },
    { key: "phone", label: "주문자 번호", value: phone, hint: "결제하는 분 · - 없이" },
  ];

  // [2026-08-31 실사고] 손님이 주문자 번호를 바꿔 주문하면 주문에는 옛 번호가 남아,
  //   카드결제 링크가 손님이 안 쓰는 번호로 나갔다(루루짱929 님 건).
  //   → 받는분 번호가 다르면 그것도 복사할 수 있게 같이 보여준다. 사장님이 골라 쓰면 된다.
  const recipientPhoneForPick = String((order as { recipientPhone?: string | null }).recipientPhone || "").replace(/[^0-9]/g, "");
  if (recipientPhoneForPick && recipientPhoneForPick !== phone) {
    fields.push({ key: "recipientPhone", label: "받는분 번호", value: recipientPhoneForPick, hint: "주문자 번호와 다름 · 확인 후 사용" });
  }

  // [2026-08-30] 집·사무실 전화(02 등)로도 주문할 수 있게 열었다.
  //   카드결제 링크는 문자로 가므로 휴대폰이 아니면 발송이 안 된다.
  //   → 관리자가 링크를 만들기 전에 눈으로 알 수 있게 경고를 띄운다.
  //   ⚠️ 주문·금액·입금·정산은 건드리지 않는다. 화면 경고만.
  const phoneIsMobile = /^01[016789][0-9]{7,8}$/.test(phone);
  const recipientPhoneDigits = String((order as { recipientPhone?: string | null }).recipientPhone || "").replace(/[^0-9]/g, "");
  const recipientIsMobile = /^01[016789][0-9]{7,8}$/.test(recipientPhoneDigits);

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? "" : k)), 1500);
    } catch {
      showAdminToast("복사 실패 — 길게 눌러 직접 복사해주세요.", "warning");
    }
  };

  // 칸 하나를 바로 복사한다(순서·단계 없음).
  const copyFieldValue = async (index: number) => {
    const field = fields[index];
    if (!field || !field.value) return;
    await copyValue(field.key, field.value);
  };

  // 숫자키 1~4 로도 복사 (마우스 안 옮기고 붙여넣기만 반복할 수 있게)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = String(el?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index < 0) return;
      event.preventDefault();
      void copyFieldValue(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // [2026-08-31 사장님 지시] 유튜브 채팅 자동 게시는 쿼터를 먹는다(봇 글 하루 상한 공유)
  //   → 안내문구를 복사만 해주고, 유튜브 채팅에는 사장님이 직접 붙여넣는다. (금액·전화번호는 공개 채팅이라 안 넣음)
  const chatNoticeText = `💳 ${order.nickname}님 카카오톡으로 카드결제 링크 보내드렸어요! 📩 확인 부탁드려요 🙏`;

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
      {/* [2026-08-31 사장님 지시] 세로는 화면 거의 끝까지(위아래 8px만), 왼쪽은 페이스터풍 네이비·블루로
          위 쏠림 없이 세로 공간을 나눠 쓴다(헤더 → 복사 카드들 → (여백) → 하단 액션). */}
      <div style={{ display: "flex", flexDirection: "row", width: "980px", maxWidth: "96vw", height: "min(1500px, calc(100dvh - 16px))", borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ width: "50%", height: "100%", background: "#F4F6FB", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ background: "#101C3D" }}>
          <span className="text-[16px] font-black text-white">💳 카드결제 — {order.nickname}</span>
          <button type="button" onClick={onClose} className="text-xl leading-none text-white/60 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
          {/* [2026-08-31 사장님 확인] 맨 위 큰 복사 버튼은 2번 칸과 같은 값이라 삭제 — 1·2·3 카드로 통일 */}
          <div className="mb-2 text-[12px] font-bold" style={{ color: "#5A6B92" }}>페이스터 입력칸 순서대로 1 → 2 → 3 복사해서 붙여넣으세요 (숫자키 1~4)</div>

          <div className="space-y-3">
            {!phoneIsMobile && phone ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] font-bold leading-relaxed text-amber-800">
                ⚠️ 주문자 번호가 휴대폰이 아닙니다 ({phone}) — 결제링크 문자가 가지 않습니다.
                {recipientIsMobile ? (
                  <> 배송지 연락처 <b>{recipientPhoneDigits}</b> 로 보내거나, 카카오톡으로 링크를 직접 보내주세요.</>
                ) : (
                  <> 카카오톡으로 링크를 직접 보내거나, 손님께 휴대폰 번호를 여쭤보세요.</>
                )}
              </div>
            ) : null}
            {fields.map((f, fieldIndex) => (
              <div
                key={f.key}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-sm"
                style={{ border: f.highlight ? "1.5px solid #2B6BEB" : "1px solid #DDE4F2" }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black text-white" style={{ background: f.highlight ? "#2B6BEB" : "#8B99BC" }}>{fieldIndex + 1}</span>
                <div className="w-[70px] shrink-0">
                  <div className="text-[11.5px] font-black" style={{ color: f.highlight ? "#2B6BEB" : "#5A6B92" }}>{f.label}</div>
                  {f.hint ? <div className="text-[9px] font-bold" style={{ color: "#8B99BC" }}>{f.hint}</div> : null}
                </div>
                <div className="min-w-0 flex-1 truncate text-[15px] font-black" style={{ color: "#101C3D" }}>
                  {f.value || <span style={{ color: "#8B99BC" }}>없음</span>}
                </div>
                <button
                  type="button"
                  onClick={() => void copyFieldValue(fieldIndex)}
                  disabled={!f.value}
                  className="h-9 shrink-0 rounded-lg px-3 text-[12px] font-black transition disabled:opacity-40"
                  style={copiedKey === f.key ? { background: "#059669", color: "#fff" } : { background: "#EAF0FE", color: "#2B6BEB", border: "1px solid #BFD2F8" }}
                >
                  {copiedKey === f.key ? "복사됨" : "⧉ 복사"}
                </button>
              </div>
            ))}
          </div>

          {/* [2026-08-31 사장님 요청] 가운데 빈 공간 활용 — 결제 전에 주문·금액을 눈으로 검산 (표시 전용) */}
          <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl bg-white px-4 py-3.5 shadow-sm" style={{ border: "1px solid #DDE4F2" }}>
            <div className="mb-2 shrink-0 text-[11.5px] font-black" style={{ color: "#5A6B92" }}>🧾 이 주문 내용 — 결제 전에 확인하세요</div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {orderItems.map((item, itemIndex) => {
                const opt = [String(item.color || "").trim(), String(item.size || "").trim()]
                  .filter((v) => v && v !== "없음")
                  .join("/");
                return (
                  <div key={itemIndex} className="flex items-center justify-between gap-2 text-[12.5px] font-bold" style={{ color: "#101C3D" }}>
                    <span className="min-w-0 flex-1 truncate">
                      {item.productName}
                      {opt ? ` (${opt})` : ""}
                      {Number(item.qty) > 1 ? ` ×${item.qty}` : ""}
                    </span>
                    <span className="shrink-0" style={{ color: "#5A6B92" }}>{Number(item.amount || 0).toLocaleString()}원</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 shrink-0 space-y-1 border-t pt-2.5 text-[12px] font-bold" style={{ borderColor: "#EAF0FE", color: "#5A6B92" }}>
              <div className="flex justify-between"><span>상품금액 + 배송비</span><span>{baseAmount.toLocaleString()}원</span></div>
              <div className="flex justify-between"><span>카드 추가금</span><span style={{ color: "#7C3AED" }}>+{cardExtra.toLocaleString()}원</span></div>
              <div className="flex justify-between text-[14px] font-black" style={{ color: "#2B6BEB" }}><span>카드 결제금액</span><span>{amount.toLocaleString()}원</span></div>
            </div>
          </div>

          {/* 하단 액션과의 간격 — 확인 카드가 남는 세로를 흡수한다 */}
          <div className="min-h-3 shrink-0" />

          <button
            type="button"
            onClick={() => void copyValue("chatNotice", chatNoticeText)}
            title="카카오톡으로 결제링크를 보낸 뒤 누르세요. 안내문구가 복사되고, 유튜브 채팅에 붙여넣기만 하면 됩니다. (자동 게시 안 함 — 쿼터 무소모)"
            className="w-full rounded-2xl px-4 py-3.5 text-sm font-black shadow-md transition"
            style={copiedKey === "chatNotice" ? { background: "#059669", color: "#fff" } : { background: "#101C3D", color: "#fff" }}
          >
            {copiedKey === "chatNotice" ? "✔ 복사됨 · 유튜브 채팅에 붙여넣기" : "📢 카톡 발송완료 안내문구 복사"}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleComplete}
            className="mt-2.5 w-full rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-black text-white shadow-md transition hover:bg-emerald-700 disabled:bg-surface-3"
          >
            {saving ? "처리 중…" : "✔ 카드결제완료 처리"}
          </button>

          <div className="mt-4 rounded-xl px-3.5 py-2.5 text-[10.5px] font-bold leading-4" style={{ background: "#EAF0FE", color: "#3D5A8F" }}>
            상품명 칸은 「닉네임 상품명」 순서로 넣어야 나중에 어느 주문인지 매칭됩니다(이름 X). 전화번호는 <b>주문자(결제하는 분)</b> 번호예요 — 택배 받는 분 번호가 아닙니다. 페이스터는 남의 서버라 자동 채우기가 안 돼요.
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
