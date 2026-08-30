// app/api/admin-live/customer-note/route.ts
// [2026-08-30 사장님 요청] "일반 쇼핑몰처럼 쪽지 알림"
//
//   기존 알림(checkout_reminder)은 문구가 고정이라 하고 싶은 말을 못 보냈다.
//   이 API 는 사장님이 직접 쓴 쪽지를 손님에게 보낸다.
//
//   왜 사이트 안 쪽지인가 (웹푸시 대신)
//     · 카카오톡 인앱 브라우저는 웹푸시를 지원하지 않는다 (카카오 공식 답변)
//     · 아이폰은 홈화면에 추가한 사람만 웹푸시를 받는다
//     · 알림 권한은 손님이 눌러야만 허용되고, 한 번 차단하면 다시 못 묻는다
//   → 사이트 안 쪽지는 이 제약이 하나도 없다. 접속만 하면 누구나 본다.
//
// [2026-08-30 보강]
//   POST   여러 명에게 한 번에 + 같은 쪽지 중복 발송 차단(source_key)
//   GET    보낸 쪽지 목록 (누구에게·언제·읽었는지)
//   PATCH  잘못 보낸 쪽지 회수
//
// 주문·금액·입금·정산·배송·포인트 무접촉. customer_site_alerts 에만 쓴다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  buildNoteSourceKey,
  cleanNotePhone,
  cleanNoteSessionKey,
  cleanNoteText,
  noteHours,
  normalizeTargets,
  targetSessionKeyOf,
  type CleanTarget,
} from "@/lib/customerNote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const who = (session: unknown) => String((session as Record<string, unknown>)?.username || "admin").slice(0, 80);

// [2026-08-30 배포 순서 사고 방지]
//   source_key / revoked_at 은 이번에 새로 추가하는 칸이다.
//   SQL 을 아직 안 돌린 상태로 배포되면 "그런 칸 없다" 오류가 나서 쪽지가 통째로 안 나간다.
//   → 그 오류만 따로 알아보고, 새 칸 없이 한 번 더 시도한다. (SQL 을 돌리면 자동으로 원래 길로 돌아온다)
const isMissingColumn = (msg: unknown) =>
  /column .* does not exist|could not find the .* column|PGRST204|42703/i.test(String(msg ?? ""));
const isDuplicate = (msg: unknown) =>
  /duplicate key|unique constraint|23505/i.test(String(msg ?? ""));

/** 보내기 — 한 명이든 여러 명이든 같은 길로 간다. */
export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = cleanNoteText(body.title, 60) || "📩 루루동이 알림";
    const message = cleanNoteText(body.message, 500);
    const hours = noteHours(body.hours);

    // 예전 방식(한 명)도 그대로 받는다 — 고객 카드의 쪽지 보내기가 이 모양으로 부른다.
    const targets: CleanTarget[] = Array.isArray(body.targets)
      ? normalizeTargets(body.targets)
      : normalizeTargets([{ phone: body.phone, sessionKey: body.sessionKey }]);

    if (targets.length === 0) {
      return NextResponse.json({ ok: false, message: "받는 손님을 찾지 못했습니다(전화번호 또는 세션키 필요)." }, { status: 400 });
    }
    if (!message) return NextResponse.json({ ok: false, message: "보낼 내용을 적어주세요." }, { status: 400 });

    const sb = admin();
    const nowMs = Date.now();
    const sentBy = who(session);

    const rows = targets.map((t) => ({
      // 전화번호가 있으면 그걸 기준으로 — 기기를 바꿔도 그 손님이면 받는다.
      target_session_key: targetSessionKeyOf(t),
      customer_phone: t.phone || null,
      kind: "admin_note",
      title,
      message,
      is_active: true,
      expires_at: new Date(nowMs + hours * 60 * 60 * 1000).toISOString(),
      sent_by: sentBy,
      // 같은 사람·같은 내용·같은 10분 구간이면 같은 값 → DB 유니크가 두 번째를 막는다.
      source_key: buildNoteSourceKey(t, message, nowMs),
    }));

    // ① 사전 조회로 먼저 거른다(에러 없이 "이미 보냄"으로 알려주기 위해)
    let already = new Set<string>();
    try {
      const { data } = await sb
        .from("customer_site_alerts")
        .select("source_key")
        .in("source_key", rows.map((r) => r.source_key));
      already = new Set(((data || []) as Record<string, unknown>[]).map((r) => String(r.source_key ?? "")));
    } catch {
      /* 사전 조회 실패해도 아래 유니크 인덱스가 최종적으로 막는다 */
    }

    const fresh = rows.filter((r) => !already.has(r.source_key));
    const skipped = rows.length - fresh.length;
    if (fresh.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped, duplicate: true, hours });
    }

    // ② 실제 저장. 동시에 두 번 눌린 경우는 유니크 위반이 나는데, 그건 실패가 아니라 "이미 보냄"이다.
    let { data: inserted, error } = await sb.from("customer_site_alerts").insert(fresh).select("id");

    // 새 칸(source_key)이 아직 없는 DB — 중복 방지 없이라도 쪽지는 나가게 한다.
    let sourceKeyMissing = false;
    if (error && isMissingColumn(error.message)) {
      sourceKeyMissing = true;
      const plain = fresh.map(({ source_key, ...rest }) => rest);
      const retry = await sb.from("customer_site_alerts").insert(plain).select("id");
      inserted = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isDuplicate(error.message)) return NextResponse.json({ ok: true, sent: 0, skipped: rows.length, duplicate: true, hours });
      return NextResponse.json({ ok: false, message: "쪽지 저장 실패: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sent: (inserted || []).length, skipped, hours, sourceKeyMissing });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** 보낸 쪽지 목록 — 누구에게 · 언제 · 읽었는지 · 회수했는지 */
export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(200, Math.max(10, Math.floor(Number(sp.get("limit")) || 60)));
    const phone = cleanNotePhone(sp.get("phone"));
    const sessionKey = cleanNoteSessionKey(sp.get("sessionKey"));
    // 기본은 사장님이 직접 쓴 쪽지만. all=1 이면 담긴현황 자동알림까지 같이 본다.
    const includeAuto = sp.get("all") === "1";

    const sb = admin();
    let q = sb
      .from("customer_site_alerts")
      .select("id,kind,title,message,customer_phone,target_session_key,created_at,expires_at,seen_at,dismissed_at,revoked_at,revoked_by,sent_by,is_active")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!includeAuto) q = q.eq("kind", "admin_note");
    if (phone) q = q.eq("customer_phone", phone);
    else if (sessionKey) q = q.eq("target_session_key", sessionKey);

    let { data, error } = await q as { data: Record<string, unknown>[] | null; error: { message?: string } | null };

    // 새 칸(revoked_at/revoked_by)이 아직 없는 DB — 그 칸만 빼고 다시 읽는다.
    if (error && isMissingColumn(error.message)) {
      let q2 = sb
        .from("customer_site_alerts")
        .select("id,kind,title,message,customer_phone,target_session_key,created_at,expires_at,seen_at,dismissed_at,sent_by,is_active")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!includeAuto) q2 = q2.eq("kind", "admin_note");
      if (phone) q2 = q2.eq("customer_phone", phone);
      else if (sessionKey) q2 = q2.eq("target_session_key", sessionKey);
      const retry = await q2 as { data: Record<string, unknown>[] | null; error: { message?: string } | null };
      data = retry.data;
      error = retry.error;
    }

    if (error) return NextResponse.json({ ok: false, message: "보낸 쪽지 조회 실패: " + error.message }, { status: 500 });

    return NextResponse.json({ ok: true, notes: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** 회수 — 잘못 보낸 쪽지를 손님 화면에서 내린다. 기록은 남는다(지우지 않는다). */
export async function PATCH(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Math.floor(Number(body.id) || 0);
    if (id <= 0) return NextResponse.json({ ok: false, message: "회수할 쪽지를 찾지 못했습니다." }, { status: 400 });

    const sb = admin();
    let { data, error } = await sb
      .from("customer_site_alerts")
      .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_by: who(session) })
      .eq("id", id)
      .eq("kind", "admin_note")   // 자동 알림은 회수 대상이 아니다
      .select("id,seen_at")
      .maybeSingle();

    // 새 칸이 아직 없는 DB — 화면에서 내리는 것(is_active=false)만이라도 되게 한다.
    if (error && isMissingColumn(error.message)) {
      const retry = await sb
        .from("customer_site_alerts")
        .update({ is_active: false })
        .eq("id", id)
        .eq("kind", "admin_note")
        .select("id,seen_at")
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) return NextResponse.json({ ok: false, message: "회수 실패: " + error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, message: "회수할 쪽지를 찾지 못했습니다." }, { status: 404 });

    // 이미 읽은 쪽지는 화면에서 내려도 손님이 이미 봤다 — 사장님이 알아야 전화로 정정할 수 있다.
    return NextResponse.json({ ok: true, alreadySeen: Boolean(data.seen_at) });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
