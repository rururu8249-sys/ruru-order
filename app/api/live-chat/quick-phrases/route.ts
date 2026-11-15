import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { chatIdentityFromRequest, sameChatOrigin, verifiedChatRole } from "@/lib/liveChatSession";
import { QUICK_PHRASES_KEY, cleanQuickPhrases, readQuickPhrases } from "@/lib/liveChatQuickPhrases";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => reply({ ok: false, message }, status);
// [2026-11-13] 사이트 채팅 «자주 쓰는 말» — 관리자 로그인 또는 서버가 확인한 채팅 관리자만. settings 한 줄만 씀(돈·주문 무접촉).
// [2026-11-15 사장님] «자주 쓰는 말» 권한만 받은 회원(방송 진행 아님)은 본인 목록을 따로 씀(총관리자 목록과 연동 안 함).
//   총관리자(관리자 로그인 포함)는 ?member=카카오번호 로 그 사람 목록을 읽기만.
type Access = { key: string; own: boolean; owner: boolean } | null;
const ownKey = (kakaoId: string) => `${QUICK_PHRASES_KEY}:k:${kakaoId}`;
async function access(request: NextRequest): Promise<Access> {
  if (await verifyAdminSessionFromRequest(request)) return { key: QUICK_PHRASES_KEY, own: false, owner: true };
  const identity = chatIdentityFromRequest(request);
  if (!identity) return null;
  const role = await verifiedChatRole(getServiceClient(), identity);
  if (role.isManager) return { key: QUICK_PHRASES_KEY, own: false, owner: role.isOwner };
  if (role.phrases) return { key: ownKey(identity.sub), own: true, owner: false };
  return null;
}
export async function GET(request: NextRequest) {
  try {
    const a = await access(request);
    if (!a) return fail("관리자 로그인 또는 채팅 본인 확인이 필요해요.", 403);
    const member = (request.nextUrl.searchParams.get("member") || "").trim();
    if (member) {
      if (!a.owner || !/^\d{1,20}$/.test(member)) return fail("총관리자만 볼 수 있어요.", 403);
      const { data, error } = await getServiceClient().from("settings").select("value").eq("key", ownKey(member)).maybeSingle();
      if (error) return fail("자주 쓰는 말을 읽지 못했어요.", 503);
      return reply({ ok: true, own: true, saved: Boolean(data), phrases: data ? readQuickPhrases(data.value) : [] });
    }
    const { data, error } = await getServiceClient().from("settings").select("value").eq("key", a.key).maybeSingle();
    if (error) return fail("자주 쓰는 말을 읽지 못했어요.", 503);
    // 본인 목록은 처음엔 비어 있음(총관리자 기본 문구를 가져오지 않음)
    return reply({ ok: true, own: a.own, phrases: a.own && !data ? [] : readQuickPhrases(data?.value) });
  } catch { return fail("자주 쓰는 말을 읽지 못했어요.", 503); }
}
export async function POST(request: NextRequest) {
  try {
    const a = sameChatOrigin(request) ? await access(request) : null;
    if (!a) return fail("관리자 로그인 또는 채팅 본인 확인이 필요해요.", 403);
    const raw = await request.json();
    if (!Array.isArray(raw?.phrases)) return fail("저장할 말이 없어요.");
    const phrases = cleanQuickPhrases(raw.phrases);
    const { error } = await getServiceClient().from("settings").upsert([{ key: a.key, value: JSON.stringify(phrases) }], { onConflict: "key" });
    if (error) return fail("저장하지 못했어요.", 503);
    return reply({ ok: true, own: a.own, phrases, message: "자주 쓰는 말을 저장했어요" });
  } catch { return fail("저장하지 못했어요. 다시 시도해 주세요.", 503); }
}
