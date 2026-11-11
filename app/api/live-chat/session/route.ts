import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CHAT_SESSION_COOKIE, CHAT_STATE_COOKIE, chatCookieOptions, sameChatOrigin, signChatIdentity, verifyChatIdentity } from "@/lib/liveChatSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });

// Separate chat verification: never changes customer profile, cart, or order identity.
export async function GET(request: NextRequest) {
  try {
    const state = `ruru_chat_${randomBytes(24).toString("hex")}`;
    const returnTo = request.nextUrl.searchParams.get("returnTo") === "/chat-view" ? "/chat-view" : "/order";
    const params = new URLSearchParams({ client_id: process.env.KAKAO_REST_API_KEY || "", redirect_uri: `${request.nextUrl.origin}/auth/kakao/callback`, response_type: "code", state });
    const response = NextResponse.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
    response.cookies.set(CHAT_STATE_COOKIE, signChatIdentity({ sub: "0", phone: returnTo, nonce: state }, 600), chatCookieOptions(600));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch { return fail("본인 확인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}
export async function POST(request: NextRequest) {
  if (!sameChatOrigin(request)) return fail("잘못된 요청입니다.", 403);
  const raw = await request.json().catch(() => ({}));
  const state = verifyChatIdentity(request.cookies.get(CHAT_STATE_COOKIE)?.value);
  if (!state || state.sub !== "0" || !String(raw.state).startsWith("ruru_chat_") || raw.state !== state.nonce || !raw.code) return fail("본인 확인 시간이 지났어요. 다시 시도해 주세요.", 401);
  try {
    const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: process.env.KAKAO_REST_API_KEY || "", redirect_uri: `${request.nextUrl.origin}/auth/kakao/callback`, code: String(raw.code) }), cache: "no-store",
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) return fail("카카오 본인 확인에 실패했어요.", 401);
    const userResponse = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    const user = await userResponse.json();
    const sub = String(user.id || "");
    if (!userResponse.ok || !/^\d+$/.test(sub)) return fail("카카오 계정을 확인하지 못했어요.", 401);
    const phone = String(user.kakao_account?.phone_number || "").replace(/\D/g, "").replace(/^82(?:0)?/, "0");
    const nonce = randomBytes(24).toString("hex");
    const response = NextResponse.json({ ok: true, sub, nonce, returnTo: state.phone }, { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set(CHAT_SESSION_COOKIE, signChatIdentity({ sub, phone, nonce }), chatCookieOptions());
    response.cookies.set(CHAT_STATE_COOKIE, "", chatCookieOptions(0));
    return response;
  } catch { return fail("본인 확인 연결이 불안정해요. 다시 시도해 주세요.", 503); }
}
export async function DELETE(request: NextRequest) {
  if (!sameChatOrigin(request)) return fail("잘못된 요청입니다.", 403);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CHAT_SESSION_COOKIE, "", chatCookieOptions(0));
  response.cookies.set(CHAT_STATE_COOKIE, "", chatCookieOptions(0));
  return response;
}
