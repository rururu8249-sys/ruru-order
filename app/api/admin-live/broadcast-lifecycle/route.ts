import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return reply({ error: "관리자 로그인이 필요합니다." }, 401);
  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  const title = String(body?.title || "").trim();
  const broadcastId = String(body?.broadcastId || "").trim();
  if (!["createDraft", "activate", "end"].includes(action)) return reply({ error: "허용되지 않은 방송 작업입니다." }, 400);
  if (action === "createDraft" && (!title || title.length > 120)) return reply({ error: "방송 제목을 1~120자로 입력해주세요." }, 400);
  if (action !== "createDraft" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(broadcastId)) {
    return reply({ error: "정확한 방송 ID가 필요합니다." }, 400);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return reply({ error: "DB 연결 설정이 없습니다." }, 503);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const fn = action === "createDraft" ? "ruru_admin_create_broadcast_draft" : action === "activate" ? "ruru_admin_activate_broadcast" : "ruru_admin_end_broadcast";
  const args = action === "createDraft" ? { p_title: title } : { p_broadcast_id: broadcastId };
  const { data, error } = await sb.rpc(fn, args);
  if (error) return reply({ error: error.message }, error.code === "P0001" || error.code === "23505" ? 409 : 503);
  return reply({ data });
}
