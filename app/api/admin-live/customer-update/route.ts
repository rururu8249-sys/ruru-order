import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

// 관리자: 회원의 닉네임/이름/주소를 교정한다(회원상세에서 호출).
//   - 식별키 customer_phone(숫자만)은 절대 변경하지 않음(여기선 조회/대상 식별에만 사용).
//   - customers(정본) + 그 회원의 orders(주문서 표시: youtube_nickname/customer_name) 갱신.
//   - 돈/포인트/입금상태/금액/deposits/RPC 컬럼은 일절 건드리지 않음(표시·정보 컬럼만).
//   - 주소는 customers.shipping_addresses(기본배송지)만 수정 → flat은 DB 트리거가 미러. 기존 주문 송장 스냅샷은 보존.

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const text = (v: unknown) => String(v ?? "").trim();
const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
// 옛 주문이 하이픈 포맷일 수 있어, 매칭 후보를 숫자/하이픈 둘 다 만든다(누락 방지).
function phoneVariants(d: string): string[] {
  const set = new Set<string>([d]);
  if (d.length === 11) set.add(`${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`);
  else if (d.length === 10) set.add(`${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`);
  return [...set];
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const phoneKey = digits(body.phone);
    if (!phoneKey) return jsonError("대상 회원 전화번호가 없습니다.");

    // 들어온 값(빈 문자열이면 '변경 안 함'으로 취급). 주소는 셋 중 하나라도 오면 주소 변경으로 봄.
    const nextNick = body.youtube_nickname === undefined ? null : text(body.youtube_nickname);
    const nextName = body.customer_name === undefined ? null : text(body.customer_name);
    const hasAddr = body.address !== undefined || body.detail_address !== undefined || body.zipcode !== undefined;
    const nextAddr = text(body.address);
    const nextDetail = text(body.detail_address);
    const nextZip = text(body.zipcode);

    const sb = admin();

    // 현재 회원 조회(정본)
    const { data: cur, error: readErr } = await sb
      .from("customers")
      .select("id, youtube_nickname, customer_name, zipcode, address, detail_address, shipping_addresses, customer_history")
      .eq("customer_phone", phoneKey)
      .limit(1)
      .maybeSingle();
    if (readErr) return jsonError("회원 조회 실패: " + readErr.message, 500);
    if (!cur) return jsonError("해당 전화번호의 회원을 찾지 못했습니다.");

    const c = cur as Record<string, any>;
    const patch: Record<string, unknown> = {};
    // ⚠️ 회원상세 '변경 이력'은 {field, old_value, new_value, changed_at} 키로 읽는다(AdminLiveCustomersPanel). 키 맞춰야 표시됨.
    const history: { field: string; old_value: string; new_value: string; changed_at: string }[] = [];
    const nowIso = new Date().toISOString();
    const pushHist = (field: string, oldV: unknown, newV: unknown) => {
      if (text(oldV) !== text(newV)) history.push({ field, old_value: text(oldV), new_value: text(newV), changed_at: nowIso });
    };

    // 닉네임(youtube_nickname): 손님 표시 닉네임. 빈값으로 비우는 건 막음(식별 불가 방지).
    if (nextNick !== null && nextNick !== "" && nextNick !== text(c.youtube_nickname)) {
      patch.youtube_nickname = nextNick;
      pushHist("youtube_nickname", c.youtube_nickname, nextNick);
    }
    // 이름(customer_name)
    if (nextName !== null && nextName !== "" && nextName !== text(c.customer_name)) {
      patch.customer_name = nextName;
      pushHist("customer_name", c.customer_name, nextName);
    }

    // 주소: shipping_addresses 기본배송지(없으면 첫 항목)만 수정 + flat도 함께 세팅(트리거가 기본배송지로 미러).
    if (hasAddr) {
      const arr = Array.isArray(c.shipping_addresses) ? [...c.shipping_addresses] : [];
      let idx = arr.findIndex((a: any) => a?.isDefault);
      if (idx < 0) idx = arr.length > 0 ? 0 : -1;
      const base = idx >= 0 ? { ...arr[idx] } : { isDefault: true };
      const merged = {
        ...base,
        ...(body.zipcode !== undefined ? { zipcode: nextZip } : {}),
        ...(body.address !== undefined ? { address: nextAddr } : {}),
        ...(body.detail_address !== undefined ? { detailAddress: nextDetail } : {}),
      };
      if (idx >= 0) arr[idx] = merged;
      else arr.push(merged);
      patch.shipping_addresses = arr;
      // flat도 같이(트리거가 어차피 기본배송지로 덮지만, 기본배송지를 위에서 갱신했으니 일치)
      if (body.zipcode !== undefined) { patch.zipcode = nextZip; pushHist("zipcode", c.zipcode, nextZip); }
      if (body.address !== undefined) { patch.address = nextAddr; pushHist("address", c.address, nextAddr); }
      if (body.detail_address !== undefined) { patch.detail_address = nextDetail; pushHist("detail_address", c.detail_address, nextDetail); }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, changed: false, message: "변경된 내용이 없습니다." });
    }

    // 변경 이력 append(회원상세 '변경 이력'에 표시되는 customer_history 재사용)
    if (history.length > 0) {
      const prevHist = Array.isArray(c.customer_history) ? c.customer_history : [];
      patch.customer_history = [...prevHist, ...history];
    }

    const { error: upErr } = await sb.from("customers").update(patch).eq("customer_phone", phoneKey);
    if (upErr) return jsonError("회원 정보 수정 실패: " + upErr.message, 500);

    // 주문서 표시 반영: 그 회원의 orders 의 youtube_nickname/customer_name 만 갱신(표시 전용).
    //   ⚠️ 돈/입금상태/금액/deposit_confirmed_at 등은 건드리지 않음. 주소 스냅샷도 미변경(기존 송장 보존).
    let ordersUpdated = 0;
    const ordersPatch: Record<string, unknown> = {};
    if (patch.youtube_nickname !== undefined) ordersPatch.youtube_nickname = patch.youtube_nickname;
    if (patch.customer_name !== undefined) ordersPatch.customer_name = patch.customer_name;
    if (Object.keys(ordersPatch).length > 0) {
      const { data: oRows, error: oErr } = await sb
        .from("orders")
        .update(ordersPatch)
        .in("customer_phone", phoneVariants(phoneKey))
        .select("id");
      if (oErr) {
        // 주문 표시 갱신 실패해도 회원 정본은 이미 바뀜 → 부분 성공으로 알림
        return NextResponse.json({
          ok: true,
          changed: true,
          ordersUpdated: 0,
          warning: "회원 정보는 바뀌었지만 주문서 표시 갱신에 실패했습니다: " + oErr.message,
        });
      }
      ordersUpdated = Array.isArray(oRows) ? oRows.length : 0;
    }

    return NextResponse.json({ ok: true, changed: true, ordersUpdated, history });
  } catch (e: any) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}
