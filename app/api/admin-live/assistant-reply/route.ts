// [2026-10-22 AI 비서 4단계] 응대 문구 — 손님 말(글·사진) → 요약 + 답장 2~3안. 돈·주문 무접촉(문구만 만듦).
//   GET            : 응대 방침(저장된 것, 없으면 기본 방침)
//   PUT {policy}   : 응대 방침 저장(admin_assistant_memos 의 kind='policy' 한 줄 — 서버만 읽고 씀, 손님 화면에서 안 보임)
//   POST {text, image?} : 문구 만들기. 글의 전화·계좌 번호는 자리표로 가려서 보냄. 사진은 사장님이 고른 것만 그대로 보냄.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { callGeminiJson, type GeminiPart } from "@/lib/geminiJson";
import { maskSensitive } from "@/lib/assistantMemo";
import { DEFAULT_REPLY_POLICY, dropUnknownPlaceholders, parseReplyJson, replyPrompt, validReplyImage } from "@/lib/assistantReply";

const TABLE = "admin_assistant_memos";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readPolicy(db: ReturnType<typeof getSupabaseAdminClient>): Promise<{ id: string | null; policy: string; isDefault: boolean }> {
  const { data, error } = await db.from(TABLE).select("id, body").eq("kind", "policy").eq("status", "open").order("updated_at", { ascending: false }).limit(1);
  if (error || !data || data.length === 0) return { id: null, policy: DEFAULT_REPLY_POLICY, isDefault: true };
  const row = data[0] as { id: string; body: string };
  return { id: row.id, policy: row.body || DEFAULT_REPLY_POLICY, isDefault: false };
}

const unauthorized = () => NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return unauthorized();
  try {
    const p = await readPolicy(getSupabaseAdminClient());
    return NextResponse.json({ ok: true, policy: p.policy, isDefault: p.isDefault, defaultPolicy: DEFAULT_REPLY_POLICY });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "방침 불러오기 실패" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  const policy = String(body?.policy ?? "").trim().slice(0, 4000);
  if (!policy) return NextResponse.json({ ok: false, message: "방침을 적어 주세요." }, { status: 400 });
  try {
    const db = getSupabaseAdminClient();
    const cur = await readPolicy(db);
    const now = new Date().toISOString();
    const res = cur.id
      ? await db.from(TABLE).update({ body: policy, updated_at: now }).eq("id", cur.id).eq("kind", "policy")
      : await db.from(TABLE).insert({ kind: "policy", body: policy, status: "open", updated_at: now });
    if (res.error) return NextResponse.json({ ok: false, message: res.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "방침 저장 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 3000);
  const image = body?.image ? validReplyImage(body.image) : null;
  if (body?.image && !image) return NextResponse.json({ ok: false, message: "사진은 jpg·png 로 2MB 이하만 돼요." }, { status: 400 });
  if (!text && !image) return NextResponse.json({ ok: false, message: "손님이 보낸 말을 붙여넣거나 사진을 골라 주세요." }, { status: 400 });

  try {
    const db = getSupabaseAdminClient();
    const { policy } = await readPolicy(db);
    const { masked, restore: restoreKnown, count } = maskSensitive(text);
    const restore = (s: string) => dropUnknownPlaceholders(restoreKnown(s), count);
    const parts: GeminiPart[] = [{ text: replyPrompt(policy, masked, Boolean(image), Date.now()) }];
    if (image) parts.push({ inline_data: image });
    const ai = await callGeminiJson(parts, { timeoutMs: 15000, maxTokens: 1500 });
    if (!ai.text) {
      return NextResponse.json({ ok: false, ai: ai.note, message: "지금은 AI 가 답을 못 만들어요. 잠시 뒤 다시 눌러 주세요." }, { status: 503 });
    }
    const result = parseReplyJson(ai.text, restore);
    if (!result) return NextResponse.json({ ok: false, ai: ai.note, message: "답을 정리하지 못했어요. 다시 눌러 주세요." }, { status: 502 });
    return NextResponse.json({ ok: true, ai: ai.note, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "문구 만들기 실패" }, { status: 500 });
  }
}
