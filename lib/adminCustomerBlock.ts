// ═══ 관리자 «고객 차단» 저장 한 곳 — 2026-09-22 신설 ═══
//
//   차단을 회원목록/회원상세/주문상세 세 곳에서 할 수 있게 되면서
//   같은 fetch 가 여러 파일에 복사될 참이었다. 합배송 주소키 사고(같은 로직 복사 →
//   한쪽만 고쳐 사고)와 같은 길이라 처음부터 한 곳으로 모은다.
//
//   ⚠ 실제 저장은 기존 API 가 그대로 한다(app/api/admin-live/customer-block/route.ts).
//     여기서는 부르기만 한다 — 차단 판정·주문·입금·정산 로직 무접촉.

export type AdminCustomerBlockResult = {
  phone: string;
  blocked: boolean;
  reason: string;
  matchedCount: number;
};

export async function requestAdminCustomerBlock(input: {
  phone: string;
  blocked: boolean;
  reason: string;
}): Promise<AdminCustomerBlockResult> {
  const phone = String(input.phone ?? "").replace(/\D/g, "");
  const reason = input.blocked ? String(input.reason ?? "").trim() : "";

  if (!phone) throw new Error("전화번호가 없어 차단 처리할 수 없습니다.");
  if (input.blocked && !reason) throw new Error("차단사유를 입력해주세요.");

  const response = await fetch("/api/admin-live/customer-block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, blocked: input.blocked, reason }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "차단 처리 실패");
  }

  return {
    phone,
    blocked: input.blocked,
    reason,
    matchedCount: Number(payload?.matchedCount || 0),
  };
}
