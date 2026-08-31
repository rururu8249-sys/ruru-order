// ── [2026-08-31 사장님 요청] 고객용 주문내역 복사 텍스트 ──
//   주문 상세 서랍(LiveOrderDetailDrawer)의 「고객용 복사」와 주문서 목록의 「주문서 복사」가
//   같은 텍스트를 쓰도록 한 곳으로 분리했다. 읽기 전용 — 어떤 데이터도 변경하지 않는다.
//   금액 계산은 서랍 화면 표시값과 동일한 기준(상품금액/배송비/카드추가금/포인트).
import type { LiveOrder } from "./types";
import { formatOrderOptionText } from "@/lib/orderOptionText";
import { formatKoreanPhone } from "@/lib/order/phone";

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()}원`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getCustomerAddress(order: LiveOrder) {
  const row = order as LiveOrder & {
    address?: string | null;
    detailAddress?: string | null;
    detail_address?: string | null;
    customerAddress?: string | null;
    shippingAddress?: string | null;
  };
  const baseAddress = clean(row.address) || clean(row.customerAddress) || clean(row.shippingAddress);
  const detailAddress = clean(row.detailAddress) || clean(row.detail_address);
  return [baseAddress, detailAddress].filter(Boolean).join(" ");
}

function formatFullDateTime(value: string | null | undefined, fallback?: string | null) {
  if (!value) return fallback || "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback || value || "-";
  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${weekdays[date.getDay()]} ${hh}:${mi}`;
}

// [고객용 복사 · 2026-07-22 사장님 지시] 배송정보+주문내역+금액을 고객에게 붙여넣기 좋은 텍스트로.
//   orderForView: 화면에 보이는 주문(상세 서랍은 로컬 수정본을 넘긴다). rawOrder: 원본(스네이크 필드 보조).
// 상세 서랍과 동일한 금액 계산 (LiveOrderDetailDrawer 442~493과 같은 기준) — 복사·결제요청이 함께 쓴다.
function computeAmounts(orderForView: LiveOrder, rawOrder?: LiveOrder) {
  const raw = (rawOrder ?? orderForView) as unknown as Record<string, unknown>;
  const view = orderForView as unknown as Record<string, unknown>;
  const items = Array.isArray(orderForView.items) ? orderForView.items : [];
  const productAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const shippingFee = Number(orderForView.shippingFee || 0);
  const paymentMethodText = String(raw.paymentMethod ?? raw.payment_method ?? raw.payment_type ?? "");
  const isCardPaymentDisplay = paymentMethodText.includes("카드");
  const cardPaymentExtraAmount =
    Number(raw.cardExtraAmount ?? raw.card_extra_amount ?? raw.vat_amount ?? raw.vatAmount ?? 0) || 0;
  const cardPaymentExpectedTotal =
    Number(
      raw.cardPaymentTotalAmount ??
        raw.card_payment_total_amount ??
        raw.adjusted_total_price ??
        raw.adjustedTotalPrice ??
        raw.total_price ??
        raw.totalPrice ??
        raw.final_amount ??
        raw.finalAmount ??
        0
    ) ||
    productAmount + shippingFee + cardPaymentExtraAmount;
  const totalAmount = productAmount + shippingFee;
  const pointUsedAmount =
    Number(view.pointUsedAmount ?? view.point_used_amount ?? raw.pointUsedAmount ?? raw.point_used_amount ?? 0) || 0;
  const payableTotal = isCardPaymentDisplay
    ? cardPaymentExpectedTotal
    : Math.max(0, totalAmount - (pointUsedAmount > 0 ? pointUsedAmount : 0));
  return { items, productAmount, shippingFee, isCardPaymentDisplay, cardPaymentExtraAmount, payableTotal };
}

export function buildCustomerOrderCopyText(orderForView: LiveOrder, rawOrder?: LiveOrder): string {
  const { items, productAmount, shippingFee, isCardPaymentDisplay, cardPaymentExtraAmount, payableTotal } =
    computeAmounts(orderForView, rawOrder);

  const fmtPhone = (value?: string | null) => formatKoreanPhone(value);
  const o = orderForView;
  const orderPhoneDigits = String(o.phone || "").replace(/[^0-9]/g, "");
  const recipientName = String(o.recipientName || "").trim();
  const recipientPhone = String(o.recipientPhone || "").trim();
  const recipientDiffers =
    (recipientName && recipientName !== String(o.name || "").trim()) ||
    (recipientPhone && recipientPhone.replace(/[^0-9]/g, "") !== orderPhoneDigits);
  const addressText = getCustomerAddress(o);
  const zip = String(o.zipcode || "").trim();

  const lines: string[] = [];
  lines.push(`[루루동이 주문내역] ${String(o.orderNo || "").trim()}`.trim());
  lines.push(`주문일: ${formatFullDateTime(o.createdAt, o.submittedAt)}`);
  lines.push("");
  if (String(o.nickname || "").trim()) lines.push(`닉네임: ${String(o.nickname).trim()}`);
  lines.push(`주문자: ${String(o.name || "").trim()}${o.phone ? ` (${fmtPhone(o.phone)})` : ""}`);
  if (recipientDiffers) {
    lines.push(`받는분: ${recipientName || String(o.name || "").trim()}${recipientPhone ? ` (${fmtPhone(recipientPhone)})` : ""}`);
  }
  if (addressText) lines.push(`주소: ${zip ? `(${zip}) ` : ""}${addressText}`);
  lines.push("");
  lines.push("[주문상품]");
  for (const item of items) {
    const opt = formatOrderOptionText(item.color, item.size); // [2026-08-31] 없음 숨김·「사이즈 6」 표기
    lines.push(`- ${item.productName}${opt ? ` (${opt})` : ""} ${Number(item.qty) || 1}개 · ${money(Number(item.amount) || 0)}`);
  }
  lines.push("");
  lines.push(`상품금액 ${money(productAmount)}`);
  lines.push(`배송비 ${money(shippingFee)}`);
  if (isCardPaymentDisplay && cardPaymentExtraAmount > 0) lines.push(`카드수수료 ${money(cardPaymentExtraAmount)}`);
  {
    const view = orderForView as unknown as Record<string, unknown>;
    const raw = (rawOrder ?? orderForView) as unknown as Record<string, unknown>;
    const pointUsedAmount =
      Number(view.pointUsedAmount ?? view.point_used_amount ?? raw.pointUsedAmount ?? raw.point_used_amount ?? 0) || 0;
    if (pointUsedAmount > 0) lines.push(`포인트 사용 -${money(pointUsedAmount)}`);
  }
  lines.push(`총 결제금액 ${money(payableTotal)} · ${String(o.paymentMethod || "").trim() || "무통장입금"}`);
  // [2026-08-22 사장님 지시] 입금 상태를 복사 텍스트에 표기 — 완료면 완료 표시,
  //   입금 전(무통장)이면 계좌·입금액·확인 소요시간 안내까지 붙인다. (읽기 전용, 데이터 무변경)
  {
    const ps = String(o.paymentStatus || "");
    if (["paid", "auto_paid", "manual_paid", "card_paid"].includes(ps)) {
      lines.push("");
      lines.push("✅ 입금확인 완료된 주문이에요. 감사합니다!");
    } else if (ps === "unpaid" || ps === "manual_match_needed") {
      lines.push("");
      // 계좌는 주문서 페이지(app/order/page.tsx BANK_*)와 동일 값 — 계좌 변경 시 함께 수정
      lines.push("💳 입금계좌: 새마을금고 9002186993725 (유혜원)");
      lines.push(`입금하실 금액: ${money(payableTotal)}`);
      lines.push("※ 입금 확인은 보통 10분, 늦어도 30분 안에 완료돼요. 이미 입금하셨다면 조금만 기다려주세요 🙂");
    } else if (ps === "card_unpaid") {
      lines.push("");
      lines.push("💳 카드결제 확인 전 주문이에요.");
    }
  }
  if (String(o.deliveryMemo || "").trim()) {
    lines.push("");
    lines.push(`배송메모: ${String(o.deliveryMemo).trim()}`);
  }

  return lines.join("\n");
}

// ── [2026-08-31 사장님 요청] 제출된 주문서 「결제요청」 쪽지 문구 ──
//   결제수단·입금상태에 맞는 문구. 이미 확인 끝났거나 취소된 주문이면 null(보낼 필요 없음).
//   발송은 기존 쪽지 API(/api/admin-live/customer-note) 재사용 — 주문/입금/정산 데이터 무접촉.
export function buildPaymentRequestNote(order: LiveOrder): { title: string; message: string } | null {
  const ps = String(order.paymentStatus || "");
  if (["paid", "auto_paid", "manual_paid", "card_paid", "canceled"].includes(ps)) return null;
  const { payableTotal } = computeAmounts(order);
  const nick = String(order.nickname || order.name || "고객").trim();

  if (ps === "card_unpaid") {
    // [2026-08-31 사장님 지시] 카드결제 링크는 카카오톡으로 간다 — 어디서 뭘 누르면 되는지 구체적으로.
    return {
      title: "💳 카드결제 안내",
      message: `${nick}님, 주문서 잘 받았어요! 카드결제가 아직 완료 전이에요.\n\n결제하실 금액: ${money(payableTotal)}\n\n📱 카카오톡으로 카드결제 링크를 보내드렸어요.\n카카오톡을 열어 「루루동이」가 보낸 메시지의 링크를 누르고, 안내에 따라 결제를 완료해주세요.\n\n결제가 확인되면 바로 주문 처리해드릴게요 🙂 링크가 안 보이시면 방송 채팅이나 쪽지로 말씀해주세요.`,
    };
  }
  // 무통장 (unpaid / manual_match_needed)
  return {
    title: "💳 입금 안내",
    // 계좌는 app/order/page.tsx BANK_* 와 동일 값 — 계좌 변경 시 함께 수정
    message: `${nick}님, 주문서 잘 받았어요! 아직 입금 확인 전이에요.\n\n💳 입금계좌: 새마을금고 9002186993725 (유혜원)\n입금하실 금액: ${money(payableTotal)}\n\n※ 이미 입금하셨다면 확인까지 보통 10분, 늦어도 30분 걸려요. 조금만 기다려주세요 🙂`,
  };
}
