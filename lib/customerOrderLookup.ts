import { koreanPhoneVariants } from "./order/phone";
import { productHasOverseasBadge } from "./orderPurchaseConsent";
// [2026-08-29] 손님 「주문내역」 조회 규칙 — 두 화면이 같은 규칙을 쓰도록 한 곳에 모은다.
//
// 문제 (실제 신고: 루루짱929 님이 본인 주문내역이 안 보인다고 하심)
//   1) 두 화면 모두 최근 7일치만 조회했다.
//      - app/myorder/page.tsx
//      - app/order/page.tsx 의 주문서 안 「주문내역」 시트
//      해외원정방송은 "방송 종료 후 2~3주 소요"로 공지 중이라, 배송을 기다리는 손님이
//      정작 주문내역을 확인하려 하면 7일이 지나 화면에서 사라진다.
//   2) 두 화면의 고객 식별 기준이 서로 달랐다.
//      - myorder: kakao_id 일치 OR (kakao_id 없는 옛 주문 + 전화번호)
//      - 주문서 시트: 전화번호만  ← 번호가 바뀌면 과거 주문이 통째로 사라진다
//      제출 API(app/api/customer-orders/submit/route.ts)에 적힌 설계 원칙은
//      "고객 식별 = 카카오 계정(kakao_id), 전화번호는 폴백일 뿐" 이므로 시트 쪽이 어긋나 있었다.
//
// 확인된 것 (추정 아님)
//   - 두 조회문 어디에도 broadcast 조건이 없다 → 방송 종료/쇼핑몰 모드와 주문내역 노출은 무관하다.
//   - 안 보이던 진짜 이유는 7일 제한과 식별 기준 불일치다.
//
// 주의: 조회(읽기) 전용이다. orders 를 쓰지 않는다.

// 조회 기간 = DB 에서 «불러오는 최대 범위». 화면에 보이는 범위는 아래 VISIBLE 값으로 한 번 더 거른다.
// [㊿ 2026-10-20 사장님] 180일 → 30일(해외배송 주문서의 최대 노출 기간과 같게).
export const CUSTOMER_ORDER_LOOKUP_DAYS = 30;

// [㊿ 2026-10-20 사장님] 손님에게 «보이는» 주문서 기간 — 기본 14일, 해외배송 상품이 하나라도 든 주문서는 30일.
export const CUSTOMER_ORDER_VISIBLE_DAYS = 14;
export const CUSTOMER_ORDER_VISIBLE_DAYS_OVERSEAS = 30;

// 한 번에 가져올 최대 주문 행 수. 방송 피크에 조회가 무거워지지 않게 상한을 둔다.
// (기존 myorder 조회에는 상한이 아예 없었다)
export const CUSTOMER_ORDER_LOOKUP_LIMIT = 200;

export function customerOrderLookupSinceIso(now: Date = new Date()): string {
  const since = new Date(now.getTime());
  since.setDate(since.getDate() - CUSTOMER_ORDER_LOOKUP_DAYS);
  return since.toISOString();
}

// 카카오 user id 는 숫자만. 숫자가 아니면 필터 문자열에 넣지 않는다(주입 방지 + 전화번호 폴백).
export function normalizeLookupKakaoId(raw: unknown): string {
  const text = String(raw ?? "").trim();
  return /^[0-9]+$/.test(text) ? text : "";
}

// 전화번호도 숫자만 남긴 값만 필터에 넣는다.
export function normalizeLookupPhone(raw: unknown): string {
  return String(raw ?? "").replace(/[^0-9]/g, "");
}

// [2026-08-31 실사고] "주문내역이 안 보인다"는 문의가 반복됐다.
//   orders.customer_phone 은 숫자만("01012345678")과 하이픈("010-1234-5678")이 섞여 저장돼 있는데
//   (제출 API app/api/customer-orders/submit/route.ts 주석에 명시된 사실),
//   조회는 숫자만으로 정확 일치할 때만 찾았다 → 하이픈으로 저장된 옛 주문이 통째로 안 보였다.
//   → 같은 번호의 모든 저장 형식(숫자/옛 하이픈/새 하이픈)으로 찾는다.
//   값은 숫자와 하이픈뿐이라 PostgREST in() 문자열에 안전하다.
export function orderLookupPhoneValues(phoneRaw: unknown): string[] {
  const phone = normalizeLookupPhone(phoneRaw);
  if (!phone) return [];
  return koreanPhoneVariants(phone);
}

// Supabase .or() 에 넣을 문자열.
//   kakao_id 가 있으면: 내 카카오 주문 전부 + (카카오ID 없는 옛 주문 중 내 번호의 모든 저장형식)
//   없으면 null 을 돌려주고, 호출부가 .in("customer_phone", orderLookupPhoneValues(...)) 로 폴백한다.
export function buildOrderLookupOrFilter(kakaoIdRaw: unknown, phoneRaw: unknown): string | null {
  const kakaoId = normalizeLookupKakaoId(kakaoIdRaw);
  const phoneValues = orderLookupPhoneValues(phoneRaw);
  if (!kakaoId) return null;
  if (phoneValues.length === 0) return `kakao_id.eq.${kakaoId}`;
  // 카드 주문 등 과거 저장 경로는 미지정 ID를 null 대신 ""로 저장했다.
  // 다른 계정의 ID는 여전히 제외하고, ID가 없는 두 형식만 번호로 찾는다.
  return `kakao_id.eq.${kakaoId},and(or(kakao_id.is.null,kakao_id.eq.""),customer_phone.in.(${phoneValues.join(",")}))`;
}

// [㊿] 불러온 주문 행(최대 30일)을 주문서 단위로 «보이는 기간» 만큼만 남긴다. 읽기·표시 전용(orders 쓰기 없음).
//   · 주문서 = order_group_id || id, 주문서 시각 = 그 묶음의 가장 이른 created_at
//   · 14일 이내 → 그대로 / 14일 초과~30일 이내 → 묶음 상품 중 해외배송(productHasOverseasBadge, 구매동의와 같은 기준)이 있으면 유지
//   · 상품 조회 오류·예외면 숨기지 않고 그대로 돌려준다(손님 주문이 안 보이는 사고 방지)
//   · 순서는 받은 그대로(created_at desc)
export async function applyCustomerOrderVisibleWindow(supabase: any, rows: any[], now = new Date()): Promise<any[]> {
  if (!Array.isArray(rows) || rows.length === 0) return Array.isArray(rows) ? rows : [];
  try {
    const DAY = 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    const keyOf = (row: any) => String(row?.order_group_id || row?.id || "");
    const groups = new Map<string, { firstMs: number; productIds: Set<string> }>();
    for (const row of rows) {
      const key = keyOf(row);
      const ms = new Date(row?.created_at).getTime();
      const g = groups.get(key) || { firstMs: Number.POSITIVE_INFINITY, productIds: new Set<string>() };
      if (Number.isFinite(ms) && ms < g.firstMs) g.firstMs = ms;
      const pid = String(row?.product_id ?? "").trim();
      if (pid) g.productIds.add(pid);
      groups.set(key, g);
    }
    const ageDays = (g: { firstMs: number }) => (Number.isFinite(g.firstMs) ? (nowMs - g.firstMs) / DAY : 0);
    const needCheck = [...groups.entries()].filter(([, g]) => {
      const age = ageDays(g);
      return age > CUSTOMER_ORDER_VISIBLE_DAYS && age <= CUSTOMER_ORDER_VISIBLE_DAYS_OVERSEAS;
    });
    const ids = [...new Set(needCheck.flatMap(([, g]) => [...g.productIds]))];
    const overseasIds = new Set<string>();
    if (ids.length > 0) {
      const { data, error } = await supabase.from("products").select("id,badge_type,badge_types").in("id", ids);
      if (error) throw error;
      for (const product of data || []) if (productHasOverseasBadge(product)) overseasIds.add(String(product.id));
    }
    const keep = new Set<string>();
    for (const [key, g] of groups) {
      const age = ageDays(g);
      if (age <= CUSTOMER_ORDER_VISIBLE_DAYS) keep.add(key);
      else if (age <= CUSTOMER_ORDER_VISIBLE_DAYS_OVERSEAS && [...g.productIds].some((id) => overseasIds.has(id))) keep.add(key);
    }
    return rows.filter((row) => keep.has(keyOf(row)));
  } catch (error) {
    console.warn("[주문조회] 보이는 기간 거르기 실패 — 숨기지 않고 전부 보여줌", error);
    return rows;
  }
}
