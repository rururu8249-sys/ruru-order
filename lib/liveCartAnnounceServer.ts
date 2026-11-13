// [2026-11-10 07:39 사장님] 장바구니 담음 알림 — 손님이 «새로» 담은 상품을 방송 채팅에 루루동이 글 한 줄로(모두에게).
//   「🛍️ 루*동이님 장바구니 담음 · PD-202 블랙/M · 259,000원」 + 「담기 ›」(다른 손님이 눌러 같은 상품 옵션 창).
//   믿는 값만 씀: 닉네임 = 회원 표(카카오 계정) · 상품 이름·판매가 = 지금 방송 상품(서버) · 옵션은 그 상품 사이즈 목록 안일 때만.
//   읽기: broadcasts · settings · customers · 방송 상품(30초 기억) / 알림: 사이트 봇 글 + 연결된 유튜브 채팅.
//   장바구니·재고·주문·돈 무접촉. 실패해도 담기에는 영향 없음(조용히 넘어감).
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIVE_CHAT_KEY, parseLiveChatSetting } from "@/lib/liveChat";
import {
  LIVE_CHAT_BOT_KAKAO,
  LIVE_CHAT_BOT_KEY,
  LIVE_CHAT_BOT_NICK,
  botRefOfCart,
  cartOwnerTag,
  cartAnnounceText,
  maskChatNick,
  parseLiveChatBotSetting,
  trustedCartPrice,
  type CartAnnounceItem,
} from "@/lib/liveChatBot";
import { loadCandidates } from "@/lib/liveChatBotServer";
import { isBlockedValue } from "@/lib/assistantSearchServer";
import { AUTO_TEST_AVATAR, AUTO_TEST_KAKAO_ID } from "@/lib/autoTestOrder";

export type NewCartLine = { productId: string; productName: string; color: string; size: string; unitPrice: number | null };

/** 같은 사람 같은 상품은 10분에 한 번 · 한 사람 글은 20초에 한 번 · 방송 전체로 3초에 한 번(채팅 도배 방지) */
const SAME_ITEM_MS = 10 * 60 * 1000;
const PER_PERSON_MS = 20 * 1000;
const PER_BROADCAST_MS = 3 * 1000;
const seenItem = new Map<string, number>();
const lastPerson = new Map<string, number>();
const lastBroadcast = new Map<string, number>();

function sweep(map: Map<string, number>, ms: number) {
  if (map.size < 800) return;
  const now = Date.now();
  for (const [k, t] of map) if (now - t > ms) map.delete(k);
}

const OPT_OK = /^[^<>{}\[\]\\`]{1,20}$/;

export async function announceNewCartLines(sb: SupabaseClient, input: { sessionKey: string; kakaoId: string | null; lines: NewCartLine[] }): Promise<void> {
  try {
    const kakaoId = String(input.kakaoId ?? "").trim();
    if (!kakaoId || !input.lines.length) return;
    const now = Date.now();
    const person = `${kakaoId}`;
    // [2026-11-13] 「한 사람 20초에 한 번」은 뺌 — 상품을 연달아 담으면 두 번째 상품 알림이 통째로 빠졌음(같은 상품 10분 한 번은 그대로)

    const [bcRes, chatRes, botRes, custRes] = await Promise.all([
      sb.from("broadcasts").select("id").eq("status", "ON").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("settings").select("value").eq("key", LIVE_CHAT_KEY).maybeSingle(),
      sb.from("settings").select("value").eq("key", LIVE_CHAT_BOT_KEY).maybeSingle(),
      sb.from("customers").select("youtube_nickname, is_blocked").eq("kakao_id", kakaoId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const bc = String((bcRes.data as { id?: unknown } | null)?.id ?? "").trim();
    if (!bc) return;
    if (!parseLiveChatSetting((chatRes.data as { value?: unknown } | null)?.value).enabled) return;
    const bot = parseLiveChatBotSetting((botRes.data as { value?: unknown } | null)?.value);
    if (!bot.enabled || !bot.cart) return;
    const cust = custRes.data as { youtube_nickname?: unknown; is_blocked?: unknown } | null;
    const nick = String(cust?.youtube_nickname ?? "").trim();
    if (!nick || isBlockedValue(cust?.is_blocked)) return;
    // 방송 전체 3초 간격 — 버리지 않고 남은 시간만큼 기다렸다 올림(최대 3초)
    const gap = PER_BROADCAST_MS - (Date.now() - (lastBroadcast.get(bc) ?? 0));
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));

    const cands = await loadCandidates(sb, bc);
    const items: Array<CartAnnounceItem & { ref: string }> = [];
    for (const line of input.lines) {
      const key = `${kakaoId}|${line.productId}|${line.productName}|${line.color}|${line.size}`;
      if (now - (seenItem.get(key) ?? 0) < SAME_ITEM_MS) continue;
      const mine = cands.filter((c) => c.productId === line.productId);
      const cand = mine.find((c) => c.detailName && c.detailName === line.productName) ?? mine.find((c) => !c.detailName);
      if (!cand) continue; // 지금 방송 상품이 아니면 안 알림
      const size = cand.sizes.length ? (cand.sizes.includes(line.size) ? line.size : "") : (OPT_OK.test(line.size) ? line.size : "");
      const color = OPT_OK.test(line.color) ? line.color : "";
      seenItem.set(key, now);
      items.push({ name: cand.name || cand.detailName || line.productName, color, size, price: trustedCartPrice(line.unitPrice, cand), ref: botRefOfCart(cand, cartOwnerTag(input.sessionKey)) });
    }
    sweep(seenItem, SAME_ITEM_MS);
    if (!items.length) return;
    // [2026-11-13] 같은 담기 신호가 서버 두 곳에서 동시에 처리되면 같은 글이 두 번 올라갔음 — 최근 10분 같은 글(bot_ref)이 이미 있으면 안 올림
    {
      const since = new Date(now - SAME_ITEM_MS).toISOString();
      const { data: dup } = await sb.from("live_chat_messages").select("bot_ref").eq("broadcast_id", bc).in("bot_ref", items.map((it) => it.ref)).gte("created_at", since).limit(50);
      const done = new Set((dup ?? []).map((d) => String((d as { bot_ref?: unknown }).bot_ref ?? "")));
      for (let i = items.length - 1; i >= 0; i--) if (done.has(items[i].ref)) items.splice(i, 1);
      if (!items.length) return;
    }
    const body = cartAnnounceText(maskChatNick(nick), items);
    if (!body) return;
    lastPerson.set(person, now);
    lastBroadcast.set(bc, now);
    sweep(lastPerson, PER_PERSON_MS);
    const { error } = await sb.from("live_chat_messages").insert({ broadcast_id: bc, kakao_id: LIVE_CHAT_BOT_KAKAO, customer_id: null, nickname: LIVE_CHAT_BOT_NICK, body, badge: "bot", bot_ref: items[0].ref, avatar_url: input.kakaoId === AUTO_TEST_KAKAO_ID ? AUTO_TEST_AVATAR : null });
    // [2026-11-13 18:42 사장님 «장바구니 담음은 유튜브 채팅에 안 올림 — 유튜브 한도 아끼고 위젯 스티커로만»]
    //   사이트 채팅 글은 그대로 남고, 상품 위젯이 이 글(bot_ref c:)을 받아 「장바구니」 스티커로 보여 준다.
    void error;
  } catch {
    /* 알림 실패는 담기와 무관 */
  }
}
