// lib/subscribeFreeShipServer.ts
// [2026-11-01] 구독 인증 무료배송 — 서버 전용(service_role 클라이언트를 받아서 씀).
//   손님 인증 라우트(app/api/subscribe-verify)와 주문 제출(customer-orders/submit)이 같이 쓴다.
//   어떤 경우에도 예외를 던지지 않는다: 못 읽으면 «혜택 없음»(= 배송비 그대로 받는 안전한 쪽).
import { parseSubscribeFreeShip, SUBSCRIBE_FREE_SHIP_KEY, isSubscribeFreeShipActive, type SubscribeFreeShipConfig } from "./subscribeFreeShip";
import { COMBINE_SHIPPING_SETTING_KEYS, getKoreaTodayCombineWindow, isCombineShippingActiveNow, parseCombineShippingSettings } from "./admin-v2/combineShipping";

export const SUBSCRIBE_PROOF_BUCKET = "subscribe-proofs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function readSubscribeFreeShipConfig(supabase: Db): Promise<SubscribeFreeShipConfig> {
  try {
    const { data, error } = await supabase.from("settings").select("key,value").eq("key", SUBSCRIBE_FREE_SHIP_KEY).maybeSingle();
    if (error || !data) return parseSubscribeFreeShip(null);
    return parseSubscribeFreeShip(data.value);
  } catch {
    return parseSubscribeFreeShip(null);
  }
}

export function cleanKakaoId(value: unknown): string {
  return String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 64);
}

/** 이 카카오 계정이 인증돼 있는가(사장님이 취소한 건 제외). 표가 없거나 못 읽으면 false. */
export async function isKakaoSubscribeVerified(supabase: Db, kakaoId: string): Promise<boolean> {
  const kid = cleanKakaoId(kakaoId);
  if (!kid) return false;
  try {
    const { data, error } = await supabase
      .from("subscribe_verifications")
      .select("id")
      .eq("kakao_id", kid)
      .eq("status", "verified")
      .limit(1);
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** One-time marketing benefit window captured when a screenshot is verified.
 * Explicit administrator combine window takes priority; while a broadcast is live,
 * use that broadcast ID; otherwise use Korea's calendar day. */
export type SubscribeBenefitWindow = {
  startAt: string | null;
  endAt: string | null;
  broadcastId: string | null;
};
export async function resolveSubscribeBenefitWindow(supabase: Db, now: Date = new Date()): Promise<SubscribeBenefitWindow> {
  const { data: rows, error } = await supabase.from("settings").select("key,value")
    .in("key", [...COMBINE_SHIPPING_SETTING_KEYS]);
  if (error) throw new Error("합배송 기간 설정을 불러올 수 없습니다.");
  const settings = parseCombineShippingSettings(rows || []);
  if (isCombineShippingActiveNow(settings, now)) {
    return { startAt: settings.startAt, endAt: settings.endAt, broadcastId: null };
  }
  // Same priority as the existing customer combine-shipping screen.
  const { data: live, error: liveError } = await supabase.from("broadcasts")
    .select("id,status,started_at,created_at")
    .eq("status", "ON")
    .order("started_at", { ascending: false })
    .limit(1).maybeSingle();
  if (liveError) throw new Error("방송 합배송 기준을 확인하지 못했습니다.");
  if (live?.id && (live.started_at || live.created_at)) {
    return { startAt: null, endAt: null, broadcastId: String(live.id) };
  }
  const day = getKoreaTodayCombineWindow(now);
  return { startAt: day.startAt, endAt: day.endAt, broadcastId: null };
}

export type SubscribeBenefitStatus = { verified: boolean; everVerified: boolean; used: boolean; available: boolean };
export async function readSubscribeBenefitStatus(supabase: Db, kakaoId: string, now = new Date()): Promise<SubscribeBenefitStatus> {
  const kid = cleanKakaoId(kakaoId);
  const none = { verified: false, everVerified: false, used: false, available: false };
  if (!kid) return none;
  const { data: history, error: historyError } = await supabase.from("subscribe_verifications")
    .select("status,canceled_at")
    .eq("kakao_id", kid).in("status", ["verified", "canceled"])
    .order("created_at", { ascending: false }).limit(100);
  if (historyError) return none;
  const verified = (history || []).some((row: any) => row.status === "verified");
  const everVerified = verified || (history || []).some((row: any) => row.status === "canceled" || !!row.canceled_at);
  const { data: redemption, error: redemptionError } = await supabase.from("subscribe_free_ship_redemptions")
    .select("kakao_id").eq("kakao_id", kid).maybeSingle();
  if (redemptionError) return { verified, everVerified, used: false, available: false };
  const used = !!redemption;
  if (!verified || used) return { verified, everVerified, used, available: false };
  const config = await readSubscribeFreeShipConfig(supabase);
  if (!isSubscribeFreeShipActive(config, now)) return { verified, everVerified, used, available: false };
  const { data: eligible, error: eligibleError } = await supabase.rpc("ruru_subscribe_free_ship_eligible", {
    p_kakao_id: kid, p_at: now.toISOString(),
  });
  return { verified, everVerified, used, available: !eligibleError && eligible === true };
}

/** Order-submit server gate: one-time benefit available + event ON + certificate valid. */
export async function activeSubscribeWaiverFor(supabase: Db, kakaoId: string, now: Date = new Date()): Promise<SubscribeFreeShipConfig | null> {
  const status = await readSubscribeBenefitStatus(supabase, kakaoId, now);
  return status.available ? await readSubscribeFreeShipConfig(supabase) : null;
}

export async function ensureSubscribeProofBucket(supabase: Db): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(SUBSCRIBE_PROOF_BUCKET);
  if (!error && data) return;
  const { error: createError } = await supabase.storage.createBucket(SUBSCRIBE_PROOF_BUCKET, {
    public: false,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    fileSizeLimit: 5 * 1024 * 1024,
  });
  if (createError && !String(createError.message || "").toLowerCase().includes("already")) {
    throw new Error(createError.message);
  }
}
