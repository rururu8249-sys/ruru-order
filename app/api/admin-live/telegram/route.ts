import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  checkTelegramBotToken,
  detectChatIdFromUpdates,
  getTelegramStatus,
  readReportOnEnd,
  saveTelegramConfig,
  sendTelegram,
  writeReportOnEnd,
} from "@/lib/telegram";
import { buildTodayReport } from "@/lib/telegramReport";

export const runtime = "nodejs";

// 관리자 전용: 텔레그램 알림 상태 조회 / 설정 저장 / 테스트 발송
export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const status = await getTelegramStatus();
    const reportOnEnd = await readReportOnEnd();
    return NextResponse.json({ ok: true, ...status, reportOnEnd });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String((body as any)?.action || "");

  try {
    if (action === "save") {
      // [2026-10-23] 토큰을 새로 넣으면 저장 전에 텔레그램(getMe)으로 확인 — 틀린 토큰이 조용히 저장돼 「전송 안 됨」으로만 보이던 것 방지
      let botName = "";
      if (typeof (body as any)?.botToken === "string" && String((body as any).botToken).trim()) {
        const check = await checkTelegramBotToken(String((body as any).botToken));
        if (!check.ok) return NextResponse.json({ ok: false, error: `봇 토큰 확인 실패 — ${check.reason}` }, { status: 400 });
        botName = check.botName || "";
      }
      await saveTelegramConfig({
        botToken: typeof (body as any)?.botToken === "string" ? (body as any).botToken : undefined,
        chatId: typeof (body as any)?.chatId === "string" ? (body as any).chatId : undefined,
        enabled: typeof (body as any)?.enabled === "boolean" ? (body as any).enabled : undefined,
      });
      if (typeof (body as any)?.reportOnEnd === "boolean") await writeReportOnEnd((body as any).reportOnEnd);
      return NextResponse.json({ ok: true, botName });
    }
    if (action === "detect-chat") {
      const r = await detectChatIdFromUpdates();
      return NextResponse.json(r);
    }
    if (action === "send-report") {
      // 방송 종료 자동발송(auto)일 때는 토글 꺼져 있으면 스킵. 수동 버튼은 항상 보냄.
      const auto = (body as any)?.auto === true;
      if (auto && !(await readReportOnEnd())) {
        return NextResponse.json({ ok: false, skipped: true, reason: "방송 종료 자동발송 꺼짐" });
      }
      // [2026-10-22 사장님] 포인트 사용금액 수동 입력(숫자) — 없으면 실제 사용금액
      const rawManual = (body as any)?.pointUsedManual;
      const pointUsedManual = rawManual === null || rawManual === undefined || rawManual === "" ? null : Number(rawManual);
      const text = await buildTodayReport({ pointUsedManual: pointUsedManual != null && Number.isFinite(pointUsedManual) && pointUsedManual >= 0 ? pointUsedManual : null });
      const r = await sendTelegram(text, { forceEvenIfDisabled: !auto });
      return NextResponse.json({ ok: r.ok, skipped: r.skipped, reason: r.reason, preview: text });
    }
    if (action === "send-range-report") {
      // [2026-08-31 사장님 지적] 매출 바의 📤 버튼이 화면 필터와 무관하게 오늘/방송 기준으로 갔다
      //   → 화면(현재 조회범위)에서 만든 보고 텍스트를 그대로 보낸다. 수동 버튼이라 토글 무관 전송.
      const text = String((body as any)?.text || "").trim().slice(0, 3500);
      if (!text) return NextResponse.json({ ok: false, reason: "보낼 내용이 없습니다." });
      const r = await sendTelegram(text, { forceEvenIfDisabled: true });
      return NextResponse.json({ ok: r.ok, skipped: r.skipped, reason: r.reason });
    }
    if (action === "test") {
      const msg = String((body as any)?.message || "").trim() || "🔔 루루동이 텔레그램 알림 테스트입니다. 잘 도착했어요!";
      const r = await sendTelegram(msg, { forceEvenIfDisabled: true });
      return NextResponse.json({ ok: r.ok, skipped: r.skipped, reason: r.reason });
    }
    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
