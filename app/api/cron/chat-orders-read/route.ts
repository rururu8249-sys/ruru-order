// app/api/cron/chat-orders-read/route.ts
// [2026-08-14] 채팅읽기 서버 자동화 — 브라우저 창을 켜놓지 않아도 서버가 스스로 읽는다.
//   Vercel Cron이 1분마다 호출 → 함수 안에서 20초 간격 3회 읽기 = 실효 20초 주기.
//   채팅읽기 OFF / 방송 OFF(테스트 URL 없음)면 readLiveChatOnce가 즉시 건너뜀 → 쿼터 0.
//   bankda-sync cron과 동일한 호출 검증 방식.
import { NextRequest, NextResponse } from "next/server";
import { readLiveChatOnce } from "@/lib/youtubeChatRead";
import { parsePendingChatOrders } from "@/lib/chatOrderPipeline";
import { createClient } from "@supabase/supabase-js";

// [2026-08-14 버그수정] cron이 "읽기만" 하고 판정을 안 해서, 관리자 창이 닫혀 있으면
//   접수확인이 몇 분씩 밀렸다(11:08 주문 → 11:13 판정 실측). 읽은 뒤 바로 판정+봇 발송까지 한다.
function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isVercelCronRequest(request: NextRequest) {
  return (request.headers.get("user-agent") || "").includes("vercel-cron/1.0");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const provided = (
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    ""
  ).trim();
  if (!isVercelCronRequest(request) && (!secret || provided !== secret)) {
    return NextResponse.json({ ok: false, error: { message: "인증 필요" } }, { status: 401 });
  }

  const results: unknown[] = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await readLiveChatOnce();
    let parsed: unknown = null;
    if (r.ok && !r.skipped) {
      // 읽자마자 판정 — 접수확인·재입력 안내가 창 없이도 20초 주기로 나간다
      try { const pr = await parsePendingChatOrders(sbAdmin(), { limit: 200 }); parsed = { updated: pr.updated, botSent: pr.botSent }; } catch { /* 판정 실패해도 다음 회차에 재시도 */ }
    }
    results.push({ ok: r.ok, skipped: r.skipped, fetched: r.fetched, reason: r.reason, parsed });
    // 꺼져 있으면(스킵) 남은 반복도 스킵일 테니 바로 종료 — 함수 시간 낭비 방지
    if (r.skipped) break;
    if (i < 2) await sleep(17000); // 판정 시간이 늘어난 만큼 간격을 줄여 60초 한도 안에 (3회 유지)
  }
  return NextResponse.json({ ok: true, results });
}
