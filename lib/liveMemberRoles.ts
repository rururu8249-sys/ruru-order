// lib/liveMemberRoles.ts
// [2026-11-15 사장님 「가입 회원에게 손님 주문서 방송 화면에서 조작하는 권한을 편하게 주게」]
//   유튜브(역할 프리셋 + 채팅에서 바로 지정)·쇼피파이(역할 → 세부 권한) 방식을 따름.
//   주인 = 카카오 계정(live_member_roles.kakao_id). 관리자페이지 로그인과는 따로다.
//   예전 목록(settings live_watch_v1 owners·mods 전화번호)은 그대로 읽고, 저장할 때마다 이 표 기준으로 맞춰 쓴다(mirror).
//   돈·주문·입금 무관.
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEMBER_PERMS = ["owner", "host", "moderate", "test", "persona", "memory", "phrases"] as const;
export type MemberPerm = (typeof MEMBER_PERMS)[number];
export type MemberBadge = "crown" | "crown_pink";

export const MEMBER_PERM_INFO: Record<MemberPerm, { label: string; desc: string }> = {
  owner: { label: "총관리자", desc: "왕관 표시 · 고정 댓글 · 채팅 관리자 지정 · 게임" },
  host: { label: "방송 진행", desc: "/상품 명령 · 상품 소개 · 소개영상 · 사이트 카드 · 자주 쓰는 말 · 보는 사람 목록" },
  moderate: { label: "채팅 정리", desc: "글 삭제 · 5분 금지 · 접속 차단 · 손님이 지운 글 보기" },
  test: { label: "테스트 표시 보기", desc: "[테스트] 글·테스트 시청자 표시" },
  persona: { label: "닉네임 골라 보내기", desc: "자동 테스트 손님 이름으로 채팅 보내기" },
  phrases: { label: "자주 쓰는 말", desc: "방송 화면(PC)에서 자주 쓰는 말 — 유튜브 복사·사이트 채팅 보내기. 본인만의 목록(총관리자 목록과 따로, 총관리자는 볼 수 있음)" },
  memory: { label: "구매 얘기 시험 보기", desc: "자동 테스트 손님의 «지난번 ○○ 샀었는데 좋았어요» 글을 일반 손님 화면 그대로 보기([테스트] 표시 없이) — 일반 계정으로 실전처럼 시험할 때" },
};

export const MEMBER_PRESETS: { key: string; label: string; desc: string; perms: MemberPerm[] }[] = [
  { key: "owner", label: "총관리자", desc: "모든 기능", perms: ["owner", "host", "moderate", "test", "persona", "memory"] },
  { key: "sub", label: "부관리자", desc: "채팅 정리 · 테스트 보기 · 닉네임 골라 보내기", perms: ["moderate", "test", "persona"] },
  { key: "chat", label: "채팅 관리자", desc: "채팅 정리만 (R 표시)", perms: ["moderate"] },
  { key: "chatPhrases", label: "채팅 + 자주 쓰는 말", desc: "채팅 정리 · 내 자주 쓰는 말(유튜브 복사·사이트 보내기)", perms: ["moderate", "phrases"] },
];

export function cleanPerms(raw: unknown): MemberPerm[] {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  return MEMBER_PERMS.filter((p) => list.includes(p));
}

export function presetOf(perms: MemberPerm[]): string {
  const key = [...perms].sort().join(",");
  return MEMBER_PRESETS.find((p) => [...p.perms].sort().join(",") === key)?.key ?? "custom";
}

export type MemberFlags = { isOwner: boolean; isManager: boolean; isMod: boolean; seeTest: boolean; persona: boolean; memory?: boolean; phrases?: boolean };
export const NO_MEMBER_FLAGS: MemberFlags = { isOwner: false, isManager: false, isMod: false, seeTest: false, persona: false };

/** 권한 → 화면·서버가 쓰는 판정. 총관리자는 전부, 방송 진행은 채팅 정리·테스트 보기도 포함(예전 isManager 와 같음). */
export function flagsFromPerms(perms: MemberPerm[]): MemberFlags {
  const has = (p: MemberPerm) => perms.includes(p);
  const isOwner = has("owner");
  const isManager = isOwner || has("host");
  return { isOwner, isManager, isMod: isManager || has("moderate"), seeTest: isManager || has("test"), persona: isOwner || has("persona"), memory: isOwner || has("memory"), phrases: isManager || has("phrases") };
}

/** 채팅 글 옆 표시 — 총관리자 왕관, 채팅 정리·방송 진행 R, 나머지 없음 */
export function badgeFromRole(perms: MemberPerm[], badge: MemberBadge | null): MemberBadge | "mod" | null {
  if (perms.includes("owner")) return badge ?? "crown";
  if (perms.includes("moderate") || perms.includes("host")) return "mod";
  return null;
}

export function mergeFlags(a: MemberFlags, b: MemberFlags): MemberFlags {
  return { isOwner: a.isOwner || b.isOwner, isManager: a.isManager || b.isManager, isMod: a.isMod || b.isMod, seeTest: a.seeTest || b.seeTest, persona: a.persona || b.persona, memory: Boolean(a.memory || b.memory), phrases: Boolean(a.phrases || b.phrases) };
}

export type MemberRoleRow = { kakao_id: string; perms: MemberPerm[]; badge: MemberBadge | null; nickname: string | null; updated_at?: string | null };

let cache: { at: number; rows: Map<string, MemberRoleRow> } | null = null;
const CACHE_MS = 10_000;

export function invalidateMemberRoles() { cache = null; }

export async function readMemberRoles(sb: SupabaseClient): Promise<Map<string, MemberRoleRow>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const { data, error } = await sb.from("live_member_roles").select("kakao_id, perms, badge, nickname, updated_at");
  if (error) throw new Error("Member roles unavailable");
  const rows = new Map<string, MemberRoleRow>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(r.kakao_id ?? "");
    if (!id) continue;
    const badge = r.badge === "crown" || r.badge === "crown_pink" ? r.badge : null;
    rows.set(id, { kakao_id: id, perms: cleanPerms(r.perms), badge, nickname: r.nickname ? String(r.nickname) : null, updated_at: r.updated_at ? String(r.updated_at) : null });
  }
  cache = { at: Date.now(), rows };
  return rows;
}

/** 이 카카오 계정의 표 권한. 표를 못 읽으면 권한 없음(예전 목록 판정은 호출하는 쪽에서 그대로). */
export async function memberRoleOf(sb: SupabaseClient, kakaoId: string | null | undefined): Promise<MemberRoleRow | null> {
  if (!kakaoId) return null;
  try { return (await readMemberRoles(sb)).get(String(kakaoId)) ?? null; } catch { return null; }
}
