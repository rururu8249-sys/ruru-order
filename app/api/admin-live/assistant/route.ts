// [2026-10-22 AI 비서 1단계] 손님·주문·상품 찾기 — 읽기 전용(SELECT 만). 돈·주문상태·포인트·Bankda 무접촉.
//   흐름: 사장님 입력 → (Gemini 무료) 무엇을 찾는지 JSON 으로만 해석 → 서버가 DB 를 직접 찾음 → 화면에 표로.
//   ⚠ Gemini 에는 «사장님이 입력한 글자»만 보낸다. 손님 이름·전화·주소·주문 내용은 AI 로 절대 보내지 않는다.
//   키가 없거나 AI 가 실패하면 lib/assistantSearch.parseIntentByRule 로 해석(검색은 그대로 됨).
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { callGeminiJson } from "@/lib/geminiJson";
import { parseIntentByRule, parseIntentJson, trimNameParticle, type AssistantIntent } from "@/lib/assistantSearch";
import { searchCustomers, searchProducts } from "@/lib/assistantSearchServer";
import { loadSalesAnalysisSnapshot } from "@/lib/salesAnalysisLoader";
import { computeSalesAnswer, resolvePeriod } from "@/lib/salesQuestion";
import { PERIOD_KEYS, type PeriodKey } from "@/lib/statQuestionParse";
import { buildSalesDataPack, chatPrompt, looksLikeChatQuestion, parseChatJson, type ChatTurn } from "@/lib/assistantChat";
import { salesProductPhotos } from "@/lib/salesHistory";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const INTENT_PROMPT = `너는 쇼핑몰 관리자의 검색 요청을 해석한다. 사장님 문장에서 무엇을 찾는지만 JSON 으로 답한다.
- 손님/주문자/닉네임/이름을 찾는 말이면 {"intent":"customer","name":"<손님 이름이나 닉네임 그대로>","product":""}
- 상품/물건/챙기기/옵션/누가 무슨 상품을 샀는지 묻는 말이면 {"intent":"product","name":"","product":"<상품 이름 그대로>"}
- 숫자(매출·순위)를 묻는 말이면 {"intent":"stats","name":"","product":"","stat":"<top_products|top_buyers|top_days|bottom_days|summary>","period":"<기간>","date":"<YYYY-MM-DD 또는 빈칸>"}
  · top_products = 뭐가 잘 나갔는지/많이 팔린 상품, top_buyers = 누가 많이 샀는지, top_days = 어느 날(날짜·방송)에 제일 많이 팔렸는지/매출 많이 나온 날, bottom_days = 매출 제일 적었던 날/안 팔린 날, summary = 매출·주문 수·미입금(순위 아님)
  · 기간: today(오늘) yesterday(어제) last_7_days(최근 일주일) this_week(이번 주) last_week(지난주) this_month(이번 달) last_month(지난달) last_3_months(최근 3개월) last_broadcast(지난·최근·어제 방송) date(특정 날짜, date 칸에 날짜) all(전체·지금까지). 기간 말이 없거나 「이 기간」처럼 가리키기만 하면 period 는 빈칸 "".
  · 오늘 날짜(한국): {{TODAY}}
- 그 외 판매·매출·방송·손님 흐름을 «비교·분석·이유·추천·요약»해 달라는 말(예: 주말이 평일보다 잘 팔려?, 왜 줄었어?, 다음 방송 뭐 팔까?, 이번 달 정리해 줘)이면 {"intent":"chat","name":"","product":""} — 손님 한 명을 찾는 게 아니면 customer 로 보내지 말 것
- 모르겠으면 {"intent":"unknown","name":"","product":""}
이름·상품명은 사장님이 쓴 글자를 고치지 말고 그대로 옮긴다(오타도 그대로). 단 이름 뒤 조사·호칭(이라는, 님, 씨, 이/가/은/는)과 날짜·「챙길」 같은 말은 뺀다. 설명 없이 JSON 하나만.
사장님 문장: `;

function todayKstText(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// AI 가 안 될 때 이유(화면 디버그용·비밀값 없음): no_key / http_400 / empty / bad_json / timeout …
let lastAiNote = "";

async function askGemini(text: string): Promise<AssistantIntent | null> {
  // 모델 고르기·생각 토큰·붐빔 처리는 lib/geminiJson 한 곳(메모함과 같이 씀)
  const { text: out, note } = await callGeminiJson(INTENT_PROMPT.replace("{{TODAY}}", todayKstText()) + text);
  lastAiNote = note;
  if (!out) return null;
  const parsed = parseIntentJson(out);
  if (!parsed) { lastAiNote = `${note}:bad_json`; return null; }
  return parsed;
}

// ───────────────────────── DB 읽기 ─────────────────────────
function pickRangeKey(raw: unknown): PeriodKey {
  if (raw === "3m") return "last_3_months";
  return PERIOD_KEYS.includes(raw as PeriodKey) && raw !== "date" && raw !== "last_broadcast" ? (raw as PeriodKey) : "last_3_months";
}

export async function POST(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 200);
  const range = pickRangeKey(body?.range);
  const rangeFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.from ?? "")) ? String(body.from) : undefined;
  const rangeTo = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.to ?? "")) ? String(body.to) : undefined;
  const rangePeriod = resolvePeriod(range, Date.now(), { from: rangeFrom, to: rangeTo });
  const forced = body?.mode === "customer" || body?.mode === "product" ? body.mode : null;
  if (!text) return NextResponse.json({ ok: false, message: "찾을 내용을 입력해 주세요." }, { status: 400 });

  // 1) 무엇을 찾는지 — 화면 칩으로 고른 경우엔 AI 안 부름(무료 한도 아낌)
  let intent: AssistantIntent;
  let via: "ai" | "rule" | "chip" = "rule";
  if (forced) {
    intent = { intent: forced, name: forced === "customer" ? text : "", product: forced === "product" ? text : "" };
    via = "chip";
  } else {
    const ai = await askGemini(text);
    if (ai && ai.intent !== "unknown") { intent = ai; via = "ai"; }
    else if (ai && ai.intent === "unknown" && looksLikeChatQuestion(text)) intent = ai; // [AI-7] AI 가 「찾기 아님」이라 했고 질문 같으면 → 자유 질문(아래)
    else if (ai && ai.intent === "chat") { intent = ai; via = "ai"; }
    else intent = parseIntentByRule(text);
  }
  const history: ChatTurn[] = Array.isArray(body?.history)
    ? (body.history as unknown[]).slice(-6).map((h) => {
        const o = (h ?? {}) as { role?: unknown; text?: unknown };
        return { role: o.role === "assistant" ? "assistant" : "user", text: String(o.text ?? "").slice(0, 1500) } as ChatTurn;
      })
    : [];

  // [AI-7] 자유 질문 — 집계표(손님 이름·전화 없음, 닉네임만)를 AI 에 주고 말로 답한다. 숫자 질문엔 카드와 함께, 모르는 질문엔 이것만.
  async function chatAnswer(supabaseClient: SupabaseClient, periodKeyOverride?: PeriodKey, date?: string): Promise<{ answer: string | null; periodLabel: string; snapshot: Awaited<ReturnType<typeof loadSalesAnalysisSnapshot>>; period: ReturnType<typeof resolvePeriod>; sales: ReturnType<typeof computeSalesAnswer> }> {
    const snapshot = await loadSalesAnalysisSnapshot(supabaseClient, () => true);
    const period = periodKeyOverride
      ? resolvePeriod(periodKeyOverride, Date.now(), { date, broadcasts: snapshot.broadcasts })
      : resolvePeriod(range, Date.now(), { from: rangeFrom, to: rangeTo, broadcasts: snapshot.broadcasts });
    const sales = computeSalesAnswer(snapshot.orders, period, 80, snapshot.broadcasts);
    const pack = buildSalesDataPack(sales, period.label);
    const { text: out, note } = await callGeminiJson(chatPrompt(pack, history, text, Date.now()), { timeoutMs: 15000, maxTokens: 1024 });
    lastAiNote = note;
    return { answer: parseChatJson(out), periodLabel: period.label, snapshot, period, sales };
  }

  if (intent.intent === "unknown" || intent.intent === "chat") {
    if (intent.intent === "chat" || looksLikeChatQuestion(text)) {
      try {
        const r = await chatAnswer(getSupabaseAdminClient());
        if (r.answer) return NextResponse.json({ ok: true, via: "ai", ai: lastAiNote, intent, kind: "chat", answer: r.answer, periodLabel: r.periodLabel });
      } catch (error) {
        console.error("[assistant] chat", error);
      }
    }
    // 자유 질문도 안 되면 옛날처럼 규칙으로 손님·상품 찾기
    const ruled = parseIntentByRule(text);
    if (ruled.intent === "unknown") return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, kind: "unknown" });
    intent = ruled;
    via = "rule";
  }

  try {
    const supabase = getSupabaseAdminClient();
    const sinceIso = rangePeriod.fromIso;
    if (intent.intent === "customer") {
      let result = await searchCustomers(supabase, intent.name, sinceIso);
      const trimmed = trimNameParticle(intent.name);
      if (result.total === 0 && trimmed !== intent.name) {
        // 「홍길이」처럼 조사가 붙어 못 찾았으면 떼고 한 번 더
        result = await searchCustomers(supabase, trimmed, sinceIso);
        intent = { ...intent, name: trimmed };
      }
      return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, range, kind: "customer", ...result });
    }
    if (intent.intent === "stats") {
      // [AI-2] 숫자 질문 — 판매분석과 같은 스냅샷·같은 계산(lib/salesQuestion). 읽기만.
      // [10/22 실측] 기간 말이 없으면 화면 기간(드롭다운·달력)을 기간으로(예전엔 오늘·AI 가 all 로 답하면 전체 기간이 나왔음)
      // [AI-7] 카드(판매분석과 같은 계산) + AI 가 집계표를 보고 쓴 말 답(answer)
      const r = await chatAnswer(supabase, intent.period, intent.date);
      const snapshot = r.snapshot;
      const period = r.period;
      const answer = { ...r.sales, topProducts: r.sales.topProducts.slice(0, 10), topBuyers: r.sales.topBuyers.slice(0, 10), topDays: r.sales.topDays.slice(0, 10), bottomDays: r.sales.bottomDays.slice(0, 10) };
      const productById = new Map(snapshot.products.map((p) => [String(p.id), p]));
      const topProducts = answer.topProducts.map((p) => {
        const product = productById.get(p.productId);
        return { ...p, photo: product ? salesProductPhotos(p.name, product, p.productId || undefined).detail : "" };
      });
      return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, kind: "stats", stat: intent.stat || "summary", periodLabel: period.label, ...answer, topProducts, byBroadcast: undefined, answer: r.answer });
    }
    const result = await searchProducts(supabase, intent.product, sinceIso);
    return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, range, kind: "product", ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "찾기 실패" }, { status: 500 });
  }
}
