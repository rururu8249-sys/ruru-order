// app/api/admin-live/auto-test-order/route.ts
// [2026-11-13] 자동 테스트 주문 관리 — 관리자만(미들웨어 + 세션 확인).
//   GET 상태 · POST {action:"toggle",enabled} | {action:"run"} | {action:"delete",groupIds?:string[]} (groupIds 없으면 자동 테스트 주문서 전부)
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { AUTO_TEST_KAKAO_ID } from "@/lib/autoTestOrder";
import { autoTestRunNow, deleteAutoTestOrders, readAutoTestRows, readAutoTestState, postTestChat, screenHostBeat, screenTestPlan, screenTestVerify, setAutoTestChatEnabled, setAutoTestEnabled, type ScreenPlan } from "@/lib/autoTestOrderServer";
import { getServiceClient } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const deny = () => NextResponse.json({ ok: false, message: "관리자 로그인이 필요해요." }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return deny();
  const sb = getServiceClient();
  // ?host=1 = 관리자 화면(화면 테스트 담당)이 살아 있다는 신호
  if (request.nextUrl.searchParams.get("host") === "1") return NextResponse.json({ ok: true, state: await screenHostBeat(sb) });
  const state = await readAutoTestState(sb);
  const rows = await readAutoTestRows(sb, null).catch(() => []);
  const testOrders = new Set(rows.map((r) => String(r.order_group_id ?? ""))).size;
  return NextResponse.json({ ok: true, state, testOrders });
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
    if (action === "screen-plan") {
      const plan = await screenTestPlan(sb, request.nextUrl.origin, body?.scheduled === true);
      return NextResponse.json({ ok: true, ...("skip" in plan ? { skip: plan.skip } : { plan }) });
    }
    if (action === "toggle-chat") return NextResponse.json({ ok: true, state: await setAutoTestChatEnabled(sb, body?.enabled === true) });
    if (action === "chat-after") {
      // 화면 테스트가 주문을 마친 뒤 — 그 닉네임이 아직 테스트 계정의 지금 닉네임일 때만(다음 테스트와 안 섞이게)
      const plan = body?.plan as ScreenPlan | undefined;
      const text = String(plan?.chatAfter ?? "").trim();
      if (!plan || !text) return NextResponse.json({ ok: true, posted: false });
      if (!(await readAutoTestState(sb)).chatEnabled) return NextResponse.json({ ok: true, posted: false }); // 채팅 끄면 바로 멈춤
      const { data: c } = await sb.from("customers").select("youtube_nickname").eq("kakao_id", AUTO_TEST_KAKAO_ID).maybeSingle();
      if (String((c as { youtube_nickname?: string } | null)?.youtube_nickname ?? "") !== plan.nickname) return NextResponse.json({ ok: true, posted: false });
      const r = await postTestChat(request.nextUrl.origin, plan.broadcastId, text);
      return NextResponse.json({ ok: true, posted: r.ok });
    }
    if (action === "screen-verify") {
      const plan = body?.plan as ScreenPlan | undefined;
      if (!plan || !plan.nickname || !Array.isArray(plan.lines)) return NextResponse.json({ ok: false, message: "계획이 없어요." }, { status: 400 });
      const last = await screenTestVerify(sb, plan, String(body?.note ?? "").slice(0, 300));
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
