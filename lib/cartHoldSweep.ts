// [㉛ 2026-10-17] 만료된 장바구니 선점 «서버가» 정리 — 손님이 다시 접속하지 않아도 완전 삭제.
//   만료 기준 = 처음 담은 시각 + 유지시간(claim_cart_hold 가 expires_at 에 그 값을 넣는다).
//   하는 일: ① 만료 줄의 손님(세션키·kakao_id·전화)·상품·옵션으로 비움 기록(cart_clear_marks, reason=expired)
//           ② 그 줄을 cart_reservations 에서 삭제(지울 때 다시 «만료 상태»인지 확인 — 그 사이 다시 담은 줄은 안 지움).
//   ①이 있어서 손님 폰이 옛 장바구니를 다시 보내도 동기화가 거절한다(처음 담은 시각이 리셋되지 않음).
//   표시용 선점 전용 — 주문·재고·금액·입금·포인트 무관. 호출처: 동기화(cart-reservations)·관리자 담김 현황·cron.

import { normCartOpt } from "./cartClearMarks";

type SweepClient = { from(table: string): any };

const BATCH = 500;

export async function sweepExpiredCartHolds(supabase: SweepClient, now: Date = new Date()): Promise<{ deleted: number; marked: number; error?: string }> {
  const nowIso = now.toISOString();
  const { data, error } = await supabase
    .from("cart_reservations")
    .select("id,session_key,kakao_id,customer_phone,product_id,color,size")
    .lte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(BATCH);
  if (error) return { deleted: 0, marked: 0, error: String(error.message || error) };
  const rows = (data || []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return { deleted: 0, marked: 0 };

  const seen = new Set<string>();
  const marks: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const mark = {
      reason: "expired",
      session_key: String(row.session_key ?? "").trim() || null,
      kakao_id: String(row.kakao_id ?? "").trim() || null,
      customer_phone: String(row.customer_phone ?? "").replace(/[^0-9]/g, "") || null,
      product_id: String(row.product_id ?? "").trim() || null,
      color: normCartOpt(row.color),
      size: normCartOpt(row.size),
    };
    if (!mark.product_id) continue; // 상품 없는 줄은 비움 기록 대상이 아니다(삭제만)
    const key = [mark.session_key, mark.kakao_id, mark.customer_phone, mark.product_id, mark.color, mark.size].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push(mark);
  }
  let marked = 0;
  if (marks.length > 0) {
    const { error: markError } = await supabase.from("cart_clear_marks").insert(marks);
    if (!markError) marked = marks.length;
  }

  // 사장님 확정: 유지시간이 지나면 «무조건» 완전 삭제(기록 실패여도 지운다).
  const ids = rows.map((row) => row.id).filter((id) => id !== null && id !== undefined);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data: gone, error: delError } = await supabase
      .from("cart_reservations")
      .delete()
      .in("id", ids.slice(i, i + 200))
      .lte("expires_at", nowIso)
      .select("id");
    if (delError) return { deleted, marked, error: String(delError.message || delError) };
    deleted += (gone || []).length;
  }
  return { deleted, marked };
}
