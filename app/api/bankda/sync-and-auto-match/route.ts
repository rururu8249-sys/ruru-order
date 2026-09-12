import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const INTERNAL_CRON_BYPASS_TOKEN = "ruru-bankda-cron-internal-v1";

async function readJsonSafe(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function pickAutoSummary(autoResult: any) {
  const summary = autoResult?.summary || {};

  return {
    candidates: Number(summary.candidates ?? 0),
    success_count: Number(summary.success_count ?? 0),
    failed_count: Number(summary.failed_count ?? 0),
    blocked_count: Number(summary.blocked_count ?? 0),
    // [2026-09-13] 포인트 전액사용 0원 주문의 입금확인 건수가 요약에서 빠져 있었다.
    //   → 관리자 화면이 «매칭 0건»으로 알고 주문목록을 새로 안 읽어, 입금 소리가 다음 새로고침 때까지 밀렸다.
    //   (자동매칭 판정·DB 쓰기는 그대로. 여기는 이미 끝난 결과를 «세어서 알려주는» 자리일 뿐이다.)
    zero_payment_success_count: Number(summary.zero_payment_success_count ?? 0),
  };
}

function getInternalCronSecret() {
  return INTERNAL_CRON_BYPASS_TOKEN;
}

async function handleSyncAndAutoMatch(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const internalCronSecret = getInternalCronSecret();

  const syncResponse = await fetch(`${origin}/api/bankda/sync-deposits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ruru-internal-cron": internalCronSecret,
      Authorization: `Bearer ${internalCronSecret}`,
    },
    cache: "no-store",
  });

  const syncResult = await readJsonSafe(syncResponse);

  if (!syncResponse.ok || syncResult?.ok === false) {
    return NextResponse.json(
      {
        ok: false,
        mode: "bankda_sync_then_auto_match",
        step: "bankda_sync",
        message: syncResult?.message || "뱅크다 입금내역 동기화 실패",
        sync: syncResult,
      },
      { status: syncResponse.status || 500 }
    );
  }

  const autoResponse = await fetch(`${origin}/api/admin-v2/auto-payment-match/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ruru-internal-cron": internalCronSecret,
      Authorization: `Bearer ${internalCronSecret}`,
    },
    body: JSON.stringify({ confirm: "RUN_AUTO_MATCH" }),
    cache: "no-store",
  });

  const autoResult = await readJsonSafe(autoResponse);
  const autoSummary = pickAutoSummary(autoResult);

  if (!autoResponse.ok || autoResult?.ok === false) {
    return NextResponse.json(
      {
        ...(syncResult || {}),
        ok: false,
        mode: "bankda_sync_then_auto_match",
        step: "auto_payment_match",
        message: autoResult?.message || "뱅크다 동기화 후 자동입금확인 실행 실패",
        sync: syncResult,
        autoMatch: autoResult,
        autoMatchSummary: autoSummary,
      },
      { status: autoResponse.status || 500 }
    );
  }

  return NextResponse.json({
    ...(syncResult || {}),
    ok: true,
    mode: "bankda_sync_then_auto_match",
    message:
      autoSummary.success_count > 0
        ? `자동입금확인 ${autoSummary.success_count.toLocaleString("ko-KR")}건 처리`
        : "입금내역 자동조회 완료 · 자동입금 후보 없음",
    sync: syncResult,
    autoMatch: autoResult,
    autoMatchSummary: autoSummary,
  });
}

export async function POST(request: NextRequest) {
  return handleSyncAndAutoMatch(request);
}

export async function GET(request: NextRequest) {
  return handleSyncAndAutoMatch(request);
}
