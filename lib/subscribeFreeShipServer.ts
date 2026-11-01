// lib/subscribeFreeShipServer.ts
// [2026-11-01] 구독 인증 무료배송 — 서버 전용(service_role 클라이언트를 받아서 씀).
//   손님 인증 라우트(app/api/subscribe-verify)와 주문 제출(customer-orders/submit)이 같이 쓴다.
//   어떤 경우에도 예외를 던지지 않는다: 못 읽으면 «혜택 없음»(= 배송비 그대로 받는 안전한 쪽).
import { parseSubscribeFreeShip, SUBSCRIBE_FREE_SHIP_KEY, isSubscribeFreeShipActive, type SubscribeFreeShipConfig } from "./subscribeFreeShip";

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

/** 주문 제출 검사용 — 지금 혜택 켜짐 + 이 손님 인증됨이면 설정, 아니면 null */
export async function activeSubscribeWaiverFor(supabase: Db, kakaoId: string, now: Date = new Date()): Promise<SubscribeFreeShipConfig | null> {
  const config = await readSubscribeFreeShipConfig(supabase);
  if (!isSubscribeFreeShipActive(config, now)) return null;
  if (!(await isKakaoSubscribeVerified(supabase, kakaoId))) return null;
  return config;
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
