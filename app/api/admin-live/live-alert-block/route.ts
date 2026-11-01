// app/api/admin-live/live-alert-block/route.ts
// [2026-11-01 사장님] 방송 알림톡 «계속 제외» 명단 — 보기·회원 찾기·넣기·해제. 관리자만(미들웨어 + 여기서 한 번 더).
//   알림톡 발송(live-alert-send)이 이 명단을 읽어 어느 발송에서도 뺀다. 돈·주문 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { readLiveAlertBlocks, writeLiveAlertBlocks } from "@/lib/liveAlertBlockServer";
import { addLiveAlertBlocks, blockPhone, blockPhoneSet, isMobilePhone, maskBlockPhone, removeLiveAlertBlocks, viewLiveAlertBlocks, type LiveAlertBlockEntry } from "@/lib/liveAlertBlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type CustomerRow = { id: unknown; customer_phone?: unknown; customer_name?: unknown; youtube_nickname?: unknown; kakao_nickname?: unknown; live_alert_optin?: boolean | null };

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const supabase = db();
    const list = await readLiveAlertBlocks(supabase);
    const q = String(request.nextUrl.searchParams.get("q") || "").replace(/[,()*%\\]/g, " ").trim().slice(0, 30);
    let results: Array<{ customerId: string; name: string; nickname: string; phone: string; optin: boolean | null; blocked: boolean }> = [];
    if (q) {
      const digits = blockPhone(q);
      const ors = [`customer_name.ilike.*${q}*`, `youtube_nickname.ilike.*${q}*`, `kakao_nickname.ilike.*${q}*`];
      if (digits.length >= 3) ors.push(`customer_phone.ilike.*${digits}*`);
      const { data, error } = await supabase
        .from("customers")
        .select("id,customer_phone,customer_name,youtube_nickname,kakao_nickname,live_alert_optin")
        .or(ors.join(","))
        .order("last_login_at", { ascending: false, nullsFirst: false })
        .limit(40);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      const blocked = blockPhoneSet(list);
      const seen = new Set<string>();
      for (const row of (data || []) as CustomerRow[]) {
        const phone = blockPhone(row.customer_phone);
        if (!isMobilePhone(phone) || seen.has(phone)) continue;
        seen.add(phone);
        results.push({
          customerId: String(row.id ?? ""),
          name: String(row.customer_name ?? ""),
          nickname: String(row.youtube_nickname || row.kakao_nickname || ""),
          phone: maskBlockPhone(phone),
          optin: typeof row.live_alert_optin === "boolean" ? row.live_alert_optin : null,
          blocked: blocked.has(phone),
        });
      }
      results = results.slice(0, 20);
    }
    return NextResponse.json({ ok: true, items: viewLiveAlertBlocks(list), results });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => null)) as { action?: string; customerIds?: unknown; ids?: unknown } | null;
    const supabase = db();
    const list = await readLiveAlertBlocks(supabase);
    if (body?.action === "add") {
      const ids = Array.isArray(body.customerIds) ? body.customerIds.map((v) => String(v ?? "").trim()).filter(Boolean).slice(0, 200) : [];
      if (!ids.length) return NextResponse.json({ ok: false, message: "회원을 골라 주세요." }, { status: 400 });
      const { data, error } = await supabase.from("customers").select("id,customer_phone,customer_name,youtube_nickname,kakao_nickname").in("id", ids);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      const add: LiveAlertBlockEntry[] = [];
      for (const row of (data || []) as CustomerRow[]) {
        const phone = blockPhone(row.customer_phone);
        if (!isMobilePhone(phone)) continue;
        add.push({ phone, customerId: String(row.id ?? ""), name: String(row.customer_name ?? ""), nickname: String(row.youtube_nickname || row.kakao_nickname || ""), at: "" });
      }
      if (!add.length) return NextResponse.json({ ok: false, message: "휴대폰 번호가 있는 회원만 넣을 수 있어요." }, { status: 400 });
      const next = addLiveAlertBlocks(list, add);
      await writeLiveAlertBlocks(supabase, next);
      return NextResponse.json({ ok: true, items: viewLiveAlertBlocks(next), added: next.length - list.length });
    }
    if (body?.action === "remove") {
      const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v ?? "")).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return NextResponse.json({ ok: false, message: "해제할 회원을 골라 주세요." }, { status: 400 });
      const next = removeLiveAlertBlocks(list, ids);
      await writeLiveAlertBlocks(supabase, next);
      return NextResponse.json({ ok: true, items: viewLiveAlertBlocks(next), removed: list.length - next.length });
    }
    return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}
