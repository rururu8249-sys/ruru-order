// [2026-10-22 AI 비서 3단계] 메모함 — 저장·정리·완료 체크. 돈·주문·포인트 테이블 무접촉(admin_assistant_memos 만).
//   POST {text}        : 원문을 «먼저» 저장 → (AI 또는 규칙으로) 정리한 줄 저장. AI 가 실패해도 원문·규칙 정리는 남는다.
//   GET                : 열린 줄 + 최근 끝낸 줄(30일) + 원문 개수
//   PATCH {id,status}  : open / done / deleted (줄 하나)
//   AI 로 보내기 전 전화·계좌 번호는 자리표로 가림(lib/assistantMemo.maskSensitive).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { callGeminiJson } from "@/lib/geminiJson";
import { matchText } from "@/lib/assistantSearch";
import { maskSensitive, mergeSingleLine, organizeByRule, organizePrompt, parseOrganizeJson, type MemoItem } from "@/lib/assistantMemo";

const TABLE = "admin_assistant_memos";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function tableMissing(error: unknown): boolean {
  const e = (error || {}) as { code?: string; message?: string };
  return e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(String(e.message || ""));
}
const setupResponse = () =>
  NextResponse.json({ ok: false, needsSetup: true, message: "메모함 표가 아직 없어요. 설정 SQL 실행이 필요해요." }, { status: 503 });

// AI 는 「행복나무」가 손님 닉네임인지 상품인지 모른다(실측: 상품 칸에 넣음).
//   손님·상품 이름 목록과 대조해서 손님에만 맞으면 손님 칸으로, 상품에만 맞으면 상품 칸으로 옮긴다(읽기만).
async function fixWhoProduct(db: ReturnType<typeof getSupabaseAdminClient>, items: MemoItem[]): Promise<MemoItem[]> {
  const hints = items.flatMap((it) => [it.who, it.product]).filter(Boolean) as string[];
  if (hints.length === 0) return items;
  try {
    const [cust, prod] = await Promise.all([
      db.from("customers").select("youtube_nickname, customer_name").limit(5000),
      db.from("products").select("product_name").limit(3000),
    ]);
    if (cust.error || prod.error) return items;
    const custNames = ((cust.data as { youtube_nickname: string | null; customer_name: string | null }[]) || []).flatMap((c) => [c.youtube_nickname, c.customer_name]).filter(Boolean) as string[];
    const prodNames = ((prod.data as { product_name: string | null }[]) || []).map((p) => p.product_name).filter(Boolean) as string[];
    const strong = (q: string, list: string[]) => list.some((v) => { const k = matchText(q, v); return k === "exact" || k === "partial"; });
    return items.map((it) => {
      let { who, product } = it;
      if (product && !strong(product, prodNames) && strong(product, custNames) && !who) { who = product; product = null; }
      if (who && !strong(who, custNames) && strong(who, prodNames) && !product) { product = who; who = null; }
      return { ...it, who, product };
    });
  } catch {
    return items;
  }
}

// 정리된 줄만(원문 raw·응대 방침 policy 줄은 메모 목록에 안 보임)
const ITEM_KINDS = ["todo", "customer", "product", "note"];
const ITEM_COLUMNS = "id, created_at, kind, parent_id, body, due_date, who, product, status, done_at, organized_by";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const db = getSupabaseAdminClient();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [open, done] = await Promise.all([
      db.from(TABLE).select(ITEM_COLUMNS).in("kind", ITEM_KINDS).eq("status", "open").order("created_at", { ascending: false }).limit(300),
      db.from(TABLE).select(ITEM_COLUMNS).in("kind", ITEM_KINDS).eq("status", "done").gte("done_at", since).order("done_at", { ascending: false }).limit(100),
    ]);
    if (open.error) return tableMissing(open.error) ? setupResponse() : NextResponse.json({ ok: false, message: open.error.message }, { status: 500 });
    if (done.error) return NextResponse.json({ ok: false, message: done.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, open: open.data || [], done: done.data || [] });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "메모 불러오기 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ ok: false, message: "메모를 적어 주세요." }, { status: 400 });

  try {
    const db = getSupabaseAdminClient();
    // 1) 원문 먼저 저장 — 정리가 실패해도 사장님이 쓴 건 남는다
    const raw = await db.from(TABLE).insert({ kind: "raw", body: text, status: "open" }).select("id").maybeSingle();
    if (raw.error) return tableMissing(raw.error) ? setupResponse() : NextResponse.json({ ok: false, message: raw.error.message }, { status: 500 });
    const parentId = (raw.data as { id: string } | null)?.id;

    // 2) 정리: AI(번호 가림) → 실패하면 규칙
    const now = Date.now();
    const { masked, restore } = maskSensitive(text);
    const ai = await callGeminiJson(organizePrompt(masked, now), { timeoutMs: 8000, maxTokens: 1500 });
    let items: MemoItem[] | null = ai.text ? parseOrganizeJson(ai.text, restore, now) : null;
    const organizedBy = items ? "ai" : "rule";
    if (!items) items = organizeByRule(text, now);
    items = mergeSingleLine(text, items, now); // [10-23] 한 줄 메모는 한 장으로
    items = await fixWhoProduct(db, items);

    const rows = items.map((it) => ({
      kind: it.kind,
      parent_id: parentId,
      body: it.body,
      due_date: it.due_date,
      who: it.who,
      product: it.product,
      status: "open",
      organized_by: organizedBy,
    }));
    const saved = rows.length ? await db.from(TABLE).insert(rows).select(ITEM_COLUMNS) : { data: [], error: null };
    if (saved.error) {
      // 원문은 저장됨 — 정리 줄만 실패
      return NextResponse.json({ ok: true, savedRaw: true, items: [], organizedBy, ai: ai.note, message: "메모는 저장했어요. 정리는 실패했어요." });
    }
    return NextResponse.json({ ok: true, savedRaw: true, items: saved.data || [], organizedBy, ai: ai.note });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "메모 저장 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "").trim();
  const status = String(body?.status ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["open", "done", "deleted"].includes(status)) {
    return NextResponse.json({ ok: false, message: "잘못된 요청이에요." }, { status: 400 });
  }
  try {
    const db = getSupabaseAdminClient();
    const { error } = await db
      .from(TABLE)
      .update({ status, done_at: status === "done" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("kind", ITEM_KINDS);
    if (error) return tableMissing(error) ? setupResponse() : NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "저장 실패" }, { status: 500 });
  }
}
