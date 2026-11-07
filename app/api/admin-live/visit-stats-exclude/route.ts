// [2026-11-07 사장님 「루루동이·루루실장은 접속 기록에서 빼자」] 접속 기록 제외 계정 — 목록·검색·넣기·빼기
//   관리자만(middleware + verifyAdminSession). settings 한 키(visit_stats_exclude_v1)만 쓴다. 주문·입금·돈·포인트 무접촉.
//   운영자 테스트 번호 회원은 자동 포함(여기서 못 뺌). 그 외는 사장님이 닉네임으로 찾아 넣는다.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { VISIT_EXCLUDE_KEY, loadExcludedCustomers, parseExcludeSetting } from "@/lib/visitStatsExclude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readIds(sb: ReturnType<typeof admin>) {
  const { data } = await sb.from("settings").select("value").eq("key", VISIT_EXCLUDE_KEY).limit(1);
  return parseExcludeSetting(Array.isArray(data) && data[0] ? data[0].value : null);
}

async function writeIds(sb: ReturnType<typeof admin>, ids: number[]) {
  const value = JSON.stringify({ customerIds: ids });
  const { data: ex } = await sb.from("settings").select("key").eq("key", VISIT_EXCLUDE_KEY).limit(1);
  const res = Array.isArray(ex) && ex.length > 0
    ? await sb.from("settings").update({ value }).eq("key", VISIT_EXCLUDE_KEY)
    : await sb.from("settings").insert({ key: VISIT_EXCLUDE_KEY, value });
  if (res.error) throw new Error(res.error.message);
}

const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const sb = admin();
    const q = String(request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q) {
      // 닉네임·카톡 이름·이름으로 회원 찾기(최대 10명)
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const { data, error } = await sb
        .from("customers")
        .select("id, youtube_nickname, kakao_nickname, customer_name, customer_phone")
        .or(`youtube_nickname.ilike.${like},kakao_nickname.ilike.${like},customer_name.ilike.${like}`)
        .limit(10);
      if (error) throw new Error(error.message);
      const list = ((data || []) as Array<Record<string, unknown>>).map((c) => ({
        id: Number(c.id),
        nickname: String(c.youtube_nickname ?? "").trim() || "(닉네임 없음)",
        kakaoName: String(c.kakao_nickname ?? "").trim(),
        name: String(c.customer_name ?? "").trim(),
        phoneTail: digits(c.customer_phone).slice(-4),
      }));
      return NextResponse.json({ ok: true, found: list });
    }
    const list = await loadExcludedCustomers(sb);
    return NextResponse.json({ ok: true, list });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.customerId);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, message: "회원을 골라 주세요." }, { status: 400 });
    const sb = admin();
    const ids = await readIds(sb);
    if (body.action === "add") {
      const { data } = await sb.from("customers").select("id").eq("id", id).limit(1);
      if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ ok: false, message: "그 회원을 못 찾았어요." }, { status: 404 });
      if (!ids.includes(id)) await writeIds(sb, [...ids, id]);
    } else if (body.action === "remove") {
      const cur = await loadExcludedCustomers(sb);
      if (cur.find((c) => c.id === id)?.auto) return NextResponse.json({ ok: false, message: "운영자 테스트 번호 계정은 자동으로 빠져요. 여기서는 뺄 수 없어요." }, { status: 400 });
      await writeIds(sb, ids.filter((x) => x !== id));
    } else {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청이에요." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, list: await loadExcludedCustomers(sb) });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
