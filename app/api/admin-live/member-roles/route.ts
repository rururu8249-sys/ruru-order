// app/api/admin-live/member-roles/route.ts
// [2026-11-15] 설정 › 방송·알림 › 방송 화면 권한 — 보기·회원 찾기·저장·빼기. 관리자 로그인만(미들웨어 + 여기서 한 번 더).
//   권한 표(live_member_roles, 카카오 계정 기준)만 바꾸고 예전 목록(live_watch_v1 owners·mods)을 맞춰 씀. 주문·돈 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";
import { invalidateMemberRoles, readMemberRoles } from "@/lib/liveMemberRoles";
import { removeMemberRole, saveMemberRole } from "@/lib/liveMemberRolesServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const mask = (p: string) => (p.length >= 8 ? `${p.slice(0, 3)}-****-${p.slice(-4)}` : p);
type Cust = { kakao_id?: string | null; customer_phone?: string | null; customer_name?: string | null; youtube_nickname?: string | null; kakao_nickname?: string | null; kakao_profile_image?: string | null };
const COLS = "kakao_id, customer_phone, customer_name, youtube_nickname, kakao_nickname, kakao_profile_image, created_at";

function person(c: Cust | undefined, fallbackNick: string | null) {
  const photo = String(c?.kakao_profile_image || "").replace(/^http:\/\//, "https://");
  return {
    nickname: String(c?.youtube_nickname || c?.kakao_nickname || fallbackNick || ""),
    name: String(c?.customer_name || ""),
    phone: mask(digits(c?.customer_phone)),
    photo: /^https:\/\//.test(photo) && !/default_profile/i.test(photo) ? photo : "",
    member: Boolean(c),
  };
}

async function list(sb: ReturnType<typeof getServiceClient>) {
  invalidateMemberRoles();
  const rows = [...(await readMemberRoles(sb)).values()];
  const ids = rows.map((r) => r.kakao_id);
  const byId = new Map<string, Cust>();
  if (ids.length) {
    const { data, error } = await sb.from("customers").select(COLS).in("kakao_id", ids).order("created_at", { ascending: true });
    if (error) throw new Error("회원을 못 읽었어요.");
    for (const c of (data ?? []) as Cust[]) byId.set(String(c.kakao_id), c);
  }
  const { data: ops } = await sb.from("operator_test_accounts").select("customer_phone, is_active").eq("is_active", true);
  const opPhones = ((ops ?? []) as Array<{ customer_phone?: string }>).map((o) => digits(o.customer_phone)).filter((p) => p.length >= 9);
  const opPeople: Array<ReturnType<typeof person> & { key: string }> = [];
  if (opPhones.length) {
    const { data } = await sb.from("customers").select(COLS).in("customer_phone", opPhones);
    const byPhone = new Map(((data ?? []) as Cust[]).map((c) => [digits(c.customer_phone), c]));
    for (const p of opPhones) {
      const c = byPhone.get(p);
      if (p === "0200000077") continue; // 자동 테스트 회원은 화면에서 뺌
      opPeople.push({ key: p, ...person(c, null), phone: mask(p) });
    }
  }
  return {
    items: rows
      .map((r) => ({ kakaoId: r.kakao_id, perms: r.perms, badge: r.badge, updatedAt: r.updated_at, ...person(byId.get(r.kakao_id), r.nickname) }))
      .sort((a, b) => Number(b.perms.includes("owner")) - Number(a.perms.includes("owner")) || b.perms.length - a.perms.length || a.nickname.localeCompare(b.nickname, "ko")),
    ops: opPeople,
  };
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const sb = getServiceClient();
    const q = String(request.nextUrl.searchParams.get("q") || "").replace(/[,()*%\\]/g, " ").trim().slice(0, 30);
    if (q) {
      const d = digits(q);
      const ors = [`customer_name.ilike.*${q}*`, `youtube_nickname.ilike.*${q}*`, `kakao_nickname.ilike.*${q}*`];
      if (d.length >= 3) ors.push(`customer_phone.ilike.*${d}*`);
      const { data, error } = await sb.from("customers").select(COLS).not("kakao_id", "is", null).or(ors.join(",")).order("last_login_at", { ascending: false, nullsFirst: false }).limit(30);
      if (error) return fail("찾기 실패", 500);
      const roles = await readMemberRoles(sb);
      const seen = new Set<string>();
      const results = [];
      for (const c of (data ?? []) as Cust[]) {
        const id = String(c.kakao_id || "");
        if (!/^\d+$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        results.push({ kakaoId: id, perms: roles.get(id)?.perms ?? [], badge: roles.get(id)?.badge ?? null, ...person(c, null) });
        if (results.length >= 12) break;
      }
      return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: true, ...(await list(sb)) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("못 불러왔어요.", 500);
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminSessionFromRequest(request);
  if (!admin) return fail("관리자 로그인이 필요합니다.", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("잘못된 요청입니다.", 403);
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kakaoId = String(raw.kakaoId ?? "");
    const sb = getServiceClient();
    const by = `admin:${String((admin as { sub?: string }).sub ?? "")}`;
    const r = raw.action === "remove"
      ? await removeMemberRole(sb, kakaoId)
      : await saveMemberRole(sb, { kakaoId, perms: raw.perms, badge: raw.badge, nickname: typeof raw.nickname === "string" ? raw.nickname.slice(0, 40) : null, by });
    if (!r.ok) return fail(r.message, 400);
    return NextResponse.json({ ok: true, message: r.message, ...(await list(sb)) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("저장 못 했어요.", 500);
  }
}
