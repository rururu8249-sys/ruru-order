import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { SolapiMessageService } from "solapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizePhone(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const pfId = process.env.SOLAPI_PF_ID;
    const templateId = process.env.SOLAPI_TEMPLATE_ID;
    const sender = process.env.SOLAPI_SENDER;
    if (!apiKey || !apiSecret || !pfId || !templateId || !sender) {
      return NextResponse.json({ ok: false, error: "SOLAPI 환경변수 누락(KEY/SECRET/PF_ID/TEMPLATE_ID/SENDER)" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({} as any));
    const broadcastId = String(body?.broadcastId ?? "").trim();
    const dryRun = body?.dryRun === true;

    const supabase = getSupabaseAdmin();

    // 중복 발송 방지: 같은 방송으로 이미 성공 발송 기록이 있으면 막기
    let alreadySent = false;
    if (broadcastId) {
      const { data: prev } = await supabase
        .from("live_alert_logs")
        .select("id")
        .eq("broadcast_id", broadcastId)
        .in("status", ["success", "partial"])
        .limit(1);
      alreadySent = !!(prev && prev.length > 0);
    }

    // opt-in 신청자 조회 (.range 페이지네이션, 1000 초과 대비)
    const phones = new Set<string>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("customers")
        .select("customer_phone")
        .eq("live_alert_optin", true)
        .range(from, from + pageSize - 1);
      if (error) return NextResponse.json({ ok: false, error: `고객 조회 실패: ${error.message}` }, { status: 500 });
      if (!data || data.length === 0) break;
      for (const row of data) {
        const p = normalizePhone((row as any).customer_phone);
        if (p.length >= 10) phones.add(p);
      }
      if (data.length < pageSize) break;
    }
    const targets = Array.from(phones);
    const targetCount = targets.length;

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, targetCount, alreadySent });
    }
    if (alreadySent) {
      return NextResponse.json({ ok: false, alreadySent: true, error: "이 방송은 이미 발송했습니다." }, { status: 409 });
    }
    if (targetCount === 0) {
      return NextResponse.json({ ok: true, targetCount: 0, successCount: 0, failCount: 0, message: "신청자 없음" });
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret);
    const messages = targets.map((to) => ({
      to,
      from: sender,
      kakaoOptions: { pfId, templateId, variables: {}, disableSms: true },
    }));

    let failCount = 0;
    let status = "success";
    let memo = "";
    const rawResults: any[] = [];
    try {
      for (let i = 0; i < messages.length; i += 10000) {
        const part = messages.slice(i, i + 10000);
        const r: any = await messageService.send(part as any);
        rawResults.push(r);
        const fl = Array.isArray(r?.failedMessageList) ? r.failedMessageList : [];
        failCount += fl.length;
      }
    } catch (e: any) {
      status = "fail";
      memo = String(e?.message ?? e).slice(0, 500);
      failCount = targetCount;
      rawResults.push({ error: memo });
    }
    const successCount = Math.max(0, targetCount - failCount);
    if (status !== "fail") status = failCount === 0 ? "success" : successCount === 0 ? "fail" : "partial";

    const sentBy = String((session as any)?.name ?? (session as any)?.sub ?? (session as any)?.id ?? "admin");
    await supabase.from("live_alert_logs").insert({
      broadcast_id: broadcastId || null,
      template_code: templateId,
      target_count: targetCount,
      success_count: successCount,
      fail_count: failCount,
      status,
      sent_by: sentBy,
      memo: memo || null,
      raw_result: rawResults,
    });

    return NextResponse.json({ ok: status !== "fail", targetCount, successCount, failCount, status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
