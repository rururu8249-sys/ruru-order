// app/api/admin-live/customer-link-requests/route.ts
// [2026-09-09] «계정 연결 요청» 목록 — 관리자 (1단계: 보기 + 처리표시)
//
//   손님이 카톡을 바꿔 계정이 갈라졌을 때, 손님 쪽에서 예전 번호로 본인 확인을 마치면
//   customer_link_requests 에 한 줄이 쌓인다. 사장님은 여기서 그 줄을 본다.
//
//   GET   대기중 + 최근 처리분 목록. 판단에 필요한 «예전 계정» 숫자(주문건수·포인트)를 곁들인다.
//   PATCH 한 줄의 상태만 바꾼다 (pending → done / rejected) + 메모
//
//   ⚠ 1단계는 돈을 «옮기지 않는다». 이 파일에는 포인트/주문/입금/정산/배송 «쓰기»가 한 줄도 없다.
//      읽기는 판단 자료용이고, 쓰기는 customer_link_requests 에만 한다.
//      실제 병합(2단계)은 별도 API 로 만들고, 그때 위험 분석을 다시 한다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { koreanPhoneVariants } from "@/lib/order/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const text = (value: unknown) => String(value ?? "").trim();

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  try {
    const db = admin();

    const { data: rows, error } = await db
      .from("customer_link_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const list = rows || [];

    // 판단 자료 — «예전 계정»에 뭐가 들어 있는지 (읽기만)
    const enriched = await Promise.all(
      list.map(async (row: any) => {
        const oldPhone = text(row?.target_customer_phone);
        if (!oldPhone) return { ...row, old_order_count: 0, old_points: 0 };

        const variants = koreanPhoneVariants(oldPhone);
        const [orderRes, pointRes] = await Promise.all([
          db.from("orders").select("id", { count: "exact", head: true }).in("customer_phone", variants).neq("is_deleted", true),
          db.from("customer_point_balances").select("current_points").in("customer_phone", variants).limit(5),
        ]);

        const points = (pointRes.data || []).reduce((sum: number, item: any) => sum + Number(item?.current_points || 0), 0);
        return { ...row, old_order_count: Number(orderRes.count || 0), old_points: points };
      }),
    );

    return NextResponse.json({
      ok: true,
      rows: enriched,
      pendingCount: enriched.filter((row: any) => text(row?.status) === "pending").length,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, reason: "server", message: String(error?.message || "") }, { status: 500 });
  }
}

// [2026-09-09 2단계] 실제 «합치기» — 미리보기(dryRun) / 실행
//   ⚠ 병합은 단계가 7개다. 여기서 7번 나눠 쏘면 중간에 실패했을 때 반쪽만 옮겨진 채 남는다 = 돈 사고.
//     → Postgres 함수 ruru_merge_customer_link_request 안에서 «한 트랜잭션»으로 돈다(실패하면 통째로 되돌아감).
//     이 파일은 그 함수를 부르기만 한다. 순서·안전핀은 전부 함수 안에 있다.
//     함수는 실행 전 스스로 백업(customer_link_merge_backup)을 남긴다.
export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_body" }, { status: 400 });
  }

  const id = text(body.id);
  if (!id) return NextResponse.json({ ok: false, reason: "no_id" }, { status: 400 });
  // 기본은 «미리보기». 실행은 confirm 을 명시적으로 보내야만 한다(오클릭으로 병합되지 않게).
  const dryRun = body.confirm !== true;

  try {
    const db = admin();
    const { data, error } = await db.rpc("ruru_merge_customer_link_request", {
      p_request_id: id,
      p_dry_run: dryRun,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, result: data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, reason: "server", message: String(error?.message || "") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_body" }, { status: 400 });
  }

  const id = text(body.id);
  const status = text(body.status);
  const memo = text(body.admin_memo).slice(0, 300);

  if (!id) return NextResponse.json({ ok: false, reason: "no_id" }, { status: 400 });
  if (status && !["pending", "done", "rejected"].includes(status)) {
    return NextResponse.json({ ok: false, reason: "bad_status" }, { status: 400 });
  }

  try {
    const db = admin();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) {
      patch.status = status;
      patch.handled_by = String((session as Record<string, unknown>)?.sub || "admin").slice(0, 80);
      patch.handled_at = status === "pending" ? null : new Date().toISOString();
    }
    if (body.admin_memo !== undefined) patch.admin_memo = memo;

    const { error } = await db.from("customer_link_requests").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, reason: "server", message: String(error?.message || "") }, { status: 500 });
  }
}
