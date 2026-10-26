// [2026-10-26] 카톡 알림톡(입금 요청·주문서 제출 안내) 설정 — 템플릿 ID 저장·불러오기·시험 발송.
//   관리자만(이중: middleware + verifyAdminSession). settings 표의 두 키만 쓴다. 주문·입금·돈 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { KAKAO_NOTIFY_TEMPLATES, cleanTemplateId, kakaoTargetPhone, type KakaoNotifyKind } from "@/lib/kakaoNotify";
import { readKakaoTemplateIds, sendKakaoNotify, solapiEnvReady } from "@/lib/kakaoNotifyServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function writeSetting(sb: ReturnType<typeof admin>, key: string, value: string) {
  const { data: ex } = await sb.from("settings").select("key").eq("key", key).limit(1);
  const res = Array.isArray(ex) && ex.length > 0
    ? await sb.from("settings").update({ value }).eq("key", key)
    : await sb.from("settings").insert({ key, value });
  if (res.error) throw new Error(res.error.message);
}

const SAMPLE: Record<KakaoNotifyKind, Record<string, string>> = {
  unpaid: { 닉네임: "루루동이", 주문번호: "RURU-TEST0000", 금액: "45,000원", 계좌: "시험 발송 — 실제 계좌 아님" },
  cart: { 닉네임: "루루동이", 상품: "시험 발송 상품" },
};

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const ids = await readKakaoTemplateIds(admin());
    return NextResponse.json({ ok: true, ids, envReady: solapiEnvReady() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sb = admin();
    if (body.action === "save") {
      for (const tpl of Object.values(KAKAO_NOTIFY_TEMPLATES)) {
        const raw = String(body[tpl.kind] ?? "").trim();
        const id = cleanTemplateId(raw);
        if (raw && !id) return NextResponse.json({ ok: false, message: `「${tpl.title}」 템플릿 ID 모양이 아니에요(영문·숫자). SOLAPI 템플릿 목록의 ID를 복사해 주세요.` }, { status: 400 });
        await writeSetting(sb, tpl.settingKey, id);
      }
      return NextResponse.json({ ok: true, ids: await readKakaoTemplateIds(sb) });
    }
    if (body.action === "test") {
      const kind = body.kind === "cart" ? "cart" : body.kind === "unpaid" ? "unpaid" : null;
      if (!kind) return NextResponse.json({ ok: false, message: "종류가 없어요." }, { status: 400 });
      const phone = kakaoTargetPhone(body.phone);
      if (!phone) return NextResponse.json({ ok: false, message: "받을 휴대폰 번호(010…)를 넣어 주세요." }, { status: 400 });
      const who = String((session as any)?.username || "admin");
      const result = await sendKakaoNotify(sb, kind, [{ phone, vars: SAMPLE[kind] }], `${who}:test`);
      if (result.status === "not_configured") return NextResponse.json({ ok: false, message: solapiEnvReady() ? "템플릿 ID를 먼저 저장해 주세요." : "SOLAPI 연결 정보(환경변수)가 없어요." }, { status: 400 });
      if (result.status !== "sent") return NextResponse.json({ ok: false, message: `발송 실패${result.message ? `: ${result.message}` : ""}` }, { status: 502 });
      return NextResponse.json({ ok: true, sent: result.sent });
    }
    return NextResponse.json({ ok: false, message: "알 수 없는 요청" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message ?? e) }, { status: 500 });
  }
}
