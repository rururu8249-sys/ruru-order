// app/api/admin-live/auto-test-order/route.ts
// [2026-11-13] 자동 테스트 주문 관리 — 관리자만(미들웨어 + 세션 확인).
//   GET 상태 · POST {action:"toggle",enabled} | {action:"run"} | {action:"delete",groupIds?:string[]} (groupIds 없으면 자동 테스트 주문서 전부)
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { autoTestRunNow, deleteAutoTestOrders, readAutoTestState, setAutoTestEnabled } from "@/lib/autoTestOrderServer";
import { AUTO_TEST_REASON } from "@/lib/autoTestOrder";
import { getServiceClient } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const deny = () => NextResponse.json({ ok: false, message: "관리자 로그인이 필요해요." }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return deny();
  const sb = getServiceClient();
  const state = await readAutoTestState(sb);
  const { count } = await sb.from("orders").select("order_group_id", { count: "exact", head: true }).eq("is_test_order", true).eq("test_order_reason", AUTO_TEST_REASON);
  return NextResponse.json({ ok: true, state, testRows: count ?? 0 });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return deny();
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  const sb = getServiceClient();
  try {
    if (action === "toggle") return NextResponse.json({ ok: true, state: await setAutoTestEnabled(sb, body?.enabled === true) });
    if (action === "run") {
      const last = await autoTestRunNow(sb, request.nextUrl.origin);
      return NextResponse.json({ ok: true, last, state: await readAutoTestState(sb) });
    }
    if (action === "delete") {
      const ids = Array.isArray(body?.groupIds) ? (body!.groupIds as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : null;
      if (ids && ids.length === 0) return NextResponse.json({ ok: false, message: "지울 주문서가 없어요." }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await deleteAutoTestOrders(sb, ids)) });
    }
    return NextResponse.json({ ok: false, message: "알 수 없는 요청" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "실패" }, { status: 500 });
  }
}
