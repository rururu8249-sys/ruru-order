// lib/liveAlertBlockServer.ts
// [2026-11-01] 방송 알림톡 «계속 제외» 명단 저장 — 비공개 저장소(admin-private/live-alert-blocks.json).
//   settings 표는 손님 화면도 읽어서 전화번호를 거기 두지 않는다. 서버(service_role)만 읽고 쓴다.
import { parseLiveAlertBlocks, type LiveAlertBlockEntry } from "./liveAlertBlock";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const ADMIN_PRIVATE_BUCKET = "admin-private";
export const LIVE_ALERT_BLOCK_FILE = "live-alert-blocks.json";

function isNotFound(error: unknown): boolean {
  const e = (error || {}) as { message?: string; statusCode?: string | number; status?: number; error?: string; originalError?: { status?: number } };
  const msg = `${e.message || ""} ${e.error || ""}`.toLowerCase();
  return String(e.statusCode) === "404" || e.status === 404 || e.originalError?.status === 404 || msg.includes("not found") || msg.includes("object not found") || msg.includes("bucket not found");
}

/** 명단 읽기. 아직 한 번도 저장 안 했으면 빈 명단. 그 밖의 오류는 throw(발송 쪽에서 «안 보내고 멈춤»). */
export async function readLiveAlertBlocks(supabase: Db): Promise<LiveAlertBlockEntry[]> {
  const { data, error } = await supabase.storage.from(ADMIN_PRIVATE_BUCKET).download(LIVE_ALERT_BLOCK_FILE);
  if (error) {
    if (isNotFound(error)) return [];
    throw new Error(error.message || "발송 제외 명단을 읽지 못했어요");
  }
  if (!data) return [];
  const text = typeof data.text === "function" ? await data.text() : String(data);
  return parseLiveAlertBlocks(text);
}

export async function readLiveAlertBlockPhones(supabase: Db): Promise<Set<string>> {
  return new Set((await readLiveAlertBlocks(supabase)).map((e) => e.phone));
}

async function ensureBucket(supabase: Db) {
  const { data, error } = await supabase.storage.getBucket(ADMIN_PRIVATE_BUCKET);
  if (!error && data) return;
  const { error: createError } = await supabase.storage.createBucket(ADMIN_PRIVATE_BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024 });
  if (createError && !String(createError.message || "").toLowerCase().includes("already")) throw new Error(createError.message);
}

export async function writeLiveAlertBlocks(supabase: Db, list: LiveAlertBlockEntry[]): Promise<void> {
  await ensureBucket(supabase);
  const body = JSON.stringify({ v: 1, items: list });
  const { error } = await supabase.storage
    .from(ADMIN_PRIVATE_BUCKET)
    .upload(LIVE_ALERT_BLOCK_FILE, new Blob([body], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(error.message || "발송 제외 명단 저장 실패");
}
