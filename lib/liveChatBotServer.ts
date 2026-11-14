// [2026-11-10] 루루동이AI — 손님 글이 저장된 «뒤»에 서버가 한 번 보고, 안내할 게 있으면 봇 글을 한 줄 넣는다.
//   읽기: settings(live_chat_bot_v1) · broadcast_products · products · live_chat_messages(최근 봇 글) / 쓰기: live_chat_messages 봇 글 한 줄만.
//   주문·돈·재고·포인트 무접촉. 실패해도 손님 글에는 영향 없음(조용히 넘어감).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChatAnnounceText } from "@/lib/chatAnnounce";
import { buildDetailChatLine, detailProducts, parseProductNote, cleanOptionValues } from "@/lib/productDetailModel";
import { isExposedProductRow } from "@/lib/cartExposureServer";
import {
  LIVE_CHAT_BOT_COOLDOWN_MS,
  LIVE_CHAT_BOT_KAKAO,
  LIVE_CHAT_BOT_KEY,
  LIVE_CHAT_BOT_NICK,
  botRefOfFaq,
  botRefOfProduct,
  parseLiveChatBotSetting,
  pickFaq,
  pickProductForChat,
  pickProductsForShortChat,
  productBotText,
  type BotCandidate,
} from "@/lib/liveChatBot";

// 방송 상품은 30초 동안 기억(손님 글마다 상품 전체를 읽지 않게 — DB 부담)
const candCache = new Map<string, { at: number; list: BotCandidate[] }>();
const CACHE_MS = 30 * 1000;
// 같은 서버 안에서 방금 올린 안내(DB 확인 전에 빠르게 거르기)
const recentRefs = new Map<string, number>();

function productCandidates(row: Record<string, unknown>): BotCandidate[] {
  const pid = String(row.id ?? "").trim();
  if (!pid) return [];
  const details = detailProducts(row, { includeHidden: false });
  if (details.length) {
    return details.map((d) => ({
      productId: pid,
      detailName: d.detailName,
      texts: [d.detailName, d.code].filter(Boolean),
      line: buildDetailChatLine(d),
      soldOut: d.stockManaged && d.stock !== null && d.stock <= 0,
      sizes: d.sizes,
      name: d.detailName,
      priceMin: d.price,
      priceMax: d.price,
    }));
  }
  const note = parseProductNote(row);
  const kw = Array.isArray(note.search_keywords) ? (note.search_keywords as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const stock = Number(row.total_stock ?? row.stock);
  return [{
    productId: pid,
    detailName: "",
    texts: [String(row.product_name ?? "").trim(), ...kw].filter(Boolean),
    line: buildChatAnnounceText(row),
    soldOut: note.stock_management_enabled === true && Number.isFinite(stock) && stock <= 0,
    sizes: cleanOptionValues(row.size_options),
    name: String(row.product_name ?? "").trim(),
    ...priceRangeOf(row, note),
  }];
}

// [07:39] 단품 판매가 범위 — 기본가 ~ 기본가+옵션 추가금 최대(장바구니 알림이 손님이 보낸 값을 믿을지 볼 때)
function priceRangeOf(row: Record<string, unknown>, note: Record<string, unknown>): { priceMin: number; priceMax: number } {
  const base = Math.max(0, Number(row.price ?? row.sale_price ?? 0) || 0);
  const pricing = (note.option_pricing && typeof note.option_pricing === "object" ? note.option_pricing : {}) as Record<string, unknown>;
  const plus = Object.values(pricing).map((v) => Math.max(0, Math.floor(Number(v) || 0)));
  return { priceMin: base, priceMax: base + (plus.length ? Math.max(...plus) : 0) };
}

export async function loadCandidates(sb: SupabaseClient, bc: string): Promise<BotCandidate[]> {
  const hit = candCache.get(bc);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const { data: bp, error } = await sb.from("broadcast_products").select("product_id").eq("broadcast_id", bc).limit(2000);
  if (error) return hit?.list ?? [];
  const ids = Array.from(new Set(((bp || []) as Array<Record<string, unknown>>).map((r) => String(r.product_id ?? "").trim()).filter(Boolean)));
  const list: BotCandidate[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows, error: e2 } = await sb.from("products").select("*").in("id", ids.slice(i, i + 200));
    if (e2) return hit?.list ?? [];
    for (const row of (rows || []) as Array<Record<string, unknown>>) {
      if (!isExposedProductRow(row)) continue;
      list.push(...productCandidates(row));
    }
  }
  candCache.set(bc, { at: Date.now(), list });
  return list;
}

async function postedRecently(sb: SupabaseClient, bc: string, ref: string): Promise<boolean> {
  const k = `${bc}|${ref}`;
  const at = recentRefs.get(k);
  if (at && Date.now() - at < LIVE_CHAT_BOT_COOLDOWN_MS) return true;
  const since = new Date(Date.now() - LIVE_CHAT_BOT_COOLDOWN_MS).toISOString();
  const { data } = await sb.from("live_chat_messages").select("id").eq("broadcast_id", bc).eq("kakao_id", LIVE_CHAT_BOT_KAKAO).eq("bot_ref", ref).gte("created_at", since).limit(1);
  return Boolean(data && data.length);
}

async function postBot(sb: SupabaseClient, bc: string, ref: string, body: string) {
  // [2026-11-14 21:55 사장님 「물어보면 계속 나오게」] 자주 묻는 말(f:)은 쉬는 시간 없이 물을 때마다 답함 — 상품 안내 등은 1분 쉬는 시간 그대로
  if (!ref.startsWith("f:") && (await postedRecently(sb, bc, ref))) return;
  recentRefs.set(`${bc}|${ref}`, Date.now());
  if (recentRefs.size > 500) for (const [k, t] of recentRefs) if (Date.now() - t > LIVE_CHAT_BOT_COOLDOWN_MS) recentRefs.delete(k);
  await sb.from("live_chat_messages").insert({ broadcast_id: bc, kakao_id: LIVE_CHAT_BOT_KAKAO, customer_id: null, nickname: LIVE_CHAT_BOT_NICK, body, badge: "bot", bot_ref: ref });
}

/** 손님 글 하나를 보고 루루동이AI 안내(상품·자주 묻는 말). 실패해도 조용히. */
export async function runLiveChatBot(sb: SupabaseClient, bc: string, body: string): Promise<void> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", LIVE_CHAT_BOT_KEY).maybeSingle();
    const setting = parseLiveChatBotSetting((data as { value?: unknown } | null)?.value);
    if (!setting.enabled) return;
    if (setting.product) {
      const cands = await loadCandidates(sb, bc);
      const pick = pickProductForChat(body, cands);
      if (pick) await postBot(sb, bc, botRefOfProduct(pick.cand), productBotText(pick.cand));
      else for (const sp of pickProductsForShortChat(body, cands)) await postBot(sb, bc, botRefOfProduct(sp), sp.text);
    }
    const faq = pickFaq(body, setting.faqs);
    if (faq) await postBot(sb, bc, botRefOfFaq(faq.faq), faq.faq.answer);
  } catch {
    /* 봇 실패는 손님 글과 무관 */
  }
}
