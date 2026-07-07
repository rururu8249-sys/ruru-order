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

function maskPhone(p: string): string {
  return p.length >= 8 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p;
}

// 발송 대상 모드:
//   - "optin": 방송알림 신청(live_alert_optin=true) 회원만  (안전, 기본값)
//   - "all"  : 전체 회원 (신청 안 한 사람 포함) — 동의 미확인자에게 발송 = 카카오 채널 제재 위험
// 어느 모드든 "이 방송에서 이미 받은 사람"은 자동 제외(증분 발송). 재발송해도 중복 안 감.
type SendMode = "optin" | "all";

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
    const mode: SendMode = body?.mode === "all" ? "all" : "optin";

    const supabase = getSupabaseAdmin();

    // 이 방송에서 이미 받은 사람(성공 기록) — 증분 발송을 위해 제외 목록으로 사용
    const received = new Set<string>();
    if (broadcastId) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("live_alert_recipients")
          .select("customer_phone")
          .eq("broadcast_id", broadcastId)
          .eq("status", "success")
          .range(from, from + 999);
        if (error) break; // 기록 테이블 조회 실패해도 발송 자체는 진행(최악: 중복발송 방지만 약해짐)
        if (!data || data.length === 0) break;
        for (const r of data) {
          const p = normalizePhone((r as any).customer_phone);
          if (p) received.add(p);
        }
        if (data.length < 1000) break;
      }
    }

    // 후보 회원(모드별) — 전화번호 + 이름(미리보기용)
    const candidates = new Map<string, string>(); // phone -> name
    for (let from = 0; ; from += 1000) {
      let q = supabase.from("customers").select("customer_phone, customer_name").range(from, from + 999);
      if (mode === "optin") q = q.eq("live_alert_optin", true);
      const { data, error } = await q;
      if (error) return NextResponse.json({ ok: false, error: `고객 조회 실패: ${error.message}` }, { status: 500 });
      if (!data || data.length === 0) break;
      for (const row of data) {
        const p = normalizePhone((row as any).customer_phone);
        if (p.length >= 10 && !candidates.has(p)) candidates.set(p, String((row as any).customer_name ?? ""));
      }
      if (data.length < 1000) break;
    }

    // 대상 = 후보 − 이미 받은 사람
    const targets = Array.from(candidates.keys()).filter((p) => !received.has(p));
    const targetCount = targets.length;
    const candidateCount = candidates.size;
    const receivedCount = received.size;

    if (dryRun) {
      const sample = targets.slice(0, 100).map((p) => ({ name: candidates.get(p) || "", phone: maskPhone(p) }));
      return NextResponse.json({ ok: true, dryRun: true, mode, candidateCount, receivedCount, targetCount, sample });
    }

    if (targetCount === 0) {
      return NextResponse.json({
        ok: true,
        mode,
        targetCount: 0,
        successCount: 0,
        failCount: 0,
        message: receivedCount > 0 ? "이 방송은 대상 전원이 이미 받았습니다." : "발송 대상이 없습니다.",
      });
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret);
    const messages = targets.map((to) => ({
      to,
      from: sender,
      kakaoOptions: { pfId, templateId, variables: {}, disableSms: true },
    }));

    const failedPhones = new Set<string>();
    let status = "success";
    let memo = "";
    const rawResults: any[] = [];
    try {
      for (let i = 0; i < messages.length; i += 10000) {
        const part = messages.slice(i, i + 10000);
        const r: any = await messageService.send(part as any);
        rawResults.push(r);
        const fl = Array.isArray(r?.failedMessageList) ? r.failedMessageList : [];
        for (const f of fl) {
          const fp = normalizePhone((f as any)?.to);
          if (fp) failedPhones.add(fp);
        }
      }
    } catch (e: any) {
      status = "fail";
      memo = String(e?.message ?? e).slice(0, 500);
      for (const p of targets) failedPhones.add(p);
      rawResults.push({ error: memo });
    }

    const successPhones = targets.filter((p) => !failedPhones.has(p));
    const successCount = successPhones.length;
    const failCount = targetCount - successCount;
    if (status !== "fail") status = failCount === 0 ? "success" : successCount === 0 ? "fail" : "partial";

    // 성공한 수신자 기록(증분 발송 근거). 중복은 무시(유니크 인덱스 + ignoreDuplicates). broadcastId 있을 때만.
    if (broadcastId && successPhones.length > 0) {
      for (let i = 0; i < successPhones.length; i += 1000) {
        const rows = successPhones.slice(i, i + 1000).map((p) => ({
          broadcast_id: broadcastId,
          customer_phone: p,
          status: "success",
        }));
        const { error: recErr } = await supabase
          .from("live_alert_recipients")
          .upsert(rows, { onConflict: "broadcast_id,customer_phone", ignoreDuplicates: true });
        if (recErr) console.warn("[live-alert] 수신자 기록 실패(발송은 완료됨):", recErr.message);
      }
    }

    // 발송 요약 로그(기존 유지)
    const sentBy = String((session as any)?.name ?? (session as any)?.sub ?? (session as any)?.id ?? "admin");
    await supabase.from("live_alert_logs").insert({
      broadcast_id: broadcastId || null,
      template_code: templateId,
      target_count: targetCount,
      success_count: successCount,
      fail_count: failCount,
      status,
      sent_by: sentBy,
      memo: memo || `mode=${mode}`,
      raw_result: rawResults,
    });

    return NextResponse.json({ ok: status !== "fail", mode, targetCount, successCount, failCount, status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
