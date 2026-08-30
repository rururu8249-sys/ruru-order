// app/api/admin-live/customer-phone-change/route.ts
// [2026-08-30 사장님 지시] "내가 수정 아예 가능하게 설계를 하던지" + "오류 안생기게 근본적으로 해결해"
//
// 왜 필요한가
//   회원 전화번호는 지금까지 화면에서 바꿀 수 없었다.
//   (customer-update/route.ts:6 — 식별키라 일부러 잠가둠)
//   그래서 손님이 번호를 잘못 넣으면 사장님이 매번 SQL 을 돌려야 했다.
//   주문상세에서 고쳐도 orders 만 바뀌고 customers 는 그대로라 다음 로그인에 원복됐다.
//
// ⚠️ 전화번호는 "식별키" 다. 아래에 닿는다 —
//     · 포인트 잔액/이력/차단   → DB 트리거 trg_sync_identity_on_phone_change 가 따라옴
//     · 합배송 택배비 묶음      → app/order/page.tsx checkAlreadyPaidShippingGroups 가 customer_phone 기준
//     · 무통장 자동입금확인      → 번호 기준 매칭
//   그래서 회원만 바꾸고 주문을 안 바꾸면 옛 주문과 갈라져 택배비가 또 붙는다.
//   → 기본값은 "회원 + 그 회원 주문"을 함께 통일한다.
//
// 안전장치
//   1) 관리자 세션 필수
//   2) 새 번호 형식 검사(숫자 10~11자리)
//   3) 새 번호를 쓰는 "다른 회원"이 있으면 거부 (번호 재사용 → 남의 주문 딸려옴 방지)
//   4) 회원 변경이 실패하면 주문은 건드리지 않는다
//   5) 받는분 연락처는 "옛 번호와 같을 때만" 바꾼다 (다른 사람이 받는 주문 보호)
//   6) 출고완료 주문 제외 옵션 (과거 송장 기록 보존)
//   7) customer_history 에 변경 기록 → 나중에 추적 가능
//
// 금액 · 입금상태 · 포인트잔액 · 배송비 컬럼은 이 API 가 직접 쓰지 않는다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { conflictMessage, phoneDigits, phoneVariants, validateNewPhone } from "@/lib/customerPhoneChange";

export const runtime = "nodejs";
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

const digits = phoneDigits;

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const currentPhone = digits(body.currentPhone);
    const newPhone = digits(body.newPhone);
    // 기본값: 주문도 같이 통일한다(합배송 갈라짐 방지). 명시적으로 false 를 보낼 때만 끈다.
    const unifyOrders = body.unifyOrders === false ? false : true;
    // 기본값: 출고완료 주문도 포함. true 로 보내면 과거 송장 기록을 보존한다.
    const keepShipped = body.keepShipped === true;

    if (!currentPhone) return jsonError("대상 회원 전화번호가 없습니다.");
    const valid = validateNewPhone(currentPhone, newPhone);
    if (!valid.ok) return jsonError(valid.message);

    const sb = admin();

    // ① 대상 회원 확인
    const { data: target, error: readErr } = await sb
      .from("customers")
      .select("id, youtube_nickname, customer_name, customer_phone, customer_history")
      .eq("customer_phone", currentPhone)
      .limit(1)
      .maybeSingle();

    if (readErr) return jsonError("회원 조회 실패: " + readErr.message, 500);
    if (!target) return jsonError("이 번호를 쓰는 회원을 찾지 못했습니다.", 404);

    // ② 새 번호를 쓰는 다른 회원이 있으면 중단 (번호 재사용 사고 방지)
    const { data: conflicts, error: conflictErr } = await sb
      .from("customers")
      .select("id, youtube_nickname, customer_name")
      .in("customer_phone", phoneVariants(newPhone))
      .neq("id", (target as Record<string, unknown>).id as number);

    if (conflictErr) return jsonError("중복 확인 실패: " + conflictErr.message, 500);
    const conflictMsg = conflictMessage(
      (conflicts || []) as Array<Record<string, unknown>>,
      (target as Record<string, unknown>).id,
    );
    if (conflictMsg) return jsonError(conflictMsg, 409);

    // ③ 회원 번호 변경 — DB 트리거가 포인트 잔액/이력/차단을 새 번호로 옮긴다
    const nowIso = new Date().toISOString();
    const prevHist = Array.isArray((target as Record<string, unknown>).customer_history)
      ? ((target as Record<string, unknown>).customer_history as unknown[])
      : [];

    const { error: upErr } = await sb
      .from("customers")
      .update({
        customer_phone: newPhone,
        customer_history: [
          ...prevHist,
          {
            field: "customer_phone",
            old_value: currentPhone,
            new_value: newPhone,
            note: "관리자 화면에서 변경",
            changed_at: nowIso,
          },
        ],
      })
      .eq("id", (target as Record<string, unknown>).id as number);

    if (upErr) {
      return jsonError(
        "회원 전화번호 변경 실패: " + upErr.message + "\n(주문은 건드리지 않았습니다.)",
        500,
      );
    }

    // ④ 그 회원의 주문도 통일 — 합배송·입금매칭이 번호 기준이라 갈라지면 택배비가 또 붙는다
    let ordersUpdated = 0;
    let recipientUpdated = 0;
    let ordersWarning = "";

    if (unifyOrders) {
      try {
        let q = sb
          .from("orders")
          .update({ customer_phone: newPhone, phone: newPhone })
          .in("customer_phone", phoneVariants(currentPhone));
        if (keepShipped) q = q.neq("order_manage_status", "출고완료");

        const { data: oRows, error: oErr } = await q.select("id");
        if (oErr) {
          ordersWarning = "회원 번호는 바뀌었지만 주문 통일에 실패했습니다: " + oErr.message;
        } else {
          ordersUpdated = Array.isArray(oRows) ? oRows.length : 0;
        }

        // 받는분 연락처는 "주문자와 같았던 경우"에만 따라 바꾼다.
        //   (선물처럼 받는 사람이 다른 주문의 번호를 건드리면 안 된다)
        if (!oErr) {
          const { data: rRows, error: rErr } = await sb
            .from("orders")
            .update({ recipient_phone: newPhone })
            .eq("customer_phone", newPhone)
            .in("recipient_phone", phoneVariants(currentPhone))
            .select("id");
          if (!rErr) recipientUpdated = Array.isArray(rRows) ? rRows.length : 0;
        }
      } catch (e) {
        ordersWarning = "주문 통일 중 오류: " + (e instanceof Error ? e.message : String(e));
      }
    }

    // ⑤ [2026-08-30] 받은 쪽지도 새 번호로 옮긴다.
    //   쪽지는 customer_phone 으로 찾는다. 번호만 바꾸고 여기를 안 옮기면
    //   그 손님이 예전에 받은 쪽지·알림이 쪽지함에서 통째로 사라진다.
    //   target_session_key 가 `phone:<옛번호>` 인 줄도 같이 고친다(번호로만 보낸 쪽지).
    //   실패해도 번호 변경 자체는 되돌리지 않는다 — 쪽지는 보조 기능이다.
    let alertsMoved = 0;
    let alertsWarning = "";
    try {
      const { data: aRows, error: aErr } = await sb
        .from("customer_site_alerts")
        .update({ customer_phone: newPhone })
        .in("customer_phone", phoneVariants(currentPhone))
        .select("id");
      if (aErr) alertsWarning = "쪽지 이동 실패: " + aErr.message;
      else alertsMoved = Array.isArray(aRows) ? aRows.length : 0;

      // 번호로만 보낸 쪽지는 대상 키가 `phone:01012345678` 형태다.
      await sb
        .from("customer_site_alerts")
        .update({ target_session_key: `phone:${newPhone}` })
        .in("target_session_key", phoneVariants(currentPhone).map((v) => `phone:${v.replace(/[^0-9]/g, "")}`));
    } catch (e) {
      alertsWarning = "쪽지 이동 중 오류: " + (e instanceof Error ? e.message : String(e));
    }

    return NextResponse.json({
      ok: true,
      changed: true,
      customerId: (target as Record<string, unknown>).id,
      from: currentPhone,
      to: newPhone,
      ordersUpdated,
      recipientUpdated,
      alertsMoved,
      ...(alertsWarning ? { alertsWarning } : {}),
      ...(ordersWarning ? { warning: ordersWarning } : {}),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}
