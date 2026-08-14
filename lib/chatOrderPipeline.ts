// lib/chatOrderPipeline.ts
// [2026-08-14] 3단계: 읽어둔 raw 채팅을 파싱해서 chat_orders 에 결과만 적어둔다.
//   ⚠️ 여기서는 장바구니에 담지 않는다. 관리자가 눈으로 검증하는 단계.
//   ⚠️ 접촉 테이블: chat_orders(쓰기) / chat_current_product·broadcasts·broadcast_products·products(읽기)
//      돈·입금·재고·주문 테이블은 읽지도 쓰지도 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseChatOrder, type ParseProduct } from "@/lib/chatOrderParser";
import { loadParseProducts } from "@/lib/chatOrderProducts";
import { readSetting, writeSetting, postLiveChatMessage } from "@/lib/youtube";

// ── 봇 안내(자동) ───────────────────────────────────────
//   상품을 못 정한 주문 채팅(보류/상품모름)에 봇이 채팅으로 다시 적어달라고 안내한다.
//   ⚠️ 쿼터 보호: 글 1개 = 50 units. 하루 40건 상한 + 발송 간격 20초 + 회당 2건.
//   ⚠️ 같은 채팅에 두 번 안내하지 않는다(raw → 판정완료로 상태가 바뀌므로 자동 보장).
export const SETTING_BOT_REPLY_ENABLED = "chat_order_bot_reply_enabled";
const SETTING_BOT_LAST_MS = "chat_order_bot_last_ms";
const BOT_DAILY_CAP = 60;          // 안내+접수확인 합산 일일 상한 (글 1개 = 쿼터 50)
const SETTING_BOT_CONFIRM_LAST_MS = "chat_order_bot_confirm_last_ms";
const BOT_CONFIRM_GAP_MS = 60000;  // 접수확인은 1분에 1번, 그 사이 접수분을 묶어서 발송
const BOT_GAP_MS = 20000;
const BOT_MAX_PER_PASS = 2;
const BOT_FRESH_MS = 3 * 60 * 1000;   // 3분 지난 채팅엔 뒷북 안내 금지

// ── 자가진단(자동) ──────────────────────────────────────
//   상품 목록이 바뀌는 순간(방송 중 새 상품 등록 포함) 스스로 돌고,
//   "엉뚱한 상품으로 확신하는" 문장 패턴을 찾아내면 그 패턴은 실채팅에서 자동 보류 처리한다.
//   → 방송 중 아무도 들여다보지 않아도 잘못 담길 길이 막힌다.
const SETTING_PRODUCTS_SIG = "chat_order_products_sig";
export const SETTING_SELF_CHECK = "chat_order_selfcheck";

const sqz = (v: string) => v.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

export type SelfCheckBad = { text: string; expected: string; got: string; phrase: string };
export type SelfCheckResult = {
  total: number; full: number; prod: number; wrong: number; safe: number;
  productCount: number; bad: SelfCheckBad[];
};

export function selfCheckProducts(products: ParseProduct[]): SelfCheckResult {
  type Case = { text: string; src: string; expectName: string; expectVariant: string | null };
  const cases: Case[] = [];
  for (const p of products) {
    cases.push({ text: `${p.name} 주세요`, src: p.name, expectName: p.name, expectVariant: null });
    for (const v of p.variants || [])
      cases.push({ text: `${v} 주세요`, src: v, expectName: p.name, expectVariant: v });
  }
  let full = 0, prod = 0, wrong = 0, safe = 0;
  const bad: SelfCheckBad[] = [];
  for (const c of cases.slice(0, 2000)) {
    const r = parseChatOrder(c.text, products, null);
    const nameOK = r.productName && sqz(r.productName) === sqz(c.expectName);
    const varOK = c.expectVariant && r.variantName && sqz(r.variantName) === sqz(c.expectVariant);
    if (r.status !== "parsed") safe += 1;
    else if (varOK || (nameOK && !c.expectVariant)) full += 1;
    else if (nameOK) prod += 1;
    else {
      wrong += 1;
      if (bad.length < 50) bad.push({
        text: c.text,
        expected: c.expectName + (c.expectVariant ? ` / ${c.expectVariant}` : ""),
        got: (r.productName || "-") + (r.variantName ? ` / ${r.variantName}` : ""),
        phrase: sqz(c.src),
      });
    }
  }
  return { total: Math.min(cases.length, 2000), full, prod, wrong, safe, productCount: products.length, bad };
}

export type ParsePassResult = {
  ok: boolean;
  scanned: number;
  updated: number;
  byStatus: Record<string, number>;
  productCount: number;
  broadcastSource: "live" | "shop" | "recent" | "none";
  botSent?: number;
  reason?: string;
};

// 「지금 이거」 변경 이력. 메시지가 쓰인 시각으로 되감아 찾는다.
type CurrentRow = { product_id: string | null; cleared: boolean; setMs: number };

// ISO 문자열 비교는 소수점 자릿수(.5 vs 없음)에 따라 어긋날 수 있어 실제 시각(ms)으로 비교한다.
function resolveCurrentAt(history: CurrentRow[], atMs: number): string | null {
  // history 는 setMs 내림차순. atMs 이하 중 첫 행이 그 시각의 상태.
  for (const row of history) {
    if (row.setMs <= atMs) {
      if (row.cleared) return null;
      const id = String(row.product_id ?? "").trim();
      return id || null;
    }
  }
  return null;
}

export async function parsePendingChatOrders(
  sb: SupabaseClient,
  opts?: { limit?: number; reparseAll?: boolean }
): Promise<ParsePassResult> {
  const limit = Math.min(Math.max(Number(opts?.limit ?? 200) || 200, 1), 500);
  const byStatus: Record<string, number> = {};
  try {
    let q = sb
      .from("chat_orders")
      .select("id,raw_message,published_at,parse_status,display_name,channel_id")
      .order("id", { ascending: true })
      .limit(limit);
    if (!opts?.reparseAll) q = q.eq("parse_status", "raw");
    const { data: rows, error } = await q;
    if (error) return { ok: false, scanned: 0, updated: 0, byStatus, productCount: 0, broadcastSource: "none", reason: error.message };

    const pending = (rows || []) as Record<string, unknown>[];
    if (pending.length === 0)
      return { ok: true, scanned: 0, updated: 0, byStatus, productCount: 0, broadcastSource: "none", reason: "파싱 대기 없음" };

    const loaded = await loadParseProducts(sb);
    const products: ParseProduct[] = loaded.products;

    // 상품 목록 변경 감지 → 자가진단 자동 실행 (방송 중 새 상품 등록 즉시 반영)
    let conflictPhrases: string[] = [];
    try {
      const sig = products
        .map((p) => `${p.id}:${p.name}:${(p.variants || []).length}`)
        .sort().join("|").slice(0, 8000);
      const prevSig = await readSetting(sb, SETTING_PRODUCTS_SIG);
      if (sig !== prevSig) {
        const check = selfCheckProducts(products);
        await writeSetting(sb, SETTING_SELF_CHECK, JSON.stringify(check));
        await writeSetting(sb, SETTING_PRODUCTS_SIG, sig);
      }
      const rawCheck = await readSetting(sb, SETTING_SELF_CHECK);
      if (rawCheck) {
        const c = JSON.parse(rawCheck) as SelfCheckResult;
        conflictPhrases = (c.bad || []).map((b) => b.phrase).filter((x) => x && x.length >= 2);
      }
    } catch { /* 진단 실패는 파싱을 막지 않는다 */ }

    const { data: histRows } = await sb
      .from("chat_current_product")
      .select("product_id,cleared,set_at")
      .order("set_at", { ascending: false })
      .limit(200);
    const history = ((histRows || []) as Record<string, unknown>[])
      .map((r) => ({
        product_id: r.product_id == null ? null : String(r.product_id),
        cleared: r.cleared === true,
        setMs: new Date(String(r.set_at ?? "")).getTime(),
      }))
      .filter((r) => Number.isFinite(r.setMs)) as CurrentRow[];

    let updated = 0;
    // 봇 안내 대상: (닉네임, 사유) — 판정 후 모아서 상한 안에서 발송
    const botTargets: { name: string; channel: string; kind: "ambiguous" | "need_product"; cands: string[]; atMs: number }[] = [];
    // 접수 확인 대상: 알아들은 주문 — 묶어서 한 줄로 확인해준다
    const confirmTargets: { name: string; product: string; variant: string | null; qty: number; atMs: number }[] = [];
    for (const row of pending) {
      const raw = String(row.raw_message ?? "");
      const atMs = new Date(String(row.published_at ?? "")).getTime();
      const currentId = resolveCurrentAt(history, Number.isFinite(atMs) ? atMs : Date.now());
      let r = parseChatOrder(raw, products, currentId);

      // 봇이 쓴 안내 메시지(🤖 시작)는 주문이 아니다 — 봇이 자기 글에 다시 안내를 다는
      //   무한루프를 원천 차단한다. (안내문에 "주세요"가 들어가므로 필수)
      if (/^[🤖🛍📢🎁]/u.test(raw.trim())) {
        r = { ...r, status: "not_order", productId: null, productName: null, matchedBy: null,
              variantName: null, candidates: [], reason: "봇 안내 메시지" };
      }

      // 자가진단이 찾아낸 "이름 겹침" 문장 패턴은 확신하지 않고 자동 보류한다.
      //   방송 중 새 상품이 기존 상품과 겹쳐도 사람이 안 봐도 안전.
      if (r.status === "parsed" && conflictPhrases.length > 0) {
        const sqRaw = sqz(raw);
        if (conflictPhrases.some((ph) => sqRaw.includes(ph))) {
          r = {
            ...r, status: "ambiguous",
            candidates: [r.productName || ""].filter(Boolean),
            reason: "상품명 겹침 감지 — 자동 보류 (관리자 확인)",
          };
        }
      }

      byStatus[r.status] = (byStatus[r.status] || 0) + 1;

      if (r.status === "parsed" && Number.isFinite(atMs)) {
        confirmTargets.push({
          name: String(row.display_name ?? "").trim().replace(/^@/, ""),
          product: String(r.productName || ""), variant: r.variantName, qty: r.qty, atMs,
        });
      }
      if ((r.status === "ambiguous" || r.status === "need_product") && Number.isFinite(atMs)) {
        botTargets.push({
          name: String(row.display_name ?? "").trim(),
          channel: String(row.channel_id ?? ""),
          kind: r.status, cands: r.candidates, atMs,
        });
      }

      const { error: upErr } = await sb
        .from("chat_orders")
        .update({
          parse_status: r.status,
          parsed_product_id: r.productId,
          parsed_product_name: r.productName,
          parsed_variant: r.variantName,
          parsed_qty: r.qty,
          parsed_matched_by: r.matchedBy,
          parsed_options: r.optionTokens.join(","),
          parsed_candidates: r.candidates.join(" | "),
          parsed_reason: r.reason,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", row.id as number);
      if (!upErr) updated += 1;
    }

    // ── 봇 안내 발송 (설정 ON일 때만, 상한 준수) ──
    let botSent = 0;
    try {
      if ((await readSetting(sb, SETTING_BOT_REPLY_ENABLED)) === "true" && botTargets.length > 0) {
        // 읽기 루프가 찾아둔 채팅방 ID를 그대로 쓴다 — 테스트 URL 모드에서도 봇이 글을 쓸 수 있다.
        const botChatId = await readSetting(sb, "chat_order_chat_id");
        const day = new Date().toISOString().slice(0, 10);
        const { data: u } = await sb.from("youtube_api_usage")
          .select("calls").eq("day", day).eq("method", "liveChatMessages.insert").limit(1).maybeSingle();
        let sentToday = Number((u as Record<string, unknown> | null)?.calls || 0);
        let lastMs = Number(await readSetting(sb, SETTING_BOT_LAST_MS)) || 0;
        const seenChannel = new Set<string>();
        for (const t of botTargets) {
          if (botSent >= BOT_MAX_PER_PASS || sentToday >= BOT_DAILY_CAP) break;
          if (Date.now() - t.atMs > BOT_FRESH_MS) continue;          // 뒷북 금지
          if (Date.now() - lastMs < BOT_GAP_MS) break;               // 발송 간격
          if (t.channel && seenChannel.has(t.channel)) continue;     // 같은 손님 1회
          seenChannel.add(t.channel);
          const nick = t.name ? `${t.name}님, ` : "";
          const msg = t.kind === "ambiguous" && t.cands.length > 0
            ? `🤖 ${nick}${t.cands.slice(0, 3).join(" / ")} 중 어느 상품인지 종류와 함께 다시 적어주세요!`
            : `🤖 ${nick}상품명(또는 앞번호)과 함께 적어주시면 바로 접수돼요! 예) 3번 주세요`;
          const res = await postLiveChatMessage(msg, { forceEvenIfDisabled: true, liveChatId: botChatId });
          if (res.ok) {
            botSent += 1; sentToday += 1; lastMs = Date.now();
            await writeSetting(sb, SETTING_BOT_LAST_MS, String(lastMs));
            if (u) await sb.from("youtube_api_usage").update({ calls: sentToday }).eq("day", day).eq("method", "liveChatMessages.insert");
            else await sb.from("youtube_api_usage").insert({ day, method: "liveChatMessages.insert", calls: 1 });
          } else break; // 실패하면 이번 회차는 중단 (다음 주기에 재시도할 다른 채팅이 온다)
        }
      }
    } catch { /* 봇 안내 실패는 파싱 결과를 막지 않는다 */ }

    // ── 접수 확인 발송 (묶음 — 1분에 1번, 여러 건을 한 줄로) ──
    try {
      if ((await readSetting(sb, SETTING_BOT_REPLY_ENABLED)) === "true") {
        const fresh = confirmTargets.filter((t) => Date.now() - t.atMs <= BOT_FRESH_MS);
        if (fresh.length > 0) {
          const day = new Date().toISOString().slice(0, 10);
          const { data: u } = await sb.from("youtube_api_usage")
            .select("calls").eq("day", day).eq("method", "liveChatMessages.insert").limit(1).maybeSingle();
          const sentToday = Number((u as Record<string, unknown> | null)?.calls || 0);
          const lastMs = Number(await readSetting(sb, SETTING_BOT_CONFIRM_LAST_MS)) || 0;
          if (sentToday < BOT_DAILY_CAP && Date.now() - lastMs >= BOT_CONFIRM_GAP_MS) {
            const item = (t: (typeof fresh)[number]) => {
              const what = (t.variant || t.product).replace(/\(.*?\)/g, "").trim().slice(0, 14);
              return `${t.name}님 ${what}${t.qty > 1 ? ` ${t.qty}개` : ""}`;
            };
            const shown = fresh.slice(0, 3).map(item).join(" · ");
            const more = fresh.length > 3 ? ` 외 ${fresh.length - 3}건` : "";
            const msg = `🧾 접수! ${shown}${more} — 사이트 주문서에서 확정해주세요 🛒`;
            const botChatId2 = await readSetting(sb, "chat_order_chat_id");
            const res = await postLiveChatMessage(msg, { forceEvenIfDisabled: true, liveChatId: botChatId2 });
            if (res.ok) {
              botSent += 1;
              await writeSetting(sb, SETTING_BOT_CONFIRM_LAST_MS, String(Date.now()));
              if (u) await sb.from("youtube_api_usage").update({ calls: sentToday + 1 }).eq("day", day).eq("method", "liveChatMessages.insert");
              else await sb.from("youtube_api_usage").insert({ day, method: "liveChatMessages.insert", calls: 1 });
            }
          }
        }
      }
    } catch { /* 접수확인 실패는 파싱 결과를 막지 않는다 */ }

    return {
      ok: true,
      scanned: pending.length,
      updated,
      byStatus,
      productCount: products.length,
      broadcastSource: loaded.source,
      botSent,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, scanned: 0, updated: 0, byStatus, productCount: 0, broadcastSource: "none", reason: msg };
  }
}
