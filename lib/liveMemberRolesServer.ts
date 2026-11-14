// lib/liveMemberRolesServer.ts
// [2026-11-15] 방송 화면 권한 — 저장·빼기·예전 목록 맞추기. service_role 클라이언트로만 부른다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIVE_WATCH_KEY, parseLiveWatchSetting, serializeLiveWatchSetting, type LiveChatOwner } from "@/lib/liveWatch";
import { cleanPerms, invalidateMemberRoles, readMemberRoles, type MemberBadge, type MemberPerm } from "@/lib/liveMemberRoles";
import { koreanPhoneVariants } from "@/lib/order/phone";

const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

/** 카카오 계정 → 지금 회원 전화번호(최근 회원 줄) */
async function phonesOfKakao(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await sb.from("customers").select("kakao_id, customer_phone, created_at").in("kakao_id", ids).order("created_at", { ascending: true });
  if (error) throw new Error("회원 번호를 못 읽었어요.");
  for (const r of (data ?? []) as Array<{ kakao_id?: string; customer_phone?: string }>) {
    const p = digits(r.customer_phone);
    if (p.length >= 9) out.set(String(r.kakao_id), p); // 오름차순이라 마지막(최근)이 남음
  }
  return out;
}

/**
 * 예전 목록(live_watch_v1 owners·mods 전화번호)을 표 기준으로 다시 씀.
 * 회원이 아닌 번호(예전 번호 등)는 손대지 않고 그대로 둔다.
 */
export async function syncLiveWatchMirror(sb: SupabaseClient): Promise<void> {
  invalidateMemberRoles();
  const rows = [...(await readMemberRoles(sb)).values()];
  const phoneOf = await phonesOfKakao(sb, rows.map((r) => r.kakao_id));
  const { data: st, error } = await sb.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle();
  if (error) throw new Error("설정을 못 읽었어요.");
  const setting = parseLiveWatchSetting((st as { value?: unknown } | null)?.value);
  const legacy = Array.from(new Set([...setting.owners.map((o) => o.phone), ...setting.mods]));
  const memberPhones = new Set<string>();
  if (legacy.length) {
    const vs = Array.from(new Set(legacy.flatMap((p) => [p, ...koreanPhoneVariants(p)])));
    const { data: cs, error: ce } = await sb.from("customers").select("customer_phone").in("customer_phone", vs);
    if (ce) throw new Error("회원 번호를 못 읽었어요.");
    for (const c of (cs ?? []) as Array<{ customer_phone?: string }>) memberPhones.add(digits(c.customer_phone));
  }
  const owners: LiveChatOwner[] = setting.owners.filter((o) => !memberPhones.has(o.phone));
  const mods: string[] = setting.mods.filter((p) => !memberPhones.has(p));
  for (const r of rows) {
    const phone = phoneOf.get(r.kakao_id);
    if (!phone) continue;
    if (r.perms.includes("owner")) { if (!owners.some((o) => o.phone === phone)) owners.push({ phone, badge: r.badge ?? "crown" }); }
    else if ((r.perms.includes("moderate") || r.perms.includes("host")) && !mods.includes(phone)) mods.push(phone);
  }
  const value = serializeLiveWatchSetting({ ...setting, owners, mods: mods.filter((p) => !owners.some((o) => o.phone === p)) });
  const { error: we } = await sb.from("settings").update({ value }).eq("key", LIVE_WATCH_KEY);
  if (we) throw new Error("설정을 저장 못 했어요.");
}

export async function saveMemberRole(sb: SupabaseClient, input: { kakaoId: string; perms: unknown; badge?: unknown; nickname?: string | null; by: string }): Promise<{ ok: boolean; message: string }> {
  const kakaoId = String(input.kakaoId || "").trim();
  if (!/^\d+$/.test(kakaoId)) return { ok: false, message: "회원을 다시 골라 주세요." };
  const perms = cleanPerms(input.perms);
  if (!perms.length) return removeMemberRole(sb, kakaoId);
  const badge: MemberBadge | null = perms.includes("owner") ? (input.badge === "crown" ? "crown" : "crown_pink") : null;
  const prev = (await readMemberRoles(sb)).get(kakaoId);
  if (prev?.perms.includes("owner") && !perms.includes("owner") && (await ownerCount(sb)) <= 1) return { ok: false, message: "총관리자는 한 명 이상 있어야 해요." };
  const { error } = await sb.from("live_member_roles").upsert([{ kakao_id: kakaoId, perms, badge, nickname: input.nickname ?? prev?.nickname ?? null, updated_at: new Date().toISOString(), updated_by: input.by }], { onConflict: "kakao_id" });
  invalidateMemberRoles();
  if (error) return { ok: false, message: "저장 못 했어요." };
  await syncLiveWatchMirror(sb);
  return { ok: true, message: "저장했어요. 그분 화면은 새로고침하면 바로 바뀌어요." };
}

async function ownerCount(sb: SupabaseClient) {
  return [...(await readMemberRoles(sb)).values()].filter((r) => r.perms.includes("owner")).length;
}

export async function removeMemberRole(sb: SupabaseClient, kakaoId: string): Promise<{ ok: boolean; message: string }> {
  const prev = (await readMemberRoles(sb)).get(kakaoId);
  if (!prev) return { ok: true, message: "권한이 없는 회원이에요." };
  if (prev.perms.includes("owner") && (await ownerCount(sb)) <= 1) return { ok: false, message: "총관리자는 한 명 이상 있어야 해요." };
  const { error } = await sb.from("live_member_roles").delete().eq("kakao_id", kakaoId);
  invalidateMemberRoles();
  if (error) return { ok: false, message: "못 뺐어요." };
  await syncLiveWatchMirror(sb);
  return { ok: true, message: "권한을 뺐어요." };
}

/** 채팅에서 바로 「채팅 관리자로 지정/해제」 — 채팅 정리 권한만 넣고 뺌 */
export async function toggleModeratePerm(sb: SupabaseClient, kakaoId: string, grant: boolean, nickname: string, by: string) {
  const prev = (await readMemberRoles(sb)).get(kakaoId);
  const base: MemberPerm[] = prev?.perms ?? [];
  const perms = grant ? Array.from(new Set<MemberPerm>([...base, "moderate"])) : base.filter((p) => p !== "moderate");
  return saveMemberRole(sb, { kakaoId, perms, badge: prev?.badge, nickname: prev?.nickname ?? nickname, by });
}
