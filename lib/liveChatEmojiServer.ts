// [2026-11-10] 사이트 채팅 이모티콘 — 서버 공용(service_role 로만 부른다).
//   설정 읽기·직접 넣은/막은 손님 명단(비공개 저장소)·누적 구매 금액(읽기만)·쓸 수 있는지 판정.
//   누적 구매 = 결제 끝난 주문 줄만(상태가 입금확인·카드결제완료·출고 등 — 판매분석과 같은 결제완료 목록, 취소·테스트·삭제 제외).
//   사람 = 카카오 계정(kakao_id), 카카오 계정이 안 찍힌 옛 주문은 지금 전화번호로.
//   주문·돈·포인트 쓰기 없음.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MONTH_COLS } from "@/lib/liveSummary";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";

const PAID = new Set(PAID_STATUS_VALUES);
import { koreanPhoneVariants } from "@/lib/order/phone";
import { LIVE_WATCH_KEY, parseLiveWatchSetting } from "@/lib/liveWatch";
import {
  EMOJI_ALWAYS_PHONES,
  LIVE_CHAT_EMOJI_KEY,
  emojiAllowed,
  parseChatEmojiSetting,
  type ChatEmojiSetting,
} from "@/lib/liveChatEmoji";

export const EMOJI_PRIVATE_BUCKET = "admin-private";
export const EMOJI_ACCESS_FILE = "live-chat-emoji-access.json";
export const EMOJI_PUBLIC_BUCKET = "product-images";

export type EmojiAccessLists = { allow: string[]; deny: string[] };

const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const phoneOk = (p: string) => p.length >= 9 && p.length <= 11;

export async function readEmojiSetting(sb: SupabaseClient): Promise<ChatEmojiSetting> {
  const { data } = await sb.from("settings").select("value").eq("key", LIVE_CHAT_EMOJI_KEY).maybeSingle();
  return parseChatEmojiSetting((data as { value?: unknown } | null)?.value);
}

function isNotFound(error: unknown): boolean {
  const e = (error || {}) as { message?: string; statusCode?: string | number; status?: number; error?: string; originalError?: { status?: number } };
  const msg = `${e.message || ""} ${e.error || ""}`.toLowerCase();
  return String(e.statusCode) === "404" || e.status === 404 || e.originalError?.status === 404 || msg.includes("not found");
}

export function parseEmojiAccessLists(text: string): EmojiAccessLists {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const list = (v: unknown) => Array.from(new Set((Array.isArray(v) ? v : []).map(digits).filter(phoneOk))).slice(0, 2000);
    return { allow: list(o.allow), deny: list(o.deny) };
  } catch {
    return { allow: [], deny: [] };
  }
}

/** 명단 읽기 — 아직 없으면 빈 명단. 그 밖의 오류는 throw(판정은 «못 씀»으로). */
export async function readEmojiAccessLists(sb: SupabaseClient): Promise<EmojiAccessLists> {
  const { data, error } = await sb.storage.from(EMOJI_PRIVATE_BUCKET).download(EMOJI_ACCESS_FILE);
  if (error) {
    if (isNotFound(error)) return { allow: [], deny: [] };
    throw new Error(error.message || "이모티콘 명단을 못 읽었어요");
  }
  if (!data) return { allow: [], deny: [] };
  return parseEmojiAccessLists(await data.text());
}

export async function writeEmojiAccessLists(sb: SupabaseClient, lists: EmojiAccessLists): Promise<void> {
  const { data, error } = await sb.storage.getBucket(EMOJI_PRIVATE_BUCKET);
  if (error || !data) {
    const { error: ce } = await sb.storage.createBucket(EMOJI_PRIVATE_BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024 });
    if (ce && !String(ce.message || "").toLowerCase().includes("already")) throw new Error(ce.message);
  }
  const body = JSON.stringify({ v: 1, allow: lists.allow, deny: lists.deny });
  const { error: ue } = await sb.storage
    .from(EMOJI_PRIVATE_BUCKET)
    .upload(EMOJI_ACCESS_FILE, new Blob([body], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (ue) throw new Error(ue.message || "명단 저장 실패");
}

/** 누적 구매 금액(결제 끝난 주문서 합) — 카카오 계정 기준 + 카카오 계정 없는 옛 주문은 전화번호. 읽기만. */
export async function paidTotalOf(sb: SupabaseClient, who: { kakaoId?: string; phone?: string }, sinceIso: string | null): Promise<number> {
  const k = String(who.kakaoId ?? "").replace(/[^0-9A-Za-z_-]/g, "");
  const p = digits(who.phone);
  const ors: string[] = [];
  if (k) ors.push(`kakao_id.eq.${k}`);
  if (phoneOk(p)) {
    const vs = Array.from(new Set([p, ...koreanPhoneVariants(p)])).map((v) => `"${v}"`).join(",");
    ors.push(k ? `and(kakao_id.is.null,customer_phone.in.(${vs}))` : `customer_phone.in.(${vs})`);
  }
  if (!ors.length) return 0;
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < 10; page++) {
    let q = sb.from("orders").select(`${MONTH_COLS},kakao_id,is_deleted`).or(ors.join(","));
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q.order("id", { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    const list = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...list.filter((r) => r.is_deleted !== true));
    if (list.length < 1000) break;
  }
  // 줄마다 — 결제완료 상태인 줄만(같은 주문서 안에서 한 상품만 취소된 경우도 남은 상품은 셈). 테스트·삭제 제외.
  let sum = 0;
  for (const r of rows) {
    if (r.is_test_order === true) continue;
    const a = String(r.admin_order_status_v2 || "").trim();
    const b = String(r.order_manage_status || "").trim();
    if (a.includes("취소") || b.includes("취소")) continue;
    if (!PAID.has(a) && !PAID.has(b)) continue;
    const v = Number(r.final_amount ?? r.adjusted_total_price ?? r.total_price ?? 0);
    if (Number.isFinite(v) && v > 0) sum += v;
  }
  return sum;
}

export function sinceOf(setting: ChatEmojiSetting): string | null {
  return setting.period === "1y" ? new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString() : null;
}

/** 늘 쓸 수 있는 번호 — 사장님 지정 3개 + 방송 보기 설정의 총관리자 + 켜진 관리자 시험 계정 */
export async function alwaysEmojiPhones(sb: SupabaseClient): Promise<Set<string>> {
  const set = new Set(EMOJI_ALWAYS_PHONES);
  const [st, ops] = await Promise.all([
    sb.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle(),
    sb.from("operator_test_accounts").select("customer_phone").eq("is_active", true),
  ]);
  for (const o of parseLiveWatchSetting((st.data as { value?: unknown } | null)?.value).owners) set.add(digits(o.phone));
  for (const r of (ops.data ?? []) as Array<{ customer_phone?: string }>) set.add(digits(r.customer_phone));
  set.delete("");
  return set;
}

// 같은 서버에서 잠깐 기억(글마다 주문표를 다시 읽지 않게) — 5분
const cache = new Map<string, { at: number; ok: boolean }>();
const CACHE_MS = 5 * 60 * 1000;
export function clearEmojiAccessCache() { cache.clear(); }

/** 이 카카오 계정이 이모티콘을 쓸 수 있는지. 읽기 실패면 false(최고 관리자는 번호만 맞으면 true). */
export async function canUseChatEmoji(sb: SupabaseClient, kakaoId: string, setting?: ChatEmojiSetting): Promise<boolean> {
  const k = String(kakaoId || "").trim();
  if (!k) return false;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  const st = setting ?? (await readEmojiSetting(sb));
  const { data: cust } = await sb.from("customers").select("customer_phone").eq("kakao_id", k).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const phone = digits((cust as { customer_phone?: string } | null)?.customer_phone);
  const always = await alwaysEmojiPhones(sb).catch(() => new Set(EMOJI_ALWAYS_PHONES));
  if (phone && always.has(phone)) { cache.set(k, { at: Date.now(), ok: true }); return true; }
  let ok = false;
  try {
    const lists = await readEmojiAccessLists(sb);
    const denied = lists.deny.includes(phone);
    const allowed = lists.allow.includes(phone);
    const needTotal = !denied && !allowed && st.access === "amount";
    const paidTotal = needTotal ? await paidTotalOf(sb, { kakaoId: k, phone }, sinceOf(st)) : null;
    ok = emojiAllowed({ setting: st, always: false, allowed, denied, paidTotal });
  } catch {
    ok = false;
  }
  cache.set(k, { at: Date.now(), ok });
  return ok;
}
