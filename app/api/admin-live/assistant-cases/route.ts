// [2026-10-22 AI 비서 9단계] 좋은 응대 사례 — 저장·목록·삭제. admin_assistant_memos kind='case'(body=JSON 글자, who=분류). 서버만(service_role). 돈 무접촉.
//   GET            : 사례 목록(최근 200)
//   POST {category, customer, reply, situation?, reason?, policy?, outcome?} : 사례 저장(번호 가림)
//   PATCH {id, action:"delete"} : 숨김(status=deleted — 지우지 않음)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { buildCase, normalizeCaseCategory, parseCase, serializeCase } from "@/lib/assistantCases";

const TABLE = "admin_assistant_memos";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const unauthorized = () => NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return unauthorized();
  try {
    const { data, error } = await db().from(TABLE).select("id, who, body, created_at").eq("kind", "case").eq("status", "open").order("created_at", { ascending: false }).limit(200);
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    const cases = (data || []).map((r) => ({ id: r.id, category: r.who || "기타", createdAt: r.created_at, ...(parseCase(r.body) || { customer: "", situation: "", reply: "", reason: "", policy: "", outcome: "" }) })).filter((c) => c.customer && c.reply);
    return NextResponse.json({ ok: true, cases });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "사례를 못 불러왔어요" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  const c = buildCase(body || {});
  if (!c) return NextResponse.json({ ok: false, message: "손님 말과 최종 답장이 있어야 저장돼요." }, { status: 400 });
  try {
    const { data, error } = await db().from(TABLE).insert({ kind: "case", body: serializeCase(c), who: normalizeCaseCategory(body?.category), status: "open", organized_by: "owner" }).select("id").maybeSingle();
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "사례 저장 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "").trim();
  if (!id || body?.action !== "delete") return NextResponse.json({ ok: false, message: "id 와 action 이 필요해요." }, { status: 400 });
  try {
    const { error } = await db().from(TABLE).update({ status: "deleted", updated_at: new Date().toISOString() }).eq("id", id).eq("kind", "case");
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "삭제 실패" }, { status: 500 });
  }
}
