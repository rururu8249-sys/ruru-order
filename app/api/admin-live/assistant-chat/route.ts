// [2026-10-22 AI 비서 8단계] 대화창 하나 — POST { messages, range, from, to }
//   AI(Gemini 무료) 가 도구를 골라 부르고, 서버가 읽기 도구를 실행해 결과를 돌려주며 최대 5번 돈다.
//   쓰기 도구(propose_*)는 실행하지 않고 카드로 화면에 돌려준다 → 사장님 버튼이 기존 API(assistant-memos·admin-tasks)를 부른다.
//   AI 로 가는 손님 정보 = 닉네임·이름·주문 내용(상품·금액·상태·날짜)까지. 전화·주소·계좌는 보내지 않는다(화면 카드에만 가린 번호).
//   돈·입금확인·정산·주문상태·포인트·Bankda 를 건드리는 도구는 없다(전부 SELECT).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { callGeminiChat, type GeminiAnyPart, type GeminiContent } from "@/lib/geminiJson";
import { AGENT_TOOLS, WRITE_TOOLS, agentSystemPrompt, argStr, normalizeIssueType } from "@/lib/assistantAgent";
import { searchCustomers, searchProducts } from "@/lib/assistantSearchServer";
import { loadSalesAnalysisSnapshot } from "@/lib/salesAnalysisLoader";
import { computeSalesAnswer, resolvePeriod } from "@/lib/salesQuestion";
import { PERIOD_KEYS, type PeriodKey } from "@/lib/statQuestionParse";
import { buildSalesDataPack } from "@/lib/assistantChat";
import { DEFAULT_REPLY_POLICY, validReplyImage } from "@/lib/assistantReply";
import { buildChapters, chaptersText, kstDateLabel } from "@/lib/broadcastSeo";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 설정이 없습니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}

type ClientMessage = { role: "user" | "assistant"; text: string; images?: { mimeType: string; data: string }[] };
export type AgentCard =
  | { kind: "customers"; people: unknown[] }
  | { kind: "products"; products: unknown[]; buyers: unknown[] }
  | { kind: "memo"; text: string }
  | { kind: "issue"; issueType: "exchange" | "refund" | "return" | "general"; nickname: string; name: string; orderNo: string; memo: string }
  | { kind: "reply"; category: string; summary: string; drafts: { label: string; text: string }[] }
  | { kind: "seo"; broadcastId: string; titles: string[]; description: string; tags: string[] };

const MAX_TURNS = 5;

function pickRange(raw: unknown): PeriodKey {
  if (raw === "3m") return "last_3_months";
  return PERIOD_KEYS.includes(raw as PeriodKey) && raw !== "date" && raw !== "last_broadcast" ? (raw as PeriodKey) : "last_3_months";
}

/** 화면 카드엔 가린 전화 그대로, AI 에는 전화 빼고 */
function customersForAi(people: unknown[]): unknown[] {
  return (people as Record<string, unknown>[]).slice(0, 8).map((p) => ({
    nickname: p.nickname, name: p.name, blocked: p.blocked, match: p.match, lastOrderAt: p.lastOrderAt, orderCount: p.orderCount,
    orders: ((p.orders as Record<string, unknown>[]) || []).slice(0, 5).map((o) => ({
      orderNo: o.orderNo, date: o.createdAt, items: o.summary, amount: o.amount, payment: o.paymentLabel, method: o.paymentMethod, shipping: o.shippingLabel,
    })),
  }));
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.messages) ? (body.messages as unknown[]) : [];
  const messages: ClientMessage[] = raw.slice(-14).map((m) => {
    const o = (m ?? {}) as Partial<ClientMessage>;
    const images = Array.isArray(o.images) ? (o.images as unknown[]).map((im) => validReplyImage(im)).filter((im): im is { mime_type: string; data: string } => !!im).slice(0, 10).map((im) => ({ mimeType: im.mime_type, data: im.data })) : [];
    return { role: o.role === "assistant" ? "assistant" : "user", text: String(o.text ?? "").slice(0, 4000), images };
  });
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || (!last.text.trim() && !(last.images && last.images.length))) {
    return NextResponse.json({ ok: false, message: "할 말을 적어 주세요." }, { status: 400 });
  }
  const range = pickRange(body?.range);
  const rangeFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.from ?? "")) ? String(body.from) : undefined;
  const rangeTo = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.to ?? "")) ? String(body.to) : undefined;
  const rangePeriod = resolvePeriod(range, Date.now(), { from: rangeFrom, to: rangeTo });

  const db = getSupabaseAdminClient();
  const cards: AgentCard[] = [];
  const toolLog: string[] = [];
  let snapshot: Awaited<ReturnType<typeof loadSalesAnalysisSnapshot>> | null = null;
  const getSnapshot = async () => (snapshot ??= await loadSalesAnalysisSnapshot(db, () => true));

  async function runTool(name: string, args: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
    toolLog.push(name);
    switch (name) {
      case "find_customer": {
        const q = argStr(args, "query", 60);
        const since = argStr(args, "range") === "all" ? null : rangePeriod.fromIso;
        let r = await searchCustomers(db, q, since);
        if (r.total === 0 && since) r = await searchCustomers(db, q, null);
        if (r.people.length) cards.push({ kind: "customers", people: r.people.slice(0, 8) });
        return { total: r.total, people: customersForAi(r.people) };
      }
      case "find_product": {
        const q = argStr(args, "query", 80);
        const since = argStr(args, "range") === "all" ? null : rangePeriod.fromIso;
        const r = await searchProducts(db, q, since);
        if (r.products.length) cards.push({ kind: "products", products: r.products.slice(0, 8), buyers: r.buyers.slice(0, 30) });
        const buyersForAi = (r.buyers as Record<string, unknown>[]).slice(0, 30).map((b) => ({ nickname: b.nickname, name: b.name, product: b.productName, option: b.option, qty: b.qty, payment: b.paymentLabel, date: b.createdAt }));
        return { total: r.total, products: (r.products as Record<string, unknown>[]).slice(0, 8).map((p) => ({ name: p.name, detail: p.detail, price: p.price, hidden: p.hidden })), buyerOrderCount: r.buyerOrderCount, buyerQty: r.buyerQty, buyers: buyersForAi };
      }
      case "sales_stats": {
        const snap = await getSnapshot();
        const key = argStr(args, "period") as PeriodKey;
        const period = PERIOD_KEYS.includes(key)
          ? resolvePeriod(key, Date.now(), { date: argStr(args, "date"), from: argStr(args, "from"), to: argStr(args, "to"), broadcasts: snap.broadcasts })
          : resolvePeriod(range, Date.now(), { from: rangeFrom, to: rangeTo, broadcasts: snap.broadcasts });
        const sales = computeSalesAnswer(snap.orders, period, 80, snap.broadcasts);
        // 손님 순위는 닉네임+이름(사장님 결정 10/22). 전화는 안 감
        const pack = buildSalesDataPack({ ...sales, topBuyers: sales.topBuyers.map((b) => ({ ...b, nickname: b.name && b.name !== b.nickname ? `${b.nickname}(${b.name})` : b.nickname })) }, period.label);
        return { periodLabel: period.label, table: pack };
      }
      case "list_memos": {
        const { data } = await db.from("admin_assistant_memos").select("id, kind, body, due_date, who, product, created_at").in("kind", ["todo", "customer", "product", "note"]).eq("status", "open").order("created_at", { ascending: false }).limit(100);
        return { memos: (data || []).map((m) => ({ kind: m.kind, text: m.body, due: m.due_date, who: m.who, product: m.product, at: m.created_at })) };
      }
      case "get_reply_policy": {
        const { data } = await db.from("admin_assistant_memos").select("body").eq("kind", "policy").eq("status", "open").order("updated_at", { ascending: false }).limit(1);
        return { policy: data?.[0]?.body || DEFAULT_REPLY_POLICY };
      }
      case "broadcast_products": {
        // 최근 12개 방송 목록 + 고른(또는 가장 최근) 방송의 상품·「소개」 챕터(assistant-seo 라우트와 같은 읽기)
        const { data: recent } = await db.from("broadcasts").select("id, public_title, started_at, ended_at").neq("is_deleted", true).order("started_at", { ascending: false }).limit(12);
        const list = (recent || []).map((b) => ({ id: String(b.id), title: b.public_title || "제목 없음", date: b.started_at ? kstDateLabel(b.started_at) : "방송 예정" }));
        let id = argStr(args, "broadcastId", 40);
        if (!id || !list.some((b) => b.id === id)) id = list[0]?.id || "";
        if (!id) return { error: "방송이 없어요" };
        const [bc, bp] = await Promise.all([
          db.from("broadcasts").select("id, public_title, started_at, ended_at").eq("id", id).maybeSingle(),
          db.from("broadcast_products").select("product_id, sort_order, products(id, product_name, price, product_note)").eq("broadcast_id", id),
        ]);
        const products = ((bp.data || []) as Record<string, unknown>[])
          .sort((x, y) => Number(x.sort_order ?? 0) - Number(y.sort_order ?? 0))
          .map((row) => row.products as Record<string, unknown> | null)
          .filter((p): p is Record<string, unknown> => !!p)
          .map((p) => ({ name: String(p.product_name || "").trim(), price: Number(p.price) || 0 }))
          .filter((p) => p.name)
          .slice(0, 60);
        let chapters = "";
        const startedAt = bc.data?.started_at as string | null | undefined;
        if (startedAt) {
          const { data: ccp } = await db.from("chat_current_product").select("set_at, product_name, detail_name, cleared")
            .gte("set_at", startedAt).lte("set_at", (bc.data?.ended_at as string | null) || new Date().toISOString()).order("set_at", { ascending: true }).limit(500);
          const ch = buildChapters(startedAt, (bc.data?.ended_at as string | null) || null, (ccp || []) as { set_at: string; product_name: string | null; detail_name?: string | null; cleared?: boolean | null }[]);
          if (ch.length >= 3) chapters = chaptersText(ch);
        }
        return { broadcastId: id, title: bc.data?.public_title || "제목 없음", date: startedAt ? kstDateLabel(startedAt) : "방송 예정", products, chapters: chapters || null, note: chapters ? "chapters 는 설명란 끝에 「타임라인」 제목 아래 그대로 붙인다(00:00 줄 형식 유지)." : "챕터 없음", recentBroadcasts: list };
      }
      case "propose_memo": {
        const text = argStr(args, "text", 1000);
        if (!text) return { error: "메모 글이 비었어요" };
        cards.push({ kind: "memo", text });
        return { shown: true, note: "메모 저장 카드를 사장님께 보여줬다. 사장님이 저장 버튼을 누르면 저장된다." };
      }
      case "propose_issue": {
        const nickname = argStr(args, "nickname", 60);
        const memo = argStr(args, "memo", 800);
        if (!nickname || !memo) return { error: "닉네임·내용이 필요해요" };
        cards.push({ kind: "issue", issueType: normalizeIssueType(argStr(args, "issueType")), nickname, name: argStr(args, "name", 40), orderNo: argStr(args, "orderNo", 40), memo });
        return { shown: true, note: "고객이슈 등록 카드를 보여줬다. 사장님이 등록 버튼을 누르면 등록된다." };
      }
      case "propose_reply": {
        const drafts = Array.isArray(args?.drafts) ? (args!.drafts as Record<string, unknown>[]).slice(0, 3).map((d) => ({ label: String(d?.label ?? "안").slice(0, 20), text: String(d?.text ?? "").slice(0, 600) })).filter((d) => d.text) : [];
        if (!drafts.length) return { error: "초안이 비었어요" };
        cards.push({ kind: "reply", category: argStr(args, "category", 20), summary: argStr(args, "summary", 80), drafts });
        return { shown: true, note: "답장 초안 카드를 보여줬다(복사 버튼)." };
      }
      case "propose_seo": {
        const titles = Array.isArray(args?.titles) ? (args!.titles as unknown[]).map((t) => String(t).slice(0, 100)).filter(Boolean).slice(0, 3) : [];
        const tags = Array.isArray(args?.tags) ? (args!.tags as unknown[]).map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, 30) : [];
        const description = argStr(args, "description", 3000);
        if (!titles.length || !description) return { error: "제목·설명이 비었어요" };
        cards.push({ kind: "seo", broadcastId: argStr(args, "broadcastId", 40), titles, description, tags });
        return { shown: true, note: "유튜브 SEO 카드를 보여줬다(복사 버튼)." };
      }
      default:
        return { error: `모르는 도구 ${name}` };
    }
  }

  // 대화 → Gemini contents
  const contents: GeminiContent[] = messages.map((m) => {
    const parts: GeminiAnyPart[] = [];
    if (m.role === "user" && m.images?.length) for (const im of m.images) parts.push({ inline_data: { mime_type: im.mimeType, data: im.data } });
    parts.push({ text: m.text || "(사진)" });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const system = agentSystemPrompt(Date.now(), rangePeriod.label);

  let note = "";
  let answer = "";
  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const res = await callGeminiChat(contents, { tools: AGENT_TOOLS, systemInstruction: system, timeoutMs: 25000, maxTokens: 2048 });
      note = res.note;
      if (!res.parts) break;
      const calls = res.parts.filter((p): p is { functionCall: { name: string; args?: Record<string, unknown> } } => "functionCall" in p);
      const texts = res.parts.filter((p): p is { text: string } => "text" in p).map((p) => p.text).join("").trim();
      if (calls.length === 0) { answer = texts; break; }
      contents.push({ role: "model", parts: res.parts });
      const responses: GeminiAnyPart[] = [];
      for (const c of calls) {
        let out: Record<string, unknown>;
        try { out = await runTool(c.functionCall.name, c.functionCall.args); }
        catch (e) { out = { error: e instanceof Error ? e.message : "도구 실패" }; }
        responses.push({ functionResponse: { name: c.functionCall.name, response: out } });
      }
      contents.push({ role: "user", parts: responses });
      if (texts && turn === MAX_TURNS - 1) answer = texts;
    }
  } catch (error) {
    console.error("[assistant-chat]", error);
  }

  if (!answer && cards.length === 0) {
    return NextResponse.json({ ok: true, answer: "지금 AI 가 답을 못 만들었어요. 잠시 뒤 다시 말해 주세요.", cards, tools: toolLog, ai: note, failed: true });
  }
  if (!answer) answer = WRITE_TOOLS.has(toolLog[toolLog.length - 1] || "") ? "아래 카드에서 확인하고 눌러 주세요." : "아래에 찾은 내용을 보여드렸어요.";
  return NextResponse.json({ ok: true, answer, cards, tools: toolLog, ai: note });
}
